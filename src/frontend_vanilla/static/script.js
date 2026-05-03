/* Survey app: dynamic UI, branching, persistence, submission. */

/* Fresh session per load (per current product choice) - preserving deviceID and progress */
(() => {
  const preserved = ['dyn:deviceId', 'dyn:sessionId', 'dyn:answers', 'dyn:currentId', 'dyn:mode', 'dyn:history', 'k10:theme', 'k10:cookiesAccepted', 'dyn:introSeen'];
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(k => {
      if (k.startsWith('dyn:') && !preserved.includes(k)) localStorage.removeItem(k);
    });
  } catch { }
  // Note: we no longer clear answers/currentId here to allow for persistence
})();

/* store query params into sessionStorage */
function captureQueryParams(allowedKeys = null) {
  const params = new URLSearchParams(window.location.search);
  const obj = {};
  for (const [k, v] of params.entries()) {
    if (!allowedKeys || allowedKeys.includes(k)) obj[k] = v;
  }
  try { sessionStorage.setItem('dyn:query', JSON.stringify(obj)); } catch { }
  return obj;
}

/* Data loading */
let RESOURCES_DB = [];
const loadResourcesJSON = async () => {
  try {
    const r = await fetch('../static/resources.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    RESOURCES_DB = await r.json();
  } catch (e) {
    console.error('Failed to load resources.json', e);
    RESOURCES_DB = [];
  }
};
const loadQuestionsJSON = async () => {
  const url = '../static/questions.json';
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Failed to load ${url}: HTTP ${r.status}`);
  return r.json();
};

/* Backend submission */
const SURVEY_ENDPOINT = 'https://nn6mnazknqfj6su7x5cm4svs640nmglc.lambda-url.us-east-2.on.aws/survey';
async function submitSurvey(payload) {
  const res = await fetch(SURVEY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const message = (data && data.message) || res.statusText || 'Request failed';
    throw new Error(`Submit failed (${res.status}): ${message}`);
  }
  return data;
}

/* Minimal toast */
function showToast(message) {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
    background: var(--bg-secondary); color: var(--text-primary);
    padding: 10px 16px; border-radius: 25px; font-size: .9rem; font-weight: 800;
    z-index: 2000; opacity: 0; border: 1px solid rgba(0,0,0,.06);
    transition: all .3s ease; box-shadow: ${getComputedStyle(document.body).getPropertyValue('--shadow-a')};
  `;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 280); }, 1600);
}

/* Visibility rules for branching */
function isVisible(question, answers) {
  const c = question.showIf;
  if (!c) return true;

  const evalCond = (cond) => {
    if (!cond) return true;
    if (Array.isArray(cond.and)) return cond.and.every(evalCond);
    if (Array.isArray(cond.or)) return cond.or.some(evalCond);
    if (cond.not) return !evalCond(cond.not);

    const qid = cond.questionId || cond.q;
    if (!qid) return true;

    const a = answers[qid];
    if (a === undefined || a === null || (Array.isArray(a) && a.length === 0)) return false;

    const arr = Array.isArray(a) ? a : [a];

    if (cond.equals !== undefined) return a === cond.equals;
    if (Array.isArray(cond.anyOf)) return arr.some(v => cond.anyOf.includes(v));
    if (cond.notEquals !== undefined) return a !== cond.notEquals;
    if (cond.contains !== undefined) return arr.includes(cond.contains);

    return true;
  };

  return evalCond(c);
}

function isPotentiallyVisible(question, answers) {
  const c = question.showIf;
  if (!c) return true;

  const evalCond = (cond) => {
    if (!cond) return true;
    if (Array.isArray(cond.and)) return cond.and.every(evalCond);
    if (Array.isArray(cond.or)) return cond.or.some(evalCond);
    if (cond.not) return !evalCond(cond.not);

    const qid = cond.questionId || cond.q;
    if (!qid) return true;

    const a = answers[qid];
    if (a === undefined || a === null || (Array.isArray(a) && a.length === 0)) return true;

    const arr = Array.isArray(a) ? a : [a];

    if (cond.equals !== undefined) return a === cond.equals;
    if (Array.isArray(cond.anyOf)) return arr.some(v => cond.anyOf.includes(v));
    if (cond.notEquals !== undefined) return a !== cond.notEquals;
    if (cond.contains !== undefined) return arr.includes(cond.contains);

    return true;
  };

  return evalCond(c);
}

async function captureBrowserGPS({
  highAccuracy = false,      // false reduces timeouts indoors; you can retry with true if needed
  timeoutMs = 30000,
  maximumAgeMs = 600000      // allow cached position up to 10 min
} = {}) {
  const write = (obj) => { try { sessionStorage.setItem('dyn:gps', JSON.stringify(obj)); } catch { } };

  if (!('geolocation' in navigator)) {
    write({ supported: false, status: 'unsupported', capturedAt: new Date().toISOString() });
    return null;
  }

  const getPosition = () =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: maximumAgeMs
      });
    });

  try {
    const pos = await getPosition();
    const gps = {
      supported: true,
      status: 'ok',
      capturedAt: new Date().toISOString(),
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      }
    };
    write(gps);
    return gps;
  } catch (err) {
    // Standard codes: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
    const code = err?.code;
    const status =
      code === 1 ? 'denied' :
        code === 2 ? 'unavailable' :
          code === 3 ? 'timeout' :
            'error';

    const gps = {
      supported: true,
      status,
      capturedAt: new Date().toISOString(),
      error: { code, message: err?.message }
    };
    write(gps);
    return null;
  }
}

function getStoredGPS() {
  try { return JSON.parse(sessionStorage.getItem('dyn:gps') || 'null'); }
  catch { return null; }
}

async function retryGPS() {
  // First attempt: reliable
  let gps = await captureBrowserGPS({ highAccuracy: false });
  if (gps) return gps;

  // Second attempt: more precise but may be slower
  return await captureBrowserGPS({ highAccuracy: true, timeoutMs: 20000 });
}

// Placeholder for getLanguage function, as it's used in the new payload structure
function getLanguage() {
  return navigator.language || navigator.userLanguage || 'en-US';
}

