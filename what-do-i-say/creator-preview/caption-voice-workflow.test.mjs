import assert from 'node:assert/strict';
import {test} from 'node:test';
import {captionInVoice,preferredCaptionContext,SOURCE_CONTEXT} from './caption-voice-workflow.mjs';
const prepared={manifest:{videoSha256:'a'.repeat(64),audioMode:'included',durationMs:5000,parts:[]},chunks:[]};
const proposals=['Silence is not a setting I enabled for supervised sleep.','Apparently sleep comes with an audience and plenty of silence.','Announce the visit before you watch me sleep like a documentary.'];
const ready=(id,caption)=>({id:String(id).padStart(32,'0'),state:'ready',expires:2000000000,caption,summary:'Visuals: A performed scene.\nSpeech: Sit in silence and watch me sleep. Announce yourself.'});
function setup(finals=[proposals[0],proposals[1]]){
 const creates=[],voices=[],jobs=[];let count=0;
 const client={create:async spec=>{creates.push(spec);return ready(++count,count===1?'A neutral factual description of the spoken sleep exchange.':finals.shift()||proposals[2]);},
  voice:async(id,prefs)=>{voices.push({id,prefs});return proposals.slice();},forget:()=>{},part:async()=>{},commit:async()=>{},status:async()=>{}};
 return {client,creates,voices,jobs,options:{context:'',tone:'natural',state:{},wait:async()=>{},onJob:id=>jobs.push(id)}};
}
test('creative proposals never reach the editor without a second actual analyzer result for those exact words',async()=>{
 const f=setup();const result=await captionInVoice(f.client,prepared,f.options);
 assert.equal(f.creates.length,2);assert.equal(f.creates[0].context,SOURCE_CONTEXT);assert.equal(f.creates[0].tone,'polished');
 assert.equal(f.voices.length,1);assert.equal(f.voices[0].id,String(1).padStart(32,'0'));
 assert.match(f.creates[1].context,/preserve exactly/);assert(f.creates[1].context.includes(proposals[0]));
 assert.equal(result.id,String(2).padStart(32,'0'));assert.equal(result.caption,proposals[0]);assert.equal(f.jobs.at(-1),null);
});
test('a changed model caption is never substituted for an unchecked proposal',async()=>{
 const f=setup(['A different freshly verified caption about a sleep scene.','Another caption that is not one of the proposed words.']);
 await assert.rejects(captionInVoice(f.client,prepared,f.options),e=>e.code==='caption_voice_unverified');
 assert.equal(f.creates.length,3);assert.equal(f.voices.length,1);
 assert.deepEqual(f.options.state.options,[]);
});
test('remaining proposals reuse the same free writing pass while every displayed option gets its own video check',async()=>{
 const f=setup();await captionInVoice(f.client,prepared,f.options);const second=await captionInVoice(f.client,prepared,f.options);
 assert.equal(f.voices.length,1);assert.equal(f.creates.length,3);assert.equal(second.caption,proposals[1]);
 assert(!f.creates[2].context.includes(proposals[0]));assert.equal(f.options.state.used.length,2);
});
test('cosmetic punctuation is allowed only on the actual verified version, without different words or added emoji',async()=>{
 const checked='Silence is not a setting I enabled for supervised sleep!';const f=setup([checked]);
 assert.equal((await captionInVoice(f.client,prepared,f.options)).caption,checked);
 const changed=setup([proposals[0]+' 🖕',proposals[0]+' 🖕']);
 await assert.rejects(captionInVoice(changed.client,prepared,changed.options),e=>e.code==='caption_voice_unverified');
});
test('equivalent contractions can use the verified wording while a changed negation cannot',async()=>{
 const checked='Silence isn’t a setting I enabled for supervised sleep.';const f=setup([checked]);
 assert.equal((await captionInVoice(f.client,prepared,f.options)).caption,checked);
 const changed=setup(['Silence is a setting I enabled for supervised sleep.','Silence is a setting I enabled for supervised sleep.']);
 await assert.rejects(captionInVoice(changed.client,prepared,changed.options),e=>e.code==='caption_voice_unverified');
});
test('a tone or custom preference change reuses factual evidence but creates a fresh writing pass',async()=>{
 const f=setup();await captionInVoice(f.client,prepared,f.options);await captionInVoice(f.client,prepared,{...f.options,context:'Keep this gentle.',tone:'polished'});
 assert.equal(f.creates.length,3);assert.equal(f.voices.length,2);assert.equal(f.voices[1].prefs.context,'Keep this gentle.');
 assert.equal(f.voices[1].prefs.tone,'polished');assert(f.voices[1].prefs.previous.includes(proposals[0]));
});
test('failed source analysis, cancellation and free allowance errors never show a literal fallback',async()=>{
 const f=setup();f.client.create=async()=>({id:'1'.repeat(32),state:'failed',expires:2000000000,error:'caption_unverified'});
 await assert.rejects(captionInVoice(f.client,prepared,f.options),e=>e.code==='caption_unverified');assert.equal(f.voices.length,0);
 const c=new AbortController();c.abort();const stopped=setup();await assert.rejects(captionInVoice(stopped.client,prepared,{...stopped.options,signal:c.signal}));assert.equal(stopped.creates.length,0);
 const denied=setup();denied.client.voice=async()=>{const e=new Error('allowance');e.code='caption_voice_allowance';throw e;};
 await assert.rejects(captionInVoice(denied.client,prepared,denied.options),e=>e.code==='caption_voice_allowance');assert.equal(denied.creates.length,1);
});
test('the exact candidate preference envelope stays inside the unchanged host limit',()=>{
 assert(preferredCaptionContext(['a'.repeat(130),'b'.repeat(130),'c'.repeat(130)]).length<=500);
 assert.throws(()=>preferredCaptionContext(['a'.repeat(500)]));
});
