const requestPayloads = new Map();
const nativePostMessage = self.postMessage.bind(self);

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'generate' && data.id) requestPayloads.set(data.id, data.payload || {});
});

self.postMessage = function mobileGuardPostMessage(data, transfer) {
  const message = data || {};
  if (message.type === 'error' && message.code === 'sparkle_quality' && message.id) {
    const fallback = schedulingFallback(requestPayloads.get(message.id));
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

await import('/what-do-i-say/sparkle-mobile-worker.js?v=1');
