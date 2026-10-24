// Browser-independent behavior checks for Creator Studio local persistence.
// Run: node what-do-i-say/creator-preview/storage.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function environment() {
  const data = new Map(), drafts = new Map(), elements = new Map();
  let allowDiscard = true;
  const windowListeners = {};
  const make = id => ({
    id, value: '', textContent: '', options: [],
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    click() { this.listeners.click?.(); },
    dispatchEvent(event) { this.listeners[event.type]?.(); },
    focus() { this.focused = true; },
    replaceChildren(...items) { this.options = items; },
    add(item) { this.options.push(item); }
  });
  for (const id of ['save','new-project','load','delete','clear','export-projects','saved','project-search','project','task','idea','audience','tone','save-status','profile-save','profile-clear','profile-status','creator-name','creator-niche','creator-style','creator-avoid']) elements.set(id, make(id));
  elements.get('task').options = [{value:'content'},{value:'reply'}];
  elements.get('tone').options = [{value:'Warm and conversational'},{value:'Playful and bold'}];
  elements.get('task').value = 'content';
  elements.get('tone').value = 'Warm and conversational';
  const localStorage = {
    getItem: k => data.has(k) ? data.get(k) : null,
    setItem: (k,v) => data.set(k,String(v)),
    removeItem: k => data.delete(k)
  };
  const sessionStorage = {
    getItem: k => drafts.has(k) ? drafts.get(k) : null,
    setItem: (k,v) => drafts.set(k,String(v)),
    removeItem: k => drafts.delete(k)
  };
  const context = vm.createContext({
    document: {getElementById: id => elements.get(id)},
    localStorage, sessionStorage,
    Option: function(text,value) { this.text = text; this.value = value; },
    window: {confirm: () => allowDiscard, addEventListener: (type,fn) => {windowListeners[type] = fn;}},
    Date, Math, JSON, String,
    Event: function(type) { this.type = type; }
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context);
  const el = id => elements.get(id);
  return {run,el,localStorage,sessionStorage,context,setAllowDiscard: value => {allowDiscard = value;},triggerUnload: () => {const event = {returnValue:undefined,prevented:false,preventDefault(){this.prevented=true;}};windowListeners.beforeunload?.(event);return event;}};
}

