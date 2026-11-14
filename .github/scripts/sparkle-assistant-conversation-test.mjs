import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor() {
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.classList = { add() {}, toggle() {} };
  }
  append(...items) { this.children.push(...items); }
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

function setup() {
  const nodes = new Map();
  const askCalls = [];
  const writeCalls = [];
  const previews = [];
  const website = {
    siteName: 'Good Dog Grooming', headline: 'Happy pups',
    subheading: 'Gentle grooming services', theme: 'rose',
    ctaLabel: 'Learn more', sections: [
      { heading: 'Baths', body: 'Fresh and clean' },
      { heading: 'Trims', body: 'A tidy look' }
    ]
  };
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, new Element());
      return nodes.get(selector);
    },
    querySelectorAll() { return []; },
    createElement() { return new Element(); }
  };
  const window = {
    addEventListener() {},
    Sparkle: {
      generate: async payload => {
        writeCalls.push(payload);
        return 'Written message for someone else.';
      }
    },
    SparkleAssistant: {
      ask: async (text, history, task, onStatus, existingWebsite) => {
        askCalls.push({ text, history: JSON.parse(JSON.stringify(history)), task, existingWebsite });
        if (task === 'website') return {
          type: 'website', message: 'I made a static website draft. It is not published.', website
        };
        return { type: 'chat', message: 'I can help. What kind of website do you want?' };
      },
      cancel() {}
    },
    SparkleSiteDraft: { show: (site, stack) => previews.push({ site, stack }) }
  };
  vm.runInNewContext(readFileSync('what-do-i-say/chat-app.js', 'utf8'), {
    document, window, navigator: {}, requestAnimationFrame: cb => cb()
  });
  async function send(text) {
    nodes.get('#prompt').value = text;
    nodes.get('#message-form').onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
  }
  function reset() { nodes.get('#new-message-top').onclick(); }
  return { send, reset, askCalls, writeCalls, previews };
}

test('Sparkle follows the website request through clarification and revision', async () => {
  const s = setup();
  await s.send('Create me a website');
  assert.equal(s.askCalls.length, 1);
  assert.equal(s.askCalls[0].task, 'chat');
  assert.equal(s.writeCalls.length, 0);
  await s.send('For my dog grooming business');
  assert.equal(s.askCalls[1].task, 'website');
  assert.equal(s.askCalls[1].history[0].content, 'Create me a website');
  assert.equal(s.previews.length, 1);
  await s.send('Make it blue');
  assert.equal(s.askCalls[2].task, 'website');
  assert.equal(s.askCalls[2].existingWebsite.siteName, 'Good Dog Grooming');
  assert.equal(s.previews.length, 2);
});

test('a direct correction switches from writing to actual assistant behavior', async () => {
  const s = setup();
  await s.send('Tell Jordan I cannot make Friday');
  assert.equal(s.writeCalls.length, 1);
  await s.send('No im asking you to do that for me');
  assert.equal(s.askCalls.length, 1);
  assert.equal(s.askCalls[0].task, 'chat');
  assert.equal(s.askCalls[0].history[0].content, 'Tell Jordan I cannot make Friday');
  assert.equal(s.askCalls[0].history[1].role, 'assistant');
});

test('message refinements still refine, and new chats clear assistant state', async () => {
  const s = setup();
  await s.send('Tell Jordan I cannot make Friday');
  await s.send('Make it warmer');
  assert.equal(s.askCalls.length, 0);
  assert.equal(s.writeCalls[1].refine, 'custom');
  s.reset();
  await s.send('Create me a website');
  assert.equal(s.askCalls.length, 1);
  s.reset();
  await s.send('Can you loan me a dollar?');
  assert.equal(s.writeCalls.at(-1).mode, 'write');
});


test('creative requests are not mistaken for messages to send someone', async () => {
  const s = setup();
  await s.send('Write a poem about the sunrise');
  assert.equal(s.askCalls.length, 1);
  assert.equal(s.writeCalls.length, 0);
  s.reset();
  await s.send('Write a message to my friend about dinner');
  assert.equal(s.writeCalls.length, 1);
  s.reset();
  await s.send('Build me a site for a small photography business');
  assert.equal(s.askCalls.at(-1).task, 'website');
});
