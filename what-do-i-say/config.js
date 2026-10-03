window.WDIS_API_BASE = '';
window.WDIS_AI_ENDPOINT = '';
window.WDIS_PAYMENT_VERIFY_PAUSED = true;

(() => {
  const panel = document.getElementById('result-panel');
  const result = document.getElementById('result');
  const mini = panel?.querySelector('.mini');
  if (!panel || !result) return;
  panel.hidden = false;
  if (!result.textContent.trim()) result.textContent = 'Your Sparkle message will appear here.';
  if (mini) mini.textContent = 'Give me the words output';
})();
