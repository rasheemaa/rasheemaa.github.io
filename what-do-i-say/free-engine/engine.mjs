// Local, people-free footage editor. No inference, uploads, third-party APIs or arbitrary user media.
const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d',{alpha:false});
const video=$('source'),format=$('format'),title=$('title');
const status=$('status'),render=$('render'),preview=$('preview');
const frame=$('frame');
let busy=false,drawHandle=0,stopTimer=0,activeRecorder=null;
const TITLE=Object.freeze({flow:'FIND YOUR FLOW',pause:'A MOMENT TO PAUSE',breathe:'LET THE DAY BREATHE'});
const DIMENSIONS=Object.freeze({'9:16':[360,640],'16:9':[640,360],'1:1':[480,480]});
const text=value=>{status.textContent=value;};
function dimensions(){
  const [width,height]=DIMENSIONS[format.value]||DIMENSIONS['9:16'];
  canvas.width=width;canvas.height=height;frame.dataset.format=format.value;
}
function scene(){
  const w=canvas.width,h=canvas.height;
  if(video.readyState>=2 && video.videoWidth>0){
    const scale=Math.max(w/video.videoWidth,h/video.videoHeight);
    const dw=video.videoWidth*scale,dh=video.videoHeight*scale;
    ctx.drawImage(video,(w-dw)/2,(h-dh)/2,dw,dh);
  }else{
    const gradient=ctx.createLinearGradient(0,0,w,h);
    gradient.addColorStop(0,'#1f3443');gradient.addColorStop(1,'#5a405b');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  }
  const shadow=ctx.createLinearGradient(0,h*.50,0,h);
  shadow.addColorStop(0,'rgba(17,16,25,0)');shadow.addColorStop(1,'rgba(17,16,25,.78)');
  ctx.fillStyle=shadow;ctx.fillRect(0,0,w,h);
  ctx.textAlign='center';ctx.fillStyle='#fff6fb';
  const size=Math.max(17,Math.min(33,w*.063));
  ctx.font='600 '+size+'px system-ui,sans-serif';
  const label=TITLE[title.value]||TITLE.flow;
  ctx.fillText(label,w/2,h*.86,w*.91);
  ctx.font='500 '+Math.max(11,size*.43)+'px system-ui,sans-serif';
  ctx.fillStyle='#e5c4d9';ctx.fillText('SPARKLE · FREE VIDEO ENGINE',w/2,h*.92,w*.9);
}
function draw(){
  scene();
  if(!video.paused && !video.ended)drawHandle=requestAnimationFrame(draw);
}
function stopFrame(){cancelAnimationFrame(drawHandle);drawHandle=0;video.pause();scene();}
function availableMime(){
  if(typeof MediaRecorder==='undefined' || typeof canvas.captureStream!=='function')return '';
  return ['video/mp4;codecs=avc1.42E01E','video/mp4',
    'video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
    .find(mime=>MediaRecorder.isTypeSupported(mime))||'';
}
async function mediaReady(){
  if(video.readyState>=2)return;
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{done();reject(new Error('Video loading timed out.'));},14000);
    const done=()=>{clearTimeout(timeout);video.removeEventListener('loadeddata',ok);video.removeEventListener('error',bad);};
    const ok=()=>{done();resolve();};
    const bad=()=>{done();reject(new Error('Footage is unavailable.'));};
    video.addEventListener('loadeddata',ok,{once:true});
    video.addEventListener('error',bad,{once:true});
    video.load();
  });
}
async function startVideo(){
  stopFrame();video.currentTime=0;
  await mediaReady();
  await video.play();
  draw();
}
async function withBusy(work){
  if(busy)return;
  busy=true;render.disabled=true;preview.disabled=true;
  try{await work();}
  catch(err){text('Could not finish: '+(err?.message||'unsupported playback')+' You can download the clean source clip.');stopFrame();}
  finally{busy=false;render.disabled=false;preview.disabled=false;}
}
const EXPORT_FORMAT=Object.freeze({'9:16':'portrait','16:9':'wide','1:1':'square'});
function downloadPreRendered(){
  const safeFormat=EXPORT_FORMAT[format.value],safeTitle=Object.hasOwn(TITLE,title.value)?title.value:null;
  if(!safeFormat||!safeTitle)throw new Error('Choose a supported video format and title.');
  const filename='sparkle-'+safeFormat+'-'+safeTitle+'.mp4';
  const link=document.createElement('a');
  link.href='./exports/'+safeFormat+'-'+safeTitle+'.mp4';
  link.download=filename;
  document.body.append(link);link.click();link.remove();
  text('Your edited MP4 download has started. This is a pre-rendered people-free clip, with no AI or upload.');
}

function download(blob,mime){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='sparkle-free-video.'+(mime.includes('mp4')?'mp4':'webm');
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),45000);
}
format.addEventListener('change',()=>{if(busy)return;stopFrame();dimensions();scene();});
title.addEventListener('change',()=>{if(!busy)scene();});
preview.addEventListener('click',()=>withBusy(async()=>{
  text('Previewing five seconds of real nature footage…');
  await startVideo();
  await new Promise(resolve=>{stopTimer=setTimeout(resolve,5000);});
  clearTimeout(stopTimer);stopFrame();
  text('Preview finished. Use Export free video to create an edited clip on your device.');
}));
render.addEventListener('click',()=>withBusy(async()=>{
  const mime=availableMime();
  if(!mime){downloadPreRendered();return;}
  text('Rendering a silent five-second video locally. Keep this tab open.');
  await startVideo();
  const stream=canvas.captureStream(24);
  let recorder;
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1600000});}
  catch(err){stream.getTracks().forEach(track=>track.stop());throw err;}
  activeRecorder=recorder;
  const pieces=[];
  const completed=new Promise((resolve,reject)=>{
    recorder.addEventListener('dataavailable',event=>{if(event.data?.size)pieces.push(event.data);});
    recorder.addEventListener('error',event=>reject(event.error||new Error('Recording failed.')),{once:true});
    recorder.addEventListener('stop',()=>resolve(),{once:true});
  });
  recorder.start(250);
  await new Promise(resolve=>{stopTimer=setTimeout(resolve,5200);});
  clearTimeout(stopTimer);stopFrame();
  if(recorder.state!=='inactive')recorder.stop();
  await completed;
  stream.getTracks().forEach(track=>track.stop());activeRecorder=null;
  if(!pieces.length)throw new Error('This browser produced an empty export.');
  const blob=new Blob(pieces,{type:recorder.mimeType||mime});
  download(blob,recorder.mimeType||mime);
  text('Export ready: '+Math.round(blob.size/1024)+' KB created on this device. No cloud rendering or upload.');
}));
window.addEventListener('pagehide',()=>{
  clearTimeout(stopTimer);cancelAnimationFrame(drawHandle);
  if(activeRecorder?.state==='recording')activeRecorder.stop();
  video.pause();
});
dimensions();scene();
