const PROFILE = 'Sparkle Mobile Safe';

function post(id, type, payload = {}) {
  self.postMessage({ id, type, ...payload });
}

function clean(value) {
  return String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sentenceCase(value) {
  let output = clean(value);
  if (!output) return '';
  output = output.replace(/^([a-z])/, (m) => m.toUpperCase());
  if (!/[.!?]$/.test(output)) output += '.';
  return output;
}

function directAddress(value) {
  return clean(value)
    .replace(/\b(?:he|she|they|them|him)\b/gi, 'you')
    .replace(/\b(?:his|her|their)\b/gi, 'your');
}

function fixDraft(value) {
  let output = clean(value)
    .replace(/\bcant\b/gi, "can't")
    .replace(/\bwont\b/gi, "won't")
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bdidnt\b/gi, "didn't")
    .replace(/\bim\b/gi, "I'm")
    .replace(/\bive\b/gi, "I've")
    .replace(/\bill\b/gi, "I'll")
    .replace(/\bi\b/g, 'I');
  return sentenceCase(output);
}

function greeting(name, body) {
  const recipient = clean(name);
  const message = sentenceCase(body);
  if (!recipient) return message;
  return `Hi ${recipient}, ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
}

function schedulingFallback(payload) {
  if (payload?.mode !== 'write' || payload?.refine) return '';
  const source = clean(payload?.text);
  if (!source) return '';

  const positiveFirst = source.match(/^(?:Tell\s+(.{1,60}?)\s+)?I\s+can\s+(?:meet|make|attend|join|do)\s+(?:(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))\s*,?\s*but\s+I\s+(?:cannot|can't|can’t|won't|won’t|will\s+not|am\s+unable\s+to)\s+(?:meet|make|attend|join|do)\s+(?:(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:at\s+)?(?:the\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))(?:\s+meeting)?[.!?]*$/i);
  if (positiveFirst) {
    const recipient = clean(payload?.personName || positiveFirst[1]);
    const availableDay = clean(positiveFirst[2]);
    const availableTime = clean(positiveFirst[3]);
    const refusedDay = clean(positiveFirst[4]);
    const refusedTime = clean(positiveFirst[5]);
    const available = `${availableDay ? `${availableDay} at ` : 'at '}${availableTime}`;
    const refused = `${refusedDay ? `${refusedDay} at ` : ''}${refusedTime}`;
    return `${recipient ? `Hi ${recipient}, ` : ''}I'm available ${available}, but I can't make ${refused}.`;
  }

  const negativeFirst = source.match(/^(?:Tell\s+(.{1,60}?)\s+)?I\s+(?:cannot|can't|can’t|won't|won’t|will\s+not|am\s+unable\s+to)\s+(?:meet|make|attend|join|do)\s+(?:(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:at\s+)?(?:the\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))(?:\s+meeting)?\s*,?\s*but\s+I\s+can\s+(?:meet|make|attend|join|do)\s+(?:(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))[.!?]*$/i);
  if (negativeFirst) {
    const recipient = clean(payload?.personName || negativeFirst[1]);
    const refusedDay = clean(negativeFirst[2]);
    const refusedTime = clean(negativeFirst[3]);
    const availableDay = clean(negativeFirst[4]);
    const availableTime = clean(negativeFirst[5]);
    const refused = `${refusedDay ? `${refusedDay} at ` : ''}${refusedTime}`;
    const available = `${availableDay ? `${availableDay} at ` : 'at '}${availableTime}`;
    return `${recipient ? `Hi ${recipient}, ` : ''}I can't make ${refused}, but I'm available ${available}.`;
  }
  return '';
}

function replyIntent(value) {
  const source = clean(value);
  const marker = /\b(?:i want to say|i want my reply to (?:say|communicate)|i want to tell (?:them|him|her)|i need to say|i need my reply to (?:say|communicate)|my reply should (?:say|communicate)|reply that|respond that)\b\s*[:,-]?\s*/ig;
  let match;
  let last = null;
  while ((match = marker.exec(source))) last = match;
  if (!last) return source;
  const intent = source.slice(last.index + last[0].length).trim();
  return intent.length >= 3 ? intent : source;
}

function writeMessage(payload) {
  const scheduled = schedulingFallback(payload);
  if (scheduled) return scheduled;

  const source = clean(payload?.text);
  const named = clean(payload?.personName);
  if (!source) return '';

  let match = source.match(/^tell\s+([^,.;!?]+?)\s+(?:that\s+)?(.+)$/i);
  if (match) return greeting(named || match[1], directAddress(match[2]));

  match = source.match(/^ask\s+([^,.;!?]+?)\s+(?:if|whether)\s+(.+)$/i);
  if (match) return greeting(named || match[1], `can you let me know if ${directAddress(match[2]).replace(/[.!?]+$/, '')}?`);

  match = source.match(/^ask\s+([^,.;!?]+?)\s+to\s+(.+)$/i);
  if (match) return greeting(named || match[1], `can you please ${directAddress(match[2]).replace(/[.!?]+$/, '')}?`);

  match = source.match(/^i\s+(?:need|want)\s+to\s+tell\s+([^,.;!?]+?)\s+(?:that\s+)?(.+)$/i);
  if (match) return greeting(named || match[1], directAddress(match[2]));

  return greeting(named, source);
}

function replyMessage(payload) {
  const name = clean(payload?.personName);
  const intent = directAddress(replyIntent(payload?.text));
  return greeting(name, intent);
}

function shorter(source) {
  let output = clean(source)
    .replace(/^(?:hey|hello)\s+/i, 'Hi ')
    .replace(/\bI am (?:unable|not able) to\b/gi, "I can't")
    .replace(/\bI will not\b/gi, "I won't")
    .replace(/\bI do not\b/gi, "I don't")
    .replace(/\bI am\b/gi, "I'm")
    .replace(/\bI will\b/gi, "I'll")
    .replace(/\bI have\b/gi, "I've")
    .replace(/\bjust\b\s*/gi, '')
    .replace(/\breally\b\s*/gi, '')
    .replace(/\bI wanted to let you know that\b/gi, '')
    .replace(/\bI wanted to let you know\b/gi, '');
  return sentenceCase(output);
}

function professional(source, name) {
  let output = clean(source)
    .replace(/\bcan['’]t\b/gi, 'cannot')
    .replace(/\bwon['’]t\b/gi, 'will not')
    .replace(/\bdon['’]t\b/gi, 'do not')
    .replace(/\bdidn['’]t\b/gi, 'did not')
    .replace(/\bI['’]m\b/gi, 'I am')
    .replace(/\bI['’]ll\b/gi, 'I will')
    .replace(/\bI['’]ve\b/gi, 'I have');
  const recipient = clean(name);
  if (recipient) {
    output = output.replace(new RegExp(`^(?:Hi|Hey|Hello|Dear)\\s+${escapeRegExp(recipient)}\\s*,?\\s*`, 'i'), '');
    return greeting(recipient, output).replace(/^Hi\s+/, 'Hello ');
  }
  return sentenceCase(output);
}

function refineMessage(payload) {
  const source = clean(payload?.currentMessage);
  const action = String(payload?.refine || '');
  if (!source) return '';
  if (action === 'shorter') return shorter(source);
  if (action === 'softer') {
    if (/\b(?:sorry|please|thank|thanks|appreciate|understand|unfortunately|hope)\b/i.test(source)) return sentenceCase(source);
    return sentenceCase(`I hope you understand. ${source}`);
  }
  if (action === 'firmer') {
    return sentenceCase(source
      .replace(/^Unfortunately,\s*/i, '')
      .replace(/^I hope you understand\.\s*/i, '')
      .replace(/[\s,]+(?:I(?:'m| am)\s+)?sorry[.!?]*$/i, '.'));
  }
  if (action === 'professional') return professional(source, payload?.personName);
  if (action === 'another') {
    let output = source
      .replace(/^Hi\s+/i, 'Hello ')
      .replace(/^Hello\s+/i, 'Hi ')
      .replace(/\bcannot\b/gi, "can't")
      .replace(/\bwill not\b/gi, "won't")
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bI am\b/gi, "I'm")
      .replace(/\bI will\b/gi, "I'll")
      .replace(/\bI have\b/gi, "I've");
    if (clean(output).toLowerCase() === source.toLowerCase()) {
      output = source.replace(/\bI can\b/i, "I'm able to").replace(/\bI need\b/i, 'I want');
    }
    return sentenceCase(output);
  }
  return sentenceCase(source);
}

function applyTone(message, payload) {
  const tone = String(payload?.tone || 'warm');
  if (tone === 'professional') return professional(message, payload?.personName);
  if (tone === 'concise') return shorter(message);
  if (tone === 'firm' || tone === 'direct') {
    return sentenceCase(message
      .replace(/^I hope you understand\.\s*/i, '')
      .replace(/^Unfortunately,\s*/i, '')
      .replace(/[\s,]+(?:I(?:'m| am)\s+)?sorry[.!?]*$/i, '.'));
  }
  if (tone === 'casual') {
    return sentenceCase(message
      .replace(/\bcannot\b/gi, "can't")
      .replace(/\bwill not\b/gi, "won't")
      .replace(/\bdo not\b/gi, "don't")
      .replace(/\bI am\b/gi, "I'm"));
  }
  return sentenceCase(message);
}

function generate(payload) {
  if (payload?.refine) return refineMessage(payload);
  let output = '';
  if (payload?.mode === 'fix') output = fixDraft(payload?.text);
  else if (payload?.mode === 'reply') output = replyMessage(payload);
  else output = writeMessage(payload);
  return applyTone(output, payload);
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'generate' || !data.id) return;
  try {
    post(data.id, 'status', {
      phase: 'generating',
      message: 'Sparkle is finding the words…',
      profile: PROFILE,
      backend: 'local-safe'
    });
    const message = generate(data.payload || {});
    if (!message) throw new Error('Please add a little more detail so Sparkle has something to work with.');
    post(data.id, 'result', {
      message,
      profile: PROFILE,
      backend: 'local-safe'
    });
  } catch (error) {
    post(data.id, 'error', {
      code: 'sparkle_mobile_safe',
      message: String(error?.message || 'Sparkle could not finish that message. Please try again.')
    });
  }
});
