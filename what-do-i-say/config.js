window.WDIS_API_BASE = 'https://what-do-i-say-payments.rasheema-abdullah.workers.dev';
window.WDIS_AI_ENDPOINT = '';
window.WDIS_PAYMENT_VERIFY_PAUSED = false;

(() => {
  const blockCheckoutWhileVerificationIsPaused = () => {
    if (window.WDIS_PAYMENT_VERIFY_PAUSED !== true) return;

    document.querySelectorAll('[data-founder-checkout], a[href*="buy.stripe.com"]').forEach((control) => {
      control.dataset.paymentHref = control.getAttribute?.('href') || '';
      control.removeAttribute?.('href');
      control.setAttribute('aria-disabled', 'true');
      control.setAttribute('title', 'Secure payment verification is temporarily unavailable.');
      if ('disabled' in control) control.disabled = true;
      control.addEventListener('click', (event) => event.preventDefault());
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blockCheckoutWhileVerificationIsPaused, { once: true });
  } else {
    blockCheckoutWhileVerificationIsPaused();
  }
})();