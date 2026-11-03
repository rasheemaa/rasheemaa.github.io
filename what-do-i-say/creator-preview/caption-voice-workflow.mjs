import {CaptionFailure} from './caption-client.mjs?v=2';
export const SOURCE_CONTEXT='Write a neutral factual caption about the actual exchange or visible action. Keep its exact situation. Do not add a joke, personal history or unseen event. A performed dialogue is a scene, not proof of the creator\'s experience.';
const sameWords=text=>{
 let value=text.normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/gu,"'");
 for(const [short,long]of Object.entries({"i'm":'i am',"you're":'you are',"we're":'we are',"they're":'they are',
  "don't":'do not',"doesn't":'does not',"didn't":'did not',"isn't":'is not',"aren't":'are not',"wasn't":'was not',"weren't":'were not',
  "can't":'can not',cannot:'can not',"won't":'will not',"shouldn't":'should not',"couldn't":'could not',"wouldn't":'would not',
  "mustn't":'must not',"haven't":'have not',"hasn't":'has not',"hadn't":'had not'}))value=value.replace(new RegExp('\\b'+short+'\\b','gu'),long);
 return (value.match(/[\p{L}\p{N}]+/gu)||[]).join(' ');
};
const emoji=text=>(text.match(/\p{Extended_Pictographic}(?:\ufe0f|\p{Emoji_Modifier})*(?:\u200d\p{Extended_Pictographic}(?:\ufe0f|\p{Emoji_Modifier})*)*|\p{Regional_Indicator}{1,2}|[0-9#*]\ufe0f?\u20e3/gu)||[]).map(x=>x.replace(/[\p{Emoji_Modifier}\ufe0f]/gu,''));
const matchesProposal=(proposal,checked)=>{
 if(sameWords(proposal)!==sameWords(checked))return false;
 const allowed=emoji(proposal);for(const item of emoji(checked)){const index=allowed.indexOf(item);if(index<0)return false;allowed.splice(index,1);}return true;
};
export function preferredCaptionContext(candidates){
  if(!Array.isArray(candidates)||!candidates.length||candidates.length>3||candidates.some(s=>typeof s!=='string'||s.length>130))throw new CaptionFailure('caption_voice_unverified');
  const context='Preferred caption words, preserve exactly when supported by the actual clip: '+JSON.stringify(candidates);
  if(context.length>500)throw new CaptionFailure('caption_voice_unverified');
  return context;
}
function pause(signal){return new Promise(resolve=>{const timer=setTimeout(done,2000);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();}signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();});}
export async function verifiedCaptionJob(client,prepared,options){
  const {context,tone,signal,onProgress=()=>{},onJob=()=>{},wait=pause}=options;
  const data={...prepared.manifest,context,tone};let job;
  signal?.throwIfAborted();
  job=await client.create(data,signal);onJob(job.id);
  if(job.state==='uploading'){
    for(let offset=0;offset<data.parts.length;offset+=3){
      signal?.throwIfAborted();onProgress('uploading');
      await Promise.all(data.parts.slice(offset,offset+3).map((part,index)=>client.part(job.id,part,prepared.chunks[offset+index],signal)));
    }
    job=await client.commit(job.id,signal);
  }
  while(job.state!=='ready'){
    signal?.throwIfAborted();if(['failed','cancelled','expired'].includes(job.state)){client.forget();onJob(null);throw new CaptionFailure(job.error||'caption_unverified');}
    onProgress(job.state);await wait(signal);signal?.throwIfAborted();job=await client.status(job.id,signal);
  }
  signal?.throwIfAborted();client.forget();onJob(null);return job;
}
export async function captionInVoice(client,prepared,{context,tone,state,signal,onProgress=()=>{},onJob=()=>{},wait=pause}){
  const sourceKey=JSON.stringify({video:prepared.manifest.videoSha256,audio:prepared.manifest.audioMode});
  const key=JSON.stringify({sourceKey,context,tone});
  if(state.sourceKey!==sourceKey){for(const name of Object.keys(state))delete state[name];state.sourceKey=sourceKey;state.used=[];}
  if(state.key!==key){state.key=key;state.options=[];}
  if(!state.source||state.source.expires<=Date.now()/1000){
    onProgress('source');state.source=await verifiedCaptionJob(client,prepared,{context:SOURCE_CONTEXT,tone:'polished',signal,onJob,wait,onProgress:()=>onProgress('source')});
  }
  if(!state.options?.length){
    onProgress('voice');const proposed=await client.voice(state.source.id,{context,tone,previous:state.used.slice(-6)},signal);
    state.options=proposed.filter(text=>!state.used.some(previous=>sameWords(previous)===sameWords(text)));
    if(!state.options.length)throw new CaptionFailure('caption_voice_unverified');
  }
  const options=state.options.slice();
  for(let attempt=0;attempt<2;attempt++){
    signal?.throwIfAborted();onProgress('checking');
    let job;
    try{job=await verifiedCaptionJob(client,prepared,{context:preferredCaptionContext(options),tone,signal,onJob,wait,onProgress:()=>onProgress('checking')});}
    catch(error){if(error instanceof CaptionFailure&&error.code==='caption_unverified'){if(attempt===0)continue;state.options=[];throw new CaptionFailure('caption_voice_unverified');}throw error;}
    // The exact returned words were independently checked against the actual
    // video and registered by the original freshness ledger. A model rewrite
    // is never treated as approval of a different proposed caption.
    const match=options.find(text=>matchesProposal(text,job.caption));
    if(match){state.used.push(job.caption);state.options=state.options.filter(text=>sameWords(text)!==sameWords(match));return job;}
    onProgress('checking');
  }
  state.options=[];throw new CaptionFailure('caption_voice_unverified');
}
