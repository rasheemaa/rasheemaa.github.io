(() => {
  const API_BASE = String(window.WDIS_API_BASE || '').trim().replace(/\/$/, '');
  const CHECKOUT_ENDPOINT = API_BASE ? `${API_BASE}/api/checkout` : '';
  const VERIFY_ENDPOINT = API_BASE ? `${API_BASE}/api/verify-payment` : '';
  const CLAIM_KEY = 'wdis_founder_claim_v1';
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

  function validClaim(value) {
    return /^[a-f0-9]{64}$/.test(String(value || ''));
  }

  function readClaim() {
    try {
      const value = localStorage.getItem(CLAIM_KEY) || '';
      return validClaim(value) ? value : '';
    } catch (_) {
      return '';
    }
  }

  function createClaim() {
    if (!window.crypto?.getRandomValues) return '';
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function ensureClaim() {
    const existing = readClaim();
    if (existing) return existing;

    const claim = createClaim();
    if (!claim) return '';

    try {
      localStorage.setItem(CLAIM_KEY, claim);
      return localStorage.getItem(CLAIM_KEY) === claim ? claim : '';
    } catch (_) {
      return '';
    }
  }

  // The app owns payment recovery. Add the browser claim to its verification
  // request without exposing the claim in the Stripe success URL.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || input || '');
    if (VERIFY_ENDPOINT && url === VERIFY_ENDPOINT && String(init?.method || 'GET').toUpperCase() === 'POST') {
      const claimToken = readClaim();
      let body = {};
      try { body = JSON.parse(String(init.body || '{}')); } catch (_) {}
      return nativeFetch(input, {
        ...init,
        body: JSON.stringify({ ...body, claimToken })
      });
    }
    return nativeFetch(input, init);
  };

  async function startFounderCheckout() {
    if (window.WDIS_PAYMENT_VERIFY_PAUSED === true) {
      setStatus('Secure payment verification is temporarily unavailable. Please try again later.');
      return;
    }

    if (!CHECKOUT_ENDPOINT) {
      setStatus('Secure checkout is temporarily unavailable. Please try again later.');
      return;
    }

    const claimToken = ensureClaim();
    if (!claimToken) {
      setStatus('This browser cannot safely save your purchase recovery key. Please enable site storage and try again.');
      return;
    }

    setBusy(true);
    setStatus('Opening secure Stripe checkout…');

    try {
      const response = await nativeFetch(CHECKOUT_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimToken })
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