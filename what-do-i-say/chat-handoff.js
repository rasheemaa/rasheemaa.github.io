(() => {
  const KEY = 'wdis_chat_handoff_v1';
  const MAX_AGE_MS = 5 * 60 * 1000;

  function readHandoff() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.text !== 'string' || !data.text.trim()) return null;
      if (!Number.isFinite(data.at) || Date.now() - data.at > MAX_AGE_MS) {
        sessionStorage.removeItem(KEY);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function saveHandoff(text) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        text: String(text || '').slice(0, 3500),
        at: Date.now()
      }));
    } catch {}
  }

  function clearHandoff() {
    try { sessionStorage.removeItem(KEY); } catch {}
  }

  function hasFinishedAnswer() {
    return Boolean(document.querySelector('.message-row.assistant:not(.working)'));
  }

  function setup() {
    const form = document.querySelector('#message-form');
    const prompt = document.querySelector('#prompt');
    const conversation = document.querySelector('#conversation');
    if (!form || !prompt || !conversation) return;

    form.addEventListener('submit', () => {
      const text = String(prompt.value || '').trim();
      if (!text || hasFinishedAnswer()) return;
      saveHandoff(text);
    }, true);

    const observer = new MutationObserver(() => {
      if (hasFinishedAnswer()) clearHandoff();
    });
    observer.observe(conversation, { childList: true, subtree: true });

    const pending = readHandoff();
    if (!pending || conversation.children.length) return;

    prompt.value = pending.text;
    prompt.dispatchEvent(new Event('input', { bubbles: true }));

    const resume = () => {
      if (hasFinishedAnswer() || conversation.children.length) return;
      if (!window.Sparkle?.generate) {
        setTimeout(resume, 120);
        return;
      }
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else document.querySelector('#generate')?.click();
    };
    requestAnimationFrame(resume);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
