// Load saved theme early
(function restoreTheme() {
  try {
    const savedTheme = localStorage.getItem('k10:theme');
    if (savedTheme === 'dark') document.body.classList.add('dark-mode');
  } catch {}
})();

// In-memory resources loaded from static/resources.json
let RESOURCES_DB = [];

// Load resources.json at runtime
async function loadResourcesJSON() {
  try {
    const res = await fetch('static/resources.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    RESOURCES_DB = await res.json();
  } catch (e) {
    console.error('Failed to load resources.json', e);
    RESOURCES_DB = [];
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const cookieOverlay = document.getElementById('cookieOverlay');
  const cookieAccept = document.getElementById('cookieAccept');
  const cookieDismiss = document.getElementById('cookieDismiss');

  const syncThemeIcon = () => {
    const dark = document.body.classList.contains('dark-mode');
    if (themeIcon) themeIcon.textContent = dark ? '☀️' : '🌙';
  };

  // Theme toggle
  themeToggle?.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    syncThemeIcon();
    try { localStorage.setItem('k10:theme', isDark ? 'dark' : 'light'); } catch {}
  });
  syncThemeIcon();

  // Cookie consent
  const cookiesAccepted = () => {
    try { return localStorage.getItem('k10:cookiesAccepted') === 'yes'; } catch { return false; }
  };
  const hideCookie = () => cookieOverlay?.classList.remove('show');
  if (!cookiesAccepted()) cookieOverlay?.classList.add('show');
  cookieAccept?.addEventListener('click', () => {
    try { localStorage.setItem('k10:cookiesAccepted', 'yes'); } catch {}
    hideCookie();
  });
  cookieDismiss?.addEventListener('click', hideCookie);

  // Load resources.json before booting the app
  await loadResourcesJSON();

  // Helper to get stored issue preferences (optional future UI)
  function getSavedIssues() {
    try {
      const raw = localStorage.getItem('k10:issues');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          depression: !!parsed.depression,
          alcohol: !!parsed.alcohol,
          opioids: !!parsed.opioids
        };
      }
    } catch {}
    return { depression: true, alcohol: false, opioids: false };
  }

  // Map risk to titles/subtitles
  function getHelpCopyForRisk(risk) {
    switch (risk) {
      case 1:
        return {
          title: 'Crisis & Support Resources',
          subtitle: 'If you or someone you know is in immediate danger, call your local emergency number. These options offer crisis help and direct support.'
        };
      case 2:
        return {
          title: 'Urgent Support Options',
          subtitle: 'You may benefit from talking to someone soon. Consider these helplines and services; call emergency services if there’s immediate danger.'
        };
      case 3:
        return {
          title: 'Support and Self‑Help Resources',
          subtitle: 'Here are supportive services and self‑help options. Reach out for professional advice if things feel tougher than usual.'
        };
      case 4:
      default:
        return {
          title: 'Wellbeing Tips & Helpful Resources',
          subtitle: 'You reported lower distress. Explore these resources to maintain wellbeing and know where to turn if you ever need extra support.'
        };
    }
  }

  class QuickSurvey {
    constructor() {
      this.currentQuestion = 1;
      this.totalQuestions = 10;
      this.answers = {};
      this.pendingAutoAdvance = null;
      this.riskCategory = undefined;
      this.init();
    }

    getSubmissions() {
      try {
        const raw = localStorage.getItem('k10:submissions');
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    }
    saveSubmission(entry) {
      const all = this.getSubmissions();
      all.push(entry);
      try { localStorage.setItem('k10:submissions', JSON.stringify(all)); } catch {}
    }

    init() {
      this.bindEvents();
      this.hydrateFromStorage();
      this.updateProgress();
      this.updateBackButtonState();
    }

    hydrateFromStorage() {
      try {
        const raw = localStorage.getItem('k10:answers');
        this.answers = raw ? JSON.parse(raw) : {};
      } catch { this.answers = {}; }

      const rawQ = localStorage.getItem('k10:currentQuestion');

      document.querySelectorAll('.question-container').forEach(q => {
        q.classList.remove('active', 'leaving');
      });

      if (rawQ === 'complete') {
        this.currentQuestion = this.totalQuestions;
        const firstQ = document.querySelector('[data-question="1"]');
        if (firstQ) firstQ.classList.remove('active');
        this.completeSurvey();
      } else {
        const savedQ = rawQ ? parseInt(rawQ, 10) : 1;
        this.currentQuestion = Number.isFinite(savedQ) && savedQ >= 1 && savedQ <= this.totalQuestions ? savedQ : 1;
        const curr = document.querySelector(`[data-question="${this.currentQuestion}"]`);
        if (curr) curr.classList.add('active');
      }

      Object.entries(this.answers).forEach(([q, val]) => {
        const container = document.querySelector(`.question-container[data-question="${q}"]`);
        if (!container) return;
        container.querySelectorAll('.option').forEach(opt => {
          const selected = parseInt(opt.dataset.value, 10) === val;
          opt.classList.toggle('selected', selected);
        });
      });
    }

    bindEvents() {
      document.addEventListener('click', (e) => {
        const option = e.target.closest('.option');
        if (!option) return;
        const active = document.querySelector('.question-container.active');
        if (!active || !active.contains(option)) return;

        this.selectOption(option);

        const isLast = String(this.currentQuestion) === String(this.totalQuestions);
        if (!isLast) {
          clearTimeout(this.pendingAutoAdvance);
          this.pendingAutoAdvance = setTimeout(() => this.nextQuestion(), 180);
        }
      });

      const backBtn = document.getElementById('backBtn');
      backBtn?.addEventListener('click', () => this.prevQuestion());

      document.addEventListener('keydown', (e) => {
        const activeContainer = document.querySelector('.question-container.active');
        if (!activeContainer) return;

        if (e.key >= '1' && e.key <= '5') {
          const options = activeContainer.querySelectorAll('.option');
          const index = parseInt(e.key, 10) - 1;
          if (options[index]) options[index].click();
        }

        if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
          e.preventDefault();
          this.prevQuestion();
        }
      });

      const submitBtn = document.getElementById('submitBtn');
      submitBtn?.addEventListener('click', () => this.handleSubmit());

      const restartBtn = document.getElementById('restartBtn');
      restartBtn?.addEventListener('click', () => restartSurvey());

      const helpBtn = document.getElementById('helpBtn');
      helpBtn?.addEventListener('click', () => {
        const issues = getSavedIssues();
        this.renderHelpResources(issues);
        showHelpPage();
      });

      document.getElementById('helpBackBtn')?.addEventListener('click', () => backToSummary());
      document.getElementById('helpRestartBtn')?.addEventListener('click', () => restartSurvey());
    }

    selectOption(option) {
      const container = option.closest('.question-container');
      const options = container.querySelectorAll('.option');
      const questionNum = container.dataset.question;

      options.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');

      this.answers[questionNum] = parseInt(option.dataset.value, 10);

      try {
        localStorage.setItem('k10:answers', JSON.stringify(this.answers));
      } catch (e) {
        console.warn('Failed to save answers:', e);
      }

      if (questionNum === '1') {
        this.showFeedback("Saved!");
      }

      if (navigator.vibrate) navigator.vibrate(25);
    }

    nextQuestion() {
      const currentContainer = document.querySelector('.question-container.active');
      if (!currentContainer) return;

      currentContainer.classList.add('leaving');

      setTimeout(() => {
        currentContainer.classList.remove('active', 'leaving');

        if (this.currentQuestion < this.totalQuestions) {
          this.currentQuestion++;
          try { localStorage.setItem('k10:currentQuestion', String(this.currentQuestion)); } catch {}
          const nextContainer = document.querySelector(`[data-question="${this.currentQuestion}"]`);
          nextContainer.classList.add('active');
          this.updateProgress();
          this.showQuickInsight();
          this.updateBackButtonState();
        } else {
          this.updateProgress();
          this.updateBackButtonState();
        }
      }, 200);
    }

    prevQuestion() {
      const completionActive = document.querySelector('.question-container.active[data-question="complete"]');
      const helpActive = document.querySelector('.question-container.active[data-question="help"]');

      if (helpActive) {
        backToSummary();
        return;
      }

      if (completionActive) {
        completionActive.classList.remove('active');
        completionActive.style.display = 'none';
        this.currentQuestion = this.totalQuestions;
        try { localStorage.setItem('k10:currentQuestion', String(this.currentQuestion)); } catch {}
        const lastQ = document.querySelector(`[data-question="${this.currentQuestion}"]`);
        lastQ.classList.add('active');
        this.updateProgress();
        this.updateBackButtonState();
        return;
      }

      if (this.currentQuestion > 1) {
        const currentContainer = document.querySelector('.question-container.active');
        currentContainer.classList.add('leaving');

        setTimeout(() => {
          currentContainer.classList.remove('active', 'leaving');
          this.currentQuestion--;
          try { localStorage.setItem('k10:currentQuestion', String(this.currentQuestion)); } catch {}
          const prevContainer = document.querySelector(`[data-question="${this.currentQuestion}"]`);
          prevContainer.classList.add('active');
          this.updateProgress();
          this.updateBackButtonState();
        }, 200);
      }
    }

    updateBackButtonState() {
      const backBtn = document.getElementById('backBtn');
      const onCompletion = document.querySelector('.question-container.active[data-question="complete"]');
      const onHelp = document.querySelector('.question-container.active[data-question="help"]');
      if (!backBtn) return;
      backBtn.style.display = (onCompletion || onHelp) ? 'none' : 'flex';
      backBtn.disabled = this.currentQuestion <= 1;
    }

    updateProgress() {
      const progress = (this.currentQuestion / this.totalQuestions) * 100;
      const progressBar = document.getElementById('progressBar');
      const nums = document.querySelectorAll('.question-number span');

      if (progressBar) progressBar.style.width = `${progress}%`;

      nums.forEach(num => {
        const container = num.closest('.question-container');
        const q = container?.dataset?.question;
        if (container && q && q !== 'complete' && q !== 'help') num.textContent = `Question ${q}/10`;
      });
    }

    showQuickInsight() {
      const insights = [
        "Thanks, moving along 🚀",
        "Great pace!",
        "You’re doing well.",
        "Halfway soon!",
        "Nice progress!",
        "Almost there!",
        "Good momentum!",
        "Just a couple more!",
        "Last one next!"
      ];

      if (this.currentQuestion > 1 && this.currentQuestion <= this.totalQuestions) {
        const idx = Math.min(this.currentQuestion - 2, insights.length - 1);
        this.showToast(insights[idx]);
      }
    }

    handleSubmit() {
      const missing = [];
      for (let i = 1; i <= this.totalQuestions; i++) {
        if (!Number.isFinite(this.answers[i])) missing.push(i);
      }
      if (missing.length) {
        this.showToast(`Please answer Q${missing[0]} before submitting`);
        this.goToQuestion(missing[0]);
        return;
      }

      const total = this.computeK10Score();

      const entry = {
        timestamp: new Date().toISOString(),
        answers: { ...this.answers },
        total
      };
      this.saveSubmission(entry);

      try { localStorage.setItem('k10:currentQuestion', 'complete'); } catch {}

      this.completeSurvey();
    }

    goToQuestion(n) {
      const current = document.querySelector('.question-container.active');
      if (current) current.classList.remove('active');

      this.currentQuestion = n;
      try { localStorage.setItem('k10:currentQuestion', String(this.currentQuestion)); } catch {}
      const target = document.querySelector(`.question-container[data-question="${n}"]`);
      target?.classList.add('active');
      this.updateProgress();
      this.updateBackButtonState();
    }

    completeSurvey() {
      const completionContainer = document.querySelector('[data-question="complete"]');
      const helpContainer = document.querySelector('[data-question="help"]');
      if (!completionContainer) return;

      if (helpContainer) {
        helpContainer.classList.remove('active');
        helpContainer.style.display = 'none';
      }

      completionContainer.style.display = 'block';
      completionContainer.classList.add('active');

      const activeQ = document.querySelector('.question-container.active:not([data-question="complete"]):not([data-question="help"])');
      if (activeQ) activeQ.classList.remove('active');

      try { localStorage.setItem('k10:currentQuestion', 'complete'); } catch {}

      this.generateStats();
      this.renderHelpResources(getSavedIssues());
      this.updateBackButtonState();

      document.querySelector('.container')?.scrollIntoView({ behavior: 'smooth' });
    }

    computeK10Score() {
      let sum = 0;
      for (let i = 1; i <= this.totalQuestions; i++) {
        sum += this.answers[i] || 0;
      }
      return sum;
    }

    // Map K10 to categories: 1=highest risk, 4=lowest risk
    computeRiskCategory(total) {
      if (total <= 15) return 4;  // Low
      if (total <= 21) return 3;  // Moderate
      if (total <= 29) return 2;  // High
      return 1;                   // Very High
    }

    generateStats() {
      const total = this.computeK10Score();
      const interp = this.interpretK10(total);
      const category = this.computeRiskCategory(total);
      this.riskCategory = category;

      const summary = document.getElementById('k10Summary');
      const interpEl = document.getElementById('k10Interp');

      if (summary) summary.textContent = `K10 Total: ${total} / 50`;
      if (interpEl) {
        interpEl.textContent = `Interpretation: ${interp.band}. ${interp.text} Risk level: ${category} of 4 (1 = highest, 4 = lowest).`;
        interpEl.style.color = interp.color;
      }

      // Also update the help page heading/subtitle now that we know risk
      this.updateHelpHeadings();
    }

    interpretK10(total) {
      if (total <= 15) return { band: 'Low (10–15)', color: '#22c55e', text: 'Low level of psychological distress.' };
      if (total <= 21) return { band: 'Moderate (16–21)', color: '#eab308', text: 'Moderate distress; consider self-care and monitoring.' };
      if (total <= 29) return { band: 'High (22–29)', color: '#f97316', text: 'High distress; consider seeking professional advice.' };
      return { band: 'Very High (30–50)', color: '#ef4444', text: 'Very high distress; professional support is recommended.' };
    }

    updateHelpHeadings() {
      const helpTitleEl = document.querySelector('.help-container .help-title');
      const helpSubtitleEl = document.querySelector('.help-container .help-subtitle');
      const total = this.computeK10Score();
      const category = this.computeRiskCategory(total);
      const copy = getHelpCopyForRisk(category);

      if (helpTitleEl) helpTitleEl.textContent = copy.title;
      if (helpSubtitleEl) helpSubtitleEl.textContent = copy.subtitle;
    }

    renderHelpResources(issuesOverride) {
      const grid = document.getElementById('helpGrid');
      const helpSubtitle = document.querySelector('.help-container .help-subtitle');
      if (!grid) return;

      const total = this.computeK10Score();
      const category = this.computeRiskCategory(total);
      this.riskCategory = category;

      // Update headings according to risk
      this.updateHelpHeadings();

      // Issues to apply (from override or saved/default)
      const issues = issuesOverride ?? getSavedIssues();
      const anySelected = !!(issues.depression || issues.alcohol || issues.opioids);

      // Filter resources: by risk level, then by issue tags
      const filtered = (RESOURCES_DB || [])
        .filter(r => Number(r.risk) === category)
        .filter(r => {
          const tags = Array.isArray(r.tags) ? r.tags.map(t => String(t).toLowerCase()) : [];

          if (!anySelected) {
            // If no explicit issue chosen, default to mental-health/general
            return tags.length === 0 || tags.includes('depression');
          }

          if (issues.depression && tags.includes('depression')) return true;
          if (issues.alcohol && tags.includes('alcohol')) return true;
          if (issues.opioids && tags.includes('opioids')) return true;
          return false;
        });

      if (helpSubtitle) {
        const topics = Object.entries(issues).filter(([, v]) => v).map(([k]) => k).join(', ') || 'general mental health';
        helpSubtitle.textContent =
          `${helpSubtitle.textContent}`;
      }

      grid.innerHTML = filtered.map(card => {
        const actions = (card.actions || []).map(a => {
          const icon = a.icon
            || (a.kind === 'sms' ? 'fas fa-comment-dots'
            : a.kind === 'web' ? 'fas fa-globe'
            : 'fas fa-phone');
          const safeHref = a.href || '#';
          const blank = a.targetBlank ? 'target="_blank" rel="noopener noreferrer"' : '';
          return `<a class="chip" href="${safeHref}" ${blank}><i class="${icon}"></i> ${a.label}</a>`;
        }).join('');
        return `
          <div class="help-card">
            <h4>${card.title}</h4>
            ${card.meta ? `<div class="help-meta">${card.meta}</div>` : ''}
            <div class="help-actions">${actions}</div>
          </div>
        `;
      }).join('');
    }

    showToast(message) {
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-secondary);
        color: var(--text-primary);
        padding: 10px 16px;
        border-radius: 25px;
        font-size: 0.9rem;
        font-weight: 800;
        z-index: 2000;
        opacity: 0;
        box-shadow: ${getComputedStyle(document.body).getPropertyValue('--shadow-a')};
        transition: all 0.3s ease;
        border: 1px solid rgba(0,0,0,0.06);
      `;
      toast.textContent = message;
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = '1'; });
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 280);
      }, 1600);
    }

    showFeedback(text) {
      const feedback = document.getElementById('feedback');
      if (!feedback) return;
      feedback.textContent = text;
      feedback.classList.add('show');
      setTimeout(() => feedback.classList.remove('show'), 1000);
    }
  }

  // Boot the survey
  window.survey = new QuickSurvey();

  // Help page navigation
  window.showHelpPage = function showHelpPage() {
    const completion = document.querySelector('[data-question="complete"]');
    const help = document.querySelector('[data-question="help"]');
    if (!help) return;
    completion?.classList.remove('active');
    if (completion) completion.style.display = 'none';
    help.style.display = 'flex';
    help.classList.add('active');
    document.getElementById('backBtn')?.style?.setProperty('display', 'none');
    document.querySelector('.container')?.scrollIntoView({ behavior: 'smooth' });
  };

  window.backToSummary = function backToSummary() {
    const completion = document.querySelector('[data-question="complete"]');
    const help = document.querySelector('[data-question="help"]');
    if (!completion) return;
    help?.classList.remove('active');
    if (help) help.style.display = 'none';
    completion.style.display = 'block';
    completion.classList.add('active');
    document.getElementById('backBtn')?.style?.removeProperty('display');
    document.querySelector('.container')?.scrollIntoView({ behavior: 'smooth' });
  };
});

// Restart and clear current run, but keep past submissions
function restartSurvey() {
  const survey = window.survey;
  if (!survey) return;

  survey.answers = {};
  survey.currentQuestion = 1;

  try {
    localStorage.removeItem('k10:answers');
    localStorage.setItem('k10:currentQuestion', '1');
  } catch {}

  const completion = document.querySelector('[data-question="complete"]');
  if (completion) {
    completion.style.display = 'none';
    completion.classList.remove('active');
  }
  const help = document.querySelector('[data-question="help"]');
  if (help) {
    help.style.display = 'none';
    help.classList.remove('active');
  }

  document.querySelectorAll('.question-container').forEach(q => q.classList.remove('active', 'leaving'));
  const firstQuestion = document.querySelector('[data-question="1"]');
  if (firstQuestion) firstQuestion.classList.add('active');

  document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));

  const progressBar = document.getElementById('progressBar');
  if (progressBar) progressBar.style.width = '10%';

  survey.updateBackButtonState?.();
  document.querySelector('.container')?.scrollIntoView({ behavior: 'smooth' });
}
