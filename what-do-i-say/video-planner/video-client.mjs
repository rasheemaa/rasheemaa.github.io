// Same-origin job client. No provider URL, upload or moderation flag is accepted.
const ID=/^[a-f0-9]{32}$/, STATES=new Set(['queued','screening','generating','reviewing','ready','blocked','failed','cancelled','expired']);
const LIMIT=32*1024*1024;
const randomHex=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
const messages={free_video_limit:'The free video allowance is used for today. Please try again tomorrow.',
  rate_limited:'Please wait a moment before trying again.',safety_denied:'Sparkle could not approve this video under the video safety rules. Try a different idea.',
  video_unavailable:'Video generation is unavailable right now. Your idea is still here.',
  video_failed:'The video could not be finished. Your idea is still here.',
  request_conflict:'This generation request changed. Start again with your current idea.'};
export class VideoFailure extends Error {
  constructor(code='video_unavailable'){super(messages[code]||messages.video_unavailable);this.code=code;}
}

async function bounded(response,limit){
  const reader=response.body?.getReader();if(!reader)throw new VideoFailure();
  const parts=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>limit){await reader.cancel();throw new VideoFailure();}parts.push(value);}
  }finally{reader.releaseLock();}
  return parts;
}
export class VideoClient {
  constructor(fetcher=(...args)=>fetch(...args)){
    this.fetcher=fetcher;this.owner=randomHex(32);this.pending=null;
  }
  async request(path,{method='GET',body,file=false,signal}={}){
    const controller=new AbortController();const abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const timer=setTimeout(abort,file?60000:15000);
    try{
      const response=await this.fetcher('/api/video'+path,{method,credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{Authorization:'Bearer '+this.owner,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
      if(file&&response.ok){
        if(response.headers.get('Content-Type')!=='video/mp4')throw new VideoFailure();
        const parts=await bounded(response,LIMIT);const blob=new Blob(parts,{type:'video/mp4'});
        if(!blob.size)throw new VideoFailure();return blob;
      }
      if(!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('Content-Type')||''))throw new VideoFailure();
      const parts=await bounded(response,16384);
      const value=JSON.parse(await new Blob(parts).text());
      if(!response.ok)throw new VideoFailure(value?.error||value?.code);
      return value;
    }catch(error){if(error instanceof VideoFailure)throw error;throw new VideoFailure();}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async capabilities(){
    try{const c=await this.request('/capabilities');return c?.ready===true&&c.seconds===5&&c.audio===false&&
      Array.isArray(c.formats)&&c.formats.length===2&&['16:9','9:16'].every(x=>c.formats.includes(x))?c:null;}
    catch{return null;}
  }
  job(value,id){
    if(!value||!ID.test(value.id)||id&&value.id!==id||!STATES.has(value.state)||!Number.isSafeInteger(value.expires))throw new VideoFailure();
    return {id:value.id,state:value.state,expires:value.expires,...(value.error?{error:typeof value.error==='string'?value.error:'video_failed'}:{})};
  }
  async create(prompt,format){
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>2500||/[\u0000-\u001f\u007f]/.test(prompt)||!['16:9','9:16'].includes(format))throw new VideoFailure('invalid_request');
    // A transport retry reuses the same nonce, preventing a duplicate GPU job.
    if(!this.pending||this.pending.prompt!==prompt||this.pending.format!==format)this.pending={prompt,format,requestId:randomHex(16)};
    return this.job(await this.request('/jobs',{method:'POST',body:this.pending}));
  }
  async status(id,signal){if(!ID.test(id))throw new VideoFailure();return this.job(await this.request('/jobs/'+id,{signal}),id);}
  async cancel(id){if(!ID.test(id))throw new VideoFailure();return this.job(await this.request('/jobs/'+id,{method:'DELETE'}),id);}
  async file(id,signal){if(!ID.test(id))throw new VideoFailure();return this.request('/jobs/'+id+'/file',{file:true,signal});}
  forget(){this.pending=null;}
}
