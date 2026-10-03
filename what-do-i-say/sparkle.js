(() => {
  let worker = null;
  let nextId = 1;
  const pending = new Map();
  const SETUP_TIMEOUT_MS = 10 * 60 * 1000;
  const GENERATION_TIMEOUT_MS = 2 * 60 * 1000;
  const PROFILE_KEY = 'wdis_sparkle_profile_v1';
  const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function readProfilePreference() {
    try {
      const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      if (!value || !Number.isFinite(Number(value.at))) return null;
      if (Date.now() - Number(value.at) > PROFILE_TTL_MS) {
        localStorage.removeItem(PROFILE_KEY);
        return null;
      }
      return value;
    } catch (_) {
      return null;
    }
  }

  function rememberProfile(profile, backend) {
    if (!profile && !backend) return;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        profile: String(profile || ''),
        backend: String(backend || ''),
        at: Date.now()
      }));
    } catch (_) {}
  }

  function devicePrefersLite() {
    const saved = readProfilePreference();
    if (saved?.backend === 'wasm' || saved?.profile === 'Sparkle Lite') return true;
    return false;
  }

  function replyIntent(text) {
    const source = String(text || '').trim();
    const marker = /\b(?:i want to say|i want my reply to (?:say|communicate)|i want to tell (?:them|him|her)|i need to say|i need my reply to (?:say|communicate)|my reply should (?:say|communicate)|reply that|respond that)\b\s*[:,-]?\s*/ig;
    let match;
    let last = null;
    while ((match = marker.exec(source))) last = match;
    if (!last) return source;
    const intent = source.slice(last.index + last[0].length).trim();
    return intent.length >= 4 ? intent : source;
  }

  function repairReplyPerspective(message, payload) {
    let output = String(message || '').trim();
    if (!output || payload?.refine || payload?.mode !== 'reply') return output;

    const intent = replyIntent(payload.text);
    if (/^\s*I\s+(?:am|['’]m)\b/i.test(intent) && /^\s*you(?:'re| are)\b/i.test(output)) {
      output = output.replace(/^\s*you(?:'re| are)\b/i, "I'm");
    }

    const feeling = intent.match(/\bI\s+(?:am|['’]m)\s+not\s+(mad|angry|upset)\s+(at|with)\s+(?:them|him|her)\b/i);
    if (feeling) {
      output = output.replace(
        new RegExp(`\\bI\\s+(?:am|['’]m)\\s+not\\s+${feeling[1]}\\s+${feeling[2]}\\s+(?:them|him|her)\\b`, 'i'),
        `I'm not ${feeling[1].toLowerCase()} ${feeling[2].toLowerCase()} you`
      );
    }

    const followUp = intent.match(/\bI\s+(?:will|['’]ll)\s+(text|call|message|contact|reply to|respond to)\s+(them|him|her)\b/i);
    if (followUp) {
      const verbPattern = followUp[1].replace(/\s+/g, '\\s+');
      output = output.replace(
        new RegExp(`\\bI\\s+(?:will|['’]ll)\\s+(${verbPattern})\\s+(?:them|him|her)\\b`, 'i'),
        (_match, verb) => `I will ${verb} you`
      );
    }

    return output.replace(/\s{2,}/g, ' ').trim();
  }

  function repairCourtesy(message) {
    return String(message || '')
      .replace(/\b(?:You're|You are) welcome for your understanding\b/gi, 'Thank you for your understanding')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function detailAnchors(text) {
    return [...new Set(String(text || '').match(/\$?\d+(?:[.,:/-]\d+)*(?:\s*(?:AM|PM|a\.m\.|p\.m\.|%))?|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi) || [])];
  }

  function anchorKey(value) {
    return String(value || '').toLowerCase().replace(/\s/g, '');
  }

  function clausePolarity(clause) {
    const text = String(clause || '');
    if (/\b(?:cannot|can't|can’t|won't|will not|unable|unavailable|not able)\b/i.test(text)) return 'negative';
    if (/\b(?:can|will|available|able to)\b/i.test(text)) return 'positive';
    return '';
  }

  function polarityByAnchor(value) {
    const map = new Map();
    const clauses = String(value || '').split(/\bbut\b|[.!?;]+/i);
    clauses.forEach((clause) => {
      const polarity = clausePolarity(clause);
      if (!polarity) return;
      detailAnchors(clause).forEach((anchor) => map.set(anchorKey(anchor), polarity));
    });
    return map;
  }

  function repairRefinementPolarity(message, payload) {
    let output = String(message || '').trim();
    if (!output || !payload?.refine || !payload.currentMessage) return output;

    const expected = polarityByAnchor(payload.currentMessage);
    if (!expected.size) return output;

    const parts = output.split(/(\bbut\b|[.!?;]+)/i);
    for (let index = 0; index < parts.length; index += 2) {
      let clause = parts[index];
      const targets = new Set(
        detailAnchors(clause)
          .map((anchor) => expected.get(anchorKey(anchor)))
          .filter(Boolean)
      );
      if (targets.size !== 1) continue;

      const target = [...targets][0];
      const actual = clausePolarity(clause);
      if (!actual || actual === target) continue;

      if (target === 'negative') {
        clause = clause
          .replace(/\b(I|we)\s+can\b/i, '$1 cannot')
          .replace(/\b(I|we)\s+will\b/i, '$1 will not')
          .replace(/\b(I|we)\s+(am|are)\s+available\b/i, '$1 $2 not available');
      } else {
        clause = clause
          .replace(/\b(I|we)\s+(?:cannot|can't|can’t)\b/i, '$1 can')
          .replace(/\b(I|we)\s+(?:won't|will not)\b/i, '$1 will')
          .replace(/\b(I|we)\s+(am|are)\s+(?:not available|unavailable)\b/i, '$1 $2 available');
      }
      parts[index] = clause;
    }

    return parts.join('').replace(/\s{2,}/g, ' ').trim();
  }

  function refinementPolarityMismatch(message, payload) {
    if (!payload?.refine || !payload.currentMessage) return false;
    const expected = polarityByAnchor(payload.currentMessage);
    const actual = polarityByAnchor(message);
    for (const [anchor, polarity] of expected.entries()) {
      if (actual.has(anchor) && actual.get(anchor) !== polarity) return true;
    }
    return false;
  }

  function alternateWordingFallback(message, payload) {
    const original = repairCourtesy(String(message || '').trim());
    if (!original) return '';

    let output = original
      .replace(/^Hello\s+([^,\n]{1,60}),\s*/i, 'Hi $1, ')
      .replace(/\bcannot\b/gi, "can't")
      .replace(/\bwill not\b/gi, "won't")
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bThank you for your understanding\b/gi, 'Thanks for understanding')
      .replace(/\bI am sorry\b/gi, 'Sorry')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (output === original) {
      output = output.replace(/^Hi\s+([^,\n]{1,60}),\s*/i, '$1, ');
    }
    if (output === original) return '';

    output = repairRefinementPolarity(output, payload);
    output = repairCourtesy(output);
    return refinementPolarityMismatch(output, payload) ? '' : output;
  }

  function schedulingRefusalFallback(payload) {
    if (payload?.mode !== 'write' || payload?.refine) return '';
    const source = String(payload.text || '').trim();
    const timePattern = '(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|a\\.m\\.|p\\.m\\.))';
    const dayPattern = '(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
    const refusal = source.match(new RegExp(`\\bI\\s+(?:cannot|can['’]t|will not|won['’]t|am unable to)\\s+(?:make|attend|join)\\s+(?:the\\s+)?${timePattern}(?:\\s+meeting)?(?:\\s+(?:on\\s+)?)?${dayPattern}?`, 'i'));
    if (!refusal) return '';

    const refusedTime = refusal[1].replace(/\s+/g, ' ').trim();
    const day = refusal[2] || '';
    const alternate = source.match(new RegExp(`\\b${timePattern}\\s+works?\\s+instead\\b`, 'i'))
      || source.match(new RegExp(`\\b(?:if|whether)\\s+${timePattern}\\s+works?\\b`, 'i'));
    const alternateTime = alternate?.[1]?.replace(/\s+/g, ' ').trim() || '';
    const mentionsMeeting = /\bmeeting\b/i.test(source);
    const name = String(payload.personName || '').trim();

    let message = `${name ? `Hi ${name}, ` : ''}I can't make the ${refusedTime}${mentionsMeeting ? ' meeting' : ''}${day ? ` ${day}` : ''}.`;
    if (alternateTime) message += ` Would ${alternateTime} work instead?`;
    return message.replace(/\s{2,}/g, ' ').trim();
  }

  function stop(message = 'Sparkle stopped. Your draft is still here.', code = 'sparkle_cancelled') {
    worker?.terminate();
    worker = null;
    pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      const error = new Error(message);
      error.code = code;
      reject(error);
    });
    pending.clear();
  }

  function armTimeout(item, ms) {
    clearTimeout(item.timer);
    item.timer = setTimeout(() => stop(
      'Sparkle took too long on this device. Your draft is saved in the form. Please try again.',
      'sparkle_timeout'
    ), ms);
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('/what-do-i-say/sparkle-worker.js?v=19', { type: 'module' });

    worker.addEventListener('message', (event) => {
      const data = event.data || {};
      const item = pending.get(data.id);
      if (!item) return;

      if (data.type === 'status' || data.type === 'progress') {
        if (data.phase === 'generating') armTimeout(item, GENERATION_TIMEOUT_MS);
        if (data.phase === 'fallback') rememberProfile(data.profile || 'Sparkle Lite', data.backend || 'wasm');
        if (data.phase === 'ready' && data.backend) rememberProfile(data.profile, data.backend);
        item.onStatus?.(data);
        return;
      }

      if (data.type === 'result') {
        clearTimeout(item.timer);
        pending.delete(data.id);
        let message = repairReplyPerspective(data.message, item.payload);
        message = repairRefinementPolarity(message, item.payload);
        message = repairCourtesy(message);
        if (!message) {
          item.reject(new Error('Sparkle returned an empty message. Please try again.'));
          return;
        }
        if (refinementPolarityMismatch(message, item.payload)) {
          const error = new Error('Sparkle could not safely preserve which date or time is available. Your previous message is still here. Please try again.');
          error.code = 'sparkle_quality';
          item.reject(error);
          return;
        }
        rememberProfile(data.profile, data.backend);
        item.onStatus?.({
          type: 'status',
          phase: 'complete',
          message: `${data.profile || 'Sparkle'} finished on this device.`,
          profile: data.profile || 'Sparkle',
          backend: data.backend || ''
        });
        item.resolve(message);
        return;
      }

      if (data.type === 'error') {
        clearTimeout(item.timer);
        pending.delete(data.id);
        if (data.code === 'sparkle_quality') {
          if (item.payload?.refine === 'another') {
            const fallback = alternateWordingFallback(item.payload.currentMessage, item.payload);
            if (fallback) {
              item.onStatus?.({
                type: 'status',
                phase: 'complete',
                message: 'Sparkle finished on this device.',
                profile: 'Sparkle'
              });
              item.resolve(fallback);
              return;
            }
          }
          const refusalFallback = schedulingRefusalFallback(item.payload);
          if (refusalFallback) {
            item.onStatus?.({
              type: 'status',
              phase: 'complete',
              message: 'Sparkle preserved your scheduling details on this device.',
              profile: 'Sparkle'
            });
            item.resolve(refusalFallback);
            return;
          }
        }
        const error = new Error(data.message || 'Sparkle could not generate a message right now.');
        error.code = data.code || 'sparkle_error';
        item.reject(error);
      }
    });

    worker.addEventListener('error', () => {
      stop('Sparkle could not load on this browser. Please try again or use another device.', 'sparkle_load_error');
    });
    worker.addEventListener('messageerror', () => stop('Sparkle could not read the response. Please try again.', 'sparkle_message_error'));

    return worker;
  }

  function generate(payload, { onStatus } = {}) {
    if (pending.size) return Promise.reject(new Error('Sparkle is already working on a message.'));
    const id = `sparkle-${Date.now()}-${nextId++}`;
    const activeWorker = ensureWorker();

    return new Promise((resolve, reject) => {
      const item = { resolve, reject, onStatus, timer: null, payload };
      pending.set(id, item);
      armTimeout(item, SETUP_TIMEOUT_MS);
      onStatus?.({
        type: 'status',
        phase: 'starting',
        message: 'Starting Sparkle on this device…',
        profile: 'Sparkle'
      });
      try {
        activeWorker.postMessage({
          type: 'generate',
          id,
          payload,
          preferLite: devicePrefersLite()
        });
      } catch (_) {
        stop('Sparkle could not start this request. Please try again.', 'sparkle_request_error');
      }
    });
  }

  window.Sparkle = Object.freeze({
    name: 'Sparkle',
    mode: 'on-device',
    generate,
    cancel: () => stop()
  });
})();