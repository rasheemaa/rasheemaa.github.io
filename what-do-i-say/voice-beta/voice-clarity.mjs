/**
 * Sparkle Voice Clarity: native-rate, streaming PCM mastering.
 * Gentle 75 Hz rumble removal, +1.7 dB at 2700 Hz, mild compression,
 * and soft peak control. This cannot create detail above the model's
 * 24 kHz output; it improves intelligibility and volume consistency.
 */
export class VoiceClarityProcessor {
  constructor(sampleRate) {
    if (!Number.isFinite(sampleRate) || sampleRate < 16000 || sampleRate > 192000) {
      throw new RangeError("Unsupported voice sample rate.");
    }
    this.hpCoefficient = Math.exp(-2 * Math.PI * 75 / sampleRate);
    this.hpPreviousInput = 0;
    this.hpPreviousOutput = 0;
    const A = Math.pow(10, 1.7 / 40);
    const w = 2 * Math.PI * 2700 / sampleRate;
    const alpha = Math.sin(w) / (2 * 0.85);
    const c = Math.cos(w);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * c) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - alpha / A) / a0;
    this.eqZ1 = 0;
    this.eqZ2 = 0;
    this.envelope = 0;
    this.gain = 1;
    this.attack = Math.exp(-1 / (0.012 * sampleRate));
    this.release = Math.exp(-1 / (0.140 * sampleRate));
    this.gainSmoothing = Math.exp(-1 / (0.018 * sampleRate));
  }

  /** Mono Float32 in/out. Stateful between chunks for uninterrupted speech. */
  process(samples) {
    if (!(samples instanceof Float32Array)) throw new TypeError("Expected Float32 PCM.");
    const output = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const input = Number.isFinite(samples[i]) ? samples[i] : 0;
      const hp = this.hpCoefficient * (this.hpPreviousOutput + input - this.hpPreviousInput);
      this.hpPreviousInput = input;
      this.hpPreviousOutput = hp;
      const eq = this.b0 * hp + this.eqZ1;
      this.eqZ1 = this.b1 * hp - this.a1 * eq + this.eqZ2;
      this.eqZ2 = this.b2 * hp - this.a2 * eq;
      const level = Math.abs(eq);
      const coefficient = level > this.envelope ? this.attack : this.release;
      this.envelope = coefficient * this.envelope + (1 - coefficient) * level;
      const threshold = 0.19;
      const target = this.envelope > threshold ? Math.pow(this.envelope / threshold, 1 / 2.1 - 1) : 1;
      this.gain = this.gainSmoothing * this.gain + (1 - this.gainSmoothing) * target;
      const amplified = eq * this.gain * 1.28;
      const magnitude = Math.abs(amplified);
      const limited = magnitude <= 0.85 ? magnitude
        : 0.85 + 0.10 * Math.tanh((magnitude - 0.85) / 0.10);
      output[i] = Math.sign(amplified) * limited;
    }
    return output;
  }
}
