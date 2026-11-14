(() => {
  let controller = null;
  async function ask(message, history = [], task = 'chat', onStatus) {
    if (controller) throw new Error('Sparkle is already working.');
    const base = String(window.WDIS_API_BASE || '').replace(/\/$/, '');
    if (!base) throw new Error('Sparkle AI is not configured.');
    const requestController = new AbortController();
    controller = requestController;
    onStatus?.({ phase: 'generating', message: task === 'website'
      ? 'Sparkle is creating your website draft…'
      : 'Sparkle is thinking with you…' });
    try {
      const response = await fetch(base + '/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, task }),
        signal: requestController.signal,
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error || 'Sparkle could not answer. Please try again.'));
      if (typeof data.message !== 'string' || !data.message.trim()) throw new Error('Sparkle returned an empty answer.');
      if (data.type === 'website' && !data.website) throw new Error('The website draft was incomplete.');
      onStatus?.({ phase: 'complete', message: 'Sparkle is ready.' });
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const stopped = new Error('Stopped. Your request is still here.');
        stopped.code = 'sparkle_cancelled';
        throw stopped;
      }
      throw error;
    } finally {
      if (controller === requestController) controller = null;
    }
  }
  function cancel() {
    if (controller) controller.abort();
  }
  window.SparkleAssistant = Object.freeze({ ask, cancel });
})();
