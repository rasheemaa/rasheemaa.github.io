const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const source = readFileSync('what-do-i-say/simple-home.js','utf8');

function setup(ai = true) {
  const elements = new Map(), requests = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value:'', hidden:false, textContent:'', disabled:false, dataset:{}, handlers:{},
      classList:{add(){},remove(){}},
      addEventListener(type, handler){(this.handlers[type] ||= []).push(handler);},
      fire(type){for(const fn of this.handlers[type] || [])fn({preventDefault(){}});},
      setAttribute(key,value){this[key]=value;}, focus(){}, setSelectionRange(){}, select(){}
    });
    return elements.get(id);
  };
  const buttons = ['write','reply','fix'].map(mode => {
    const button = element('choice-'+mode); button.dataset.sparkleStart=mode; return button;
  });
  const panels = ['write','reply','fix'].map(mode => ({dataset:{sparklePanel:mode},hidden:true}));
  const choices = element('choices');
  element('sparkle-task-workspace').querySelectorAll = () => panels;
  element('sparkle-task-result').hidden=true;
  const document = {
    getElementById:element,
    querySelectorAll:() => buttons,
    querySelector:selector => selector.includes('sparkle-choices') ? choices : buttons[0]
  };
  runInNewContext(source, {
    document, window:{SPARKLE_STAGING_ONLY:true,SPARKLE_TASK_AI_ENABLED:ai},
    navigator:{clipboard:{writeText:async()=>{}}}, AbortController, setTimeout, clearTimeout,
    fetch:(_url,options) => new Promise((resolve,reject)=>requests.push({options,resolve,reject}))
  });
  return {element,requests,choose:mode=>buttons.find(x=>x.dataset.sparkleStart===mode).fire('click'),
    submit:()=>element('sparkle-task-form').fire('submit')};
}
const flush = () => new Promise(resolve=>setImmediate(resolve));
async function finish(request, message, status=200) {
  request.resolve({ok:status===200,status,json:async()=>({message})}); await flush();
}
(async()=>{
  const app=setup(); const $=app.element;
  app.choose('write'); $('sparkle-write-type').value='email';
  $('sparkle-write-idea').value='Ask about Friday';
  app.submit();
  assert.equal($('sparkle-task-cancel').hidden,false);
  await finish(app.requests[0],'First good draft');
  assert.equal($('sparkle-prepared-text').value,'First good draft');
  assert.match($('sparkle-draft-origin').textContent,/Sparkle AI/);

  app.submit(); await finish(app.requests[1],'',429);
  assert.equal($('sparkle-task-result').hidden,false);
  assert.equal($('sparkle-prepared-text').value,'First good draft');
  assert.match($('sparkle-task-status').textContent,/free allowance/);

  app.submit(); const stale=app.requests[2];
  $('sparkle-write-idea').value='An updated question'; $('sparkle-task-form').fire('input');
  assert.equal(stale.options.signal.aborted,true);
  assert.equal($('sparkle-task-continue').disabled,false);
  app.submit(); const fresh=app.requests[3];
  await finish(stale,'Stale response must be ignored');
  assert.equal($('sparkle-task-continue').disabled,true,'old finally must not unlock the new request');
  assert.equal($('sparkle-prepared-text').value,'First good draft');
  await finish(fresh,'Current draft');
  assert.equal($('sparkle-prepared-text').value,'Current draft');

  app.submit(); const cancelled=app.requests[4]; $('sparkle-task-cancel').fire('click');
  assert.equal(cancelled.options.signal.aborted,true);
  await finish(cancelled,'Cancelled response');
  assert.equal($('sparkle-prepared-text').value,'Current draft');
  assert.equal($('sparkle-task-cancel').hidden,true);

  $('sparkle-prepared-text').value='My edited words'; $('sparkle-prepared-text').fire('input');
  $('sparkle-task-back').fire('click'); app.choose('reply');
  assert.equal($('sparkle-task-result').hidden,true,'different task must not display the prior output');
  app.choose('write');
  assert.equal($('sparkle-task-result').hidden,false);
  assert.equal($('sparkle-prepared-text').value,'My edited words');
  app.submit(); await finish(app.requests[5],'x'.repeat(6001));
  assert.equal($('sparkle-prepared-text').value,'My edited words','oversized output must not replace a good draft');

  const local=setup(false); local.choose('reply');
  local.element('sparkle-reply-message').value='Can you work Friday?';
  local.element('sparkle-reply-idea').value='I cannot work Friday';
  local.element('sparkle-reply-goal').value='decline'; local.submit();
  assert.equal(local.requests.length,0);
  assert.match(local.element('sparkle-prepared-text').value,/I cannot work Friday/);
  assert.doesNotMatch(local.element('sparkle-prepared-text').value,/Can you work/);
  assert.match(local.element('sparkle-draft-origin').textContent,/on your device/);
  console.log('PASS guided writing: cancellation, stale-response isolation, safe retry, editable per-task drafts, bounded output and accurate local/AI labels');
})().catch(error=>{console.error(error);process.exitCode=1;});
