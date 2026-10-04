(() => {
  const sparkle = window.Sparkle;
  if (!sparkle?.generate) return;

  function normalizeModalMay(value) {
    return String(value || '').replace(/\bmay\s+(?=(?:I|we|you|he|she|they|it)\b)/gi, (match) => {
      return /^[A-Z]/.test(match) ? 'Can ' : 'can ';
    });
  }

  function normalizeTimes(value) {
    return String(value || '').replace(/\b(0?[1-9]|1[0-2])(?::00)?\s*([ap])\.?m\.?(?!\w)/gi,
      (_match, hour, period) => `${Number(hour)} ${period.toUpperCase()}M`);
  }

  function anchors(value) {
    return [...new Set(normalizeTimes(value).match(/\$?\d+(?:[.,:/-]\d+)*(?:\s*(?:AM|PM|%))?|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi) || [])];
  }

  function anchorKey(value) {
    return String(value || '').toLowerCase().replace(/\s/g, '');
  }

  function wordCount(value) {
    return String(value || '').trim().split(/\s+/).filter(Boolean).length;
  }

  function shortenSafely(value) {
    const original = String(value || '').trim();
    if (!original) return '';

    let output = original
      .replace(/\bI am unable to\b/gi, "I can't")
      .replace(/\bwe are unable to\b/gi, "we can't")
      .replace(/\bI am\b/g, "I'm")
      .replace(/\bWe are\b/g, "We're")
      .replace(/\bwe are\b/g, "we're")
      .replace(/\bI will not\b/g, "I won't")
      .replace(/\bwe will not\b/gi, "we won't")
      .replace(/\bI cannot\b/g, "I can't")
      .replace(/\bwe cannot\b/gi, "we can't")
      .replace(/\bI will\b/g, "I'll")
      .replace(/\bI would\b/g, "I'd")
      .replace(/\bI have\b/g, "I've")
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bdoes not\b/gi, "doesn't")
      .replace(/\bit is\b/gi, "it's")
      .replace(/\bthat is\b/gi, "that's")
      .replace(/\bin order to\b/gi, 'to')
      .replace(/\bat this time\b/gi, 'now')
      .replace(/\bI just wanted to\b/gi, 'I wanted to')
      .replace(/\bThank you for\b/gi, 'Thanks for')
      .replace(/\bI am sorry\b/gi, 'Sorry')
      .replace(/\s+instead(?=[.!?]|$)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const expectedAnchors = new Set(anchors(original).map(anchorKey));
    const actualAnchors = new Set(anchors(output).map(anchorKey));
    const keepsAnchors = [...expectedAnchors].every((anchor) => actualAnchors.has(anchor));

    return keepsAnchors && wordCount(output) < wordCount(original) ? output : '';
  }

  async function generate(payload, options = {}) {
    if (!payload?.refine) return sparkle.generate(payload, options);

    const safePayload = {
      ...payload,
      text: normalizeModalMay(payload.text),
      currentMessage: normalizeModalMay(payload.currentMessage)
    };

    if (safePayload.refine === 'shorter') {
      const shortened = shortenSafely(safePayload.currentMessage);
      if (shortened) {
        options.onStatus?.({ phase: 'generating', message: 'Sparkle is tightening the message…' });
        options.onStatus?.({ phase: 'complete', message: 'Ready on this device.' });
        return shortened;
      }
    }

    return sparkle.generate(safePayload, options);
  }

  window.Sparkle = Object.freeze({
    ...sparkle,
    generate
  });
})();
