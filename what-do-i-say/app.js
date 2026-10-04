(() => {
  const API_BASE = String(window.WDIS_API_BASE || '').trim().replace(/\/$/, '');
  const VERIFY_PAYMENT_ENDPOINT = API_BASE ? `${API_BASE}/api/verify-payment` : '';
  const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 16000;
  const keys = {
    trialStart: 'wdis_trial_started_at_v2',
    founderSession: 'wdis_founder_session_v1',
    pendingFounderSession: 'wdis_pending_founder_session_v1',
    history: 'wdis_history_v1'
  };

  const state = {
    mode: 'write',
    last: '',
    lastContext: null,
    pending: false,
    lastAction: null,
    installPrompt: null,
    founderVerified: false,
    accessReady: Promise.resolve()
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
  const cancelButton = $('#sparkle-cancel');
  const errorBox = $('#ai-error');
  const errorMessage = $('#ai-error-message');
  const retryButton = $('#ai-retry');
  const sparkleStatus = $('#sparkle-status');
  const sparkleStatusText = $('#sparkle-status-text');

  const safeGet = (key) => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };
  const safeSet = (key, value) => {
    try { localStorage.setItem(key, value); } catch (_) {}
  };
  const safeRemove = (key) => {
    try { localStorage.removeItem(key); } catch (_) {}
  };

  const isFounder = () => state.founderVerified;
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

  function setFounderStatus(message) {
    $$('[data-founder-status]').forEach((item) => { item.textContent = message; });
  }

  function setOutputActivity(active, message = 'Sparkle is working on your message…') {
    if (!resultPanel || !result) return;
    resultPanel.hidden = false;
    result.classList.toggle('is-working', active);
    if (active) {
      // Keep a real previous answer, but never show the empty placeholder as
      // if it were the outcome of the request currently running.
      if (!state.last) result.textContent = '';
      result.dataset.workingMessage = message;
      resultPanel.setAttribute('aria-busy', 'true');
    } else {
      delete result.dataset.workingMessage;
      resultPanel.setAttribute('aria-busy', 'false');
    }
  }

  function setSparkleStatus(detail = {}) {
    if (!sparkleStatus || !sparkleStatusText) return;
    const phase = String(detail.phase || detail.status || '').toLowerCase();
    sparkleStatus.dataset.state = phase || 'idle';

    if (detail.type === 'progress' && Number.isFinite(detail.progress)) {
      const percent = Math.round(detail.progress);
      const message = `Downloading Sparkle setup… ${percent}%`;
      sparkleStatusText.textContent = `${message}. Several files may be needed.`;
      if (state.pending) setOutputActivity(true, message);
      return;
    }

    if (phase === 'loading' && detail.approxDownload) {
      const message = detail.message || 'Loading Sparkle on this device…';
      sparkleStatusText.textContent = `${message} First setup is about ${detail.approxDownload}; it is cached after download.`;
      if (state.pending) setOutputActivity(true, message);
      return;
    }

    if (phase === 'generating' || phase === 'checking' || phase === 'starting' || phase === 'ready') {
      const message = detail.message || (phase === 'checking'
        ? 'Sparkle is checking the details…'
        : phase === 'generating'
          ? 'Sparkle is writing your message…'
          : 'Sparkle is getting ready…');
      sparkleStatusText.textContent = phase === 'ready'
        ? `${message} Your message stays on this device.`
        : message;
      if (state.pending) setOutputActivity(true, message);
      return;
    }

    if (phase === 'complete') {
      sparkleStatusText.textContent = `${detail.message || 'Sparkle is ready.'} Your message stays on this device.`;
      setOutputActivity(false);
      return;
    }

    if (detail.message) {
      sparkleStatusText.textContent = detail.message;
      if (state.pending) setOutputActivity(true, detail.message);
    }
  }

  function updateTrial() {
    if (!trialStatus || !trialDetail) return;

    if (isFounder()) {
      trialStatus.textContent = 'Founding Member';
      trialDetail.textContent = ' · payment verified by Stripe · core access unlocked';
      return;
    }

    if (!trialStarted()) {
      trialStatus.textContent = '3-day free trial';
      trialDetail.textContent = ' · starts with your first Sparkle message · no card required';
      return;
    }

    const remaining = trialRemainingMs();
    if (remaining <= 0) {
      trialStatus.textContent = 'Trial ended';
      trialDetail.textContent = ' · Founding Member access is $19.99 once during launch';
      return;
    }

    const hours = Math.max(1, Math.ceil(remaining / (60 * 60 * 1000)));
    trialStatus.textContent = hours > 24
      ? `${Math.ceil(hours / 24)} days left`
      : `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
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

  function setLoading(active, label = 'Sparkle is finding the words…') {
    state.pending = active;
    if (cancelButton) cancelButton.hidden = !active;
    form.setAttribute('aria-busy', String(active));
    generateButton.disabled = active;
    generateButton.dataset.loading = active ? 'true' : 'false';
    generateButton.textContent = active ? label : 'Give me the words';
    document.querySelectorAll('.refine-row button').forEach((button) => { button.disabled = active; });
    document.querySelectorAll('.mode').forEach((button) => { button.disabled = active; });
    setOutputActivity(active, active ? label : '');
    if (active) {
      requestAnimationFrame(() => resultPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
  }

  function readHistory() {
    try {
      const history = JSON.parse(safeGet(keys.history) || '[]');
      return Array.isArray(history) ? history.filter(item => item && typeof item.text === 'string').slice(0, 12) : [];
    } catch (_) { return []; }
  }

  function saveHistory(message, context) {
    let history = readHistory();
    history.unshift({ text: message, context, at: Date.now() });
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
    const history = readHistory();

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
      if (state.pending) return;
      state.last = item.text;
      state.lastContext = item.context || { mode: 'fix', text: item.text, tone: currentTone(), situation: 'general', personName: '' };
      result.textContent = item.text;
      resultPanel.hidden = false;
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  function requestPayload(refine = '') {
    if (refine && state.lastContext) return { ...state.lastContext, refine, currentMessage: state.last };
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

  async function callJSON(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store'
      });
      let data = {};
      try { data = await response.json(); } catch (_) {}
      return { response, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async function callAI(payload) {
    if (!window.Sparkle?.generate) {
      const error = new Error('Sparkle has not loaded yet. Refresh the page and try again.');
      error.code = 'sparkle_missing';
      throw error;
    }
    return window.Sparkle.generate(payload, { onStatus: setSparkleStatus });
  }

  async function verifyFounderSession(sessionId, { persist = true, quiet = false } = {}) {
    const cleanSessionId = String(sessionId || '').trim();
    if (!/^cs_live_[A-Za-z0-9]+$/.test(cleanSessionId)) {
      if (!quiet) setFounderStatus('No verified payment was found. Founding Member access stays locked.');
      return false;
    }
    if (!VERIFY_PAYMENT_ENDPOINT) {
      if (!quiet) setFounderStatus('Payment verification is temporarily unavailable. Your checkout reference is saved for verification when service returns. Paid access has not been unlocked.');
      return false;
    }

    if (!quiet) setFounderStatus('Verifying your Stripe payment…');

    try {
      const { response, data } = await callJSON(VERIFY_PAYMENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: cleanSessionId })
      });

      if (!response.ok) {
        if (!quiet) setFounderStatus(data.error || 'We could not verify that payment yet. Please try again.');
        return false;
      }

      if (data.paid !== true) {
        if (!quiet) setFounderStatus('Stripe has not marked this checkout as paid. Founding access stays locked.');
        return false;
      }

      state.founderVerified = true;
      if (persist) safeSet(keys.founderSession, cleanSessionId);
      safeRemove(keys.pendingFounderSession);
      updateTrial();
      hidePaywall();
      setFounderStatus('Payment verified by Stripe. Founding Member access is unlocked. 💗');
      return true;
    } catch (error) {
      if (!quiet) {
        setFounderStatus(error?.name === 'AbortError'
          ? 'Payment verification took too long. Refresh this page to try again.'
          : 'We could not verify your payment right now. Refresh this page to try again.');
      }
      return false;
    }
  }

  async function runAI(refine = '') {
    if (state.pending) return;
    await state.accessReady;
    if (state.pending) return;
    if (!canUseTool()) return;

    const originalText = prompt.value.trim();
    if (!refine && !originalText) {
      showError(state.mode === 'reply' ? 'Paste the message you need to reply to first.' : 'Tell me what you want to say first.');
      prompt.focus();
      return;
    }
    if (refine && !state.last) return;

    clearError();
    state.lastAction = { refine };
    setLoading(true, refine ? 'Sparkle is reworking it…' : 'Sparkle is finding the words…');
    const started = performance.now();
    const payload = requestPayload(refine);

    try {
      const message = await callAI(payload);
      if (!message) throw new Error('Sparkle came back empty. Please try again.');
      state.last = message;
      state.lastContext = { ...payload, refine: '', currentMessage: '' };
      result.textContent = message;
      resultPanel.hidden = false;
      startTrialIfNeeded();
      updateTrial();
      saveHistory(message, state.lastContext);

      const metadata = {
        engine: 'sparkle_on_device',
        mode: payload.mode,
        situation: payload.situation,
        tone: payload.tone,
        latency_bucket: latencyBucket(performance.now() - started)
      };
      if (refine) {
        track('wdis_refine', { ...metadata, action: refine });
      } else {
        track('wdis_generate', metadata);
      }
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      if (error?.code === 'sparkle_cancelled') {
        setSparkleStatus({ phase: 'idle', message: 'Stopped. Your draft is still here whenever you are ready.' });
        if (!state.last) result.textContent = 'Stopped. Your draft is still here. Tap Give me the words when you are ready.';
        return;
      }
      sparkleStatus.dataset.state = 'error';
      sparkleStatusText.textContent = error?.code === 'sparkle_quality'
        ? 'Sparkle could not verify this wording. Your draft is still here.'
        : 'Sparkle could not run on this device right now.';
      const failureMessage = error?.message || 'Sparkle could not answer right now. Please try again.';
      if (!state.last) result.textContent = failureMessage;
      showError(failureMessage);
      track('wdis_ai_error', {
        stage: refine ? 'refine' : 'generate',
        engine: 'sparkle_on_device',
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

  cancelButton?.addEventListener('click', () => window.Sparkle?.cancel());

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

  async function initializeAccess() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const returnedSession = params.get('session_id');
    const savedSession = safeGet(keys.founderSession);

    if (checkout === 'cancelled') {
      setFounderStatus('Checkout canceled. No payment was made.');
      track('wdis_checkout_cancelled', { offer: '19.99_lifetime_beta' });
      history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
    }

    if (checkout === 'success') {
      if (/^cs_live_[A-Za-z0-9]+$/.test(String(returnedSession || ''))) {
        safeSet(keys.pendingFounderSession, returnedSession);
      }
      const verified = await verifyFounderSession(returnedSession, { persist: true, quiet: false });
      track(verified ? 'wdis_payment_verified' : 'wdis_payment_verification_failed', {
        offer: '19.99_lifetime_beta'
      });
      history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
      return;
    }

    const recoverySession = savedSession || safeGet(keys.pendingFounderSession);
    if (recoverySession) {
      // A network failure must not erase the reference needed to recover a purchase.
      // This reference never grants access: each visit still requires server verification.
      await verifyFounderSession(recoverySession, { persist: true, quiet: true });
    }
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/what-do-i-say/service-worker.js', { scope: '/what-do-i-say/', updateViaCache: 'none' })
        .then(registration => registration.update()).catch(() => {});
    });
  }

  updateTrial();
  renderHistory();
  state.accessReady = initializeAccess().finally(updateTrial);
  window.setInterval(updateTrial, 60 * 1000);
})();
