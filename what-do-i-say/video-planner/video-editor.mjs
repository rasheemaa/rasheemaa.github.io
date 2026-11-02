// Only called with the private Blob returned by the guarded generation client.
// No upload, remote URL, added sound, overlay or unreviewed media input.
const MAX_BYTES=32*1024*1024;
const PROFILES=new Set(['1024x576','576x1024','1280x704','704x1280']);
export function trimRange(start,end,duration){
  if(![start,end,duration].every(Number.isFinite)||duration<=0||duration>5.1||start<0||end>duration+.001||end-start<.25)
    throw new Error('Choose at least 0.25 seconds within the original video.');
  return {start,end:Math.min(end,duration)};
}
export async function trimVideo(blob,{start,end,signal,onProgress=()=>{}}){
  if(!(blob instanceof Blob)||blob.type!=='video/mp4'||!blob.size||blob.size>MAX_BYTES)throw new Error('This video cannot be edited here.');
  signal?.throwIfAborted();
  if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined')
    throw new Error('Trimming is unavailable in this browser. You can still download the original or refine your prompt.');
  const m=await import('./vendor/mediabunny.mjs');signal?.throwIfAborted();
  const input=new m.Input({source:new m.BlobSource(blob),formats:[m.MP4]});
  let conversion,aborted=false;
  const abort=()=>{aborted=true;void conversion?.cancel().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const tracks=await input.getVideoTracks(),audio=await input.getAudioTracks();
    if(tracks.length!==1||audio.length)throw new Error('This video cannot be edited here.');
    const track=tracks[0],width=await track.getDisplayWidth(),height=await track.getDisplayHeight();
    if(!PROFILES.has(`${width}x${height}`)||!await track.canDecode())throw new Error('This browser cannot decode the original video for trimming.');
    const range=trimRange(start,end,await input.computeDuration()),quality=new m.Quality('high');
    const config={width,height,quality,frameRate:24};
    let codec='avc',extension='mp4',mime='video/mp4',format=new m.Mp4OutputFormat();
    if(!await m.canEncodeVideo(codec,config)){
      codec='vp9';extension='webm';mime='video/webm';format=new m.WebMOutputFormat();
      if(!await m.canEncodeVideo(codec,config))throw new Error('Trimming is unavailable in this browser. Download the original or refine your prompt.');
    }
    signal?.throwIfAborted();
    const target=new m.BufferTarget(),output=new m.Output({format,target});
    // Bound allocation while encoding, not just after a completed file.
    target.on('write',({end:offset})=>{if(offset>MAX_BYTES){abort();}});
    conversion=await m.Conversion.init({input,output,trim:range,audio:{discard:true},
      video:{codec,quality,forceTranscode:true,allowTransformationMetadata:false}});
    if(aborted||signal?.aborted){await conversion.cancel();signal?.throwIfAborted();throw new Error('The edited file was too large.');}
    if(!conversion.isValid)throw new Error('This browser cannot trim this video. The original is still available.');
    conversion.onProgress=p=>{if(!aborted)onProgress(Math.max(0,Math.min(1,p)));};
    await conversion.execute();signal?.throwIfAborted();
    if(!target.buffer||!target.buffer.byteLength||target.buffer.byteLength>MAX_BYTES)throw new Error('The edited file could not be saved.');
    return {blob:new Blob([target.buffer],{type:mime}),extension,duration:range.end-range.start};
  }finally{signal?.removeEventListener('abort',abort);input.dispose();}
}

