import test from 'node:test';
import assert from 'node:assert/strict';
import {CaptionThread,feedbackIntent} from './caption-thread.mjs';
const result=n=>({id:String(n).padStart(32,'0'),hook:'POV: Mom offered to send you home with supplies '+n,caption:'Same supplier '+n+' 😭',summary:'A fictional fixture.'});
test('short rejections ask for a fresh idea; flow and catchier keep the concept',()=>{
  for(const text of ['Another one','No','Again','C’mon a good one','Try again','A different scenario please'])assert.equal(feedbackIntent(text).action,'another',text);
  for(const text of ['Make it flow better','Catchier please','Keep that idea','Big mama type energy for this one'])assert.equal(feedbackIntent(text).action,'revise',text);
});
test('explicit screen and post requests only change that part',()=>{
  assert.equal(feedbackIntent('Just the on screen caption').target,'hook');
  assert.equal(feedbackIntent('Change the regular caption').target,'caption');
  assert.equal(feedbackIntent('Catchier','caption').target,'caption');
});
test('the other caption anchors to the actual earlier version, not the last rejected one',()=>{
  const t=new CaptionThread();t.accept(result(1),'video');t.accept(result(2),'video','Make it flow better');
  const c=t.request('I like the other caption. It just needed to be catchier.');
  assert.equal(c.parentId,result(1).id);assert.equal(c.reference.hook,result(1).hook);assert.equal(c.action,'revise');
});
test('manual edits are the selected reference and rejected generations do not replace it',()=>{
  const t=new CaptionThread();t.accept(result(1),'video');
  const edits={hook:'POV: my actual edit',caption:'My own wording 😭'};
  assert.deepEqual(t.request('Catchier','both',edits).reference,edits);
  assert.equal(t.versions.length,1);assert.equal(t.versions[0].caption,result(1).caption);
});
test('new clips reset the thread; earlier feedback stays bounded and source scoped',()=>{
  const t=new CaptionThread();t.accept(result(1),'one');t.accept(result(2),'one','No relationship drama');
  assert.deepEqual(t.request('Another one').notes,['No relationship drama']);
  t.accept(result(3),'two');assert.deepEqual(t.notes,[]);assert.equal(t.versions.length,1);
});
test('original remains selectable after many revisions and restore chooses the correct parent',()=>{
  const t=new CaptionThread();for(let n=1;n<=12;n++)t.accept(result(n),'one','Feedback '+n);
  assert.equal(t.versions.length,8);assert.equal(t.request('Use the original idea').parentId,result(1).id);
  const old=t.select(2);assert.equal(t.request('Make it smoother').parentId,old.id);assert.equal(t.notes.length,3);
});
test('empty or oversize feedback and empty reference fields are not sent',()=>{
  const t=new CaptionThread();t.accept(result(1),'video');
  for(const text of [' ','x'.repeat(501)])assert.throws(()=>t.request(text));
  assert.throws(()=>t.request('Catchier','both',{hook:'',caption:'A caption'}));
});
