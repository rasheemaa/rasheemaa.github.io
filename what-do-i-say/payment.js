(() => {
  const API_BASE = String(window.WDIS_API_BASE || '').trim().replace(/\/$/, '');
  const CHECKOUT_ENDPOINT = API_BASE ? `${API_BASE}/api/checkout` : '';
  const buttons = () => Array.from(document.querySelectorAll('[data-founder-checkout]'));

  function setStatus(message) {
    document.querySelectorAll('[data-founder-status]').forEach((item) => {
      item.textContent = message;
    });
  }

  function setBusy(active) {
    buttons().forEach((button) => {
      button.disabled = active;
      button.setAttribute('aria-busy', String(active));
    });
  }

  async function startFounderCheckout() {
    if (window.WDIS_PAYMENT_VERIFY_PAUSED === true) {
      setStatus('Secure payment verification is temporarily unavailable. Please try again later.');
      return;
    }

    if (!CHECKOUT_ENDPOINT) {
      setStatus('Secure checkout is temporarily unavailable. Please try again later.');
      return;
    }

    setBusy(true);
    setStatus('Opening secure Stripe checkout…');

    try {
      const response = await fetch(CHECKOUT_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });

      let data = {};
      try { data = await response.json(); } catch (_) {}

      if (!response.ok) {
        throw new Error(data.error || 'Secure checkout could not start. Please try again.');
      }

      const sessionId = String(data.sessionId || '').trim();
      const checkoutUrl = String(data.url || '').trim();
      const validSession = /^cs_live_[A-Za-z0-9]+$/.test(sessionId);
      let validUrl = false;

      try {
        const parsed = new URL(checkoutUrl);
        validUrl = parsed.protocol === 'https:' && parsed.hostname === 'checkout.stripe.com';
      } catch (_) {}

      if (!validSession || !validUrl) {
        throw new Error('Secure checkout returned an invalid response. Please try again.');
      }

      window.location.assign(checkoutUrl);
    } catch (error) {
      setBusy(false);
      setStatus(error?.message || 'Secure checkout could not start. Please try again.');
    }
  }

  buttons().forEach((button) => {
    button.addEventListener('click', startFounderCheckout);
  });
})();