{
  const e = environment();
  e.run('projects.js');
  e.el('save').click();
  assert.match(e.el('save-status').textContent,/Enter a project name/);
  e.el('project').value = 'POV idea';
  e.el('idea').value = 'Boundaries and confidence';
  e.el('audience').value = 'Creators';
  e.el('save').click();
  const saved = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(saved.length,1);
  assert.equal(saved[0].idea,'Boundaries and confidence');
  e.el('idea').value = 'Changed';
  e.el('idea').dispatchEvent(new Event('input'));
  assert.match(e.sessionStorage.getItem('sparkle_creator_unsaved_draft_v1'),/Changed/);
  assert.equal(e.triggerUnload().prevented,true);
  e.setAllowDiscard(false);
  e.el('load').click();
  assert.equal(e.el('idea').value,'Changed');
  e.setAllowDiscard(true);
  e.el('load').click();
  assert.equal(e.el('idea').value,'Boundaries and confidence');
  assert.equal(e.triggerUnload().prevented,false);
  assert.equal(e.sessionStorage.getItem('sparkle_creator_unsaved_draft_v1'),null);
  e.el('idea').dispatchEvent(new Event('input'));
  assert.equal(e.sessionStorage.getItem('sparkle_creator_unsaved_draft_v1'),null);
  e.el('idea').value = 'Updated original idea';
  e.el('save').click();
  const updated = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(updated.length,1);
  assert.equal(updated[0].idea,'Updated original idea');
  e.el('idea').value = 'Unsaved idea';
  e.setAllowDiscard(false);
  e.el('new-project').click();
  assert.equal(e.el('idea').value,'Unsaved idea');
  e.setAllowDiscard(true);
  e.context.window.SparkleCreatorDrafts = {confirmReplace: () => false};
  e.el('new-project').click();
  assert.equal(e.el('idea').value,'Unsaved idea');
  e.context.window.SparkleCreatorDrafts = {confirmReplace: () => true};
  e.el('new-project').click();
  assert.equal(e.el('project').value,'');
  assert.equal(e.el('idea').value,'');
  assert.equal(JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1')).length,1);
  e.el('project').value = 'Second project';
  e.el('idea').value = 'Another idea';
  e.el('save').click();
  assert.equal(JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1')).length,2);
  const records = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  e.el('saved').value = records[1].id;
  e.el('saved').dispatchEvent(new Event('change'));
  e.el('project').value = 'Third project';
  e.el('save').click();
  const afterSelection = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(afterSelection.length,3);
  assert.equal(afterSelection.find(p => p.id === records[1].id).name,'POV idea');
  e.el('project-search').value = 'second';
  e.el('project-search').listeners.input();
  assert.equal(e.el('saved').options.length,2);
  e.el('project-search').value = '';
  e.el('project-search').listeners.input();
  e.el('saved').value = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'))[0].id;
  e.el('delete').click();
  const remaining = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(remaining.length,2);
  assert.ok(remaining.some(p => p.name === 'POV idea'));
  assert.ok(remaining.some(p => p.name === 'Second project'));
  e.el('clear').click();
  assert.equal(e.localStorage.getItem('sparkle_creator_projects_v1'),null);
  assert.equal(e.el('saved').value,'');
  assert.equal(e.el('project').value,'Third project');
  e.el('save').click();
  const fresh = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(fresh.length,1);
  assert.equal(fresh[0].name,'Third project');
}
{
  const e = environment();
  e.run('projects.js');
  for (let i = 0; i < 30; i++) {
    e.el('new-project').click();
    e.el('project').value = 'Project ' + i;
    e.el('idea').value = 'Idea ' + i;
    e.el('save').click();
  }
  const before = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(before.length,30);
  e.el('new-project').click();
  e.el('project').value = 'Overflow project';
  e.el('idea').value = 'Do not discard any project';
  e.el('save').click();
  const after = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(after.length,30);
  assert.deepEqual(after,before);
  assert.match(e.el('save-status').textContent,/reached 30 saved projects/);
}
{
  const e = environment();
  e.run('profile.js');
  e.el('creator-name').value = 'Sample creator';
  e.el('creator-style').value = 'Original and friendly';
  e.el('profile-save').click();
  assert.match(e.context.window.SparkleCreatorProfile.profileText(),/Original and friendly/);
  e.el('profile-clear').click();
  assert.equal(e.localStorage.getItem('sparkle_creator_profile_v1'),null);
  assert.equal(e.context.window.SparkleCreatorProfile.profileText(),'');
}
{
  const e=environment();
  const raw='{unreadable saved project data';
  e.localStorage.setItem('sparkle_creator_projects_v1',raw);
  e.run('projects.js');
  e.el('project').value='A new project';e.el('idea').value='Keep existing data';
  e.el('save').click();
  assert.equal(e.localStorage.getItem('sparkle_creator_projects_v1'),raw);
  assert.match(e.el('save-status').textContent,/left untouched/);
}
{
  const e=environment();let draft='First project draft',marked=0;
  e.context.window.SparkleCreatorDrafts={confirmReplace:()=>true,projectText:()=>draft,markProjectSaved:()=>{marked++;},restoreProject:value=>{draft=value;}};
  e.run('projects.js');
  e.el('project').value='First';e.el('idea').value='First idea';e.el('save').click();
  const first=JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'))[0];
  assert.equal(first.draft,'First project draft');assert.equal(marked,1);
  e.el('new-project').click();draft='Second draft';e.el('project').value='Second';e.el('idea').value='Second idea';e.el('save').click();
  e.el('saved').value=first.id;e.el('load').click();assert.equal(draft,'First project draft');
  const external=JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  external.find(p=>p.id===first.id).draft='Newer version from another tab';
  e.localStorage.setItem('sparkle_creator_projects_v1',JSON.stringify(external));
  draft='This tab version';e.setAllowDiscard(false);e.el('save').click();
  assert.equal(JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1')).length,2);
  e.setAllowDiscard(true);e.el('save').click();
  const after=JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(after.length,3);assert.equal(after.find(p=>p.id===first.id).draft,'Newer version from another tab');
  assert(after.some(p=>p.draft==='This tab version'));
}
{
 const e=environment();
 const key='sparkle_creator_unsaved_draft_v1';
 const raw=JSON.stringify({fields:['Old project','An idea worth keeping','Creators','content','Warm and conversational'],time:Date.now()-40*86400000});
 e.sessionStorage.setItem(key,raw);e.run('projects.js');
 assert.equal(e.el('idea').value,'An idea worth keeping','An old unsaved form must remain recoverable');
 assert.equal(e.sessionStorage.getItem(key),raw);
}
{
 const e=environment(),key='sparkle_creator_unsaved_draft_v1',raw='{unreadable unsaved form';
 e.sessionStorage.setItem(key,raw);e.run('projects.js');
 assert.equal(e.sessionStorage.getItem(key),raw,'Corrupt recovery data must never be silently deleted');
 assert.match(e.el('save-status').textContent,/left untouched/);
}
console.log('Creator Studio storage behavior checks passed, including project drafts, cross-tab conflicts and unreadable-data preservation.');
