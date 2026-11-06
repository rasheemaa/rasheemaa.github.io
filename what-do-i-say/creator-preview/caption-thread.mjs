// Conversation state is scoped to this visit and this exact selected video.
// No file, owner credential, draft or feedback is written to browser storage.
export function feedbackIntent(text,target='both'){
  const words=text.normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  const hook=/\b(on screen|onscreen|hook)\b/.test(words),post=/\b(post caption|bottom caption|underneath caption|regular caption)\b/.test(words);
  if(hook&&!post)target='hook';else if(post&&!hook)target='caption';
  const another=/\b(another|different (?:one|idea|scenario|concept)|new (?:one|idea|scenario|concept)|try again)\b/.test(words)||
    /^(no|nope|nah|again|cmon a good one|come on a good one)$/.test(words);
  const original=/\b(original|first)\b/.test(words),previous=/\b(other|previous|earlier)\b/.test(words);
  return {action:another?'another':'revise',target,anchor:original?'first':previous?'previous':'selected'};
}
export class CaptionThread{
  constructor(){this.reset();}
  reset(){this.source=null;this.versions=[];this.selected=-1;this.notes=[];}
  accept(result,source,feedback=''){
    if(this.source!==source)this.reset();this.source=source;
    const version={id:result.id,hook:result.hook,caption:result.caption,summary:result.summary};
    this.versions.push(version);if(this.versions.length>8)this.versions.splice(1,1);this.selected=this.versions.length-1;
    if(feedback.trim()&&!/^(another one|again|no|nope|nah|try again)[.!?\s]*$/i.test(feedback)){
      this.notes.push(feedback.trim().slice(0,200));this.notes=this.notes.slice(-3);
    }
    return version;
  }
  select(index){if(!Number.isInteger(index)||!this.versions[index])throw Error('Choose a caption version.');this.selected=index;return {...this.versions[index]};}
  request(feedback,target='both',edited){
    feedback=feedback.trim();if(!feedback||feedback.length>500)throw Error('Add a reply up to 500 characters.');
    if(!this.versions[this.selected])throw Error('Analyze your video before replying.');
    const intent=feedbackIntent(feedback,target);
    let index=this.selected;
    if(intent.anchor==='first')index=0;
    else if(intent.anchor==='previous')index=Math.max(0,index-1);
    const reference=this.versions[index];
    const pair=index===this.selected&&edited?edited:{hook:reference.hook,caption:reference.caption};
    if(!pair.hook?.trim()||!pair.caption?.trim())throw Error('Keep both caption fields filled before asking for a rewrite.');
    return {parentId:reference.id,action:intent.action,target:intent.target,feedback,notes:[...this.notes],reference:{hook:pair.hook,caption:pair.caption}};
  }
}
