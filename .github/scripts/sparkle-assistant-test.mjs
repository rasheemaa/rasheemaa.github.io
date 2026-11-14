import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function browserModule(path, globals = {}) {
  const window = { ...globals.window };
  const sandbox = { window, ...globals };
  delete sandbox.window;
  vm.runInNewContext(readFileSync(path, 'utf8'), { window, ...sandbox }, { filename: path });
  return window;
}

test('downloadable website is real responsive HTML, with all model text escaped', () => {
  const window = browserModule('what-do-i-say/site-draft.js');
  const html = window.SparkleSiteDraft.render({
    siteName: '<script>alert("X")</script>',
    headline: '<img src=x onerror=alert(1)>',
    subheading: 'A small grooming business',
    theme: 'ocean',
    ctaLabel: 'Our services',
    sections: [
      { heading: 'Baths', body: '<iframe src="https://malicious.example"></iframe>' },
      { heading: 'Trims', body: 'Gentle trims.' }
    ]
  });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /@media\(max-width:650px\)/);
  assert.match(html, /href="#details"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;iframe/);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<iframe src='));
  assert.ok(!html.includes('onerror=alert(1)>'));
});

test('assistant client sends follow up context to the separate endpoint', async () => {
  const calls = [];
  const window = browserModule('what-do-i-say/assistant-client.js', {
    window: { WDIS_API_BASE: 'https://worker.example' },
    AbortController,
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), options });
      return {
        ok: true,
        json: async () => ({ type: 'chat', message: 'I can help with that.' })
      };
    }
  });
  const result = await window.SparkleAssistant.ask(
    'Make it blue',
    [{ role: 'user', content: 'Build a website.' }],
    'website',
    () => {},
    { siteName: 'My portfolio' }
  );
  assert.equal(result.message, 'I can help with that.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://worker.example/api/assistant');
  assert.equal(calls[0].body.task, 'website');
  assert.equal(calls[0].body.existingWebsite.siteName, 'My portfolio');
  assert.equal(calls[0].body.history[0].content, 'Build a website.');
});

test('main page actually includes assistant modules, a single composer and a sandbox policy', () => {
  const html = readFileSync('what-do-i-say/index.html', 'utf8');
  const chat = readFileSync('what-do-i-say/chat-app.js', 'utf8');
  assert.match(html, /assistant-client\.js\?v=1/);
  assert.match(html, /site-draft\.js\?v=1/);
  assert.match(html, /frame-src 'self'/);
  assert.match(html, /id="message-form"/);
  assert.match(chat, /window\.SparkleAssistant\.ask/);
  assert.match(chat, /window\.SparkleSiteDraft\.show/);
  assert.match(chat, /S\.assistantHistory/);
});
