// Exercise the Creator AI client without a deployed endpoint.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'ai.js'),'utf8');
async function scenario({response,idea='A strong opening',confirm=true,networkError=false,editorText=null,profileText='',audience='',onRequest=null}={}) {
 const elements=new Map();
 for(const id of ['generate-ai','ai-status','output','task','idea','audience','tone','draft-editor','draft-editor-label','apply-draft']){
  elements.set(id,{value:'',textContent:'',hidden:true,disabled:false,focus(){this.focused=true;},addEventListener(type,fn){this[type]=fn;}});
 }
 const el=id=>elements.get(id);
 el('task').value='content';el('idea').value=idea;el('tone').value='Warm';el('audience').value=audience;
 el('output').textContent='Previous draft';
 if(editorText!==null){el('draft-editor').hidden=false;el('draft-editor').value=editorText;}
 let calls=0, confirms=0;
 const context=vm.createContext({
  document:{getElementById:el},
  window:{WDIS_API_BASE:'https://example.workers.dev',SparkleCreatorDrafts:{confirmReplace(){confirms++;return confirm;}},SparkleCreatorProfile:{profileText:()=>profileText}},
  URL,AbortController,JSON,Set,Error,TypeError,
  setTimeout:()=>1,clearTimeout:()=>{},
  fetch:async (url,opts)=>{calls++;assert.equal(url,'https://example.workers.dev/api/creator/generate');assert.equal(opts.credentials,'omit');assert.equal(opts.cache,'no-store');assert.equal(opts.method,'POST');assert.equal(opts.headers['Content-Type'],'application/json');if(onRequest)onRequest(JSON.parse(opts.body));if(networkError)throw new TypeError('offline');return response;}
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
 r=await scenario({response:{ok:false,status:503,json:async()=>({error:'SECRET INTERNAL TRACE'})}});
 assert.equal(r.el('output').textContent,'Previous draft');assert.match(r.el('ai-status').textContent,/temporarily unavailable/);assert.doesNotMatch(r.el('ai-status').textContent,/SECRET/);
 let payload;
 r=await scenario({response:{ok:true,status:200,json:async()=>({task:'content',output:'Safe draft'})},idea:'  Video idea  ',audience:'  moms  ',profileText:'Voice '.repeat(300),onRequest:body=>{payload=body;}});
 assert.equal(payload.idea,'Video idea');assert.equal(payload.audience,'moms');assert.equal(payload.task,'content');assert.equal(payload.tone,'Warm');assert.equal(payload.profile.length,1200);assert.deepEqual(Object.keys(payload).sort(),['audience','idea','profile','task','tone']);
 r=await scenario({networkError:true,editorText:'Unapplied edit'});
 assert.equal(r.el('output').textContent,'Previous draft');assert.match(r.el('ai-status').textContent,/not reachable/);
 assert.equal(r.el('draft-editor').value,'Unapplied edit');assert.equal(r.el('draft-editor').hidden,false);
 console.log('Creator AI client behavior checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
