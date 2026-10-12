/**
 * Select a complete, clean phrase span from the approved recording.
 * Pocket TTS only accepts up to 10 seconds, otherwise truncating mid-word.
 * Do not alter pitch, tempo, loudness, or timbre.
 */
export function prepareVoiceReference(samples, sampleRate) {
  if (!(samples instanceof Float32Array)) throw new TypeError("Expected mono Float32 audio.");
  if (!Number.isFinite(sampleRate) || sampleRate < 16000 || sampleRate > 192000) throw new RangeError("Invalid sample rate.");
  const maximum = Math.floor(sampleRate * 9.75);
  if (samples.length <= maximum) return samples.slice();
  const window = Math.max(1, Math.round(sampleRate * .03));
  const levels = [];
  for (let offset = 0; offset < samples.length; offset += window) {
    let total = 0;
    const stop = Math.min(samples.length, offset + window);
    for (let i = offset; i < stop; i++) {
      const x = Number.isFinite(samples[i]) ? samples[i] : 0;
      total += x * x;
    }
    levels.push(Math.sqrt(total / (stop - offset)));
  }
  const quiet = levels.map(x => x < .007);
  // Remove long opening silence but preserve the initial consonant and breath.
  let firstSpoken = quiet.findIndex(x => !x);
  if (firstSpoken < 0) return samples.slice(0, maximum);
  const start = Math.max(0, firstSpoken * window - Math.floor(.07 * sampleRate));
  const maximumEnd = Math.min(samples.length, start + maximum);
  const minimumEnd = start + Math.floor(sampleRate * 7.0);
  let bestEnd = -1, quietStart = -1;
  for (let frame = 0; frame <= Math.ceil(maximumEnd / window); frame++) {
    const within = frame * window < maximumEnd;
    const silent = within && quiet[frame] === true;
    if (silent) {
      if (quietStart === -1) quietStart = frame * window;
    } else if (quietStart !== -1) {
      const quietEnd = Math.min(frame * window, maximumEnd);
      if (quietEnd - quietStart >= .15 * sampleRate && quietStart >= minimumEnd) {
        // End within a real phrase break rather than chopping a spoken vowel.
        const candidate = Math.floor((quietStart + quietEnd) / 2);
        if (candidate <= maximumEnd) bestEnd = candidate;
      }
      quietStart = -1;
    }
  }
  const end = bestEnd > start ? bestEnd : maximumEnd;
  const output = samples.slice(start, end);
  // Subtle click protection only. No filters, loudness adjustment, pitch shift.
  const fadeLength = Math.min(Math.floor(.01 * sampleRate), Math.floor(output.length / 4));
  for (let i = 0; i < fadeLength; i++) {
    const factor = i / Math.max(1, fadeLength - 1);
    output[i] *= factor;
    output[output.length - 1 - i] *= factor;
  }
  return output;
}
