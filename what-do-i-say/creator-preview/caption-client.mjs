const ID=/^[a-f0-9]{32}$/,STATES=new Set(['uploading','queued','analyzing','drafting','verifying','ready','failed','cancelled','expired']);
const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
const MESSAGES={caption_voice_allowance:'The shared free writing allowance is used for today. Your caption is safe. Try again tomorrow.',
 caption_voice_unavailable:'Caption writing is unavailable right now. Your video and caption are safe.',
 caption_voice_unverified:'Sparkle could not verify a fresh caption in your voice. Your previous caption is safe.',
 caption_busy:'Sparkle is analyzing another video. Please try again shortly.',caption_daily_limit:'The free caption allowance is used for today. Try again tomorrow.',
 caption_unverified:'Sparkle could not verify a fresh caption for this clip. Your previous caption is preserved.',
 caption_interrupted:'Video analysis was interrupted. Your previous caption is preserved.',rate_limited:'Please wait a moment before trying again.',
 caption_upload_incomplete:'The video analysis upload was interrupted. Retry to resume it.',request_conflict:'Your video or caption options changed. Start a new analysis.',
 caption_unavailable:'Video captioning is unavailable right now. Your video and draft are preserved.'};
export class CaptionFailure extends Error{constructor(code='caption_unavailable'){super(MESSAGES[code]||MESSAGES.caption_unavailable);this.code=code;}}
export class CaptionClient{
  constructor(fetcher=(...args)=>fetch(...args)){this.fetcher=fetcher;this.owner=random(32);this.pending=null;}
  async request(path,{method='GET',body,signal,timeoutMs=15000}={}){
    const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const timer=setTimeout(abort,Math.min(45000,Math.max(1000,timeoutMs)));
    try{
      const r=await this.fetcher('/api/captions'+path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{Authorization:'Bearer '+this.owner,...(body!==undefined?{'Content-Type':'application/json'}:{})},
        credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
      if(!/^application\/json(?:\s*;|\s*$)/i.test(r.headers.get('Content-Type')||''))throw new CaptionFailure();
      const reader=r.body?.getReader();if(!reader)throw new CaptionFailure();const parts=[];let size=0;
      try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384){await reader.cancel();throw new CaptionFailure();}parts.push(next.value);}}
      finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!r.ok)throw new CaptionFailure(value?.error);return value;
    }catch(error){if(error instanceof CaptionFailure)throw error;throw new CaptionFailure();}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async capabilities(){try{const c=await this.request('/capabilities');return c?.ready===true&&c.kind==='social-caption'&&c.maxSeconds===120&&c.maxFileBytes===64*1024*1024&&c.framesAnalyzed==='sampled'&&c.audioAnalyzed===true?c:null;}catch{return null;}}
  job(v,id){
    if(!v||!ID.test(v.id||'')||id&&v.id!==id||!STATES.has(v.state)||!Number.isSafeInteger(v.expires))throw new CaptionFailure();
    if(v.state==='ready'&&(typeof v.caption!=='string'||!v.caption.trim()||v.caption.length>2200||typeof v.summary!=='string'||!v.summary.trim()||v.summary.length>1200))throw new CaptionFailure();
    return {id:v.id,state:v.state,expires:v.expires,...(v.state==='ready'?{caption:v.caption,summary:v.summary}:{}),...(typeof v.error==='string'?{error:v.error}:{})};
  }
  async create(spec,signal){
    const key=JSON.stringify(spec);if(!this.pending||this.pending.key!==key)this.pending={key,requestId:random(16)};
    // Finish this bounded metadata-only create even after cancellation, so an
    // accepted job ID can be revoked instead of abandoning an unknown upload.
    signal?.throwIfAborted();
    const job=this.job(await this.request('/jobs',{method:'POST',body:{...spec,requestId:this.pending.requestId}}));
    if(signal?.aborted){await this.cancel(job.id).catch(()=>{});signal.throwIfAborted();}
    return job;
  }
  async part(id,part,bytes,signal){
    if(!ID.test(id)||!['frame','audio'].includes(part.kind)||!Number.isInteger(part.index)||part.index<0||part.index>=(part.kind==='frame'?12:60)||!(bytes instanceof Uint8Array)||bytes.length>65536)throw new CaptionFailure();
    let raw='';for(let offset=0;offset<bytes.length;offset+=8192)raw+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
    const result=await this.request(`/jobs/${id}/parts/${part.kind}/${part.index}`,{method:'PUT',body:{data:btoa(raw)},signal});
    if(result?.received!==true)throw new CaptionFailure();
  }
  async commit(id,signal){if(!ID.test(id))throw new CaptionFailure();return this.job(await this.request('/jobs/'+id+'/commit',{method:'POST',signal}),id);}
  async status(id,signal){if(!ID.test(id))throw new CaptionFailure();return this.job(await this.request('/jobs/'+id,{signal}),id);}
  async voice(id,preferences,signal){
    if(!ID.test(id))throw new CaptionFailure();
    const value=await this.request('/jobs/'+id+'/voice',{method:'POST',body:preferences,signal,timeoutMs:45000});
    if(value?.requiresVideoVerification!==true||typeof value.profile!=='string'||!Array.isArray(value.candidates)||
      !value.candidates.length||value.candidates.length>3||value.candidates.some(s=>typeof s!=='string'||s.length<20||s.length>130||/[\p{Pd}\u2212#\r\n]/u.test(s)))throw new CaptionFailure('caption_voice_unverified');
    return value.candidates;
  }
  async cancel(id){if(!ID.test(id))throw new CaptionFailure();return this.job(await this.request('/jobs/'+id,{method:'DELETE'}),id);}
  forget(){this.pending=null;}
}

