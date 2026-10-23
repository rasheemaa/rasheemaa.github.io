(() => {
  const sparkle = window.Sparkle;
  if (!sparkle?.generate) return;

  const normalize = value => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

  async function generate(payload, options = {}) {
    const first = await sparkle.generate(payload, options);

    if (payload?.refine || payload?.mode !== 'write') return first;

    const source = String(payload?.text || '').trim();
    if (!source || normalize(first) !== normalize(source)) return first;

    options.onStatus?.({
      phase: 'checking',
      message: 'Sparkle is polishing the first draft…'
    });

    try {
      const polished = await sparkle.generate({
        ...payload,
        refine: 'another',
        currentMessage: first
      }, options);

      if (polished && normalize(polished) !== normalize(first)) return polished;
    } catch (error) {
      if (error?.code === 'sparkle_cancelled') throw error;
    }

    return first;
  }

  window.Sparkle = Object.freeze({
    ...sparkle,
    generate
  });
})();
