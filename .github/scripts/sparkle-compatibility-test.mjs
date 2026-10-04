import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const code = fs.readFileSync('what-do-i-say/sparkle.js', 'utf8');
function harness(userAgent = 'Chrome', maxTouchPoints = 0) {
  const workers = [], timers = new Map(), storage = new Map();
  let timerId = 0;
  class Worker {
    constructor() { this.listeners = {}; workers.push(this); }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    postMessage(data) { this.sent = data; }
    terminate() { this.terminated = true; }
    emit(type, data) { this.listeners[type]?.({ data }); }
  }
  const context = { window: {}, navigator: { userAgent, maxTouchPoints }, Worker,
    localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, {fn, ms}); return id; },
    clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(code, context);
  return { api: context.window.Sparkle, workers, timers, storage };
}
const payload = { mode: 'write', text: 'I will be late.' };
for (const [ua,touch] of [['iPad Safari',5],['Macintosh Version/26 Safari',5],['Macintosh Version/26 Safari',0]]) {
  const h = harness(ua,touch), p = h.api.generate(payload);
  assert.equal(h.workers[0].sent.preferLite, true);
  h.api.cancel(); await assert.rejects(p, e => e.code === 'sparkle_cancelled');
}
for (const failure of ['error', 'crash', 'timeout']) {
  const h = harness(), p = h.api.generate(payload), first = h.workers[0], id = first.sent.id;
  first.emit('message', {id, type:'status', phase:'generating', backend:'webgpu'});
  if (failure === 'error') first.emit('message', {id, type:'error', code:'sparkle_compatibility'});
  if (failure === 'crash') first.emit('error');
  if (failure === 'timeout') [...h.timers.values()][0].fn();
  assert.equal(first.terminated, true);
  assert.equal(h.workers.length, 2);
  const second = h.workers[1];
  assert.equal(second.sent.preferLite, true);
  assert.equal(second.sent.payload, payload);
  // Late messages from a terminated GPU worker must not settle this request.
  first.emit('message', {id, type:'result', message:'Wrong old response'});
  second.emit('message', {id, type:'result', message:'I will be late.', backend:'wasm'});
  assert.equal(await p, 'I will be late.');
}
{
  const h = harness(), p = h.api.generate(payload), first = h.workers[0], id = first.sent.id;
  first.emit('message', {id, type:'status', phase:'generating', backend:'webgpu'});
  first.emit('message', {id, type:'error', code:'sparkle_quality', message:'Preserve details'});
  await assert.rejects(p, e => e.code === 'sparkle_quality');
  assert.equal(h.workers.length, 1);
}
{
  const h = harness(), p = h.api.generate(payload);
  assert.equal([...h.timers.values()][0].ms, 45000);
  [...h.timers.values()][0].fn();
  await assert.rejects(p, e => e.code === 'sparkle_timeout');
  const retry = h.api.generate(payload), current = h.workers.at(-1);
  current.emit('message', {id:current.sent.id, type:'result', message:'I will be late.'});
  assert.equal(await retry, 'I will be late.');
}
console.log('PASS Safari selection; GPU error/crash/timeout recovery; stale replies; quality errors; startup timeout; retry; cancellation');

{
  const h = harness(), text = 'Tell Maya I cannot meet Friday at 4 PM. I can meet Saturday at 10 AM.';
  const p = h.api.generate({mode:'write', text, personName:'Maya'}), w = h.workers[0];
  w.emit('message', {id:w.sent.id, type:'error', code:'sparkle_quality'});
  assert.equal(await p, 'Hi Maya, I cannot meet Friday at 4 PM. I can meet Saturday at 10 AM.');
  const rejectExtra = h.api.generate({mode:'write', text: text + ' Also ask about lunch.'});
  w.emit('message', {id:w.sent.id, type:'error', code:'sparkle_quality'});
  await assert.rejects(rejectExtra, e => e.code === 'sparkle_quality');
  console.log('PASS exact scheduling preservation; extra instructions are never silently dropped');
}
