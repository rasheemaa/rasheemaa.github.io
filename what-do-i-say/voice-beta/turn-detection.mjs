/**
 * Conservative client-side turn detection for Sparkle's Web Speech beta.
 * Audio stays with the browser speech-recognition provider. This never sends
 * on a browser session ending; only a settled transcript after a silence grace.
 */
export function turnSilenceMs(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  // Incomplete clauses, fillers and hanging punctuation deserve much longer.
  if (/(?:\b(?:um+|uh+|erm+|hmm+|and|but|because|so|or|if|when|while|though|although|that|which|who|to|for|with|about|like|wait|well|actually|basically|first|second|third)\s*[,.!?…]*$|[,;:]$|\.{2,}$)/i.test(text)) return 9500;
  if (/\b(?:i|we|you|he|she|they)\s+(?:am|was|were|will|would|could|should|have|had|want|need|think|feel|might)\s*[,.!?]*$/i.test(text)) return 9500;

  // Question marks and clear sentence endings are signals, not proof.
  // Keep several seconds of grace to protect thoughtful speakers.
  if (/[.!?]["'’)]?$/.test(text)) return 4300;
  if (text.split(/\s+/).length <= 3) return 7500;
  return 6500;
}
