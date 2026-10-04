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

  function saveHandoff(text, mode) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        text: String(text || '').slice(0, 3500),
        mode: ['write', 'reply', 'fix'].includes(mode) ? mode : 'write',
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
      const mode = document.querySelector('.mode.active')?.dataset.mode || 'write';
      saveHandoff(text, mode);
    }, true);

    const observer = new MutationObserver(() => {
      if (hasFinishedAnswer()) clearHandoff();
    });
    observer.observe(conversation, { childList: true, subtree: true });

    const pending = readHandoff();
    if (!pending || conversation.children.length) return;

    const modeButton = document.querySelector(`.mode[data-mode="${pending.mode}"]`);
    modeButton?.click();
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
