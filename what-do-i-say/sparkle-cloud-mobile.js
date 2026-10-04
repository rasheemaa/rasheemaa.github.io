(() => {
  const ua = navigator.userAgent || '';
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && Number(navigator.maxTouchPoints || 0) > 1);
  if (!isAppleMobile) return;

  let activeController = null;

  async function generate(payload, { onStatus } = {}) {
    if (activeController) throw new Error('Sparkle is already working on a message.');

    const base = String(window.WDIS_API_BASE || '').replace(/\/$/, '');
    if (!base) {
      const error = new Error('Sparkle is temporarily unavailable. Please try again.');
      error.code = 'sparkle_config_error';
      throw error;
    }

    const controller = new AbortController();
    activeController = controller;
    onStatus?.({
      type: 'status',
      phase: 'starting',
      message: 'Starting Sparkle securely…',
      profile: 'Sparkle Cloud',
      backend: 'cloudflare-workers-ai'
    });

    try {
      onStatus?.({
        type: 'status',
        phase: 'generating',
        message: 'Sparkle is finding the words…',
        profile: 'Sparkle Cloud',
        backend: 'cloudflare-workers-ai'
      });

      const response = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        cache: 'no-store',
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(String(data?.error || 'Sparkle could not answer right now. Please try again.'));
        error.code = response.status === 429 ? 'sparkle_rate_limited' : 'sparkle_cloud_error';
        throw error;
      }

      const message = String(data?.message || '').trim();
      if (!message) {
        const error = new Error('Sparkle returned an empty message. Please try again.');
        error.code = 'sparkle_empty';
        throw error;
      }

      onStatus?.({
        type: 'status',
        phase: 'complete',
        message: 'Sparkle is ready.',
        profile: data?.profile || 'Sparkle Cloud',
        backend: data?.backend || 'cloudflare-workers-ai'
      });
      return message;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const stopped = new Error('Sparkle stopped. Your draft is still here.');
        stopped.code = 'sparkle_cancelled';
        throw stopped;
      }
      throw error;
    } finally {
      if (activeController === controller) activeController = null;
    }
  }

  function cancel() {
    if (!activeController) return;
    activeController.abort();
    activeController = null;
  }

  window.__WDIS_MOBILE_CLOUD_SPARKLE = true;
  window.Sparkle = Object.freeze({
    name: 'Sparkle',
    mode: 'cloudflare-mobile',
    generate,
    cancel
  });
})();
