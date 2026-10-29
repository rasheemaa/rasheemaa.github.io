import {assessDesktop,buildReadinessPlan,authorizeVideoGeneration} from './contract.mjs?v=1';
const $=id=>document.getElementById(id);
const form=$('readiness-form'),result=$('result'),label=$('readiness-label'),message=$('readiness-message');
let approvedPlan=null;
function selection(){
  const raw=$('memory').value;
  return {gpu:$('gpu').value,vramGB:raw===''?null:Number(raw),scene:$('scene').value};
}
function reset(){
  approvedPlan=null;result.hidden=true;
}
for(const select of form.querySelectorAll('select'))select.addEventListener('change',reset);
form.addEventListener('submit',event=>{
  event.preventDefault();
  try{
    const device=selection();
    const assessment=assessDesktop(device);
    approvedPlan=buildReadinessPlan(device);
    // This is only a hardware assessment and planning file, never permission to generate.
    if(authorizeVideoGeneration().allowed)throw new Error('Unexpected unsafe permission to generate');
    label.textContent={
      unknown:'Hardware information needed',
      unverified:'Needs a separate GPU review',
      insufficient:'Below the documented requirements',
      candidate:'Potential local GPU candidate'
    }[assessment.status];
    message.textContent=assessment.message;
    result.hidden=false;
  }catch(_){
    approvedPlan=null;result.hidden=false;
    label.textContent='Unable to assess this device';
    message.textContent='Please choose one of the supported options.';
  }
});
$('download-plan').addEventListener('click',()=>{
  if(!approvedPlan)return;
  const blob=new Blob([JSON.stringify(approvedPlan,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='sparkle-local-ai-readiness-plan.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
});
