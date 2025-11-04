// Load saved theme on boot as early as possible
(function restoreTheme() {
  try {
    const savedTheme = localStorage.getItem('k10:theme');
    if (savedTheme === 'dark') document.documentElement.classList.add('dark-mode') || document.body.classList.add('dark-mode');
  } catch {}
})();

document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const syncThemeIcon = () => {
    const icon = themeToggle?.querySelector('i');
    if (!icon) return;
    const dark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark-mode');
    icon.className = dark ? 'fas fa-sun' : 'fas fa-moon';
  };

  // Theme toggle with persistence
  themeToggle?.addEventListener('click', () => {
    const target = document.body;
    target.classList.toggle('dark-mode');
    const isDark = target.classList.contains('dark-mode');
    const icon = themeToggle.querySelector('i');
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    try { localStorage.setItem('k10:theme', isDark ? 'dark' : 'light'); } catch {}
  });
  syncThemeIcon();

  class QuickSurvey {
    constructor() {
      this.currentQuestion = 1;
      this.totalQuestions = 10;
      this.answers = {};
      this.pendingAutoAdvance = null;

      this.init();
    }

    // Storage helpers for submissions
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
      this.createParticles();
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
      // Option click to select + auto-advance (except on last question)
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

      // Back button
      const backBtn = document.getElementById('backBtn');
      backBtn?.addEventListener('click', () => this.prevQuestion());

      // Keyboard navigation
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

      // Submit button
      const submitBtn = document.getElementById('submitBtn');
      submitBtn?.addEventListener('click', () => this.handleSubmit());

      // Restart button on completion
      const restartBtn = document.getElementById('restartBtn');
      restartBtn?.addEventListener('click', () => restartSurvey());
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
          // At last question; do nothing here (wait for Submit)
          this.updateProgress();
          this.updateBackButtonState();
        }
      }, 200);
    }

    prevQuestion() {
      const completionActive = document.querySelector('.question-container.active[data-question="complete"]');
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
      if (!backBtn) return;
      backBtn.style.display = onCompletion ? 'none' : 'flex';
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
        if (container && q && q !== 'complete') num.textContent = `Question ${q}/10`;
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
        "Last one next!",
      ];

      if (this.currentQuestion > 1 && this.currentQuestion <= this.totalQuestions) {
        const idx = Math.min(this.currentQuestion - 2, insights.length - 1);
        this.showToast(insights[idx]);
      }
    }

    // Submit handler: validate, save submission, show completion
    handleSubmit() {
      // Validate all questions answered
      const missing = [];
      for (let i = 1; i <= this.totalQuestions; i++) {
        if (!Number.isFinite(this.answers[i])) missing.push(i);
      }
      if (missing.length) {
        this.showToast(`Please answer Q${missing[0]} before submitting`);
        // Jump to first missing question
        this.goToQuestion(missing[0]);
        return;
      }

      const total = this.computeK10Score();

      // Save a submission entry
      const entry = {
        timestamp: new Date().toISOString(),
        answers: { ...this.answers },
        total
      };
      this.saveSubmission(entry);

      // Also persist current run as complete
      try { localStorage.setItem('k10:currentQuestion', 'complete'); } catch {}

      // Show completion summary
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
      if (!completionContainer) return;

      completionContainer.style.display = 'block';
      completionContainer.classList.add('active');

      const activeQ = document.querySelector('.question-container.active:not([data-question="complete"])');
      if (activeQ) activeQ.classList.remove('active');

      try { localStorage.setItem('k10:currentQuestion', 'complete'); } catch {}

      this.createCelebration();
      this.generateStats();
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

    interpretK10(total) {
      if (total <= 15) return { band: 'Low (10–15)', color: '#22c55e', text: 'Low level of psychological distress.' };
      if (total <= 21) return { band: 'Moderate (16–21)', color: '#eab308', text: 'Moderate distress; consider self-care and monitoring.' };
      if (total <= 29) return { band: 'High (22–29)', color: '#f97316', text: 'High distress; consider seeking professional advice.' };
      return { band: 'Very High (30–50)', color: '#ef4444', text: 'Very high distress; professional support is recommended.' };
    }

    generateStats() {
      const statsContainer = document.getElementById('stats');
      const total = this.computeK10Score();
      const interp = this.interpretK10(total);

      if (statsContainer) {
        const tiles = [];
        for (let i = 1; i <= this.totalQuestions; i++) {
          const val = this.answers[i] || 0;
          tiles.push(`
            <div class="stat">
              <span class="stat-number">${val}/5</span>
              <div class="stat-label">Q${i}</div>
            </div>
          `);
        }
        statsContainer.innerHTML = tiles.join('');
      }

      const summary = document.getElementById('k10Summary');
      const interpEl = document.getElementById('k10Interp');
      if (summary) summary.textContent = `K10 Total: ${total} / 50`;
      if (interpEl) {
        interpEl.textContent = `Interpretation: ${interp.band}. ${interp.text}`;
        interpEl.style.color = interp.color;
      }
    }

    createParticles() {
      const container = document.getElementById('particles');
      if (!container) return;
      for (let i = 0; i < 3; i++) {
        this.createParticle(container, true);
      }
    }

    createParticle(container, ambient = false) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = Math.random() * 100 + '%';
      particle.style.background = ambient ? 'rgba(34, 197, 94, 0.5)' : 'var(--accent)';
      particle.style.animationDelay = Math.random() * 2 + 's';

      container.appendChild(particle);
      setTimeout(() => particle.remove(), 3000);
    }

    createCelebration() {
      const container = document.getElementById('particles');
      if (!container) return;
      for (let i = 0; i < 20; i++) {
        setTimeout(() => this.createParticle(container, false), i * 100);
      }
      document.body.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => { document.body.style.animation = ''; }, 500);
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
    // Note: we intentionally DO NOT clear k10:submissions
  } catch {}

  const completion = document.querySelector('[data-question="complete"]');
  if (completion) {
    completion.style.display = 'none';
    completion.classList.remove('active');
  }

  document.querySelectorAll('.question-container').forEach(q => q.classList.remove('active', 'leaving'));
  const firstQuestion = document.querySelector('[data-question="1"]');
  if (firstQuestion) firstQuestion.classList.add('active');

  document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));

  const progressBar = document.getElementById('progressBar');
  if (progressBar) progressBar.style.width = '10%';

  const particles = document.getElementById('particles');
  if (particles) {
    particles.innerHTML = '';
    survey.createParticles();
  }

  survey.updateBackButtonState?.();
  document.querySelector('.container')?.scrollIntoView({ behavior: 'smooth' });
}
