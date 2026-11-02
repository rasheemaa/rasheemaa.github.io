// Original video remains in the browser. Send bounded sampled JPEG frames and
// (when present) complete mono PCM audio, never an arbitrary media URL.
const MAX_FILE=64*1024*1024,PART=65536,MAX_AUDIO=3841024;
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const sha=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
export async function mediaPart(kind,index,bytes,atMs){
  return {kind,index,bytes:bytes.byteLength,sha256:await sha(bytes),...(kind==='frame'?{atMs}:{})};
}
function waitMedia(video,event,signal,action){
  return new Promise((resolve,reject)=>{
    let timer;const clean=()=>{clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',bad);signal?.removeEventListener('abort',abort);};
    const ok=()=>{clean();resolve();},bad=()=>{clean();reject(new Error('This browser cannot read this video. Try an MP4, MOV or WebM with a supported codec.'));},abort=()=>{clean();reject(signal.reason||new DOMException('Cancelled','AbortError'));};
    video.addEventListener(event,ok,{once:true});video.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(bad,15000);if(signal?.aborted)abort();else action();
  });
}
export async function prepareCaptionMedia(file,{signal,visualOnly=false,onProgress=()=>{}}={}){
  if(!(file instanceof Blob)||!file.size||file.size>MAX_FILE)throw new Error('Choose a video up to 64 MB and 2 minutes long.');
  signal?.throwIfAborted();const signature=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const mp4=signature.length>=12&&String.fromCharCode(...signature.slice(4,8))==='ftyp';
  const webm=signature.length>=4&&hex(signature.slice(0,4))==='1a45dfa3';
  if(!mp4&&!webm)throw new Error('Choose a supported MP4, MOV or WebM video.');
  const url=URL.createObjectURL(file),video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
  let input,conversion;
  try{
    onProgress('Reading your video on this device.');
    await waitMedia(video,'loadeddata',signal,()=>{video.src=url;video.load();});
    if(!Number.isFinite(video.duration)||video.duration<.1||video.duration>120.001||!video.videoWidth||!video.videoHeight||video.videoWidth*video.videoHeight>9000000)
      throw new Error('Choose a supported video up to 2 minutes long and 4K resolution.');
    const durationMs=Math.min(120000,Math.floor(video.duration*1000)),count=Math.min(12,Math.max(3,Math.ceil(video.duration/2)));
    const canvas=document.createElement('canvas'),scale=Math.min(1,512/video.videoWidth,512/video.videoHeight);
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Video analysis is unavailable in this browser.');
    const chunks=[],parts=[];
    for(let i=0;i<count;i++){
      signal?.throwIfAborted();const atMs=Math.min(durationMs-2,Math.max(1,Math.floor(i*(durationMs-20)/Math.max(1,count-1))));
      onProgress(`Reading video frame ${i+1} of ${count}.`);
      await waitMedia(video,'seeked',signal,()=>{video.currentTime=atMs/1000;});ctx.drawImage(video,0,0,canvas.width,canvas.height);
      let blob;for(const quality of [.78,.62,.45]){blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(blob&&blob.size<=32768)break;}
      if(!blob||blob.size>32768)throw new Error('This video frame could not be prepared for analysis.');
      const bytes=new Uint8Array(await blob.arrayBuffer());chunks.push(bytes);parts.push(await mediaPart('frame',i,bytes,atMs));
    }
    signal?.throwIfAborted();onProgress('Checking the video’s audio.');
    const m=await import('../video-planner/vendor/mediabunny.mjs');signal?.throwIfAborted();
    input=new m.Input({source:new m.BlobSource(file),formats:m.ALL_FORMATS});
    const audio=await input.getAudioTracks();let audioMode=audio.length?'included':'none';
    if(audio.length&&visualOnly)audioMode='visual-only';
    else if(audio.length){
      if(audio.length!==1||!await audio[0].canDecode())throw new Error('This browser could not read the speech. Try another browser or choose “Use visuals only.”');
      const target=new m.BufferTarget(),output=new m.Output({format:new m.WavOutputFormat(),target});
      conversion=await m.Conversion.init({input,output,video:{discard:true},audio:{codec:'pcm-s16',sampleRate:16000,numberOfChannels:1,forceTranscode:true}});
      if(!conversion.isValid)throw new Error('This browser could not read the speech. Try another browser or choose “Use visuals only.”');
      const abort=()=>{void conversion.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
      target.on('write',({end})=>{if(end>MAX_AUDIO)abort();});
      try{onProgress('Preparing the speech for analysis.');signal?.throwIfAborted();await conversion.execute();signal?.throwIfAborted();}
      finally{signal?.removeEventListener('abort',abort);}
      if(!target.buffer||target.buffer.byteLength>MAX_AUDIO)throw new Error('The speech could not be prepared. Your video is still here.');
      const wav=new Uint8Array(target.buffer);
      for(let offset=0,index=0;offset<wav.length;offset+=PART,index++){
        const bytes=wav.slice(offset,offset+PART);chunks.push(bytes);parts.push(await mediaPart('audio',index,bytes));
      }
    }
    onProgress('Checking your video’s identity.');signal?.throwIfAborted();
    const videoSha256=await sha(await file.arrayBuffer());signal?.throwIfAborted();
    return {manifest:{videoSha256,durationMs,audioMode,parts},chunks};
  }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);input?.dispose();}
}
