// Preserve open requests instead of silently turning proposals into commitments.
const times = value => String(value || '').replace(/\b(0?[1-9]|1[0-2])(?::00)?\s*([ap])\.?m\.?(?!\w)/gi,
  (_match, hour, period) => `${Number(hour)} ${period.toUpperCase()}M`);
const key = value => times(value).toLowerCase().replace(/\s+/g, '');
function anchors(value) {
  return [...new Set(times(value).match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b|\$\s*\d+(?:\.\d+)?|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|today|tonight|tomorrow)\b/gi) || [])];
}
export function meaningSource(payload) {
  if (payload?.refine) return String(payload.currentMessage || '');
  const source = String(payload?.text || '');
  if (!['reply', 'auto'].includes(payload?.mode)) return source;
  const marker = /\b(?:i want to say|i need to say|my reply should (?:say|communicate)|reply that|respond that)\b\s*[:,-]?\s*/ig;
  let match, last;
  while ((match = marker.exec(source))) last = match;
  return last ? source.slice(last.index + last[0].length) : source;
}
function requests(source) {
  const indirect = [...source.matchAll(/\b(?:ask(?:ing)?|check(?:ing)?|find out)(?:\s+[\p{L}'’]+){0,3}?\s+(?:if|whether)\s+([^.!?\n]+)/giu)].map(m => m[1]);
  const direct = (source.match(/[^.!?\n]*\?/g) || []).filter(part =>
    !/^\s*(?:can|could|would)\s+you\s+(?:please\s+)?(?:help|write|draft|rewrite|fix|edit)\b/i.test(part));
  const questionParts = direct.map(part => part.match(/\b(?:(?:can|could|would|will|do|does|did|are|is)\s+(?:you|we|I|they|he|she|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|(?:what|when|where|how|why|who|which)\b)[\s\S]*\?/i)?.[0] || part);
  return [...indirect, ...questionParts];
}
export function requestProblem(payload, output) {
  // Custom edits may explicitly change a date, decision, or remove a question.
  if (payload?.refine === 'custom') return '';
  const source = meaningSource(payload);
  const candidates = String(output || '').match(/[^.!?\n]+(?:[.!?]|$)/g) || [];
  for (const request of requests(source)) {
    const required = anchors(request).map(key);
    const kept = candidates.some(part => {
      const isRequest = /\?\s*$/.test(part) || /\b(?:let me know|please confirm|can you confirm|tell me (?:if|whether))\b/i.test(part);
      return isRequest && required.every(anchor => key(part).includes(anchor));
    });
    if (!kept) return 'Keep my question or request for confirmation open. Do not turn a proposed plan into an agreed commitment.';
  }
  return '';
}

