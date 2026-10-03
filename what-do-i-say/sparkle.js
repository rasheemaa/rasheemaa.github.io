(() => {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function connectionPrefersLite() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return false;
    if (connection.saveData) return true;
    return /(^|-)2g|3g/.test(String(connection.effectiveType || '').toLowerCase());
  }

  function rejectAll(message = 'Sparkle stopped unexpectedly. Please try again.') {
    pending.forEach(({ reject }) => reject(new Error(message)));
    pending.clear();
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('/what-do-i-say/sparkle-worker.js?v=1', { type: 'module' });

    worker.addEventListener('message', (event) => {
      const data = event.data || {};
      const item = pending.get(data.id);
      if (!item) return;

      if (data.type === 'status' || data.type === 'progress') {
        item.onStatus?.(data);
        return;
      }

      if (data.type === 'result') {
        pending.delete(data.id);
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
        pending.delete(data.id);
        const error = new Error(data.message || 'Sparkle could not generate a message right now.');
        error.code = data.code || 'sparkle_error';
        item.reject(error);
      }
    });

    worker.addEventListener('error', () => {
      rejectAll('Sparkle could not load on this browser. Please try again or use another device.');
      worker?.terminate();
      worker = null;
    });

    return worker;
  }

  function generate(payload, { onStatus } = {}) {
    const id = `sparkle-${Date.now()}-${nextId++}`;
    const activeWorker = ensureWorker();

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onStatus });
      onStatus?.({
        type: 'status',
        phase: 'starting',
        message: 'Starting Sparkle on this device…',
        profile: 'Sparkle'
      });
      activeWorker.postMessage({
        type: 'generate',
        id,
        payload,
        preferLite: connectionPrefersLite()
      });
    });
  }

  window.Sparkle = Object.freeze({
    name: 'Sparkle',
    mode: 'on-device',
    generate
  });
})();
