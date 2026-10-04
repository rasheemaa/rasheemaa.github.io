(() => {
  const installMobileSparkleWorker = () => {
    const ua = navigator.userAgent || '';
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua)
      || (/Macintosh/.test(ua) && Number(navigator.maxTouchPoints || 0) > 1);
    if (!isAppleMobile || typeof window.Worker !== 'function') return;

    const NativeWorker = window.Worker;
    const MOBILE_WORKER_URL = '/what-do-i-say/sparkle-mobile-worker-v2.js?v=5';

    class RecyclingMobileWorker {
      constructor(options) {
        this.options = options;
        this.inner = null;
        this.terminated = false;
        this.listeners = new Map();
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
      }

      ensureInner() {
        if (this.terminated) return null;
        if (this.inner) return this.inner;

        const inner = new NativeWorker(MOBILE_WORKER_URL, this.options);
        this.inner = inner;
        window.__WDIS_MOBILE_WORKER_STARTS = Number(window.__WDIS_MOBILE_WORKER_STARTS || 0) + 1;

        inner.addEventListener('message', (event) => {
          this.forward('message', event);
          const type = String(event?.data?.type || '');
          if (type === 'result' || type === 'error') this.release(inner);
        });
        inner.addEventListener('error', (event) => this.forward('error', event));
        inner.addEventListener('messageerror', (event) => this.forward('messageerror', event));
        return inner;
      }

      release(inner) {
        if (this.inner !== inner) return;
        try { inner.terminate(); } catch (_) {}
        this.inner = null;
        window.__WDIS_MOBILE_WORKER_RECYCLES = Number(window.__WDIS_MOBILE_WORKER_RECYCLES || 0) + 1;
      }

      forward(type, event) {
        const handler = this[`on${type}`];
        if (typeof handler === 'function') handler.call(this, event);
        const listeners = this.listeners.get(type);
        if (!listeners) return;
        [...listeners].forEach((listener) => {
          if (typeof listener === 'function') listener.call(this, event);
          else if (listener && typeof listener.handleEvent === 'function') listener.handleEvent(event);
        });
      }

      postMessage(message, transfer) {
        const inner = this.ensureInner();
        if (!inner) return;
        if (arguments.length > 1) inner.postMessage(message, transfer);
        else inner.postMessage(message);
      }

      terminate() {
        this.terminated = true;
        if (this.inner) {
          try { this.inner.terminate(); } catch (_) {}
          this.inner = null;
        }
      }

      addEventListener(type, listener) {
        if (!listener) return;
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
      }

      removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener);
      }

      dispatchEvent(event) {
        if (!event?.type) return true;
        this.forward(event.type, event);
        return !event.defaultPrevented;
      }
    }

    const MobileAwareWorker = function Worker(scriptURL, options) {
      try {
        const requested = new URL(String(scriptURL), window.location.href);
        if (requested.origin === window.location.origin && requested.pathname === '/what-do-i-say/sparkle-worker.js') {
          window.__WDIS_MOBILE_SPARKLE = true;
          window.__WDIS_MOBILE_WORKER_RECYCLE_ENABLED = true;
          return new RecyclingMobileWorker(options);
        }
      } catch (_) {}
      return new NativeWorker(scriptURL, options);
    };

    try {
      MobileAwareWorker.prototype = NativeWorker.prototype;
      Object.setPrototypeOf(MobileAwareWorker, NativeWorker);
      window.Worker = MobileAwareWorker;
      window.__WDIS_MOBILE_SPARKLE = true;
    } catch (_) {}
  };

  installMobileSparkleWorker();

  const markFounderReturn = () => {
    const pendingFounderKey = 'wdis_pending_founder_session_v1';
    try {
      const params = new URLSearchParams(window.location.search);
      const checkout = params.get('checkout');
      const sessionId = String(params.get('session_id') || '').trim();
      if (checkout === 'success' && /^cs_(?:live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
        localStorage.setItem(pendingFounderKey, sessionId);
        document.querySelectorAll('[data-founder-status]').forEach((item) => {
          item.textContent = 'Stripe checkout return received. Launch access stays open while secure Founding verification reconnects.';
        });
      }
    } catch (_) {}
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markFounderReturn, { once: true });
  } else {
    markFounderReturn();
  }
})();