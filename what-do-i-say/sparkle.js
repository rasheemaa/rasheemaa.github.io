(() => {
  let worker = null;
  let nextId = 1;
  const pending = new Map();
  const SETUP_TIMEOUT_MS = 10 * 60 * 1000;
  const GENERATION_TIMEOUT_MS = 2 * 60 * 1000;
  const PROFILE_KEY = 'wdis_sparkle_profile_v1';
  const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function readProfilePreference() {
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      if (!value || !Number.isFinite(Number(value.at))) return null;
      if (Date.now() - Number(value.at) > PROFILE_TTL_MS) {
        localStorage.removeItem(PROFILE_KEY);
        return null;
      }
      return value;
    } catch (_) {
      return null;
    }
  }

  function rememberProfile(profile, backend) {
    if (!profile && !backend) return;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        profile: String(profile || ''),
        backend: String(backend || ''),
        at: Date.now()
      }));
    } catch (_) {}
  }

  function devicePrefersLite() {
    const saved = readProfilePreference();
    if (saved?.backend === 'wasm' || saved?.profile === 'Sparkle Lite') return true;
    return false;
  }

  function stop(message = 'Sparkle stopped. Your draft is still here.', code = 'sparkle_cancelled') {
    worker?.terminate();
    worker = null;
    pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      const error = new Error(message);
      error.code = code;
      reject(error);
    });
    pending.clear();
  }

  function armTimeout(item, ms) {
    clearTimeout(item.timer);
    item.timer = setTimeout(() => stop(
      'Sparkle took too long on this device. Your draft is saved in the form. Please try again.',
      'sparkle_timeout'
    ), ms);
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('/what-do-i-say/sparkle-worker.js?v=15', { type: 'module' });

    worker.addEventListener('message', (event) => {
      const data = event.data || {};
      const item = pending.get(data.id);
      if (!item) return;

      if (data.type === 'status' || data.type === 'progress') {
        if (data.phase === 'generating') armTimeout(item, GENERATION_TIMEOUT_MS);
        if (data.phase === 'fallback') rememberProfile(data.profile || 'Sparkle Lite', data.backend || 'wasm');
        if (data.phase === 'ready' && data.backend) rememberProfile(data.profile, data.backend);
        item.onStatus?.(data);
        return;
      }

      if (data.type === 'result') {
        clearTimeout(item.timer);
        pending.delete(data.id);
        if (!String(data.message || '').trim()) {
          item.reject(new Error('Sparkle returned an empty message. Please try again.'));
          return;
        }
        rememberProfile(data.profile, data.backend);
        item.onStatus?.({
          type: 'status',
          phase: 'complete',
          message: `${data.profile || 'Sparkle'} finished on this device.`,
          profile: data.profile || 'Sparkle',
          backend: data.backend || ''
        });
        item.resolve(String(data.message || '').trim());
        return;
      }

      if (data.type === 'error') {
        clearTimeout(item.timer);
        pending.delete(data.id);
        const error = new Error(data.message || 'Sparkle could not generate a message right now.');
        error.code = data.code || 'sparkle_error';
        item.reject(error);
      }
    });

    worker.addEventListener('error', () => {
      stop('Sparkle could not load on this browser. Please try again or use another device.', 'sparkle_load_error');
    });
    worker.addEventListener('messageerror', () => stop('Sparkle could not read the response. Please try again.', 'sparkle_message_error'));

    return worker;
  }

  function generate(payload, { onStatus } = {}) {
    if (pending.size) return Promise.reject(new Error('Sparkle is already working on a message.'));
    const id = `sparkle-${Date.now()}-${nextId++}`;
    const activeWorker = ensureWorker();

    return new Promise((resolve, reject) => {
      const item = { resolve, reject, onStatus, timer: null };
      pending.set(id, item);
      armTimeout(item, SETUP_TIMEOUT_MS);
      onStatus?.({
        type: 'status',
        phase: 'starting',
        message: 'Starting Sparkle on this device…',
        profile: 'Sparkle'
      });
      try {
        activeWorker.postMessage({
          type: 'generate',
          id,
          payload,
          preferLite: devicePrefersLite()
        });
      } catch (_) {
        stop('Sparkle could not start this request. Please try again.', 'sparkle_request_error');
      }
    });
  }

  window.Sparkle = Object.freeze({
    name: 'Sparkle',
    mode: 'on-device',
    generate,
    cancel: () => stop()
  });
})();