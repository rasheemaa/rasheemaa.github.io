(() => {
  const AI_ENDPOINT = String(window.WDIS_AI_ENDPOINT || '').trim();
  const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 16000;
  const keys = {
    trialStart: 'wdis_trial_started_at_v2',
    founder: 'wdis_founder_v1',
    history: 'wdis_history_v1'
  };

  const state = {
    mode: 'write',
    last: '',
    pending: false,
    lastAction: null,
    installPrompt: null
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const form = $('#message-form');
  const prompt = $('#prompt');
  const promptLabel = $('#prompt-label');
  const situation = $('#situation');
  const personName = $('#person-name');
  const resultPanel = $('#result-panel');
  const result = $('#result');
  const trialStatus = $('#trial-status');
  const trialDetail = $('#trial-detail');
  const paywall = $('#paywall');
  const installButton = $('.install-button');
  const generateButton = $('#generate');
  const errorBox = $('#ai-error');
  const errorMessage = $('#ai-error-message');
  const retryButton = $('#ai-retry');

  const safeGet = (key) => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };
  const safeSet = (key, value) => {
    try { localStorage.setItem(key, value); } catch (_) {}
  };
  const safeRemove = (key) => {
    try { localStorage.removeItem(key); } catch (_) {}
  };

  const isFounder = () => safeGet(keys.founder) === '1';
  const trialStart = () => {
    const value = Number(safeGet(keys.trialStart) || '0');
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const trialStarted = () => trialStart() > 0;
  const trialRemainingMs = () => trialStarted() ? Math.max(0, TRIAL_MS - (Date.now() - trialStart())) : TRIAL_MS;
  const trialActive = () => isFounder() || !trialStarted() || trialRemainingMs() > 0;

  function track(event, params = {}) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', event, {
      page_path: location.pathname,
      page_title: document.title,
      ...params
    });
  }

  function latencyBucket(ms) {
    if (ms < 2000) return 'under_2s';
    if (ms < 5000) return '2_to_5s';
    if (ms < 10000) return '5_to_10s';
    return 'over_10s';
  }

  function startTrialIfNeeded() {
    if (isFounder() || trialStarted()) return;
    safeSet(keys.trialStart, String(Date.now()));
    track('wdis_trial_started', { trial_days: 3 });
  }

  function updateTrial() {
    if (!trialStatus || !trialDetail) return;

    if (isFounder()) {
      trialStatus.textContent = 'Founding Member';
      trialDetail.textContent = ' · core access unlocked on this device';
      return;
    }

    if (!trialStarted()) {
      trialStatus.textContent = '3-day free trial';
      trialDetail.textContent = ' · starts with your first AI message · no card required';
      return;
    }

    const remaining = trialRemainingMs();
    if (remaining <= 0) {
      trialStatus.textContent = 'Trial ended';
      trialDetail.textContent = ' · Founding Member access is $19.99 once during launch';
      return;
    }

    const hours = Math.max(1, Math.ceil(remaining / (60 * 60 * 1000)));
    if (hours > 24) {
      trialStatus.textContent = `${Math.ceil(hours / 24)} days left`;
    } else {
      trialStatus.textContent = `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
    }
    trialDetail.textContent = ' · your free trial is active';
  }

  function currentTone() {
    return document.querySelector('input[name="tone"]:checked')?.value || 'warm';
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function showPaywall() {
    paywall.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.paywall-close')?.focus();
    track('wdis_paywall_view', { reason: 'trial_expired' });
  }

  function hidePaywall() {
    paywall.hidden = true;
    document.body.style.overflow = '';
  }

  function canUseTool() {
    if (trialActive()) return true;
    updateTrial();
    showPaywall();
    return false;
  }

  function showError(message) {
    if (!errorBox || !errorMessage) return;
    errorMessage.textContent = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearError() {
    if (errorBox) errorBox.hidden = true;
    if (errorMessage) errorMessage.textContent = '';
  }

  function setLoading(active, label = 'Finding the words…') {
    state.pending = active;
    generateButton.disabled = active;
    generateButton.dataset.loading = active ? 'true' : 'false';
    generateButton.textContent = active ? label : 'Give me the words';
    $$('.refine-row button').forEach((button) => { button.disabled = active; });
    $$('.mode').forEach((button) => { button.disabled = active; });
  }

  function saveHistory(message) {
    let history = [];
    try { history = JSON.parse(safeGet(keys.history) || '[]'); } catch (_) {}
    history.unshift({ text: message, at: Date.now() });
    history = history.slice(0, 12);
    safeSet(keys.history, JSON.stringify(history));
    renderHistory();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function renderHistory() {
    const wrap = $('#history');
    if (!wrap) return;
    let history = [];
    try { history = JSON.parse(safeGet(keys.history) || '[]'); } catch (_) {}

    if (!history.length) {
      wrap.innerHTML = '<p class="empty">Nothing saved yet.</p>';
      return;
    }

    wrap.innerHTML = history.map((item, index) => {
      const preview = item.text.length > 125 ? `${item.text.slice(0, 125)}…` : item.text;
      return `<div class="history-item"><button type="button" data-history-index="${index}"><span>${escapeHtml(preview)}</span><br><small>${new Date(item.at).toLocaleString()}</small></button></div>`;
    }).join('');

    $$('[data-history-index]').forEach((button) => button.addEventListener('click', () => {
      const item = history[Number(button.dataset.historyIndex)];
      if (!item) return;
      state.last = item.text;
      result.textContent = item.text;
      resultPanel.hidden = false;
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  function requestPayload(refine = '') {
    return {
      mode: state.mode,
      tone: currentTone(),
      situation: situation.value,
      personName: clean(personName.value),
      text: prompt.value.trim(),
      refine,
      currentMessage: refine ? state.last : ''
    };
  }

  async function callAI(payload, allowRetry = true) {
    if (!AI_ENDPOINT) {
      const error = new Error('The AI connection is still being finished. Please try again in a moment.');
      error.code = 'endpoint_missing';
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store'
      });

      let data = {};
      try { data = await response.json(); } catch (_) {}

      if (!response.ok) {
        if (allowRetry && response.status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, 650));
          return callAI(payload, false);
        }
        const error = new Error(data.error || 'That did not go through. Please try again.');
        error.code = `http_${response.status}`;
        throw error;
      }

      const message = String(data.message || '').trim();
      if (!message) {
        const error = new Error('The AI came back empty. Please try again.');
        error.code = 'empty_response';
        throw error;
      }
      return message;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('The AI took too long to answer. Tap try again.');
        timeoutError.code = 'timeout';
        throw timeoutError;
      }
      if (allowRetry && (error?.name === 'TypeError' || error?.code === 'network')) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        return callAI(payload, false);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function runAI(refine = '') {
    if (state.pending || !canUseTool()) return;

    const originalText = prompt.value.trim();
    if (!originalText) {
      showError(state.mode === 'reply' ? 'Paste the message you need to reply to first.' : 'Tell me what you want to say first.');
      prompt.focus();
      return;
    }
    if (refine && !state.last) return;

    clearError();
    state.lastAction = { refine };
    setLoading(true, refine ? 'Reworking it…' : 'Finding the words…');
    const started = performance.now();

    try {
      const message = await callAI(requestPayload(refine));
      state.last = message;
      result.textContent = message;
      resultPanel.hidden = false;
      startTrialIfNeeded();
      updateTrial();
      saveHistory(message);

      const metadata = {
        mode: state.mode,
        situation: situation.value,
        tone: currentTone(),
        latency_bucket: latencyBucket(performance.now() - started)
      };
      if (refine) {
        track('wdis_refine', { ...metadata, action: refine });
      } else {
        track('wdis_generate', metadata);
      }
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      showError(error?.message || 'The AI could not answer right now. Please try again.');
      track('wdis_ai_error', {
        stage: refine ? 'refine' : 'generate',
        error_type: String(error?.code || error?.name || 'unknown').slice(0, 40)
      });
    } finally {
      setLoading(false);
    }
  }

  $$('.mode').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      $$('.mode').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });

      if (state.mode === 'reply') {
        promptLabel.childNodes[0].nodeValue = 'What did they send you, and what do you want your reply to communicate? ';
        prompt.placeholder = 'Paste their message, then add what you want your response to say or accomplish…';
      } else if (state.mode === 'fix') {
        promptLabel.childNodes[0].nodeValue = 'Paste your draft ';
        prompt.placeholder = 'Paste what you wrote and choose how you want it to sound…';
      } else {
        promptLabel.childNodes[0].nodeValue = 'What are you trying to say? ';
        prompt.placeholder = 'Tell me what happened, what you need to say, and what you want to happen next…';
      }
      clearError();
      track('wdis_mode_select', { mode: state.mode });
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runAI('');
  });

  $('#copy').addEventListener('click', async () => {
    if (!state.last) return;
    try {
      await navigator.clipboard.writeText(state.last);
      $('#copy').textContent = 'Copied';
      setTimeout(() => { $('#copy').textContent = 'Copy'; }, 1500);
      track('wdis_copy');
    } catch (_) {
      result.focus();
      window.getSelection()?.selectAllChildren(result);
    }
  });

  $$('[data-refine]').forEach((button) => button.addEventListener('click', () => {
    if (!state.last) return;
    runAI(button.dataset.refine || '');
  }));

  retryButton?.addEventListener('click', () => {
    clearError();
    runAI(state.lastAction?.refine || '');
  });

  $$('.founder-unlock').forEach((button) => button.addEventListener('click', () => {
    safeSet(keys.founder, '1');
    updateTrial();
    hidePaywall();
    button.textContent = 'Founding access unlocked on this device';
    track('wdis_founder_unlock');
  }));

  $$('[data-founder-checkout]').forEach((link) => link.addEventListener('click', () => {
    track('wdis_founder_checkout_click', { offer: '19.99_lifetime_beta', trial_days: 3 });
  }));

  $('.paywall-close')?.addEventListener('click', hidePaywall);
  paywall?.addEventListener('click', (event) => { if (event.target === paywall) hidePaywall(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !paywall.hidden) hidePaywall(); });

  $('#clear-history').addEventListener('click', () => {
    safeRemove(keys.history);
    renderHistory();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    installButton.hidden = true;
    track('wdis_install_prompt');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/what-do-i-say/service-worker.js', { scope: '/what-do-i-say/' }).catch(() => {});
    });
  }

  updateTrial();
  renderHistory();
  window.setInterval(updateTrial, 60 * 1000);
})();
