window.WDIS_API_BASE = 'https://what-do-i-say-payments.rasheema-abdullah.workers.dev';
window.WDIS_AI_ENDPOINT = '';
window.WDIS_PAYMENT_VERIFY_PAUSED = false;

(() => {
  const blockCheckoutWhileVerificationIsPaused = () => {
    if (window.WDIS_PAYMENT_VERIFY_PAUSED !== true) return;

    document.querySelectorAll('a[href*="buy.stripe.com"]').forEach((link) => {
      link.dataset.paymentHref = link.getAttribute('href') || '';
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('title', 'Secure payment verification is temporarily unavailable.');
      link.addEventListener('click', (event) => event.preventDefault());
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blockCheckoutWhileVerificationIsPaused, { once: true });
  } else {
    blockCheckoutWhileVerificationIsPaused();
  }
})();

(() => {
  const panel = document.getElementById('result-panel');
  const result = document.getElementById('result');
  const mini = panel?.querySelector('.mini');
  if (!panel || !result) return;
  panel.hidden = false;
  if (!result.textContent.trim()) result.textContent = 'Your Sparkle message will appear here.';
  if (mini) mini.textContent = 'Give me the words output';
})();
