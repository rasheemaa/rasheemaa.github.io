(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const button = $('generate-ai'), status = $('ai-status'), output = $('output');
  const allowedTasks = new Set(['content','growth','reply','sell','deal','pdf','performance']);
  const allowedOrigins = new Set([
    'https://what-do-i-say-payments.rasheema-abdullah.workers.dev',
    'https://sparkle.rasheema-abdullah.workers.dev'
  ]);
  let active = null;
  const endpoint = () => {
    const base = window.SPARKLE_CREATOR_API_BASE;
    if (window.SPARKLE_CREATOR_API_READY !== true || typeof base !== 'string' || !/^https:\/\//.test(base)) return null;
    try {
      const url = new URL(base);
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
      if (url.origin !== window.location.origin && !allowedOrigins.has(url.origin)) return null;
      return new URL('/api/creator/generate', url.origin).href;
    } catch (_) { return null; }
  };
  const payload = () => ({
    task: $('task').value, idea: $('idea').value.trim(),
    audience: $('audience').value.trim(), tone: $('tone').value,
    profile: window.SparkleCreatorProfile?.profileText() || ''
  });
  const snapshot = () => JSON.stringify({
    data: payload(), project: $('project').value, output: output.textContent,
    editor: $('draft-editor').hidden ? null : $('draft-editor').value
  });
  const setBusy = busy => {
    button.disabled = busy;
    button.textContent = busy ? 'Sparkle is drafting…' : 'Generate with AI ✦';
    $('cancel-ai').hidden = !busy;
    output.setAttribute('aria-busy', String(busy));
  };
  const cancel = (message = 'Generation cancelled. Your current work is preserved.') => {
    if (!active) return;
    clearTimeout(active.timer);
    active.controller.abort();
    active = null;
    setBusy(false);
    status.textContent = message;
  };
  window.SparkleCreatorAI = {cancel};
  $('cancel-ai').addEventListener('click', () => cancel());
  for (const id of ['task','idea','audience','tone','project','draft-editor','creator-name','creator-niche','creator-style','creator-avoid']) {
    for (const event of ['input','change']) $(id).addEventListener(event, () => cancel('Your input changed, so the previous request was cancelled. Your draft is preserved.'));
  }
  // Show the optional AI action only when a verified endpoint is available.
  // Local draft creation remains primary; staging must not advertise a dead AI button.
  const aiAvailable = Boolean(endpoint());
  const controls = $('ai-controls'), hint = $('ai-hint');
  if (controls) controls.hidden = !aiAvailable;
  if (hint) hint.hidden = !aiAvailable;
  status.textContent = aiAvailable
    ? 'Optional AI drafting is available. Review your idea before generating.'
    : '';
  button.addEventListener('click', async () => {
    if (active) return;
    const editor = $('draft-editor'), data = payload();
    if (!allowedTasks.has(data.task) || !data.idea) {
      status.textContent = 'Choose a creator task and describe your idea first.';
      $('idea').focus();
      return;
    }
    if (data.idea.length > 3000 || data.audience.length > 160 || data.tone.length > 120 || data.profile.length > 1600) {
      status.textContent = 'Your idea or Creator Brain exceeds the AI limits. Shorten it and try again. Nothing was sent.';
      return;
    }
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 8000) {
      status.textContent = 'This request is too large. Shorten your idea or Creator Brain and try again. Nothing was sent.';
      return;
    }
    const url = endpoint();
    if (!url) {
      status.textContent = 'Creator AI is not configured in this preview. Your local creative brief is still available.';
      return;
    }
    if (window.SparkleCreatorDrafts && !window.SparkleCreatorDrafts.confirmReplace()) return;
    const pending = {controller: new AbortController(), snapshot: snapshot(), timer: null};
    active = pending;
    setBusy(true);
    status.textContent = 'Sparkle is drafting. Your reviewed task, idea, audience, tone and saved Creator Brain are sent for this request. Nothing is posted.';
    pending.timer = setTimeout(() => {
      if (active === pending) cancel('Creator AI timed out. Your previous draft is preserved.');
    }, 30000);
    try {
      const response = await fetch(url, {
        method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
        redirect: 'error', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data), signal: pending.controller.signal
      });
      let result;
      try { result = await response.json(); } catch (_) { result = null; }
      if (active !== pending || pending.controller.signal.aborted) return;
      if (!response.ok && response.status === 429) throw new Error('Creator AI is busy or has reached its current allowance. Please try again later.');
      if (!response.ok && response.status === 504) throw new Error('Creator AI timed out. Your previous draft is preserved.');
      if (!response.ok && response.status >= 500) throw new Error('Creator AI is temporarily unavailable. Your draft is safe.');
      if (!response.ok) throw new Error('Creator AI could not complete this request. Check your input and try again.');
      if (typeof result?.output !== 'string' || !result.output.trim() || result.output.length > 12000 || result.task !== data.task) {
        throw new Error('The AI response could not be verified.');
      }
      if (snapshot() !== pending.snapshot) {
        status.textContent = 'Your work changed while Sparkle was drafting. The earlier response was not applied.';
        return;
      }
      output.textContent = result.output;
      editor.hidden = true;
      $('draft-editor-label').hidden = true;
      $('apply-draft').hidden = true;
      status.textContent = 'AI draft ready to review and copy. Nothing has been posted or sent.';
      window.SparkleCreatorDrafts?.recoverCurrent?.();
    } catch (error) {
      if (active !== pending) return;
      // Output and editor are never cleared while a request runs, so failures
      // cannot restore an older snapshot over work edited in the meantime.
      status.textContent = pending.controller.signal.aborted || error.name === 'AbortError'
        ? 'Creator AI timed out or was cancelled. Your previous draft is preserved.'
        : error instanceof TypeError
          ? 'Creator AI is not reachable from this preview yet. Your previous draft is preserved.'
          : String(error.message || 'Creator AI is unavailable. Your previous draft is preserved.').slice(0,180);
    } finally {
      clearTimeout(pending.timer);
      if (active === pending) { active = null; setBusy(false); }
    }
  });
})();
