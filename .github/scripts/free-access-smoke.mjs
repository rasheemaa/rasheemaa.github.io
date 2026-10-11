import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(path, 'utf8');
const html = read('what-do-i-say/index.html');
assert(!/data-checkout-offer|id="paywall"|payment-v3\.js|paid-trial-access\.js|lifetime-copy\.js/.test(html));
assert(html.includes('Free for everyone'));
const schema = JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/s)[1]);
assert.equal(schema.isAccessibleForFree, true);
assert.equal(schema.offers.price, '0');
class Element {
  constructor() { this.children=[]; this.style={}; this.dataset={}; this.value=''; this.textContent=''; this.classList={add(){},toggle(){}}; }
  append(...children) { this.children.push(...children); }
  remove() {}
  focus() {}
  setAttribute() {}
  addEventListener() {}
  querySelector(selector) { return this.children.find(c => selector === '.bubble' && c.className === 'bubble') || null; }
}
for (const scenario of ['new visitor','expired trial','past purchaser','blocked storage']) {
  const nodes=new Map();
  const modes=['write','reply','fix'].map(mode=>{const e=new Element();e.dataset.mode=mode;return e;});
  const calls=[];
  const document={querySelector(s){if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);},querySelectorAll(s){return s==='.mode'?modes:[];},createElement(){return new Element();}};
  // Storage must never be consulted, including expired or paid legacy records.
  const context={document,navigator:{},window:{addEventListener(){},Sparkle:{generate:async p=>{calls.push(p);return 'Thanks for checking in.';}}},localStorage:{getItem(){throw Error('Access must not depend on storage');},setItem(){throw Error('No trial may start');}},requestAnimationFrame:f=>f()};
  vm.runInNewContext(read('what-do-i-say/chat-app.js'),context);
  assert.equal(nodes.get('#trial-status').textContent,'Free for everyone');
  const submit=async text=>{nodes.get('#prompt').value=text;nodes.get('#message-form').onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));};
  for (const mode of modes) {
    nodes.get('#new-message-top').onclick();mode.onclick();await submit('Tell Alex thank you.');assert.equal(calls.at(-1).mode,mode.dataset.mode);
  }
  const walk=e=>[e,...e.children.flatMap(walk)];
  const buttons=walk(nodes.get('#conversation')).filter(e=>e.onclick&&/^Make it|Try another/.test(e.textContent));
  for(const b of buttons.slice(-5)){b.onclick();await new Promise(r=>setImmediate(r));}
  assert.deepEqual(calls.slice(-5).map(p=>p.refine),['shorter','softer','firmer','professional','another']);
  await submit('Make it warmer');assert.equal(calls.at(-1).refine,'custom');
  console.log(`PASS ${scenario}: Write, Reply, Fix and all refinements without checkout or storage`);
}
