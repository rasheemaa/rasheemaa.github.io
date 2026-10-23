// Behavioral checks for request ownership, data boundaries and failure recovery.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'ai.js'),'utf8');
const ok=(output='New draft',task='content')=>({ok:true,status:200,json:async()=>({task,output})});
function boot({idea='A strong opening',confirm=true,editorText=null,profileText='',audience='',fetchImpl=async()=>ok(),base='https://sparkle.rasheema-abdullah.workers.dev',ready=true}={}) {
 const elements=new Map(),timers=new Map();let timerId=0,calls=0,confirms=0,lastOptions;
 const ids=['generate-ai','cancel-ai','ai-status','output','task','idea','audience','tone','project','draft-editor','draft-editor-label','apply-draft','creator-name','creator-niche','creator-style','creator-avoid'];
 for(const id of ids)elements.set(id,{value:'',textContent:'',hidden:true,disabled:false,attributes:{},listeners:{},focus(){this.focused=true;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},fire(type){for(const fn of this.listeners[type]||[])fn();},click(){return (this.listeners.click||[])[0]?.();}});
 const el=id=>elements.get(id);
 el('task').value='content';el('idea').value=idea;el('tone').value='Warm';el('audience').value=audience;el('output').textContent='Previous draft';
 if(editorText!==null){el('draft-editor').hidden=false;el('draft-editor').value=editorText;}
 const context=vm.createContext({
  document:{getElementById:el},
  window:{SPARKLE_CREATOR_API_READY:ready,SPARKLE_CREATOR_API_BASE:base,location:{origin:'https://thesheemaedit.com'},SparkleCreatorDrafts:{confirmReplace(){confirms++;return confirm;}},SparkleCreatorProfile:{profileText:()=>profileText}},
  URL,AbortController,TextEncoder,JSON,Set,Error,TypeError,
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  fetch:async(url,opts)=>{calls++;lastOptions=opts;assert.equal(url,'https://sparkle.rasheema-abdullah.workers.dev/api/creator/generate');assert.equal(opts.credentials,'omit');assert.equal(opts.cache,'no-store');assert.equal(opts.redirect,'error');assert.equal(opts.method,'POST');assert.equal(opts.headers['Content-Type'],'application/json');return fetchImpl(url,opts);}
 });
 vm.runInContext(source,context);
 return {el,context,get calls(){return calls;},get confirms(){return confirms;},get options(){return lastOptions;},expire(){for(const fn of [...timers.values()])fn();}};
}
(async()=>{
 let e=boot({idea:''});await e.el('generate-ai').click();assert.equal(e.calls,0);assert.equal(e.confirms,0);assert.match(e.el('ai-status').textContent,/describe your idea/);
 e=boot({confirm:false});await e.el('generate-ai').click();assert.equal(e.calls,0);assert.equal(e.el('output').textContent,'Previous draft');
 e=boot();await e.el('generate-ai').click();assert.equal(e.calls,1);assert.equal(e.el('output').textContent,'New draft');assert.equal(e.el('generate-ai').disabled,false);assert.equal(e.el('output').attributes['aria-busy'],'false');
 for(const response of [ok('Wrong task','reply'),ok(''),ok('x'.repeat(12001)),{ok:true,status:200,json:async()=>{throw Error('bad json');}}]){
  e=boot({fetchImpl:async()=>response});await e.el('generate-ai').click();assert.equal(e.el('output').textContent,'Previous draft');assert.match(e.el('ai-status').textContent,/could not be verified/);
 }
 for(const [status,message] of [[429,/busy/],[503,/temporarily unavailable/],[504,/timed out/],[400,/Check your input/]]){
  e=boot({fetchImpl:async()=>({ok:false,status,json:async()=>({error:'PRIVATE ERROR'})})});await e.el('generate-ai').click();assert.equal(e.el('output').textContent,'Previous draft');assert.match(e.el('ai-status').textContent,message);assert.doesNotMatch(e.el('ai-status').textContent,/PRIVATE ERROR/);
 }
 e=boot({idea:'  Video idea  ',audience:'  moms  ',profileText:'Voice '.repeat(250)});await e.el('generate-ai').click();
 const payload=JSON.parse(e.options.body);assert.equal(payload.idea,'Video idea');assert.equal(payload.audience,'moms');assert.equal(payload.profile,'Voice '.repeat(250));assert.deepEqual(Object.keys(payload).sort(),['audience','idea','profile','task','tone']);
 for(const props of [{profileText:'p'.repeat(1601)},{idea:'x'.repeat(3001)},{audience:'x'.repeat(161)},{idea:'界'.repeat(2900)}]){
  e=boot(props);await e.el('generate-ai').click();assert.equal(e.calls,0);assert.equal(e.el('output').textContent,'Previous draft');assert.match(e.el('ai-status').textContent,/Shorten|shorten/);
 }
 for(const base of ['https://untrusted.example','http://sparkle.rasheema-abdullah.workers.dev','https://user:pass@sparkle.rasheema-abdullah.workers.dev','https://sparkle.rasheema-abdullah.workers.dev?secret=x']){
  e=boot({base});await e.el('generate-ai').click();assert.equal(e.calls,0);assert.match(e.el('ai-status').textContent,/not configured/);
 }
 e=boot({ready:false});await e.el('generate-ai').click();assert.equal(e.calls,0);
 e=boot({fetchImpl:async()=>{throw new TypeError('offline');},editorText:'Unapplied edit'});await e.el('generate-ai').click();assert.match(e.el('ai-status').textContent,/not reachable/);assert.equal(e.el('output').textContent,'Previous draft');assert.equal(e.el('draft-editor').value,'Unapplied edit');assert.equal(e.el('draft-editor').hidden,false);

 let resolve;
 e=boot({fetchImpl:()=>new Promise(r=>{resolve=r;})});
 let pending=e.el('generate-ai').click();await e.el('generate-ai').click();assert.equal(e.calls,1);assert.equal(e.el('generate-ai').disabled,true);
 e.el('idea').value='A different project';e.el('idea').fire('input');assert.equal(e.options.signal.aborted,true);assert.equal(e.el('generate-ai').disabled,false);
 e.el('output').textContent='New project draft';resolve(ok('Late old draft'));await pending;assert.equal(e.el('output').textContent,'New project draft');
 e=boot({fetchImpl:()=>new Promise(r=>{resolve=r;})});pending=e.el('generate-ai').click();
 e.el('project').value='Programmatically loaded project';e.el('output').textContent='Loaded draft';resolve(ok('Stale result'));await pending;
 assert.equal(e.el('output').textContent,'Loaded draft');assert.match(e.el('ai-status').textContent,/work changed/);
 e=boot({fetchImpl:()=>new Promise(r=>{resolve=r;})});pending=e.el('generate-ai').click();e.expire();assert.equal(e.options.signal.aborted,true);assert.equal(e.el('generate-ai').disabled,false);assert.match(e.el('ai-status').textContent,/timed out/);resolve(ok('Too late'));await pending;assert.equal(e.el('output').textContent,'Previous draft');
 e=boot({fetchImpl:()=>new Promise(r=>{resolve=r;})});pending=e.el('generate-ai').click();e.el('cancel-ai').click();assert.equal(e.options.signal.aborted,true);resolve(ok('Cancelled result'));await pending;assert.equal(e.el('output').textContent,'Previous draft');
 const resolvers=[];e=boot({fetchImpl:()=>new Promise(r=>resolvers.push(r))});const first=e.el('generate-ai').click();e.context.window.SparkleCreatorAI.cancel();e.el('idea').value='New context';const second=e.el('generate-ai').click();resolvers[1](ok('Newest result'));await second;resolvers[0](ok('Old result'));await first;assert.equal(e.el('output').textContent,'Newest result');
 console.log('Creator AI client behavior checks passed, including cancellation, late responses and profile preservation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
