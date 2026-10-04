const requestPayloads = new Map();
const nativePostMessage = self.postMessage.bind(self);
let baseReady = false;

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function wordCount(value) {
  return normalizeSpace(value).split(/\s+/).filter(Boolean).length;
}

function normalizedWording(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function looksLikeDraftingMeta(value) {
  const output = normalizeSpace(value);
  return /^(?:version of (?:the )?message|(?:here(?:'s| is)|this is) (?:a |an |the )?(?:rewritten|revised|alternative|different)|(?:rewritten|revised|alternative) (?:version|message)|(?:your|the) (?:response|reply|message) should\b|(?:in|with) different wording|different wording and sentence structure|sentence structure\s*:)/i.test(output);
}

function polishKnownCasing(value, payload) {
  let output = normalizeSpace(value);
  const name = normalizeSpace(payload?.personName);
  if (name) output = output.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi'), name);
  output = output.replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
    (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase());
  return output;
}

function refinementFallback(payload) {
  const action = String(payload?.refine || '');
  const source = polishKnownCasing(payload?.currentMessage, payload);
  const name = normalizeSpace(payload?.personName);
  if (!action || !source) return '';

  if (action === 'shorter') {
    let output = source;
    if (name) {
      output = output.replace(new RegExp(`^(?:hey|hi|hello)\\s+${escapeRegExp(name)}\\s*,?\\s*`, 'i'), `${name}, `);
    } else {
      output = output.replace(/^(?:hey|hi|hello)\s+/i, '');
    }
    output = output
      .replace(/\bI am (?:unable|not able) to\b/gi, "I can't")
      .replace(/\bI will not\b/gi, "I won't")
      .replace(/\bI do not\b/gi, "I don't")
      .replace(/\bI am\b/gi, "I'm")
      .replace(/\bI will\b/gi, "I'll")
      .replace(/\bI have\b/gi, "I've")
      .replace(/[\s,]+sorry[.!?]*$/i, '.');
    output = normalizeSpace(output);
    return wordCount(output) < wordCount(source) ? output : '';
  }

  if (action === 'softer') {
    if (/\b(?:sorry|please|thank|thanks|appreciate|understand|unfortunately|would|could|hope|kindly)\b/i.test(source)) return source;
    return `Unfortunately, ${source}`;
  }

  if (action === 'firmer') {
    let output = source
      .replace(/^Unfortunately,\s*/i, '')
      .replace(/[\s,]+(?:I(?:'m| am)\s+)?sorry[.!?]*$/i, '.')
      .replace(/\s+Please\.\s*$/i, '.');
    return normalizeSpace(output);
  }

  if (action === 'professional') {
    let output = source
      .replace(/^Unfortunately,\s*/i, '')
      .replace(/\bcan['’]t\b/gi, 'cannot')
      .replace(/\bwon['’]t\b/gi, 'will not')
      .replace(/\bdon['’]t\b/gi, 'do not')
      .replace(/\bdoesn['’]t\b/gi, 'does not')
      .replace(/\bdidn['’]t\b/gi, 'did not')
      .replace(/\bI['’]m\b/gi, 'I am')
      .replace(/\bI['’]ll\b/gi, 'I will')
      .replace(/\bI['’]ve\b/gi, 'I have')
      .replace(/\bwe['’]re\b/gi, 'we are')
      .replace(/\bwe['’]ll\b/gi, 'we will')
      .replace(/\byou['’]re\b/gi, 'you are');
    if (name) {
      output = output.replace(new RegExp(`^(?:(?:hey|hi|hello|dear)\\s+)?${escapeRegExp(name)}\\s*,?\\s*`, 'i'), '');
      output = `Hello ${name}, ${output}`;
    }
    return normalizeSpace(output);
  }

  if (action === 'another') {
    let output = source;
    if (name) {
      const hello = new RegExp(`^(?:Hello|Dear)\\s+${escapeRegExp(name)}\\b`, 'i');
      const hi = new RegExp(`^Hi\\s+${escapeRegExp(name)}\\b`, 'i');
      if (hello.test(output)) output = output.replace(hello, `Hi ${name}`);
      else if (hi.test(output)) output = output.replace(hi, `Hello ${name}`);
    }
    output = output
      .replace(/\bcannot\b/gi, "can't")
      .replace(/\bwill not\b/gi, "won't")
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bI am\b/gi, "I'm")
      .replace(/\bI will\b/gi, "I'll")
      .replace(/\bI have\b/gi, "I've");
    if (normalizedWording(output) === normalizedWording(source)) {
      output = output.replace(/\bI can\b/i, "I'm able to");
    }
    output = normalizeSpace(output);
    return normalizedWording(output) !== normalizedWording(source) ? output : '';
  }

  return '';
}

function refinementNeedsFallback(message, payload) {
  const action = String(payload?.refine || '');
  if (!action) return false;
  const output = normalizeSpace(message);
  const source = normalizeSpace(payload?.currentMessage);
  const name = normalizeSpace(payload?.personName);
  if (!output || looksLikeDraftingMeta(output)) return true;
  if (action === 'shorter') return wordCount(output) >= wordCount(source);
  if (action === 'softer') return !/\b(?:sorry|please|thank|thanks|appreciate|understand|unfortunately|would|could|hope|kindly)\b/i.test(output);
  if (action === 'firmer') return /\bPlease\.\s*$/i.test(output);
  if (action === 'professional') {
    if (/\b(?:can['’]t|won['’]t|don['’]t|doesn['’]t|didn['’]t|I['’]m|I['’]ll|I['’]ve|we['’]re|we['’]ll)\b/i.test(output)) return true;
    if (name && !new RegExp(`^(?:Hello|Hi|Dear)\\s+${escapeRegExp(name)}\\b`, 'i').test(output)) return true;
  }
  if (action === 'another') return normalizedWording(output) === normalizedWording(source);
  return false;
}

function schedulingFallback(payload) {
  if (payload?.mode !== 'write' || payload?.refine) return '';
  const source = normalizeSpace(payload?.text);
  if (!source) return '';

  const positiveFirst = source.match(/^(?:Tell\s+(.{1,60}?)\s+)?I\s+can\s+(?:meet|make|attend|join|do)\s+(?:(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))\s*,?\s*but\s+I\s+(?:cannot|can't|can’t|won't|won’t|will\s+not|am\s+unable\s+to)\s+(?:meet|make|attend|join|do)\s+(?:(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:at\s+)?(?:the\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))(?:\s+meeting)?[.!?]*$/i);

  if (positiveFirst) {
    const recipient = normalizeSpace(payload?.personName || positiveFirst[1]);
    const availableDay = normalizeSpace(positiveFirst[2]);
    const availableTime = normalizeSpace(positiveFirst[3]);
    const refusedDay = normalizeSpace(positiveFirst[4]);
    const refusedTime = normalizeSpace(positiveFirst[5]);
    const available = `${availableDay ? `${availableDay} at ` : 'at '}${availableTime}`;
    const refused = `${refusedDay ? `${refusedDay} at ` : ''}${refusedTime}`;
    return `${recipient ? `Hi ${recipient}, ` : ''}I'm available ${available}, but I can't make ${refused}.`;
  }

  const negativeFirst = source.match(/^(?:Tell\s+(.{1,60}?)\s+)?I\s+(?:cannot|can't|can’t|won't|won’t|will\s+not|am\s+unable\s+to)\s+(?:meet|make|attend|join|do)\s+(?:(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:at\s+)?(?:the\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))(?:\s+meeting)?\s*,?\s*but\s+I\s+can\s+(?:meet|make|attend|join|do)\s+(?:(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))[.!?]*$/i);

  if (negativeFirst) {
    const recipient = normalizeSpace(payload?.personName || negativeFirst[1]);
    const refusedDay = normalizeSpace(negativeFirst[2]);
    const refusedTime = normalizeSpace(negativeFirst[3]);
    const availableDay = normalizeSpace(negativeFirst[4]);
    const availableTime = normalizeSpace(negativeFirst[5]);
    const refused = `${refusedDay ? `${refusedDay} at ` : ''}${refusedTime}`;
    const available = `${availableDay ? `${availableDay} at ` : 'at '}${availableTime}`;
    return `${recipient ? `Hi ${recipient}, ` : ''}I can't make ${refused}, but I'm available ${available}.`;
  }

  return '';
}

self.postMessage = function mobileGuardPostMessage(data, transfer) {
  let message = data || {};
  const payload = message.id ? requestPayloads.get(message.id) : null;

  if (message.type === 'result' && message.id && payload?.refine && refinementNeedsFallback(message.message, payload)) {
    const fallback = refinementFallback(payload);
    if (fallback) {
      message = {
        ...message,
        message: fallback,
        profile: 'Sparkle Mobile',
        backend: 'wasm'
      };
    }
  }

  if (message.type === 'error' && message.code === 'sparkle_quality' && message.id) {
    const fallback = refinementFallback(payload) || schedulingFallback(payload);
    if (fallback) {
      requestPayloads.delete(message.id);
      nativePostMessage({
        id: message.id,
        type: 'result',
        message: fallback,
        profile: 'Sparkle Mobile',
        backend: 'wasm'
      });
      return;
    }
  }

  if ((message.type === 'result' || message.type === 'error') && message.id) requestPayloads.delete(message.id);
  if (transfer === undefined) nativePostMessage(message);
  else nativePostMessage(message, transfer);
};

const baseReadyPromise = import('/what-do-i-say/sparkle-mobile-worker.js?v=2').then(() => {
  baseReady = true;
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'generate' || !data.id) return;
  requestPayloads.set(data.id, data.payload || {});
  if (baseReady) return;

  event.stopImmediatePropagation();
  nativePostMessage({
    id: data.id,
    type: 'status',
    phase: 'loading',
    message: 'Starting Sparkle Mobile on this iPad…',
    profile: 'Sparkle Mobile',
    backend: 'wasm'
  });

  baseReadyPromise.then(() => {
    self.dispatchEvent(new MessageEvent('message', { data }));
  }).catch((error) => {
    nativePostMessage({
      id: data.id,
      type: 'error',
      code: 'sparkle_load_error',
      message: `Sparkle Mobile could not load on this browser. ${String(error?.message || '')}`.trim()
    });
  });
});