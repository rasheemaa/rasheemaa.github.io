import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(path, 'utf8');
const html = read('what-do-i-say/index.html');
assert(html.includes('Free for everyone'));
assert(!/data-mode=|class="mode|class="mode-tabs"|id="paywall"|data-checkout-offer|payment-v3\.js|paid-trial-access\.js/.test(html), 'No visible mode chooser or payment gate');
const schema = JSON.parse(html.match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(schema.isAccessibleForFree, true);
assert.equal(schema.offers.price, '0');
assert(html.includes('chat-app.js?v=30'), 'Fresh chat controller is referenced');

class Element {
  set innerHTML(value) { this.children = []; this.html = value; }
  get innerHTML() { return this.html || ''; }
  constructor() {
    this.children = []; this.style = {}; this.dataset = {}; this.value = ''; this.textContent = ''; this.className = ''; this.hidden = false;
    this.classList = { add() {}, toggle() {} };
  }
  append(...children) { this.children.push(...children); }
  remove() {}
  focus() {}
  setAttribute() {}
  getAttribute() { return 'false'; }
  addEventListener() {}
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('.') && child.className.split(/\s+/).includes(selector.slice(1))) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}
const cases = [
  { description: 'direct writing', text: 'Tell Alex thank you.', desktop: 'write' },
  { description: 'responding', text: 'They said: Are you mad? I want to say I need time.', desktop: 'reply' },
  { description: 'rewriting', text: 'Fix this message: hey i cant do Friday.', desktop: 'fix' },
  { description: 'plain text to another person', text: 'Can you loan me a dollar?', desktop: 'write' }
];
for (const scenario of ['new visitor', 'expired trial', 'past purchaser', 'blocked storage']) {
  for (const cloud of [false, true]) {
    const nodes = new Map();
    const calls = [];
    const document = {
      querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); },
      querySelectorAll() { return []; },
      createElement() { return new Element(); }
    };
    const window = {
      __WDIS_MOBILE_CLOUD_SPARKLE: cloud,
      addEventListener() {},
      Sparkle: { generate: async payload => { calls.push(payload); return `Draft ${calls.length}.`; } }
    };
    const context = { document, navigator: {}, window, localStorage: {
      getItem() { throw Error('Access must not depend on storage'); },
      setItem() { throw Error('No trial may start'); }
    }, requestAnimationFrame: callback => callback() };
    vm.runInNewContext(read('what-do-i-say/chat-app.js'), context);
    assert.equal(nodes.get('#trial-status').textContent, 'Free for everyone');
    const submit = async input => {
      nodes.get('#new-message-top').onclick();
      nodes.get('#prompt').value = input;
      nodes.get('#message-form').onsubmit({ preventDefault() {} });
      await new Promise(resolve => setImmediate(resolve));
    };
    for (const test of cases) {
      await submit(test.text);
      assert.equal(calls.at(-1).mode, cloud ? 'auto' : test.desktop, `${scenario} / ${test.description}`);
    }
    const walk = element => [element, ...element.children.flatMap(walk)];
    const buttons = walk(nodes.get('#conversation')).filter(element => element.onclick && /^(?:Make it|Try another)/.test(element.textContent));
    for (const button of buttons.slice(-5)) { button.onclick(); await new Promise(resolve => setImmediate(resolve)); }
    assert.deepEqual(calls.slice(-5).map(payload => payload.refine), ['shorter','softer','firmer','professional','another']);
    assert(calls.slice(-5).every(payload => payload.currentMessage === 'Draft 4.'), 'Each original-response button must keep targeting that response');
    nodes.get('#prompt').value = 'Make it warmer';
    nodes.get('#message-form').onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.at(-1).refine, 'custom');
    const earlierMessage = buttons.at(-5);
    earlierMessage.onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.at(-1).currentMessage, 'Draft 4.', 'An earlier response button edits that response');
    nodes.get('#new-message-top').onclick();
    window.Sparkle.generate = async () => { throw new Error('Service unavailable'); };
    nodes.get('#prompt').value = 'Tell Jordan I cannot make tonight.';
    nodes.get('#message-form').onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nodes.get('#prompt').value, 'Tell Jordan I cannot make tonight.', 'A failed first generation restores the editable draft');
    assert.equal(nodes.get('#ai-error').hidden, false);
    console.log(`PASS ${scenario} / ${cloud ? 'mobile cloud' : 'desktop local'}: universal chat, inferred intent, refinements, no paid gate`);
  }
}
