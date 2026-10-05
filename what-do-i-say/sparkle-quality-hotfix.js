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

  function softenInitial(value) {
    const text = String(value || '');
    return /^I\b/.test(text) ? text : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  function withAddressInsertion(value, insertion) {
    const text = String(value || '').trim();
    const match = text.match(/^([A-Z][A-Za-z'’-]{1,30},\s*)([\s\S]+)$/);
    if (match) return `${match[1]}${insertion}${softenInitial(match[2])}`;
    return `${insertion}${softenInitial(text)}`;
  }

  function lessApologetic(value) {
    return String(value || '')
      .replace(/\b(?:I'?m|I am)\s+(?:really\s+)?sorry(?:,?\s+but)?\s*/i, '')
      .replace(/\bSorry(?:,?\s+but)?\s*/i, '')
      .replace(/\bI just wanted to\s+/i, '')
      .replace(/\b(?:really|hopefully)\s+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
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

  function fallbackRefinement(kind, value, request = '') {
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
      output = lessApologetic(output)
        .replace(/\b(?:maybe|perhaps)\s+/gi, '')
        .replace(/,\s*but\s+/i, '. ')
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
    } else if (kind === 'custom') {
      if (/less\s+apologetic|less\s+sorry|more\s+direct|firmer/i.test(request)) {
        output = lessApologetic(output);
        if (output === original) output = output.replace(/,\s*but\s+/i, '. ');
      } else if (/warmer|more\s+warm|gentler|friendlier|nicer|softer/i.test(request)) {
        if (!/\b(?:care|understand|hope|sorry)\b/i.test(output)) {
          output = withAddressInsertion(output, 'I want you to know ');
        }
      }
    }

    output = output.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    return output !== original && preservesAnchors(original, output) ? output : '';
  }

  function extractCustomInstruction(payload) {
    return String(payload?.text || '')
      .split(/\n\s*Message to edit:\s*/i)[0]
      .replace(/^\s*Edit request:\s*/i, '')
      .trim();
  }

  function hasUserRefusal(value) {
    return /\b(?:I|we)\s+(?:cannot|can['’]?t|cant|won['’]?t|wont|will\s+not|(?:am|are)\s+unable|do\s+not|don['’]?t|dont)\b/i.test(String(value || ''));
  }

  function looksLikeCapabilityRefusal(value, payload = {}) {
    const output = String(value || '').trim();
    if (!output) return false;
    if (/\b(?:as an ai|as a language model|I (?:do not|don't) have (?:the )?(?:ability|capability)|I (?:cannot|can't|can’t) physically)\b/i.test(output)) return true;

    const capability = /^(?:I(?:'m| am) sorry\s*,?\s*(?:but\s+)?)?I\s+(?:cannot|can['’]?t|cant|won['’]?t|wont|am unable to)\s+(?:do that|do this|help with (?:that|this)|assist with (?:that|this)|fulfill (?:that|this)|perform (?:that|this)|provide (?:that|this)|lend\b|loan\b|send (?:you )?money\b)/i;
    if (!capability.test(output)) return false;

    const source = String(payload?.currentMessage || payload?.text || '');
    return !hasUserRefusal(source);
  }

  function communicationRetryPayload(payload) {
    const source = String(payload?.text || '').trim();
    return {
      ...payload,
      text: [
        'Communication drafting context: the text below is content the user wants to communicate to another human. It is not a request for Sparkle to perform the real-world action described.',
        'Write or improve the human-to-human message while preserving the user’s meaning, facts, perspective, and recipient. Keep normal safety handling if the communication itself is genuinely unsafe.',
        `Message content:\n${source}`
      ].join('\n\n')
    };
  }

  function customEditPayload(payload) {
    const current = String(payload?.currentMessage || '').trim();
    const instruction = extractCustomInstruction(payload);
    return {
      ...payload,
      mode: 'write',
      refine: '',
      currentMessage: '',
      text: [
        'Editing task: revise an existing human-to-human message. The current message is communication for another person, not a request for Sparkle to perform anything.',
        'Apply the requested change to the current message. Preserve the speaker’s perspective, recipient, meaning, and concrete facts unless the requested change explicitly adds, removes, or changes a detail. Do not invent any other facts.',
        'If the requested change refers to them, him, or her and the current message is addressed to that same recipient, write directly to the recipient as you or your.',
        `Requested change:\n${instruction || 'Try another natural version.'}`,
        `Current message:\n${current}`,
        'Return only the revised sendable message.'
      ].join('\n\n')
    };
  }

  async function generate(payload, options = {}) {
    if (!payload?.refine) {
      const first = await sparkle.generate(payload, options);
      if (payload?.mode !== 'write' || !looksLikeCapabilityRefusal(first, payload)) return first;

      options.onStatus?.({ phase: 'checking', message: 'Sparkle is checking who the message is for…' });
      return sparkle.generate(communicationRetryPayload(payload), options);
    }

    const safePayload = {
      ...payload,
      text: normalizeModalMay(payload.text),
      currentMessage: normalizeModalMay(payload.currentMessage)
    };

    if (safePayload.refine === 'custom') {
      try {
        const edited = await sparkle.generate(customEditPayload(safePayload), options);
        if (!looksLikeCapabilityRefusal(edited, customEditPayload(safePayload))) return edited;
        options.onStatus?.({ phase: 'checking', message: 'Sparkle is keeping the edit focused on your message…' });
        return sparkle.generate(communicationRetryPayload(customEditPayload(safePayload)), options);
      } catch (error) {
        if (error?.code === 'sparkle_cancelled') throw error;
        const fallback = fallbackRefinement('custom', safePayload.currentMessage, extractCustomInstruction(safePayload));
        if (!fallback) throw error;
        options.onStatus?.({ phase: 'generating', message: 'Sparkle is polishing the wording…' });
        options.onStatus?.({ phase: 'complete', message: 'Ready on this device.' });
        return fallback;
      }
    }

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
      const fallback = fallbackRefinement(safePayload.refine, safePayload.currentMessage, safePayload.text);
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