(() => {
  if (window.location.pathname.startsWith('/what-do-i-say')) return;

  const POPUP_KEY = 'wdis_launch_popup_seen_v2';
  const FOUNDER_KEYS = ['wdis_founder_session_v1', 'wdis_founder_v1'];
  const TRIAL_SESSION_KEY = 'wdis_paid_trial_session_v1';
  const TRIAL_EXPIRES_KEY = 'wdis_paid_trial_expires_at_v1';
  const TRIAL_USED_KEY = 'wdis_paid_trial_used_v1';
  const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const safeGet = (key) => {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  };
  const safeSet = (key, value) => {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  };

  if (FOUNDER_KEYS.some((key) => Boolean(safeGet(key)))) return;
  const lastSeen = Number(safeGet(POPUP_KEY) || '0');
  if (Number.isFinite(lastSeen) && Date.now() - lastSeen < DAY_MS) return;

  const trialSession = safeGet(TRIAL_SESSION_KEY);
  const trialExpiresAt = Number(safeGet(TRIAL_EXPIRES_KEY) || '0');
  const trialUsed = safeGet(TRIAL_USED_KEY) === '1';
  const trialStarted = Boolean(trialSession) && Number.isFinite(trialExpiresAt) && trialExpiresAt > Date.now();
  const remaining = trialStarted ? Math.max(0, trialExpiresAt - Date.now()) : 0;
  const expired = trialUsed && !trialStarted;
  const remainingHours = Math.max(1, Math.ceil(remaining / (60 * 60 * 1000)));
  const remainingText = remainingHours > 24
    ? `${Math.ceil(remainingHours / 24)} days left`
    : `${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'} left`;

  const track = (event, params = {}) => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', event, {
        page_path: window.location.pathname,
        page_title: document.title,
        ...params
      });
    }
  };

  const style = document.createElement('style');
  style.textContent = `
    .wdis-launch-backdrop{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:18px;background:rgba(25,16,31,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;visibility:hidden;transition:opacity .22s ease,visibility .22s ease}
    .wdis-launch-backdrop[data-open="true"]{opacity:1;visibility:visible}
    .wdis-launch-card{position:relative;width:min(92vw,720px);max-height:min(88dvh,760px);overflow:auto;border:2px solid #21172c;border-radius:28px;background:linear-gradient(145deg,#fff9ef 0%,#fff0f7 56%,#eee5ff 100%);color:#21172c;box-shadow:12px 12px 0 rgba(33,23,44,.35),0 28px 80px rgba(0,0,0,.28);transform:translateY(14px) scale(.985);transition:transform .22s ease}
    .wdis-launch-backdrop[data-open="true"] .wdis-launch-card{transform:translateY(0) scale(1)}
    .wdis-launch-close{position:absolute;top:14px;right:14px;width:44px;height:44px;display:grid;place-items:center;border:2px solid #21172c;border-radius:50%;background:#fff;color:#21172c;font:900 25px/1 Arial,sans-serif;box-shadow:4px 4px 0 #21172c;cursor:pointer}
    .wdis-launch-inner{padding:clamp(30px,6vw,58px);text-align:center}
    .wdis-launch-badge{display:inline-flex;align-items:center;gap:7px;margin:0 0 18px;padding:8px 12px;border:2px solid #21172c;border-radius:999px;background:#c6f35a;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;box-shadow:3px 3px 0 #21172c}
    .wdis-launch-card h2{max-width:620px;margin:0 auto;font-family:Georgia,'Times New Roman',serif;font-size:clamp(40px,8vw,70px);line-height:.94;letter-spacing:-.045em}
    .wdis-launch-card h2 span{color:#e81778}
    .wdis-launch-lede{max-width:560px;margin:20px auto 0;color:#5f4e69;font-size:clamp(16px,2.5vw,19px);line-height:1.6}
    .wdis-launch-trial{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:24px auto 0;font-weight:900}
    .wdis-launch-trial span{padding:8px 11px;border:1.5px solid #21172c;border-radius:999px;background:#fff}
    .wdis-launch-cta{display:inline-flex;align-items:center;justify-content:center;min-height:56px;margin-top:26px;padding:14px 24px;border:2px solid #21172c;border-radius:14px;background:#ff4fa3;color:#fff;text-decoration:none;font-weight:900;box-shadow:6px 6px 0 #21172c;transition:transform .16s ease,box-shadow .16s ease}
    .wdis-launch-cta:hover,.wdis-launch-cta:focus-visible{transform:translate(2px,2px);box-shadow:4px 4px 0 #21172c;outline:none}
    .wdis-launch-note{max-width:540px;margin:18px auto 0;color:#6d5a78;font-size:13px;line-height:1.5}
    .wdis-launch-skip{display:block;margin:14px auto 0;border:0;background:transparent;color:#6d5a78;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer}
    body.wdis-launch-lock{overflow:hidden}
    @media(max-width:560px){.wdis-launch-backdrop{padding:10px}.wdis-launch-card{width:100%;border-radius:22px}.wdis-launch-inner{padding:38px 20px 28px}.wdis-launch-card h2{font-size:clamp(38px,13vw,56px)}.wdis-launch-cta{width:100%}}
    @media(prefers-reduced-motion:reduce){.wdis-launch-backdrop,.wdis-launch-card,.wdis-launch-cta{transition:none}}
  `;
  document.head.appendChild(style);

  const headline = expired
    ? 'Your trial ended. <span>Lifetime Access is still open.</span>'
    : trialStarted
      ? `Your <span>What Do I Say?</span> trial is active.`
      : 'Meet <span>What Do I Say?</span>';

  const lede = expired
    ? 'Lifetime Access is still available for $19.99 once while the launch offer is available.'
    : trialStarted
      ? `You still have ${remainingText}. Come back whenever a text, reply, boundary, apology, work message, or awkward conversation has you staring at the keyboard.`
      : 'The new online message platform from The Sheema Edit helps you write it, reply to it, or fix what you already typed. Try it for 3 days for $1 once. No automatic renewal.';

  const cta = expired
    ? 'See Lifetime Access →'
    : trialStarted
      ? 'Continue my trial →'
      : 'Start my 3-day trial · $1 →';

  const backdrop = document.createElement('div');
  backdrop.className = 'wdis-launch-backdrop';
  backdrop.dataset.open = 'false';
  backdrop.innerHTML = `
    <section class="wdis-launch-card" role="dialog" aria-modal="true" aria-labelledby="wdis-launch-title" aria-describedby="wdis-launch-description">
      <button class="wdis-launch-close" type="button" aria-label="Close platform launch announcement">×</button>
      <div class="wdis-launch-inner">
        <p class="wdis-launch-badge">✦ New platform launch</p>
        <h2 id="wdis-launch-title">${headline}</h2>
        <p class="wdis-launch-lede" id="wdis-launch-description">${lede}</p>
        <div class="wdis-launch-trial" aria-label="Launch offer">
          <span>${trialStarted ? remainingText : expired ? 'Trial ended' : '3 days · $1 once'}</span>
          <span>${trialStarted ? '$1 trial active' : 'No automatic renewal'}</span>
          <span>$19.99 lifetime access</span>
        </div>
        <a class="wdis-launch-cta" href="/what-do-i-say/">${cta}</a>
        <p class="wdis-launch-note">Lifetime Access is $19.99 once for the first 100 customers. The regular plan is intended to be $9.99/month after the launch.</p>
        <button class="wdis-launch-skip" type="button">Not right now</button>
      </div>
    </section>`;
  document.body.appendChild(backdrop);

  const close = backdrop.querySelector('.wdis-launch-close');
  const skip = backdrop.querySelector('.wdis-launch-skip');
  const ctaLink = backdrop.querySelector('.wdis-launch-cta');
  const card = backdrop.querySelector('.wdis-launch-card');
  const previouslyFocused = document.activeElement;

  const dismiss = (reason) => {
    safeSet(POPUP_KEY, String(Date.now()));
    track('wdis_launch_popup_close', { close_reason: reason, trial_started: trialStarted, trial_expired: expired });
    backdrop.dataset.open = 'false';
    document.body.classList.remove('wdis-launch-lock');
    window.setTimeout(() => {
      backdrop.remove();
      style.remove();
    }, 230);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
  };

  close.addEventListener('click', () => dismiss('close_button'));
  skip.addEventListener('click', () => dismiss('not_right_now'));
  ctaLink.addEventListener('click', () => {
    safeSet(POPUP_KEY, String(Date.now()));
    track('wdis_launch_popup_click', { trial_started: trialStarted, trial_expired: expired });
  });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) dismiss('backdrop');
  });
  document.addEventListener('keydown', (event) => {
    if (backdrop.dataset.open !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss('escape_key');
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(card.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.setTimeout(() => {
    backdrop.dataset.open = 'true';
    document.body.classList.add('wdis-launch-lock');
    close.focus();
    track('wdis_launch_popup_view', { trial_started: trialStarted, trial_expired: expired });
  }, 650);
})();