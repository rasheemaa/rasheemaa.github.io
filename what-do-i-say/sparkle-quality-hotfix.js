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

  function preservesAnchors(original, output) {
    const expected = new Set(anchors(original).map(anchorKey));
    const actual = new Set(anchors(output).map(anchorKey));
    return [...expected].every((anchor) => actual.has(anchor));
  }

  function withAddressInsertion(value, insertion) {
    const text = String(value || '').trim();
    const match = text.match(/^([A-Z][A-Za-z'’-]{1,30},\s*)([\s\S]+)$/);
    if (match) return `${match[1]}${insertion}${match[2].charAt(0).toLowerCase()}${match[2].slice(1)}`;
    return `${insertion}${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  function shortenSafely(value) {
    const original = String(value || '').trim();
    if (!original) return '';

    const output = original
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

    return preservesAnchors(original, output) && wordCount(output) < wordCount(original) ? output : '';
  }

  function fallbackRefinement(kind, value) {
    const original = String(value || '').trim();
    if (!original) return '';
    let output = original;

    if (kind === 'softer') {
      if (!/\b(?:sorry|understand|hope)\b/i.test(output)) {
        output = withAddressInsertion(output, "I'm sorry, but ");
      } else {
        output = output.replace(/\bI can't\b/i, "I'm not able to").replace(/\bI cannot\b/i, "I'm not able to");
      }
    } else if (kind === 'firmer') {
      output = output
        .replace(/\b(?:I'?m|I am)\s+(?:really\s+)?sorry(?:,?\s+but)?\s*/i, '')
        .replace(/\bI just wanted to\s+/i, '')
        .replace(/\b(?:maybe|perhaps|hopefully|really)\s+/gi, '')
        .replace(/,\s*but\s+/i, '. ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (output === original) output = withAddressInsertion(original, 'To be clear, ');
    } else if (kind === 'professional') {
      output = output
        .replace(/\bI can't\b/g, 'I cannot')
        .replace(/\bwe can't\b/gi, 'we cannot')
        .replace(/\bI'm\b/g, 'I am')
        .replace(/\bwe're\b/gi, 'we are')
        .replace(/\bI'll\b/g, 'I will')
        .replace(/\bI'd\b/g, 'I would')
        .replace(/\bI've\b/g, 'I have')
        .replace(/\bwon't\b/gi, 'will not')
        .replace(/\bdon't\b/gi, 'do not')
        .replace(/\bdoesn't\b/gi, 'does not')
        .replace(/^Hey\b/i, 'Hello')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (output === original) output = withAddressInsertion(original, 'Hello, ');
    } else if (kind === 'another') {
      output = output.replace(/,\s*but\s+/i, '. ');
      if (output === original) {
        output = output
          .replace(/\bI cannot\b/i, "I can't")
          .replace(/\bI am\b/i, "I'm");
      }
      if (output === original) output = withAddressInsertion(original, 'Just to let you know, ');
    }

    output = output.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    return output !== original && preservesAnchors(original, output) ? output : '';
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

    try {
      return await sparkle.generate(safePayload, options);
    } catch (error) {
      if (error?.code === 'sparkle_cancelled') throw error;
      const fallback = fallbackRefinement(safePayload.refine, safePayload.currentMessage);
      if (!fallback) throw error;
      options.onStatus?.({ phase: 'generating', message: 'Sparkle is polishing the wording…' });
      options.onStatus?.({ phase: 'complete', message: 'Ready on this device.' });
      return fallback;
    }
  }

  window.Sparkle = Object.freeze({
    ...sparkle,
    generate
  });
})();
