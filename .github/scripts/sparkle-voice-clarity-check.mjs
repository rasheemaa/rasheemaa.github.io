import assert from "node:assert/strict";
import { VoiceClarityProcessor } from "../../what-do-i-say/voice-beta/voice-clarity.mjs";

const rate = 24000, n = rate * 2;
const samples = Float32Array.from({ length: n }, (_, i) => {
  const t = i / rate;
  return 0.28 * Math.sin(2 * Math.PI * 190 * t)
    + 0.055 * Math.sin(2 * Math.PI * 2700 * t)
    + 0.055 * Math.sin(2 * Math.PI * 32 * t);
});
const entire = new VoiceClarityProcessor(rate).process(samples);
const stream = new VoiceClarityProcessor(rate);
const segments = [97, 1, 1600, 13, 321, 4096, n];
const pieces = [];
for (let at = 0, i = 0; at < n; i++) {
  const end = Math.min(n, at + segments[i++ % segments.length]);
  pieces.push(stream.process(samples.slice(at, end)));
  at = end;
}
const joined = Float32Array.from(pieces.flatMap(part => [...part]));
assert.equal(entire.length, n);
assert.equal(joined.length, n);
for (let i = 0; i < n; i++) {
  assert(Number.isFinite(entire[i]), "Output must be finite");
  assert(Math.abs(entire[i]) <= 0.951, "Peak limiter must prevent clipping");
  assert(Math.abs(entire[i] - joined[i]) < 1e-6, "Output must be chunk-boundary independent");
}
const dc = new VoiceClarityProcessor(rate).process(new Float32Array(rate).fill(0.3));
assert(Math.abs(dc[dc.length - 1]) < 0.0001, "Rumble filter must reject DC");
assert.equal(new VoiceClarityProcessor(rate).process(new Float32Array()).length, 0);
assert.throws(() => new VoiceClarityProcessor(8000), RangeError);
console.log("PASS: native-rate voice clarity and consistent chunked processing, without clipping");
