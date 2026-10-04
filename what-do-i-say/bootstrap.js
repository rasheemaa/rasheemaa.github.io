(() => {
  const installMobileSparkleWorker = () => {
    const ua = navigator.userAgent || '';
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua)
      || (/Macintosh/.test(ua) && Number(navigator.maxTouchPoints || 0) > 1);
    if (!isAppleMobile || typeof window.Worker !== 'function') return;

    const NativeWorker = window.Worker;
    const MobileAwareWorker = function Worker(scriptURL, options) {
      try {
        const requested = new URL(String(scriptURL), window.location.href);
        if (requested.origin === window.location.origin && requested.pathname === '/what-do-i-say/sparkle-worker.js') {
          window.__WDIS_MOBILE_SPARKLE = true;
          return new NativeWorker('/what-do-i-say/sparkle-mobile-worker-v2.js?v=3', options);
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