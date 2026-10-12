import assert from "node:assert/strict";
import { prepareVoiceReference } from "../../what-do-i-say/voice-beta/reference-prep.mjs";
const rate=24000;
const n=Math.round(rate*18.7);
const pcm=new Float32Array(n);
const ranges=[[.40,.70],[1.20,2.10],[2.71,3.70],[4.36,6.13],[6.67,7.31],[7.80,8.46],[8.86,9.45],[9.96,10.98],[11.40,12.33],[12.78,13.95],[14.69,16.51],[17.08,18.60]];
for(const [start,end] of ranges){
  for(let i=Math.floor(start*rate);i<Math.floor(end*rate);i++)pcm[i]=.23*Math.sin(2*Math.PI*187*i/rate);
}
const prepared=prepareVoiceReference(pcm,rate);
assert(prepared.length>8*rate && prepared.length<9.75*rate, "Use a natural 8–9.75 second reference");
assert(prepared.length<10*rate, "Must not be truncated by Pocket TTS's 10 second cap");
// The chosen pause is around 9.45–9.96 seconds. A raw 10-second clip
// otherwise extends into the next spoken phrase.
assert(prepared.length/rate>9 && prepared.length/rate<9.75, "End on a clean, full-phrase break");
assert(prepared.every(Number.isFinite));
assert(Math.abs(prepared[0])<.00001&&Math.abs(prepared[prepared.length-1])<.00001,"Avoid cut clicks");
assert.deepEqual([...prepareVoiceReference(new Float32Array(rate*4).fill(.2),rate)], [...new Float32Array(rate*4).fill(.2)], "Short reference remains otherwise untouched");
assert.throws(()=>prepareVoiceReference([],rate),TypeError);
console.log("PASS: reference ends within natural pause, avoids mid-word cut, keeps raw model output");