/* Dynamic survey controller */
class DynamicSurvey {
  constructor(config) {
    this.config = config || { title: 'Survey', version: '1.0', settings: {}, questions: [] };
    this.settings = {
      autoAdvanceSingle: !!config?.settings?.autoAdvanceSingle,
      requireNextOnMultiple: typeof config?.settings?.requireNextOnMultiple === 'boolean'
        ? config.settings.requireNextOnMultiple
        : true,
      showAbsoluteProgress: !!config?.settings?.showAbsoluteProgress,
      legacyQuestionTags: !!config?.settings?.legacyQuestionTags,
      defaultTopics: (config?.settings?.defaultTopics || []).map(s => String(s).toLowerCase())
    };
    this.questions = Array.isArray(config.questions) ? config.questions : [];
    this.answers = {};
    this.currentId = null;
    try {
      const rawHistory = localStorage.getItem('dyn:history');
      this.navHistory = rawHistory ? JSON.parse(rawHistory) : [];
    } catch { this.navHistory = []; }

    // Persistent deviceID (same across surveys/refreshes)
    this.deviceID = localStorage.getItem('dyn:deviceId');
    if (!this.deviceID) {
      this.deviceID = crypto.randomUUID();
      try { localStorage.setItem('dyn:deviceId', this.deviceID); } catch { }
    }

    // Session ID matches the current attempt
    this.sessionID = localStorage.getItem('dyn:sessionId');
    if (!this.sessionID) {
      this.sessionID = crypto.randomUUID();
      try { localStorage.setItem('dyn:sessionId', this.sessionID); } catch { }
    }

    // Navigation + interaction throttles
    this.navCooldownMs = 100;        // rate-limit for Next/Back/Submit
    this.interactCooldownMs = 500;   // minimum time before options are clickable on a new step
    this.autoAdvanceDelayMs = 180;   // small delay before auto-advance to next step

    this.navCooldownUntil = 0;       // when Next/Back/Submit allowed again
    this.interactLockUntil = 0;      // when option clicks allowed again
    this.isTransitioning = false;    // true while we're navigating to another step
    this._interactUnlockTimer = null;

    this.submitting = false;         // lock UI during submit
    this.helpOrigin = 'summary';     // where help was opened from

    this.dom = {
      root: document.getElementById('questionsRoot'),
      title: document.getElementById('appTitle'),
      subtitle: document.getElementById('appSubtitle'),
      progressBar: document.getElementById('progressBar'),
      backBtn: document.getElementById('backBtn'),
      completion: document.querySelector('[data-question="complete"]'),
      help: document.querySelector('[data-question="help"]'),
      helpTitle: document.querySelector('.help-container .help-title'),
      helpSubtitle: document.querySelector('.help-container .help-subtitle'),
      helpGrid: document.getElementById('helpGrid'),
      helpBackBtn: document.getElementById('helpBackBtn'),
      helpRestartBtn: document.getElementById('helpRestartBtn'),
      helpBtn: document.getElementById('helpBtn'),
      restartBtn: document.getElementById('restartBtn'),
      whyLink: document.getElementById('whyLink'),
      whyContent: document.getElementById('whyContent'),
      whySection: document.getElementById('whySection')
    };

    this.clickedResources = new Set();

    this.bindGlobalEvents();
    this.initUI();

    this.dom.helpBtn?.addEventListener('click', () => { this.renderHelpResources({ all: false, from: 'summary' }); this.showHelpPage(); });
    this.dom.restartBtn?.addEventListener('click', () => this.restart());
    this.dom.helpBackBtn?.addEventListener('click', () => this.backToSummary());
    this.dom.helpRestartBtn?.addEventListener('click', () => this.restart());

    this.dom.whyLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleWhySection();
    });
  }

  get storageKeys() {
    return { answers: 'dyn:answers', current: 'dyn:currentId', submissions: 'dyn:submissions', mode: 'dyn:mode', query: 'dyn:query', deviceId: 'dyn:deviceId', history: 'dyn:history', sessionId: 'dyn:sessionId' };
  }

  // Throttle helpers
  canNavigate() {
    return !this.submitting && Date.now() >= this.navCooldownUntil && !this.isTransitioning;
  }
  startNavCooldown(ms = this.navCooldownMs) {
    this.navCooldownUntil = Date.now() + ms;
  }

  canInteract() {
    return !this.submitting && !this.isTransitioning && Date.now() >= this.interactLockUntil;
  }
  startInteractCooldown(ms = this.interactCooldownMs, container = this.getContainer(this.currentId)) {
    this.interactLockUntil = Date.now() + ms;
    if (this._interactUnlockTimer) clearTimeout(this._interactUnlockTimer);

    // Disable option clicks briefly
    const options = container?.querySelector('.options');
    if (options) {
      options.style.pointerEvents = 'none';
      options.style.transition = options.style.transition || 'opacity 150ms';
      options.style.opacity = options.style.opacity || '';
      // Optionally dim a bit for feedback (comment out if undesired)
      // options.style.opacity = '0.92';
      this._interactUnlockTimer = setTimeout(() => {
        options.style.pointerEvents = '';
        // options.style.opacity = '';
      }, ms);
    } else {
      this._interactUnlockTimer = setTimeout(() => { }, ms);
    }
  }

  /* Global UI: theme, cookies, back, keys, and event delegation for clicks */
  bindGlobalEvents() {

    // Resource click tracking
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) {
        const text = chip.textContent.trim();
        if (text) this.clickedResources.add(text);
      }
    });

    // Send a canonical payload whenever the user leaves the page (mid-survey or after)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;

      // Only send if the user has actually entered the survey flow
      const hasEntered = !!this.currentId || this.clickedResources.size > 0;
      if (!hasEntered) return;

      // Build the same canonical payload used for submission, but with completed=false
      // and attach any clicked resources accumulated in this session.
      const payload = this.buildSurveyPayload(this.submitting);
      if (this.clickedResources.size > 0) {
        payload.data.clickedResources = Array.from(this.clickedResources);
      }

      fetch(SURVEY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});

      this.clickedResources.clear();
    });

    // Apply saved theme, or default to dark if none saved
    try {
      const savedTheme = localStorage.getItem('k10:theme');
      if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
      } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
      } else {
        // No saved preference → default to dark
        document.body.classList.add('dark-mode');
      }
    } catch { }

    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const syncThemeIcon = () => { if (themeIcon) themeIcon.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙'; };
    themeToggle?.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      try { localStorage.setItem('k10:theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); } catch { }
      syncThemeIcon();
    });
    syncThemeIcon();

    const cookieOverlay = document.getElementById('cookieOverlay');
    document.getElementById('cookieAccept')?.addEventListener('click', () => { try { localStorage.setItem('k10:cookiesAccepted', 'yes'); } catch { } cookieOverlay?.classList.remove('show'); });
    document.getElementById('cookieDismiss')?.addEventListener('click', () => cookieOverlay?.classList.remove('show'));

    this.dom.backBtn?.addEventListener('click', () => {
      if (!this.canNavigate()) return;
      this.startNavCooldown();
      this.isTransitioning = true;
      this.goBack();
    });

    document.addEventListener('keydown', (e) => {
      const inOverlay = document.body.classList.contains('intro-open') || this.dom.completion?.classList.contains('active') || this.dom.help?.classList.contains('active');
      if (inOverlay || !this.currentId) return;

      if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (!this.canNavigate()) return;
        this.startNavCooldown();
        this.isTransitioning = true;
        this.goBack();
        return;
      }

      if (e.key >= '1' && e.key <= '9') {
        if (!this.canInteract()) return;
        const idx = parseInt(e.key, 10) - 1;
        const options = Array.from(this.getContainer(this.currentId)?.querySelectorAll('.option') || []);
        const q = this.getQuestion(this.currentId);
        if (q?.type === 'single' && options[idx]) options[idx].click();
      }
    });

    // Single delegated listener for options + next/submit clicks
    this.dom.root.addEventListener('click', (e) => {
      const opt = e.target.closest('.option');
      if (opt) {
        const qId = opt.closest('.question-container')?.dataset.qid;
        const q = this.getQuestion(qId);
        if (q) this.onOptionClick(q, opt);
        return;
      }
      const nextBtn = e.target.closest('.submit-btn[data-role]');
      if (nextBtn) {
        if (!this.canNavigate()) return;
        this.startNavCooldown();
        this.isTransitioning = true;
        const qId = nextBtn.closest('.question-container')?.dataset.qid;
        if (qId) this.onNextFrom(qId);
      }
    });
  }

  /* Initial render and state restoration */
  initUI() {
    if (this.dom.title) this.dom.title.textContent = this.config.title || 'Survey';
    if (this.dom.subtitle) this.dom.subtitle.textContent = '';

    this.dom.root.innerHTML = this.questions.map(q => this.tplQuestion(q)).join('');
    this.hydrateFromStorage();

    const visible = this.getVisibleIds();
    if (!visible.length) return this.showCompletion();

    const saved = this.getStoredCurrent();
    this.currentId = visible.includes(saved) ? saved : visible[0];

    this.showQuestion(this.currentId, { pushHistory: true });
    this.updateProgress();
    this.updateBackButtonState();
  }

  /* Question section markup (options + optional Next row) */
  tplQuestion(q) {
    const opts = (q.options || [])
      .map(o => `<button class="option" type="button" data-value="${String(o.id)}">${o.label}</button>`)
      .join('');
    const nextRow = q.type === 'multiple'
      ? `<div class="submit-row"><button class="submit-btn" type="button" data-role="next" ${this.settings.requireNextOnMultiple ? 'disabled' : ''}>Next</button></div>`
      : '';
    return `
      <section class="question-container" data-qid="${q.id}" style="display:none">
        <div class="question-number"><span>Question ?/?</span></div>
        <h2 class="question-text">${q.text}</h2>
        <div class="options">${opts}</div>
        ${nextRow}
      </section>
    `;
  }

  /* DOM helpers */
  getContainer(qId) { return this.dom.root.querySelector(`.question-container[data-qid="${qId}"]`); }
  getQuestion(qId) { return this.questions.find(q => q.id === qId); }

  /* Single-choice bottom row (used when not auto-advancing, or at end to submit) */
  ensureSingleNavRow(qId) {
    const c = this.getContainer(qId);
    if (!c) return null;
    let row = c.querySelector('.submit-row[data-role="single-nav"]');
    if (!row) {
      row = document.createElement('div');
      row.className = 'submit-row';
      row.dataset.role = 'single-nav';
      row.innerHTML = `<button class="submit-btn" type="button" data-role="single-nav-btn">Next</button>`;
      c.appendChild(row);
    }
    return row;
  }

  /* Bottom controls reflect current answer + whether a next step exists */
  updateStepControls(qId) {
    const q = this.getQuestion(qId);
    const c = this.getContainer(qId);
    if (!q || !c) return;

    if (q.type === 'single') {
      const answered = typeof this.answers[qId] === 'string';
      if (this.settings.autoAdvanceSingle) {
        const nextId = answered ? this.getNextId(qId) : null;
        const row = c.querySelector('.submit-row[data-role="single-nav"]');
        if (answered && !nextId) {
          const ensured = this.ensureSingleNavRow(qId);
          const btn = ensured?.querySelector('.submit-btn');
          if (btn) {
            btn.textContent = 'Submit';
            btn.removeAttribute('aria-label');
            btn.disabled = false;
          }
          ensured.style.display = '';
        } else if (row) {
          row.style.display = 'none';
        }
      } else {
        const ensured = this.ensureSingleNavRow(qId);
        const btn = ensured?.querySelector('.submit-btn');
        const nextId = answered ? this.getNextId(qId) : null;
        if (btn) {
          const isSubmit = answered && !nextId;
          btn.textContent = isSubmit ? 'Submit' : 'Next';
          btn.removeAttribute('aria-label');
          btn.disabled = !answered;
        }
        ensured.style.display = '';
      }
    }

    if (q.type === 'multiple') {
      const nextBtn = c.querySelector('.submit-btn[data-role="next"]');
      const val = this.answers[qId];
      const hasAnswer = Array.isArray(val) && val.length > 0;
      if (nextBtn) {
        const isSubmit = hasAnswer && !this.getNextId(qId);
        nextBtn.disabled = this.settings.requireNextOnMultiple ? !hasAnswer : false;
        nextBtn.textContent = isSubmit ? 'Submit' : 'Next';
        nextBtn.removeAttribute('aria-label');
      }
    }

    this.updateProgress();
  }

  /* Option selection handler (single vs multiple + exclusive options) */
  onOptionClick(q, btn) {
    if (!this.canInteract()) return;

    const c = this.getContainer(q.id);
    const value = btn.dataset.value;

    if (q.type === 'single') {
      // Apply selection
      c.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
      this.answers[q.id] = value;
      this.persistAnswers();
      this.updateQuestionNumberBadges();

      const nextId = this.getNextId(q.id);
      this.updateStepControls(q.id);

      if (this.settings.autoAdvanceSingle && nextId) {
        // Prevent rapid chaining: disable options on current question immediately
        const options = c.querySelector('.options');
        if (options) options.style.pointerEvents = 'none';

        if (navigator.vibrate) navigator.vibrate(20);
        this.startNavCooldown();         // block other nav inputs
        this.isTransitioning = true;     // block option inputs until next step shows

        setTimeout(() => this.showQuestion(nextId, { pushHistory: true }), this.autoAdvanceDelayMs);
      }
      return;
    }

    // Multiple choice (with exclusive options support)
    const exclusiveIds = new Set((q.exclusiveOptionIds || []).map(String));
    const optById = id => (q.options || []).find(o => String(o.id) === String(id));
    const isExcl = id => exclusiveIds.has(String(id)) || !!optById(id)?.exclusive;

    const selected = new Set(Array.from(c.querySelectorAll('.option.selected')).map(b => b.dataset.value));
    if (btn.classList.contains('selected')) {
      btn.classList.remove('selected');
      selected.delete(value);
    } else {
      if (isExcl(value)) {
        c.querySelectorAll('.option.selected').forEach(b => b.classList.remove('selected'));
        selected.clear();
      } else {
        c.querySelectorAll('.option.selected').forEach(b => { if (isExcl(b.dataset.value)) b.classList.remove('selected'); });
        exclusiveIds.forEach(id => selected.delete(String(id)));
      }
      btn.classList.add('selected');
      selected.add(value);
    }

    this.answers[q.id] = Array.from(selected);
    this.persistAnswers();
    this.updateQuestionNumberBadges();
    this.updateStepControls(q.id);

    // Auto-advance if an exclusive option was just selected
    if (isExcl(value) && selected.has(value)) {
      const nextId = this.getNextId(q.id);
      if (nextId) {
        const options = c.querySelector('.options');
        if (options) options.style.pointerEvents = 'none';
        if (navigator.vibrate) navigator.vibrate(20);
        this.startNavCooldown();
        this.isTransitioning = true;
        setTimeout(() => this.showQuestion(nextId, { pushHistory: true }), this.autoAdvanceDelayMs);
      }
    }
  }

  /* Visible flow and branching */
  getVisibleIds() {
    const query = this.getStoredQuery();
    if (query.branching === 'false' || query.branching === 'no') return this.questions.map(q => q.id);
    return this.questions.filter(q => isVisible(q, this.answers)).map(q => q.id);
  }
  _extractShowIfRefs(cond) {
    if (!cond) return [];
    const refs = [];
    if (Array.isArray(cond.and)) cond.and.forEach(c => refs.push(...this._extractShowIfRefs(c)));
    if (Array.isArray(cond.or)) cond.or.forEach(c => refs.push(...this._extractShowIfRefs(c)));
    if (cond.not) refs.push(...this._extractShowIfRefs(cond.not));
    const qid = cond.questionId || cond.q;
    if (qid) refs.push(qid);
    return refs;
  }
  getPotentiallyVisibleIds() {
    const query = this.getStoredQuery();
    if (query.branching === 'false' || query.branching === 'no') return this.questions.map(q => q.id);

    const potVisSet = new Set();
    for (const q of this.questions) {
      if (!q.showIf) { potVisSet.add(q.id); continue; }
      if (!isPotentiallyVisible(q, this.answers)) continue;
      // Ensure all referenced parent questions are themselves reachable
      const refs = this._extractShowIfRefs(q.showIf);
      const reachable = refs.every(refId => {
        const a = this.answers[refId];
        // If the parent has a definite answer the condition was evaluated normally
        if (a !== undefined && a !== null && (!Array.isArray(a) || a.length > 0)) return true;
        // If parent answer was pruned, it must itself be potentially visible
        return potVisSet.has(refId);
      });
      if (reachable) potVisSet.add(q.id);
    }
    return this.questions.filter(q => potVisSet.has(q.id)).map(q => q.id);
  }
  maybeSkipImmediateNext(currentId, nextId) {
    const q = this.getQuestion(currentId);
    if (!q || !nextId || !Array.isArray(q.nextVisibleIfAnyOf)) return nextId;
    const ans = this.answers[currentId];
    const arr = Array.isArray(ans) ? ans : ans != null ? [ans] : [];
    if (arr.some(v => q.nextVisibleIfAnyOf.includes(v))) return nextId;

    const idxPhys = this.questions.findIndex(qq => qq.id === currentId);
    const physNextId = this.questions[idxPhys + 1]?.id || null;
    if (physNextId !== nextId) return nextId;

    const visible = this.getVisibleIds();
    const i = visible.indexOf(currentId);
    return visible[i + 2] || nextId;
  }
  getNextId(fromId = this.currentId) {
    const visible = this.getVisibleIds();
    const i = visible.indexOf(fromId);
    if (i === -1) return null;
    return this.maybeSkipImmediateNext(fromId, visible[i + 1] || null);
  }
  getPrevId(fromId = this.currentId) {
    const visible = this.getVisibleIds();
    const i = visible.indexOf(fromId);
    return i > 0 ? visible[i - 1] : null;
  }

  updateQuestionNumberBadges() {
    const visible = this.getVisibleIds();
    const potVis = this.getPotentiallyVisibleIds();

    visible.forEach((id, i) => {
      const span = this.getContainer(id)?.querySelector('.question-number span');
      if (span) {
        if (this.settings.showAbsoluteProgress) {
          // Absolute mode: show physical question number in JSON array vs Total Fixed Questions (e.g. 17/31 -> 20/31)
          const qNum = this.questions.findIndex(q => q.id === id) + 1;
          const total = this.questions.length;
          span.textContent = `Question ${qNum}/${total}`;
        } else {
          // Relative Decreasing mode: show linear 1,2,3,4 vs Shrinking Total (e.g. 17/31 -> 18/27)
          const qNum = i + 1;
          const total = potVis.length;
          span.textContent = `Question ${qNum}/${total}`;
        }
      }
    });
  }
  showQuestion(qId, { pushHistory = true } = {}) {
    if (this.submitting) return;

    if (this.dom.root) this.dom.root.style.display = '';

    this.dom.completion?.classList.remove('active');
    if (this.dom.completion) this.dom.completion.style.display = 'none';
    this.dom.help?.classList.remove('active');
    if (this.dom.help) this.dom.help.style.display = 'none';
    this.dom.root.querySelectorAll('.question-container').forEach(c => { c.classList.remove('active', 'leaving'); c.style.display = 'none'; });

    const c = this.getContainer(qId);
    if (!c) { this.isTransitioning = false; return; }
    c.style.display = 'flex';
    c.classList.add('active');

    this.updateQuestionNumberBadges();

    this.currentId = qId;
    try { localStorage.setItem(this.storageKeys.current, qId); } catch { }

    if (pushHistory) {
      const last = this.navHistory[this.navHistory.length - 1];
      if (last !== qId) {
        this.navHistory.push(qId);
        try { localStorage.setItem(this.storageKeys.history, JSON.stringify(this.navHistory)); } catch { }
      }
    }

    this.updateStepControls(qId);
    this.updateBackButtonState();

    // New: lock option clicks briefly on each question shown
    this.startInteractCooldown();

    // End transition now that question is visible
    this.isTransitioning = false;
  }
  updateProgress() {
    const visible = this.getVisibleIds();
    const potVis = this.getPotentiallyVisibleIds();

    let currentIdx, total;
    if (this.settings.showAbsoluteProgress) {
      currentIdx = Math.max(this.questions.findIndex(q => q.id === this.currentId), 0);
      total = this.questions.length || 1;
    } else {
      currentIdx = Math.max(visible.indexOf(this.currentId), 0);
      total = potVis.length || 1;
    }

    const pct = ((currentIdx + 1) / total) * 100;
    if (this.dom.progressBar) this.dom.progressBar.style.width = `${pct}%`;
  }
  updateBackButtonState() {
    if (!this.dom.backBtn) return;
    this.dom.backBtn.disabled = this.navHistory.length <= 1;
    this.dom.backBtn.style.display = 'flex';
  }

  /* Persistence (localStorage) + prune hidden answers after branching */
  persistAnswers() {
    this.pruneHiddenAnswers();
    try { localStorage.setItem(this.storageKeys.answers, JSON.stringify(this.answers)); } catch { }
  }
  pruneHiddenAnswers() {
    const visible = new Set(this.getVisibleIds());
    let changed = false;
    Object.keys(this.answers).forEach(qid => {
      if (!visible.has(qid)) { delete this.answers[qid]; changed = true; }
    });
    if (changed) {
      try { localStorage.setItem(this.storageKeys.answers, JSON.stringify(this.answers)); } catch { }
      this.questions.forEach(q => {
        if (!visible.has(q.id)) this.getContainer(q.id)?.querySelectorAll('.option.selected').forEach(b => b.classList.remove('selected'));
      });
    }
  }
  hydrateFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKeys.answers);
      this.answers = raw ? JSON.parse(raw) : {};
    } catch { this.answers = {}; }
    this.questions.forEach(q => {
      const c = this.getContainer(q.id); if (!c) return;
      const val = this.answers[q.id];
      if (q.type === 'single' && typeof val === 'string') {
        c.querySelectorAll('.option').forEach(o => o.classList.toggle('selected', o.dataset.value === val));
      } else if (q.type === 'multiple' && Array.isArray(val)) {
        const set = new Set(val);
        c.querySelectorAll('.option').forEach(o => o.classList.toggle('selected', set.has(o.dataset.value)));
      }
    });
  }
  getStoredCurrent() { try { return localStorage.getItem(this.storageKeys.current) || null; } catch { return null; } }
  getStoredMode() { try { return localStorage.getItem(this.storageKeys.mode) || null; } catch { return null; } }
  getStoredQuery() {
    try { return JSON.parse(sessionStorage.getItem(this.storageKeys.query) || '{}'); }
    catch { return {}; }
  }

  /* Next/Submit flows */
  onNextFrom(qId) {
    if (this.submitting) { this.isTransitioning = false; return; }

    const q = this.getQuestion(qId);
    const has = q.type === 'single'
      ? typeof this.answers[q.id] === 'string'
      : Array.isArray(this.answers[q.id]) && this.answers[q.id].length > 0;

    if (q.required && !has) { this.isTransitioning = false; return showToast('Please answer this question to continue'); }
    if (q.type === 'multiple' && this.settings.requireNextOnMultiple && !has) { this.isTransitioning = false; return showToast('Please select at least one option'); }

    const nextId = this.getNextId(qId);
    if (!nextId) return this.handleSubmit();
    this.showQuestion(nextId, { pushHistory: true });
  }
  goNext() {
    if (!this.canNavigate()) return;
    this.startNavCooldown();
    this.isTransitioning = true;
    const nextId = this.getNextId();
    if (!nextId) { this.isTransitioning = false; return this.updateStepControls(this.currentId); }
    this.showQuestion(nextId, { pushHistory: true });
  }
  goBack() {
    if (this.submitting) { this.isTransitioning = false; return; }

    if (this.navHistory.length > 1) {
      this.navHistory.pop();
      const visible = new Set(this.getVisibleIds());
      let prevId = this.navHistory[this.navHistory.length - 1];
      while (this.navHistory.length > 1 && !visible.has(prevId)) {
        this.navHistory.pop();
        prevId = this.navHistory[this.navHistory.length - 1];
      }
      try { localStorage.setItem(this.storageKeys.history, JSON.stringify(this.navHistory)); } catch { }
      if (visible.has(prevId)) {
        this.showQuestion(prevId, { pushHistory: false });
        return;
      }
    }
    const prevId = this.getPrevId();
    if (prevId) this.showQuestion(prevId, { pushHistory: true });
  }

  updateHelpNavButtons() {
    const back = this.dom.helpBackBtn;
    const restart = this.dom.helpRestartBtn;
    if (!back) return;

    if (this.helpOrigin === 'start') {
      back.textContent = 'Back to beginning';
      if (restart) restart.style.display = 'none';
    } else {
      back.textContent = 'Back to summary';
      if (restart) restart.style.display = '';
    }
  }

  /* Help/resources derivation */
  renderHelpResources({ all = false, from = 'summary' } = {}) {
    this.helpOrigin = from;
    this.updateHelpNavButtons();

    const grid = this.dom.helpGrid; if (!grid) return;

    let cards = [];
    if (all) {
      if (this.dom.helpTitle) this.dom.helpTitle.textContent = 'Resources';
      if (this.dom.helpSubtitle) this.dom.helpSubtitle.textContent = 'Browse the full list of available resources.';
      cards = (RESOURCES_DB || [])
        .slice()
        .sort((a, b) => (a.risk || 999) - (b.risk || 999));
    } else {
      const topics = this.computeSelectedTopics();
      const copy = this.helpCopyFromResponses(topics);
      if (this.dom.helpTitle) this.dom.helpTitle.textContent = copy.title;
      if (this.dom.helpSubtitle) this.dom.helpSubtitle.textContent = copy.subtitle;

      cards = (RESOURCES_DB || [])
        .filter(r => (Array.isArray(r.tags) ? r.tags.map(t => String(t).toLowerCase()) : []).some(t => topics.has(t)))
        .sort((a, b) => (a.risk || 999) - (b.risk || 999));
    }

    grid.innerHTML = cards.length
      ? cards.map(card => {
        const actions = (card.actions || []).map(a => {
          const icon = a.icon || (a.kind === 'sms' ? 'fas fa-comment-dots' : a.kind === 'web' ? 'fas fa-globe' : 'fas fa-phone');
          const href = a.href || '#';
          const blank = a.targetBlank ? 'target="_blank" rel="noopener noreferrer"' : '';
          return `<a class="chip" href="${href}" ${blank}><i class="${icon}"></i> ${a.label}</a>`;
        }).join('');
        return `
            <div class="help-card">
                <h4>${card.title}</h4>
                ${card.description ? `<div class="help-description">${card.description}</div>` : ''}
                ${card.meta ? `<div class="help-meta">${card.meta}</div>` : ''}
                <div class="help-actions">${actions}</div>
            </div>
            `;
      }).join('')
      : `
        <div class="help-card">
          <h4>No resources matched.</h4>
          <div class="help-meta">Check back later. In the meantime, consider checking in on your friends!</div>
        </div>
      `;

    if (!all) {
      this.renderWhySection();
      if (this.dom.whySection) this.dom.whySection.style.display = 'block';
    } else {
      if (this.dom.whySection) this.dom.whySection.style.display = 'none';
    }
  }

  renderWhySection() {
    const topicsMap = this.computeSelectedTopicsWithReasons();
    const content = this.dom.whyContent;
    if (!content) return;

    let html = '<p class="why-lead">Your responses indicated the following information:</p>';
    topicsMap.forEach((entry, tag) => {
      const mergedReasons = new Set([...entry.groupReasons, ...entry.reasons]);
      if (mergedReasons.size > 0) {
        const tagLabel = tag.charAt(0).toUpperCase() + tag.slice(1);
        html += `<div class="why-group">
          <strong>${tagLabel} Support:</strong>
          <ul>
            ${Array.from(mergedReasons).map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>`;
      }
    });

    content.innerHTML = html.length > 70 ? html : '<p>Your responses suggest general wellbeing support.</p>';
  }

  toggleWhySection() {
    const container = this.dom.whyContent;
    const link = this.dom.whyLink;
    if (!container || !link) return;

    const isHidden = container.style.display === 'none' || !container.style.display;
    container.style.display = isHidden ? 'block' : 'none';
    link.textContent = isHidden ? 'Hide details' : 'Why are we showing you these resources?';
  }
  selectedTopicsObject() {
    const set = this.computeSelectedTopics();
    const known = new Set((RESOURCES_DB || []).flatMap(r => Array.isArray(r.tags) ? r.tags.map(t => String(t).toLowerCase()) : []));
    if (!known.size) ['depression', 'alcohol', 'substances', 'abuse'].forEach(t => known.add(t));
    const obj = {}; known.forEach(t => { obj[t] = set.has(t); }); return obj;
  }
  computeUrgencyLevel() {
    const a = this.answers;
    let highest = 'low';
    const urgencyMap = { 'low': 0, 'moderate': 1, 'urgent': 2 };
    const revMap = ['low', 'moderate', 'urgent'];

    Object.keys(a).forEach(qid => {
      const q = this.getQuestion(qid); if (!q) return;
      const val = a[qid];
      const check = (oid) => {
        const o = (q.options || []).find(opt => String(opt.id) === String(oid));
        if (o && o.urgency && urgencyMap[o.urgency] > urgencyMap[highest]) {
          highest = o.urgency;
        }
      };
      if (Array.isArray(val)) val.forEach(check);
      else if (val != null) check(val);
    });
    return highest;
  }

  computeSelectedTopicsWithReasons() {
    const topics = new Map(), removes = new Set(), a = this.answers;
    const getOpt = (q, id) => (q.options || []).find(o => String(o.id) === String(id)) || null;

    const addTopic = (tag, reason, groupReason) => {
      tag = tag.toLowerCase();
      if (!topics.has(tag)) topics.set(tag, { reasons: new Set(), groupReasons: new Set() });
      const entry = topics.get(tag);
      if (groupReason) entry.groupReasons.add(groupReason);
      else if (reason) entry.reasons.add(reason);
    };

    const addTags = (o, q) => {
      const cands = [o?.indicates, o?.topics, o?.topicAdds, o?.tagsAdd];
      const tags = [];
      for (const c of cands) if (Array.isArray(c) && c.length) tags.push(...c.map(x => String(x).toLowerCase()));

      tags.forEach(t => addTopic(t, o.reason, o.groupReason));
    };

    const remTags = (o) => {
      const cands = [o?.indicatesRemove, o?.topicRemoves, o?.tagsRemove];
      for (const c of cands) if (Array.isArray(c) && c.length) return c.map(x => String(x).toLowerCase());
      return [];
    };

    const evalCond = (cond) => {
      if (!cond) return false;
      if (Array.isArray(cond.all)) return cond.all.every(evalCond);
      if (Array.isArray(cond.any)) return cond.any.some(evalCond);
      if (cond.not) return !evalCond(cond.not);
      if (typeof cond.exists === 'string') {
        const v = a[cond.exists];
        return v !== undefined && v !== null && (!Array.isArray(v) || v.length > 0);
      }
      const qid = cond.q || cond.questionId; if (!qid) return false;
      const v = a[qid], arr = Array.isArray(v) ? v : v != null ? [v] : [];
      if (cond.equals !== undefined) return v === cond.equals;
      if (Array.isArray(cond.anyOf)) return arr.some(x => cond.anyOf.includes(x));
      if (cond.notEquals !== undefined) return v !== cond.notEquals;
      return false;
    };

    const rules = Array.isArray(this.config?.topicRules) ? this.config.topicRules
      : Array.isArray(this.config?.settings?.topicRules) ? this.config.settings.topicRules : [];

    rules.forEach(r => {
      const when = r.when || r.if || r.condition; if (!when) return;
      if (evalCond(when)) {
        (r.add || []).forEach(t => addTopic(t, r.reason, r.groupReason));
        (r.remove || []).forEach(t => removes.add(String(t).toLowerCase()));
      }
    });

    Object.keys(a).forEach(qid => {
      const q = this.getQuestion(qid); if (!q) return;
      const val = a[qid];
      if (q.type === 'single' && typeof val === 'string') {
        const o = getOpt(q, val); if (!o) return;
        addTags(o, q);
        remTags(o).forEach(t => removes.add(t));
      }
      if (q.type === 'multiple' && Array.isArray(val)) {
        const ex = new Set((q.exclusiveOptionIds || []).map(String));
        const isExcl = (id) => ex.has(String(id)) || !!getOpt(q, id)?.exclusive;
        const onlyExcl = val.length > 0 && val.every(isExcl);
        if (onlyExcl) {
          val.forEach(id => {
            const o = getOpt(q, id); if (!o) return;
            remTags(o).forEach(t => removes.add(t));
          });
          return;
        }
        val.forEach(id => {
          if (isExcl(id)) return;
          const o = getOpt(q, id); if (!o) return;
          addTags(o, q);
          remTags(o).forEach(t => removes.add(t));
        });
      }
    });

    removes.forEach(t => topics.delete(t));
    if (topics.size === 0) {
      (this.settings.defaultTopics || []).forEach(t => addTopic(t, null, null));
    }
    return topics;
  }

  /* Helpers for consistent question numbering across all payloads */
  getQuestionPrefix(qId) {
    const q = this.getQuestion(qId);
    if (!q) return qId;
    const num = String(q.questionNumber).padStart(2, '0');
    return `${num}_${qId}`;
  }

  buildNumberedAnswers(answers) {
    const result = {};
    for (const [id, val] of Object.entries(answers)) {
      result[this.getQuestionPrefix(id)] = val;
    }
    return result;
  }

  computeSelectedTopics() {
    return new Set(this.computeSelectedTopicsWithReasons().keys());
  }
  helpCopyFromResponses(topicsSet) {
    const level = this.computeUrgencyLevel();
    const list = Array.from(topicsSet);
    const human = list.length ? list.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'general wellbeing';
    if (level === 'urgent') return { title: 'Urgent Support Options', subtitle: `Based on your responses, here are resources for ${human}. If there’s immediate danger, call your local emergency number.` };
    if (level === 'moderate') return { title: 'Support and Self‑Help Resources', subtitle: `Here are supportive resources for ${human}. Consider reaching out for professional advice if things feel tough.` };
    return { title: 'Wellbeing Tips & Helpful Resources', subtitle: `You reported lower concern. Explore these resources for ${human}, and keep them handy if you ever need extra support.` };
  }
  showHelpPage() {
    const c = this.dom.completion, h = this.dom.help; if (!h) return;
    c?.classList.remove('active'); if (c) c.style.display = 'none';

    if (this.dom.root) this.dom.root.style.display = 'none';

    h.style.display = 'flex'; h.classList.add('active');
    this.dom.backBtn?.style?.setProperty('display', 'none');
    document.querySelector('.container')?.scrollIntoView({ behavior: 'smooth' });
  }
  backToSummary() {
    const h = this.dom.help; if (!h) return;
    h?.classList.remove('active'); if (h) h.style.display = 'none';

    if (this.dom.root) this.dom.root.style.display = '';

    if (this.helpOrigin === 'start') {
      const startOverlay = document.getElementById('startOverlay');
      startOverlay?.classList.add('show');
      document.body.classList.add('intro-open');
      this.dom.backBtn?.style?.setProperty('display', 'none');
    } else {
      const c = this.dom.completion; if (!c) return;
      c.style.display = 'block'; c.classList.add('active');
      this.dom.backBtn?.style?.removeProperty('display');
    }

    document.querySelector('.container')?.scrollIntoView({ behavior: 'smooth' });
  }

  buildSurveyPayload(completed = false) {
    const query = this.getStoredQuery();
    const gps = getStoredGPS();
    const metadata = {
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      language: getLanguage(),
      platform: navigator.platform
    };

    // Pre-initialize all questions to null so unanswered ones appear explicitly.
    // The backend can find the last non-null entry to determine where user stopped.
    const allAnswers = {};
    for (const q of this.questions) {
      allAnswers[this.getQuestionPrefix(q.id)] = null;
    }
    // Overlay actual answers
    const filled = this.buildNumberedAnswers(this.answers);
    Object.assign(allAnswers, filled);

    return {
      data: {
        timestamp: new Date().toISOString(),
        surveyTitle: this.config.title,
        surveyVersion: this.config.version,
        mode: this.getStoredMode(),
        site_id: query.site_id || query.site || "",
        query,
        gps,
        answers: allAnswers,
        clickedResources: [], 
        deviceID: this.deviceID,
        sessionID: this.sessionID,
        metadata,
        completed,
        isTest: query.test === 'true' || query.test === 'yes',
        isBranching: query.branching !== 'false' && query.branching !== 'no'
      }
    };
  }

  async handleSubmit() {
    if (this.submitting) return; // double-submit guard

    // Validate first; if anything missing, keep user in flow and do not lock UI
    const visible = this.getVisibleIds();
    const byId = new Map(this.questions.map(q => [q.id, q]));
    for (const id of visible) {
      const q = byId.get(id); if (!q) continue;
      const v = this.answers[id];
      const has = q.type === 'single' ? typeof v === 'string' : Array.isArray(v) && v.length > 0;
      if (q.required && !has) { showToast('Please answer all required questions'); this.isTransitioning = false; this.showQuestion(id, { pushHistory: true }); return; }
      if (q.type === 'multiple' && this.settings.requireNextOnMultiple && !has) { showToast('Please select at least one option'); this.isTransitioning = false; this.showQuestion(id, { pushHistory: true }); return; }
    }

    // Lock UI and move to completion immediately
    this.submitting = true;
    try { sessionStorage.setItem(this.storageKeys.current, 'complete'); } catch { }
    this.showCompletion(); // show "All done" right away

    // Save local copy (best effort)
    try {
      const key = this.storageKeys.submissions;
      const raw = localStorage.getItem(key);
      const all = raw ? JSON.parse(raw) : [];
      all.push({ timestamp: new Date().toISOString(), answers: { ...this.answers } });
      localStorage.setItem(key, JSON.stringify(all));
    } catch { }

    // Post to backend in background
    const payload = this.buildSurveyPayload(true); // Pass true for completed
    try {
      await submitSurvey(payload);
      showToast('Submitted!');
      // Clear progress on successful submit
      this.clearAllProgress();
    }
    catch (e) { console.error('Submit error:', e); showToast('Submit failed (saved locally).'); }
  }

  clearAllProgress() {
    try {
      localStorage.removeItem(this.storageKeys.answers);
      localStorage.removeItem(this.storageKeys.current);
      localStorage.removeItem(this.storageKeys.mode);
      localStorage.removeItem(this.storageKeys.history);
    } catch { }
  }

  /* Completion + restart */
  showCompletion() {
    this.dom.root.querySelectorAll('.question-container').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
    if (this.dom.completion) { this.dom.completion.style.display = 'block'; this.dom.completion.classList.add('active'); }
    if (this.dom.backBtn) this.dom.backBtn.style.display = 'none';
  }
  restart() {
    this.answers = {}; this.currentId = null; this.navHistory = [];
    this.submitting = false;
    this.navCooldownUntil = 0;
    this.interactLockUntil = 0;
    this.isTransitioning = false;
    if (this._interactUnlockTimer) { clearTimeout(this._interactUnlockTimer); this._interactUnlockTimer = null; }

    this.clearAllProgress();

    // Regenerate session ID only on explicit restarts
    try { localStorage.removeItem(this.storageKeys.sessionId); } catch { }
    this.sessionID = crypto.randomUUID();
    try { localStorage.setItem(this.storageKeys.sessionId, this.sessionID); } catch { }

    this.dom.root.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
    if (this.dom.completion) { this.dom.completion.style.display = 'none'; this.dom.completion.classList.remove('active'); }
    if (this.dom.help) { this.dom.help.style.display = 'none'; this.dom.help.classList.remove('active'); }
    if (this.dom.progressBar) this.dom.progressBar.style.width = '0%';

    const visible = this.getVisibleIds();
    if (!visible.length) return this.showCompletion();
    this.currentId = visible[0];
    this.showQuestion(this.currentId, { pushHistory: true });
  }
}
document.addEventListener('DOMContentLoaded', async () => {
  // capturing all query params (e.g., ?site=123) into sessionStorage
  captureQueryParams();

  const cookieOverlay = document.getElementById('cookieOverlay');
  const cookiesAccepted = () => { try { return localStorage.getItem('k10:cookiesAccepted') === 'yes'; } catch { return false; } };
  const showCookieIfNeeded = () => { if (!cookiesAccepted()) cookieOverlay?.classList.add('show'); };

  const startOverlay = document.getElementById('startOverlay');
  const startBegin = document.getElementById('startBegin');
  const startDismiss = document.getElementById('startDismiss');
  const startResources = document.getElementById('startResources');
  const startMedia = document.getElementById('startMedia');

  const modeOverlay = document.getElementById('modeOverlay');
  const modeSelf = document.getElementById('modeSelf');
  const modeOther = document.getElementById('modeOther');

  // Welcome banner visuals
  if (startMedia) {
    startMedia.style.backgroundImage = "url('../static/Logo.jpg')";
    startMedia.style.backgroundSize = 'contain';
    startMedia.style.backgroundRepeat = 'no-repeat';
    startMedia.style.backgroundPosition = 'center';
  }

  const openIntro = () => { document.body.classList.add('intro-open'); startOverlay?.classList.add('show'); };
  const closeIntro = persist => {
    if (persist) { try { localStorage.setItem('dyn:introSeen', 'yes'); } catch { } }
    startOverlay?.classList.remove('show');
    document.body.classList.remove('intro-open');
  };

  const openMode = () => { document.body.classList.add('intro-open'); modeOverlay?.classList.add('show'); };
  const closeMode = () => { modeOverlay?.classList.remove('show'); };

  const proceedFromMode = (modeValue) => {
    try { localStorage.setItem('dyn:mode', modeValue); } catch { }
    closeMode();
    openIntro();
  };

  modeSelf?.addEventListener('click', () => proceedFromMode('self'));
  modeOther?.addEventListener('click', () => proceedFromMode('someoneElse'));

  startBegin?.addEventListener('click', async () => {
    closeIntro(true);
    showCookieIfNeeded();

    // Ask for GPS once the user starts
    await retryGPS(); // better than a single strict attempt

    // Send "survey started" to server using canonical payload
    try {
      const payload = window.survey.buildSurveyPayload(false);
      submitSurvey(payload).catch(e => console.error('Failed to notify server of start:', e));
    } catch (err) { }

    try { const step = localStorage.getItem('dyn:currentId'); if (!step) window.survey?.restart?.(); } catch { }
    document.querySelector('.container')?.scrollIntoView({ behavior: 'smooth' });
  });
  startDismiss?.addEventListener('click', () => { closeIntro(false); showCookieIfNeeded(); });

  startResources?.addEventListener('click', () => {
    closeIntro(false);
    showCookieIfNeeded();
    if (!window.survey) return showToast('Loading resources…');
    window.survey.renderHelpResources({ all: true, from: 'start' });
    window.survey.showHelpPage();
  });

  await loadResourcesJSON();

  let config;
  try { config = await loadQuestionsJSON(); }
  catch (e) { console.error(e); showToast('Failed to load survey questions.'); return; }

  window.survey = new DynamicSurvey(config);

  // Resume / Mode logic
  const resumeOverlay = document.getElementById('resumeOverlay');
  const resumeBtn = document.getElementById('resumeBtn');
  const startFreshBtn = document.getElementById('startFreshBtn');

  const hasProgress = () => {
    try {
      const ans = JSON.parse(localStorage.getItem('dyn:answers') || '{}');
      const step = localStorage.getItem('dyn:currentId');
      return Object.keys(ans).length > 0 && step && step !== 'complete';
    } catch { return false; }
  };

  const closeResume = () => { resumeOverlay?.classList.remove('show'); document.body.classList.remove('intro-open'); };

  if (hasProgress()) {
    document.body.classList.add('intro-open');
    resumeOverlay?.classList.add('show');
    closeMode();
  } else {
    openMode();
  }

  resumeBtn?.addEventListener('click', () => {
    closeResume();
    const step = localStorage.getItem('dyn:currentId');
    if (step && step !== 'complete') {
      window.survey.showQuestion(step, { pushHistory: true });
    }
  });

  startFreshBtn?.addEventListener('click', () => {
    window.survey.clearAllProgress();

    // Regenerate session ID for fresh starts
    try { localStorage.removeItem('dyn:sessionId'); } catch { }
    window.survey.sessionID = crypto.randomUUID();
    try { localStorage.setItem('dyn:sessionId', window.survey.sessionID); } catch { }

    closeResume();
    openMode();
    window.survey.initUI();
  });
});
