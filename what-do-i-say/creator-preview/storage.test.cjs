// Browser-independent behavior checks for Creator Studio local persistence.
// Run: node what-do-i-say/creator-preview/storage.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function environment() {
  const data = new Map(), elements = new Map();
  const make = id => ({
    id, value: '', textContent: '', options: [],
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    click() { this.listeners.click?.(); },
    replaceChildren(...items) { this.options = items; },
    add(item) { this.options.push(item); }
  });
  for (const id of ['save','load','delete','clear','saved','project','task','idea','audience','tone','save-status','profile-save','profile-clear','profile-status','creator-name','creator-niche','creator-style','creator-avoid']) elements.set(id, make(id));
  elements.get('task').options = [{value:'content'},{value:'reply'}];
  elements.get('tone').options = [{value:'Warm and conversational'},{value:'Playful and bold'}];
  elements.get('task').value = 'content';
  elements.get('tone').value = 'Warm and conversational';
  const localStorage = {
    getItem: k => data.has(k) ? data.get(k) : null,
    setItem: (k,v) => data.set(k,String(v)),
    removeItem: k => data.delete(k)
  };
  const context = vm.createContext({
    document: {getElementById: id => elements.get(id)},
    localStorage,
    Option: function(text,value) { this.text = text; this.value = value; },
    window: {confirm: () => true},
    Date, Math, JSON, String
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context);
  const el = id => elements.get(id);
  return {run,el,localStorage,context};
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
  e.el('load').click();
  assert.equal(e.el('idea').value,'Boundaries and confidence');
  e.el('project').value = 'Second project';
  e.el('idea').value = 'Another idea';
  e.el('save').click();
  assert.equal(JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1')).length,2);
  e.el('delete').click();
  const remaining = JSON.parse(e.localStorage.getItem('sparkle_creator_projects_v1'));
  assert.equal(remaining.length,1);
  assert.equal(remaining[0].name,'POV idea');
  e.el('clear').click();
  assert.equal(e.localStorage.getItem('sparkle_creator_projects_v1'),null);
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
console.log('Creator Studio storage behavior checks passed.');