export function attachVideoEditor(doc=document){
  const $=id=>doc.getElementById(id),video=$('generated-video');
  let original=null,originalURL=null,editedURL=null,revision=0,task=null,previewEnd=null,duration=0;
  const message=text=>{$('edit-progress').textContent=text;};
  const busy=value=>{
    $('trim-video').disabled=value;$('trim-start').disabled=value;$('trim-end').disabled=value;
    $('preview-trim').disabled=value;$('restore-video').disabled=value;
    $('cancel-trim').hidden=!value;
  };
  const cancel=()=>{task?.abort();task=null;};
  function range(){return trimRange(Number($('trim-start').value),Number($('trim-end').value),duration);}
  function showOriginal(){
    previewEnd=null;video.pause();video.src=originalURL;
    $('download-video').href=originalURL;$('download-video').download='sparkle-video.mp4';
    $('download-video').textContent='Download video';
    if(editedURL){URL.revokeObjectURL(editedURL);editedURL=null;}
    $('restore-video').hidden=true;
  }
  $('trim-video').addEventListener('click',async()=>{
    if(!original||task)return;
    let selection;try{selection=range();}catch(error){message(error.message);$('trim-start').focus();return;}
    const mine=revision,controller=new AbortController();task=controller;busy(true);previewEnd=null;
    const timer=setTimeout(()=>controller.abort(),120000);
    message('Preparing your edit on this device.');
    try{
      const result=await trimVideo(original,{...selection,signal:controller.signal,
        onProgress:p=>{if(mine===revision)message(`Trimming your video: ${Math.round(p*100)}%.`);}});
      if(mine!==revision||controller.signal.aborted)return;
      const next=URL.createObjectURL(result.blob),previous=editedURL;editedURL=next;
      video.pause();video.src=next;$('download-video').href=next;
      $('download-video').download='sparkle-video-edited.'+result.extension;
      $('download-video').textContent='Download edited '+result.extension.toUpperCase();
      $('restore-video').hidden=false;if(previous)URL.revokeObjectURL(previous);
      message(`Your ${result.duration.toFixed(2)}-second edit is ready. The original is kept below.`);
    }catch(error){
      if(mine===revision)message(controller.signal.aborted?'Edit stopped. Your video and original download are still here.':error.message||'The edit could not finish. Your original is still here.');
    }finally{clearTimeout(timer);if(task===controller){task=null;busy(false);}}
  });
  $('cancel-trim').addEventListener('click',()=>task?.abort());
  $('restore-video').addEventListener('click',()=>{showOriginal();message('Original video restored.');});
  $('preview-trim').addEventListener('click',()=>{
    try{
      const selected=range(),mine=revision,source=originalURL;video.pause();
      const play=()=>{if(mine!==revision||source!==originalURL)return;previewEnd=selected.end;video.currentTime=selected.start;void video.play().catch(()=>message('Press play to preview your selection.'));};
      if(video.getAttribute('src')!==originalURL){video.src=originalURL;video.addEventListener('loadedmetadata',play,{once:true});}else play();
      message('Previewing the selected part of the original. The download changes when you save the trim.');
    }catch(error){message(error.message);}
  });
  video.addEventListener('timeupdate',()=>{if(previewEnd!==null&&video.currentTime>=previewEnd){video.pause();previewEnd=null;}});
  video.addEventListener('error',()=>{if(original)message('This browser could not play the video. Download the original MP4 or try another browser.');});
  $('refine-video').addEventListener('click',()=>{$('concept').focus();$('concept').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  return {
    accept(blob){
      revision++;cancel();busy(false);previewEnd=null;duration=0;original=blob;
      const oldOriginal=originalURL,oldEdited=editedURL;originalURL=URL.createObjectURL(blob);editedURL=null;
      showOriginal();$('download-original').href=originalURL;
      $('video-editor').hidden=true;message('');
      const mine=revision;
      video.onloadedmetadata=()=>{
        if(mine!==revision||video.getAttribute('src')!==originalURL||duration)return;
        const d=video.duration;if(!Number.isFinite(d)||d<=0||d>5.1){message('The original download is available. This video cannot be trimmed here.');return;}
        duration=d;$('trim-start').value='0';$('trim-end').value=(Math.floor(d*100)/100).toFixed(2);
        $('trim-start').max=String(d);$('trim-end').max=String(d);$('video-editor').hidden=false;
        if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined'){
          $('trim-video').disabled=true;message('This browser supports preview and original download. Use a browser with video encoding to save trims.');
        }
      };
      if(oldOriginal)URL.revokeObjectURL(oldOriginal);if(oldEdited)URL.revokeObjectURL(oldEdited);
    },
    suspend(){revision++;cancel();busy(false);video.pause();previewEnd=null;},
    dispose(){revision++;cancel();video.onloadedmetadata=null;video.pause();if(originalURL)URL.revokeObjectURL(originalURL);if(editedURL)URL.revokeObjectURL(editedURL);originalURL=editedURL=original=null;}
  };
}
