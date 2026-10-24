// Behavioral tests for Creator Studio output persistence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function boot({stored,confirm=true,recovered}={}) {
 const data=new Map(stored ? [['sparkle_creator_saved_output_v1',JSON.stringify(stored)]] : []);
 const elements=new Map();
 const listeners={};
 let consent=confirm;
 const ids=['output','draft-editor','draft-editor-label','apply-draft','save-output','clear-output','output-status','task'];
 for(const id of ids)elements.set(id,{value:'',textContent:'',hidden:id==='draft-editor'||id==='draft-editor-label'||id==='apply-draft',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},click(){this.listeners.click?.();}});
 elements.get('output').textContent='Choose a goal and describe your idea to see a structured starter brief.';
 elements.get('task').value='content';
 const window={confirm:()=>consent,addEventListener:(type,fn)=>{listeners[type]=fn;}};
 const localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
 const recovery=new Map(recovered ? [['sparkle_creator_output_recovery_v1',JSON.stringify(recovered)]] : []);
 const sessionStorage={getItem:key=>recovery.get(key)??null,setItem:(key,value)=>recovery.set(key,String(value)),removeItem:key=>recovery.delete(key)};
 const ctx=vm.createContext({window,localStorage,sessionStorage,document:{getElementById:id=>elements.get(id)},Date,JSON,String,Number});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'drafts.js'),'utf8'),ctx);
 const el=id=>elements.get(id);
 const unload=()=>{const e={prevented:false,preventDefault(){this.prevented=true;}};listeners.beforeunload?.(e);return e;};
 return {el,window,localStorage,sessionStorage,unload,setConsent:value=>{consent=value;}};
}
{
 const e=boot();
 assert.equal(e.unload().prevented,false);
 e.el('output').textContent='Draft one';
 assert.equal(e.unload().prevented,true);
 e.setConsent(false);
 assert.equal(e.window.SparkleCreatorDrafts.confirmReplace(),false);
 e.el('save-output').click();
 assert.equal(JSON.parse(e.localStorage.getItem('sparkle_creator_saved_output_v1')).text,'Draft one');
 assert.equal(e.unload().prevented,false);
 e.el('draft-editor').hidden=false;
 e.el('draft-editor').value='Edited draft';
 e.el('save-output').click();
 assert.equal(JSON.parse(e.localStorage.getItem('sparkle_creator_saved_output_v1')).text,'Edited draft');
 assert.equal(e.unload().prevented,false);
 e.el('draft-editor').value='Another unsaved edit';
 assert.equal(e.unload().prevented,true);
 e.setConsent(true);
 e.el('clear-output').click();
 assert.equal(e.localStorage.getItem('sparkle_creator_saved_output_v1'),null);
}
{
 const e=boot({stored:{text:'Restored AI draft',task:'content',saved:Date.now()}});
 assert.equal(e.el('output').textContent,'Restored AI draft');
 assert.equal(e.unload().prevented,false);
}
{
 const e=boot({stored:{text:'Old draft',task:'content',saved:Date.now()-31*86400000}});
 assert.equal(JSON.parse(e.localStorage.getItem('sparkle_creator_saved_output_v1')).text,'Old draft');
 assert.equal(e.el('output').textContent,'Old draft','Older drafts remain recoverable instead of being silently deleted');
 assert.equal(e.unload().prevented,false);
}
{
 const e=boot({recovered:{text:'Do not expire this unfinished edit',displayed:'Earlier output',editing:true,time:Date.now()-40*86400000}});
 assert.equal(e.el('draft-editor').hidden,false);
 assert.equal(e.el('draft-editor').value,'Do not expire this unfinished edit');
 assert.equal(e.el('output').textContent,'Earlier output');
 assert.equal(e.unload().prevented,true);
}
console.log('Creator Studio output persistence behavior checks passed.');
