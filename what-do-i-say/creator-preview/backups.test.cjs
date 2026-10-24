const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KEY = 'sparkle_creator_projects_v1';
const source = fs.readFileSync(path.join(__dirname,'backups.js'),'utf8');
const project = (id,extra={}) => ({id,name:'Project '+id,task:'content',idea:'A real idea',audience:'Creators',tone:'Warm and conversational',saved:'2026-10-23T12:00:00.000Z',draft:'Keep this draft exactly.\n<img src=x onerror=alert(1)>',...extra});
function environment(initial = [], options = {}) {
  const data = new Map([[KEY,typeof initial === 'string' ? initial : JSON.stringify(initial)],['sparkle_creator_profile_v1','{"creator-name":"Keep my profile"}']]);
  const elements = new Map();
  let confirmations = 0, events = 0, writes = 0, reads = 0;
  const make = id => ({id,value:'',disabled:false,textContent:'',files:[],listeners:{},clicks:0,
    addEventListener(type,fn){this.listeners[type]=fn;},click(){this.clicks++;this.listeners.click?.();}});
  for(const id of ['import-projects','project-backup','backup-status'])elements.set(id,make(id));
  const el=id=>elements.get(id);
  const localStorage={getItem:key=>data.has(key)?data.get(key):null,setItem(key,value){writes++;if(options.full)throw Error('quota');data.set(key,String(value));}};
  const context=vm.createContext({
    document:{getElementById:el},localStorage,
    window:{confirm(){confirmations++;return options.confirm ? options.confirm(data) : options.accept !== false;},dispatchEvent(event){assert.equal(event.type,'sparkle:projects-restored');events++;}},
    Event:function(type){this.type=type;},TextEncoder,Date,Math,Number,Error,
    setTimeout:options.immediateTimeout ? fn=>{fn();return 1;} : setTimeout,
    clearTimeout:options.immediateTimeout ? ()=>{} : clearTimeout
  });
  vm.runInContext(source,context);
  const restore=async(value,extra={})=>{
    const text=typeof value==='string'?value:JSON.stringify(value);
    el('project-backup').value='selected-file.json';
    el('project-backup').files=[{size:Buffer.byteLength(text),text:()=>{reads++;return Promise.resolve(text);},...extra}];
    await el('project-backup').listeners.change();
  };
  return {data,el,restore,get status(){return el('backup-status').textContent;},get records(){return JSON.parse(data.get(KEY));},get confirmations(){return confirmations;},get events(){return events;},get writes(){return writes;},get reads(){return reads;}};
}
test('restore merges projects and exact drafts without changing existing records or profile',async()=>{
 const original=project('existing',{extra:'Preserve unknown existing data'}),e=environment([original]);
 await e.restore([project('imported')]);
 assert.deepEqual(e.records,[project('imported'),original]);
 assert.equal(e.data.get('sparkle_creator_profile_v1'),'{"creator-name":"Keep my profile"}');
 assert.equal(e.confirmations,1);assert.equal(e.events,1);
 assert.match(e.status,/current form and draft are unchanged/);
 assert.equal(e.el('project-backup').value,'');assert.equal(e.el('import-projects').disabled,false);
});
test('a changed matching ID creates a separate copy and repeated restore is idempotent',async()=>{
 const old=project('same'),changed=project('same',{draft:'Imported changed draft'}),e=environment([old]);
 await e.restore([changed]);
 assert.equal(e.records.length,2);assert.deepEqual(e.records[1],old);
 assert.notEqual(e.records[0].id,'same');assert.equal(e.records[0].restoredFromId,'same');
 assert.equal(e.records[0].draft,'Imported changed draft');
 await e.restore([changed]);assert.equal(e.records.length,2);assert.equal(e.confirmations,1);
 assert.match(e.status,/already saved/);
});
test('identical projects are not duplicated',async()=>{
 const e=environment([project('same')]);await e.restore([project('same')]);
 assert.equal(e.writes,0);assert.equal(e.confirmations,0);assert.equal(e.events,0);
});
test('cancelling confirmation preserves every storage byte',async()=>{
 const e=environment([project('old')],{accept:false}),before=e.data.get(KEY);
 await e.restore([project('new')]);assert.equal(e.data.get(KEY),before);assert.equal(e.writes,0);assert.match(e.status,/cancelled/);
});
test('oversized files are rejected before reading them',async()=>{
 const e=environment();await e.restore([project('new')],{size:2000001});
 assert.equal(e.reads,0);assert.equal(e.writes,0);assert.match(e.status,/smaller than 2 MB/);
});
test('UTF-8 content size is checked after reading',async()=>{
 const e=environment();await e.restore('💜'.repeat(500001),{size:1});
 assert.equal(e.writes,0);assert.match(e.status,/too large/);
});
test('malformed and unsupported backups cause no partial restore',async()=>{
 for(const value of ['{bad',{},[project('new'),project('bad',{task:'unknown'})],[project('new',{draft:'x'.repeat(12001)})],[project('new',{name:''})],[project('new',{saved:'not a date'})],[project('same'),project('same')]]) {
  const e=environment([project('old')]),before=e.data.get(KEY);await e.restore(value);
  assert.equal(e.data.get(KEY),before);assert.equal(e.writes,0);assert.equal(e.confirmations,0);
 }
});
test('unreadable existing storage is retained',async()=>{
 for(const initial of ['{broken',JSON.stringify({project:'not an array'}),JSON.stringify([{id:'legacy-incomplete'}])]){
  const e=environment(initial);await e.restore([project('new')]);
  assert.equal(e.data.get(KEY),initial);assert.equal(e.writes,0);assert.match(e.status,/Existing saved projects could not be verified/);
 }
});
test('over-capacity restore never truncates a backup or saved projects',async()=>{
 const existing=Array.from({length:30},(_,i)=>project('old'+i)),e=environment(existing),before=e.data.get(KEY);
 await e.restore([project('new')]);assert.equal(e.data.get(KEY),before);assert.equal(e.writes,0);assert.match(e.status,/exceed 30/);
 const big=environment();await big.restore(Array.from({length:31},(_,i)=>project('new'+i)));assert.equal(big.writes,0);
});
test('storage quota failure preserves the original storage',async()=>{
 const e=environment([project('old')],{full:true}),before=e.data.get(KEY);
 await e.restore([project('new')]);assert.equal(e.data.get(KEY),before);assert.match(e.status,/storage is unavailable or full/);
});
test('another tab changing storage during confirmation prevents an old snapshot overwrite',async()=>{
 const concurrent=JSON.stringify([project('other-tab')]);
 const e=environment([project('old')],{confirm(data){data.set(KEY,concurrent);return true;}});
 await e.restore([project('new')]);assert.equal(e.data.get(KEY),concurrent);assert.equal(e.writes,0);assert.match(e.status,/changed while you reviewed/);
});
test('file read failures and deadlines preserve data and recover the control',async()=>{
 for(const options of [{},{immediateTimeout:true}]){
  const e=environment([project('old')],options),before=e.data.get(KEY);
  await e.restore([project('new')],{text:()=>options.immediateTimeout?new Promise(()=>{}):Promise.reject(Error('File unavailable'))});
  assert.equal(e.data.get(KEY),before);assert.equal(e.writes,0);assert.equal(e.el('import-projects').disabled,false);
 }
});
test('empty backups and cancelled file pickers make no changes',async()=>{
 const e=environment([project('old')]);await e.restore([]);assert.equal(e.writes,0);assert.match(e.status,/contains no projects/);
 e.el('project-backup').files=[];await e.el('project-backup').listeners.change();assert.equal(e.writes,0);
});
test('restore button opens the file picker',()=>{
 const e=environment();e.el('import-projects').click();assert.equal(e.el('project-backup').clicks,1);
});
test('new records retain only supported fields and cannot pollute prototypes',async()=>{
 const e=environment();const incoming=JSON.parse(JSON.stringify([project('new')]).replace('"id":"new"','"__proto__":{"polluted":true},"extra":"drop","id":"new"'));
 await e.restore(incoming);assert.equal(e.records[0].extra,undefined);assert.equal(e.records[0].__proto__.polluted,undefined);assert.equal({}.polluted,undefined);
});
test('legacy exported records without a draft restore successfully',async()=>{
 const p=project('old-export');delete p.draft;const e=environment();await e.restore([p]);
 assert.equal(e.records[0].draft,'');assert.equal(e.records[0].name,p.name);
});
