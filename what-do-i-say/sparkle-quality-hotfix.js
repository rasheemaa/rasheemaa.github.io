(() => {
  const sparkle = window.Sparkle;
  if (!sparkle?.generate) return;

  function normalizeModalMay(value) {
    return String(value || '').replace(/\bmay\s+(?=(?:I|we|you|he|she|they|it)\b)/gi, (match) => {
      return /^[A-Z]/.test(match) ? 'Can ' : 'can ';
    });
  }

  async function generate(payload, options) {
    if (!payload?.refine) return sparkle.generate(payload, options);

    const safePayload = {
      ...payload,
      text: normalizeModalMay(payload.text),
      currentMessage: normalizeModalMay(payload.currentMessage)
    };
    return sparkle.generate(safePayload, options);
  }

  window.Sparkle = Object.freeze({
    ...sparkle,
    generate
  });
})();
