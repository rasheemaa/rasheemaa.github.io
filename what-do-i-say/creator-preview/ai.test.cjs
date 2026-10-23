// Exercise the Creator AI client without a deployed endpoint.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'ai.js'),'utf8');
async function scenario({response,idea='A strong opening',confirm=true,networkError=false}={}) {
 const elements=new Map();
 for(const id of ['generate-ai','ai-status','output','task','idea','audience','tone','draft-editor','draft-editor-label','apply-draft']){
  elements.set(id,{value:'',textContent:'',hidden:true,disabled:false,focus(){this.focused=true;},addEventListener(type,fn){this[type]=fn;}});
 }
 const el=id=>elements.get(id);
 el('task').value='content';el('idea').value=idea;el('tone').value='Warm';
 el('output').textContent='Previous draft';
 let calls=0, confirms=0;
 const context=vm.createContext({
  document:{getElementById:el},
  window:{WDIS_API_BASE:'https://example.workers.dev',SparkleCreatorDrafts:{confirmReplace(){confirms++;return confirm;}},SparkleCreatorProfile:{profileText:()=>''}},
  URL,AbortController,JSON,Set,Error,TypeError,
  setTimeout:()=>1,clearTimeout:()=>{},
  fetch:async (url,opts)=>{calls++;assert.equal(url,'https://example.workers.dev/api/creator/generate');assert.equal(opts.credentials,'omit');if(networkError)throw new TypeError('offline');return response;}
 });
 vm.runInContext(source,context);
 await el('generate-ai').click();
 return {el,calls,confirms};
}
(async()=>{
 let r=await scenario({idea:''});
 assert.equal(r.calls,0);assert.equal(r.confirms,0);assert.match(r.el('ai-status').textContent,/describe your idea/);
 r=await scenario({confirm:false});
 assert.equal(r.calls,0);assert.equal(r.el('output').textContent,'Previous draft');
 r=await scenario({response:{ok:true,status:200,json:async()=>({task:'content',output:'New draft'})}});
 assert.equal(r.calls,1);assert.equal(r.el('output').textContent,'New draft');assert.equal(r.el('generate-ai').disabled,false);
 r=await scenario({response:{ok:true,status:200,json:async()=>({task:'reply',output:'Wrong task'})}});
 assert.equal(r.el('output').textContent,'Previous draft');assert.match(r.el('ai-status').textContent,/could not be verified/);
 r=await scenario({response:{ok:false,status:429,json:async()=>({error:'PRIVATE ERROR'})}});
 assert.equal(r.el('output').textContent,'Previous draft');assert.match(r.el('ai-status').textContent,/busy/);assert.doesNotMatch(r.el('ai-status').textContent,/PRIVATE ERROR/);
 r=await scenario({networkError:true});
 assert.equal(r.el('output').textContent,'Previous draft');assert.match(r.el('ai-status').textContent,/not reachable/);
 console.log('Creator AI client behavior checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
