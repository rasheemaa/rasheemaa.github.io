(() => {
  const ua = navigator.userAgent || '';
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && Number(navigator.maxTouchPoints || 0) > 1);
  if (!isAppleMobile) return;

  let activeController = null;

  const normalizeSpace = value => String(value || '').replace(/\s+/g, ' ').trim();
  const normalized = value => normalizeSpace(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const hasRefusal = value => /\b(?:cannot|can't|can’t|won't|won’t|will not|unable|unavailable|not able)\b/i.test(String(value || ''));

  function extractAnchors(value, payload = {}) {
    const source = String(value || '');
    const found = [];
    const patterns = [
      /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|today|tomorrow|tonight)\b/gi,
      /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.)\b/gi,
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
      /\$\s*\d+(?:\.\d{1,2})?/g
    ];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) found.push(normalizeSpace(match[0]));
    }
    const personName = normalizeSpace(payload?.personName);
    if (personName) found.push(personName);
    const greeting = source.match(/^(?:Hi|Hello|Hey|Dear)\s+([^,!.?]{1,60})[,!.?]/i);
    if (greeting?.[1]) found.push(normalizeSpace(greeting[1]));
    return [...new Set(found.filter(Boolean))];
  }

  function preservesFacts(output, source, payload) {
    const candidate = normalizeSpace(output);
    if (!candidate) return false;
    const compactCandidate = candidate.toLowerCase().replace(/\s+/g, '');
    for (const anchor of extractAnchors(source, payload)) {
      const compactAnchor = anchor.toLowerCase().replace(/\s+/g, '');
      if (!compactCandidate.includes(compactAnchor)) return false;
    }
    if (hasRefusal(source) && !hasRefusal(candidate)) return false;
    if (payload?.refine === 'another' && normalized(candidate) === normalized(source)) return false;
    if (payload?.refine === 'shorter' && candidate.split(/\s+/).length >= normalizeSpace(source).split(/\s+/).length) return false;
    return true;
  }

  function sentence(value) {
    let output = normalizeSpace(value);
    if (output && !/[.!?]$/.test(output)) output += '.';
    return output;
  }

  function softer(source) {
    const current = sentence(source);
    if (/\b(?:hope you understand|please|sorry|appreciate|thank you|thanks)\b/i.test(current)) return current;
    return `${current} I hope you understand.`;
  }

  function firmer(source) {
    return sentence(String(source || '')
      .replace(/\bI hope you understand\.?\s*/gi, '')
      .replace(/^Unfortunately,?\s*/i, '')
      .replace(/\bI(?:'m| am) sorry\b[,.]?\s*/gi, '')
      .replace(/\bSorry\b[,.]?\s*/gi, ''));
  }

  function professional(source) {
    return sentence(String(source || '')
      .replace(/\bcan['’]t\b/gi, 'cannot')
      .replace(/\bwon['’]t\b/gi, 'will not')
      .replace(/\bdon['’]t\b/gi, 'do not')
      .replace(/\bdidn['’]t\b/gi, 'did not')
      .replace(/\bI['’]m\b/gi, 'I am')
      .replace(/\bI['’]ll\b/gi, 'I will')
      .replace(/\bI['’]ve\b/gi, 'I have'));
  }

  function shorter(source) {
    const current = normalizeSpace(source);
    let output = current
      .replace(/^Hi\s+([^,]+),\s*/i, '$1, ')
      .replace(/\bI am\b/gi, "I'm")
      .replace(/\bI will\b/gi, "I'll")
      .replace(/\bI have\b/gi, "I've")
      .replace(/\bI cannot\b/gi, "I can't")
      .replace(/\bI do not\b/gi, "I don't")
      .replace(/\bjust\b\s*/gi, '')
      .replace(/\breally\b\s*/gi, '')
      .replace(/\bI wanted to let you know that\b/gi, '')
      .replace(/\bI wanted to let you know\b/gi, '');
    output = sentence(output);
    return output.split(/\s+/).length < current.split(/\s+/).length ? output : current;
  }

  function another(source) {
    let output = normalizeSpace(source);
    if (/^Hi\s+/i.test(output)) output = output.replace(/^Hi\s+/i, 'Hello ');
    else if (/^Hello\s+/i.test(output)) output = output.replace(/^Hello\s+/i, 'Hi ');
    else output = `Just to be clear, ${output.charAt(0).toLowerCase()}${output.slice(1)}`;
    return sentence(output);
  }

  function safeRefinement(payload) {
    const source = normalizeSpace(payload?.currentMessage);
    const kind = String(payload?.refine || '');
    if (!source) return '';
    if (kind === 'shorter') return shorter(source);
    if (kind === 'softer') return softer(source);
    if (kind === 'firmer') return firmer(source);
    if (kind === 'professional') return professional(source);
    if (kind === 'another') return another(source);
    return source;
  }

  function customRefinement(payload) {
    const source = normalizeSpace(payload?.currentMessage);
    const instruction = normalizeSpace(payload?.text).split(/Message to edit:/i)[0];
    if (!source) return '';
    if (/less apologetic|less sorry|not apologetic/i.test(instruction)) return firmer(source);
    if (/warmer|softer|gentler|kinder/i.test(instruction)) return softer(source);
    if (/shorter|more concise|brief/i.test(instruction)) return shorter(source);
    if (/professional|formal/i.test(instruction)) return professional(source);
    if (/firmer|more direct|more assertive/i.test(instruction)) return firmer(source);
    return another(source);
  }

  async function generate(payload, { onStatus } = {}) {
    if (activeController) throw new Error('Sparkle is already working on a message.');

    const base = String(window.WDIS_API_BASE || '').replace(/\/$/, '');
    if (!base) {
      const error = new Error('Sparkle is temporarily unavailable. Please try again.');
      error.code = 'sparkle_config_error';
      throw error;
    }

    if (payload?.refine === 'custom') {
      onStatus?.({
        type: 'status',
        phase: 'generating',
        message: 'Sparkle is reworking it…',
        profile: 'Sparkle Mobile',
        backend: 'mobile-safe-refinement'
      });
      const custom = customRefinement(payload);
      if (!custom) {
        const error = new Error('Sparkle could not rework that message. Please try again.');
        error.code = 'sparkle_refine_error';
        throw error;
      }
      onStatus?.({ type: 'status', phase: 'complete', message: 'Sparkle is ready.', profile: 'Sparkle Mobile', backend: 'mobile-safe-refinement' });
      return custom;
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

      let message = String(data?.message || '').trim();
      if (!message) {
        const error = new Error('Sparkle returned an empty message. Please try again.');
        error.code = 'sparkle_empty';
        throw error;
      }

      if (payload?.refine && payload?.currentMessage && !preservesFacts(message, payload.currentMessage, payload)) {
        const fallback = safeRefinement(payload);
        if (fallback) message = fallback;
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
