(() => {
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
