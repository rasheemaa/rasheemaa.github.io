/*
 * Sparkle local AI readiness contract.
 * No inference execution, remote transport, uploaded references or user-written prompts.
 * Curated, people-free presets are NOT a substitute for checking generated frames/audio.
 */
export const LOCAL_MODEL = Object.freeze({
  id:'Wan-AI/Wan2.2-TI2V-5B',
  framework:'Wan2.2 TI2V 5B',
  minimumDocumentedVramGB:24,
  source:'https://github.com/Wan-Video/Wan2.2',
  guide:'https://docs.comfy.org/tutorials/video/wan/wan2_2'
});
export const SCENES = Object.freeze({
  forest:Object.freeze({name:'Golden forest',prompt:'Empty misty pine forest in morning golden light, slow cinematic forward motion, natural shadows, no people, animals or faces.',seconds:5}),
  ocean:Object.freeze({name:'Coastal waves',prompt:'Wide aerial view of a deserted rocky coastline, gentle waves, golden-hour color and realistic moving water, no people, animals or faces.',seconds:5}),
  rain:Object.freeze({name:'Rain on glass',prompt:'Close-up of raindrops flowing across a glass window against a softly lit empty city street at dusk, no people, animals or faces.',seconds:5})
});
export const SUPPORTED_GPU = Object.freeze(['nvidia','other','unknown']);
export const MIN_GB=24;
export function assessDesktop(input){
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new TypeError('Invalid device selection');
  if(!SUPPORTED_GPU.includes(input.gpu))throw new TypeError('Unknown GPU type');
  if(input.vramGB!==null && (!Number.isInteger(input.vramGB)||input.vramGB<0||input.vramGB>256))throw new TypeError('Invalid GPU memory amount');
  // Hardware can never be verified by form input, so report a candidate, not approval.
  if(input.gpu==='unknown'||input.vramGB===null)return {status:'unknown',message:'Check the dedicated GPU type and its VRAM before choosing a local model.'};
  if(input.gpu!=='nvidia')return {status:'unverified',message:'The documented 24 GB single-GPU example uses an NVIDIA GPU. This hardware needs a separate compatibility review.'};
  if(input.vramGB<MIN_GB)return {status:'insufficient',message:'The documented 5B single-GPU workflow needs at least 24 GB VRAM. This device is below that published requirement.'};
  return {status:'candidate',message:'Your reported GPU memory meets the published 24 GB threshold. Actual CUDA, driver, storage, model, license and speed compatibility still require local testing. Sparkle generation is not enabled.'};
}
export function buildReadinessPlan(input){
  const review=assessDesktop(input);
  if(!Object.hasOwn(SCENES,input.scene))throw new TypeError('Choose a fixed people-free scene');
  const scene=SCENES[input.scene];
  const plan={
    type:'sparkle-local-video-plan',version:1,
    status:'planning-only',
    executable:false,
    generationEnabled:false,
    provider:'local-user-device-only',
    model:{id:LOCAL_MODEL.id,minimumDocumentedVramGB:MIN_GB,repository:LOCAL_MODEL.source},
    hardware:{gpu:input.gpu,reportedVramGB:input.vramGB,assessment:review.status},
    scene:{preset:input.scene,description:scene.prompt,durationSeconds:scene.seconds},
    prohibited:['minors and age-ambiguous human subjects','sexual violence','CSAM','unreviewed external images or audio','output download before safety review'],
    safeguards:{
      arbitraryPromptInput:false,
      referenceMedia:false,
      cloudUpload:false,
      modelExecution:false,
      inputModerationCertified:false,
      fullVideoOutputModerationCertified:false,
      outputReleaseAllowed:false
    },
    nextStep:'Review the official local installation guide on a compatible computer. Do not run generation or distribute results until input, every output frame, and audio are reviewed.'
  };
  return plan;
}
export function authorizeVideoGeneration(){
  return {allowed:false,reason:'Video generation is held until independently validated input, image, full-frame and audio safety scanning is available.'};
}
