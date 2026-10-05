(() => {
  const API_BASE = String(window.WDIS_API_BASE || '').trim().replace(/\/$/, '');
  const VERIFY_ENDPOINT = API_BASE ? `${API_BASE}/api/verify-payment` : '';
  const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
  const ROLLOUT_AT = Date.parse('2026-10-05T14:31:15Z');
  const EXPIRED_SENTINEL = () => String(Date.now() - TRIAL_MS - 60_000);
  const K = {
    legacyTrial: 'wdis_trial_started_at_v2',
    trialSession: 'wdis_paid_trial_session_v1',
    trialExpires: 'wdis_paid_trial_expires_at_v1',
    pendingTrial: 'wdis_pending_trial_checkout_v1',
    paidGate: 'wdis_paid_trial_gate_v1',
    trialUsed: 'wdis_paid_trial_used_v1'
  };

  const get = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const set = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const del = (key) => { try { localStorage.removeItem(key); } catch (_) {} };

  function setPaymentStatus(message) {
    document.querySelectorAll('[data-payment-status], [data-founder-status]').forEach((node) => {
      node.textContent = message;
    });
  }

  function setTrialClock(expiresAt) {
    const expiry = Number(expiresAt || 0);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      set(K.legacyTrial, EXPIRED_SENTINEL());
      return false;
    }
    set(K.legacyTrial, String(expiry - TRIAL_MS));
    set(K.trialExpires, String(expiry));
    return true;
  }

  function blockUnverifiedFreshTrial() {
    const savedPaidSession = get(K.trialSession);
    const start = Number(get(K.legacyTrial) || 0);
    const legacyFreeTrialStillActive = Number.isFinite(start) &&
      start > 0 &&
      start < ROLLOUT_AT &&
      Date.now() - start < TRIAL_MS;

    if (!savedPaidSession && !legacyFreeTrialStillActive) {
      set(K.paidGate, '1');
      set(K.legacyTrial, EXPIRED_SENTINEL());
    }
  }

  function paintTrialCopy() {
    const status = document.querySelector('#trial-status');
    const detail = document.querySelector('#trial-detail');
    if (!status || !detail) return;

    const expiresAt = Number(get(K.trialExpires) || 0);
    const hasPaidTrial = Boolean(get(K.trialSession));
    const trialUsed = get(K.trialUsed) === '1';
    const freshPaidGate = get(K.paidGate) === '1' && !trialUsed && !hasPaidTrial;

    if (hasPaidTrial && expiresAt > Date.now()) {
      const hours = Math.max(1, Math.ceil((expiresAt - Date.now()) / 3600000));
      const nextStatus = hours > 24 ? `${Math.ceil(hours / 24)} days left` : `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
      const nextDetail = ' · $1 trial active · no auto-renewal';
      if (status.textContent !== nextStatus) status.textContent = nextStatus;
      if (detail.textContent !== nextDetail) detail.textContent = nextDetail;
      return;
    }

    if (freshPaidGate) {
      if (status.textContent !== '3-day trial · $1') status.textContent = '3-day trial · $1';
      if (detail.textContent !== ' · one-time · no auto-renewal') detail.textContent = ' · one-time · no auto-renewal';
    }
  }

  async function verifyTrial(sessionId, { quiet = false } = {}) {
    const session = String(sessionId || '').trim();
    if (!VERIFY_ENDPOINT || !/^cs_live_[A-Za-z0-9]+$/.test(session)) return false;
    if (!quiet) setPaymentStatus('Verifying your $1 trial payment with Stripe…');

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 16000);
      const response = await fetch(VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session }),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors'
      });
      clearTimeout(timer);
      let data = {};
      try { data = await response.json(); } catch (_) {}

      if (response.ok && data.paid === true && data.accessType === 'trial' && Number(data.expiresAt) > Date.now()) {
        set(K.trialSession, session);
        set(K.trialUsed, '1');
        set(K.paidGate, '1');
        del(K.pendingTrial);
        setTrialClock(data.expiresAt);
        paintTrialCopy();
        const paywall = document.querySelector('#paywall');
        if (paywall) paywall.hidden = true;
        document.body.style.overflow = '';
        setPaymentStatus('Your $1 three-day trial is active. It does not renew automatically. ✨');
        return true;
      }

      if (response.ok && data.accessType === 'trial' && data.status === 'expired') {
        del(K.trialSession);
        set(K.trialUsed, '1');
        set(K.legacyTrial, EXPIRED_SENTINEL());
        set(K.trialExpires, String(Number(data.expiresAt || 0)));
        paintTrialCopy();
        if (!quiet) setPaymentStatus('Your three-day trial has ended. Choose Founding Member access to keep using Sparkle.');
        return false;
      }

      if (!quiet) setPaymentStatus(data.error || 'Stripe has not verified this $1 trial payment yet. Access stays locked.');
      return false;
    } catch (_) {
      if (!quiet) setPaymentStatus('We could not verify your $1 trial payment right now. Refresh this page to try again.');
      return false;
    }
  }

  blockUnverifiedFreshTrial();

  const query = new URLSearchParams(location.search);
  const checkout = query.get('checkout');
  const sessionId = query.get('session_id');
  const pendingTrial = get(K.pendingTrial) === '1';

  if (pendingTrial && checkout === 'success' && /^cs_live_[A-Za-z0-9]+$/.test(String(sessionId || ''))) {
    set(K.trialSession, String(sessionId));
    history.replaceState({}, '', location.pathname);
    verifyTrial(sessionId, { quiet: false });
  } else if (pendingTrial && checkout === 'cancelled') {
    del(K.pendingTrial);
    history.replaceState({}, '', location.pathname);
    set(K.legacyTrial, EXPIRED_SENTINEL());
    setPaymentStatus('Trial checkout canceled. No payment was made.');
  } else {
    const savedTrial = get(K.trialSession);
    if (savedTrial) {
      set(K.legacyTrial, EXPIRED_SENTINEL());
      verifyTrial(savedTrial, { quiet: true });
    }
  }

  const observer = new MutationObserver(() => paintTrialCopy());
  const pill = document.querySelector('.trial-pill');
  if (pill) observer.observe(pill, { childList: true, subtree: true, characterData: true });
  paintTrialCopy();
  setInterval(paintTrialCopy, 30000);
})();