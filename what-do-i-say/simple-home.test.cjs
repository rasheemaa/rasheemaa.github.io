/* Regression coverage for the simple Sparkle home chooser. No network, AI, or deployment. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const script = readFileSync(join(__dirname, 'simple-home.js'), 'utf8');
const styles = readFileSync(join(__dirname, 'simple-home.css'), 'utf8');

assert.match(html, /<nav class="sparkle-choices" aria-label="[^"]+">/);
assert.equal((html.match(/data-sparkle-start="/g) || []).length, 3);
for (const name of ['write', 'reply', 'fix']) {
  assert.match(html, new RegExp('data-sparkle-start="' + name + '"'));
}
assert.match(html, /href="\/what-do-i-say\/creator-preview\/"/);
assert.match(html, /Video generation is not available yet\./);
assert.match(html, /simple-home\.js\?v=1/);
assert.match(html, /simple-home\.css\?v=1/);
assert.match(styles, /focus-visible/);
assert.match(styles, /prefers-reduced-motion/);

const prompts = {
  write: 'Help me write a message, caption, or email about: ',
  reply: 'Help me reply to this message: ',
  fix: 'Make this sound better while keeping my meaning: '
};

function makePage(initial = '') {
  const events = [];
  const field = {
    value: initial,
    focus() { events.push('focus'); },
    dispatchEvent(event) {
      events.push(['input', event.type, event.bubbles]);
    },
    setSelectionRange(start, end) {
      events.push(['selection', start, end]);
    }
  };
  const buttons = Object.keys(prompts).map(kind => ({
    kind,
    addEventListener(type, handler) {
      assert.equal(type, 'click');
      this.click = handler;
    },
    getAttribute(key) {
      assert.equal(key, 'data-sparkle-start');
      return kind;
    }
  }));
  const document = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-sparkle-start]');
      return buttons;
    },
    getElementById(id) {
      assert.equal(id, 'prompt');
      return field;
    }
  };
  class Event {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options.bubbles;
    }
  }
  runInNewContext(script, { document, Event }, { filename: 'simple-home.js' });
  return { field, buttons, events };
}

for (const kind of Object.keys(prompts)) {
  const fresh = makePage();
  fresh.buttons.find(button => button.kind === kind).click();
  assert.equal(fresh.field.value, prompts[kind], kind + ' must prefill the composer');
  assert.deepEqual(fresh.events, [
    ['input', 'input', true], 'focus',
    ['selection', prompts[kind].length, prompts[kind].length]
  ]);

  const existing = makePage('I already wrote this, please keep it.');
  existing.buttons.find(button => button.kind === kind).click();
  assert.equal(existing.field.value, 'I already wrote this, please keep it.', kind + ' overwrote existing content');
  assert.equal(existing.events.filter(entry => Array.isArray(entry) && entry[0] === 'input').length, 1);
}

const whitespace = makePage('  ');
whitespace.buttons[0].click();
assert.equal(whitespace.field.value, prompts.write);

const secondChoice = makePage();
secondChoice.buttons[0].click();
secondChoice.buttons[1].click();
assert.equal(secondChoice.field.value, prompts.write, 'switching a choice must not destroy a draft');

console.log('PASS Sparkle simple home: four choices, three guided prompts, accessible focus, preserves drafts, video preview only');
