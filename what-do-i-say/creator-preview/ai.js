(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const button = $('generate-ai');
  const status = $('ai-status');
  const output = $('output');
  const allowedTasks = new Set(['content','growth','reply','sell','deal','pdf','performance']);
  let busy = false;
  const endpoint = () => {
    const base = window.WDIS_API_BASE;
    if (typeof base !== 'string' || !/^https:\/\//.test(base)) return null;
    try {
      const url = new URL(base);
      if (url.username || url.password || url.search || url.hash) return null;
      return new URL('/api/creator/generate',url.origin).href;
    } catch (_) { return null; }
  };
  const payload = () => ({
    task: $('task').value,
    idea: $('idea').value.trim(),
    audience: $('audience').value.trim(),
    tone: $('tone').value,
    profile: (window.SparkleCreatorProfile?.profileText() || '').slice(0,1200)
  });
  button.addEventListener('click',async () => {
    if (busy) return;
    const editor = $('draft-editor');
    if (editor && !editor.hidden && editor.value !== output.textContent && !window.confirm('Generate a new AI draft and discard unapplied edits?')) return;
    const data = payload();
    if (!allowedTasks.has(data.task) || !data.idea) {
      status.textContent = 'Choose a creator task and describe your idea first.';
      $('idea').focus();
      return;
    }
    if (data.idea.length > 3000 || data.audience.length > 160 || data.tone.length > 120) {
      status.textContent = 'Your idea or settings exceed the AI request limits. Shorten them and try again.';
      return;
    }
    const url = endpoint();
    if (!url) { status.textContent = 'Creator AI is not configured in this preview. Your local creative brief is still available.'; return; }
    busy = true;
    button.disabled = true;
    const previous = output.textContent;
    status.textContent = 'Requesting an AI draft. Only the reviewed task, idea, audience, tone and saved Creator Brain are sent. Nothing is posted.';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),30000);
    try {
      const response = await fetch(url,{
        method:'POST',
        mode:'cors',
        cache:'no-store',
        credentials:'omit',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(data),
        signal:controller.signal
      });
      let result;
      try { result = await response.json(); } catch (_) { result = null; }
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Creator AI is not available yet.');
      if (typeof result?.output !== 'string' || !result.output.trim() || result.task !== data.task) throw new Error('The AI response could not be verified.');
      output.textContent = result.output.slice(0,12000);
      if (editor) { editor.hidden = true; $('draft-editor-label').hidden = true; $('apply-draft').hidden = true; }
      status.textContent = 'AI draft ready to review and copy. Nothing has been posted or sent.';
    } catch (error) {
      output.textContent = previous;
      status.textContent = error.name === 'AbortError'
        ? 'Creator AI timed out. Your previous draft is preserved.'
        : error instanceof TypeError
          ? 'Creator AI is not reachable from this preview yet. Your previous draft is preserved.'
          : String(error.message || 'Creator AI is unavailable. Your previous draft is preserved.').slice(0,180);
    } finally {
      clearTimeout(timeout);
      busy = false;
      button.disabled = false;
    }
  });
})();
