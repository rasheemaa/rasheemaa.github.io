import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { turnSilenceMs } from '../../what-do-i-say/voice-beta/turn-detection.mjs';

assert.equal(turnSilenceMs(''), null);
assert(turnSilenceMs('I need to explain,') > turnSilenceMs('That is my question?'));
assert(turnSilenceMs('I was') > turnSilenceMs('I finished my explanation.'));
assert(turnSilenceMs('um') >= 9000);

const source = readFileSync('what-do-i-say/voice-beta/lab.js', 'utf8');
const start = source.indexOf('async function cancel() {');
const end = source.indexOf('ui.stop.addEventListener("click", cancel);', start);
assert(start > 0 && end > start, 'Voice capture engine must be testable');
const engine = source.slice(start, end);

function fixture() {
  let now = 1000;
  let nextId = 0;
  const timers = new Map();
  const responses = [];
  const handlers = {};
  const state = {
    listening: false, recognition: null, transcript: '', partial: '',
    resumeDraft: false, finishRequested: false, restartTimer: null,
    finishTimer: null, autoTimer: null, pendingInterim: false,
    lastSpeechActivity: 0, restartFailures: 0, busy: false, cancelled: false
  };
  const ui = {
    talk: { addEventListener(event, fn) { handlers[event] = fn; } },
    typeForm: { hidden: true },
    typed: { focus() {} },
    error: { hidden: true, textContent: '' }
  };
  class SpeechRecognition {
    static instances = [];
    constructor() { SpeechRecognition.instances.push(this); }
    start() {}
    stop() { this.onend?.(); }
    abort() {}
  }
  const timeout = (fn, ms) => {
    const id = ++nextId;
    timers.set(id, { at: now + ms, fn });
    return id;
  };
  const clear = id => timers.delete(id);
  const clock = { now: () => now };
  const compiled = new Function(
    'state', 'ui', 'SpeechRecognition', 'turnSilenceMs', 'ensurePlayback',
    'report', 'phase', 'say', 'showTurn', 'processTurn', 'setTimeout',
    'clearTimeout', 'Date', engine
  );
  compiled(state, ui, SpeechRecognition, turnSilenceMs, () => {}, e => {
    throw e;
  }, () => {}, () => {}, () => {}, words => responses.push(words), timeout, clear, clock);

  const speak = (recognizer, words, final = true) => {
    recognizer.onresult({ results: [{ 0: { transcript: words }, isFinal: final }] });
  };
  const advance = ms => {
    const target = now + ms;
    for (let i = 0; i < 1000; i++) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) { now = target; return; }
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    throw new Error('Unexpected speech recognition restart loop');
  };
  return { state, responses, handlers, SpeechRecognition, advance, speak, timers };
}

// Question after true silence: no tap required, no repeated response.
{
  const t = fixture();
  t.handlers.click();
  const recognizer = t.SpeechRecognition.instances[0];
  t.speak(recognizer, 'Can you help me?');
  t.advance(turnSilenceMs('Can you help me?') - 1);
  assert.deepEqual(t.responses, [], 'Should wait the full grace period');
  t.advance(1);
  assert.deepEqual(t.responses, ['Can you help me?'], 'Settled speech should auto-send once');
  t.advance(15000);
  assert.equal(t.responses.length, 1, 'No duplicate auto-send');
}

// An unfinished thought can pause without being cut off, even over a provider restart.
{
  const t = fixture();
  t.handlers.click();
  const first = t.SpeechRecognition.instances[0];
  t.speak(first, 'So I was');
  first.onend();
  t.advance(6000);
  assert.equal(t.responses.length, 0, 'Hesitation is not a finished turn');
  const resumed = t.SpeechRecognition.instances.at(-1);
  resumed.onspeechstart?.();
  t.speak(resumed, 'thinking about what you said.');
  t.advance(turnSilenceMs('So I was thinking about what you said.'));
  assert.deepEqual(t.responses, ['So I was thinking about what you said.']);
}

// Browser's onend itself must never submit. Empty restarts must not
// continually reset the waiting period or trap the user in listening forever.
{
  const t = fixture();
  t.handlers.click();
  const first = t.SpeechRecognition.instances[0];
  t.speak(first, 'I am finished.');
  first.onend();
  assert.deepEqual(t.responses, []);
  t.advance(250);
  const next = t.SpeechRecognition.instances[1];
  next.onend();
  assert.deepEqual(t.responses, []);
  t.advance(turnSilenceMs('I am finished.') - 250);
  assert.deepEqual(t.responses, ['I am finished.']);
}

// Interim words must not send before recognition finalizes them.
{
  const t = fixture();
  t.handlers.click();
  const first = t.SpeechRecognition.instances[0];
  t.speak(first, 'What I want to say', false);
  t.advance(30000);
  assert.deepEqual(t.responses, [], 'Unfinalized speech must not auto-submit');
  t.speak(first, 'What I want to say is thank you.');
  t.advance(turnSilenceMs('What I want to say is thank you.'));
  assert.deepEqual(t.responses, ['What I want to say is thank you.']);
}

// User can still tap to finish immediately without waiting.
{
  const t = fixture();
  t.handlers.click();
  t.speak(t.SpeechRecognition.instances[0], 'I am done.');
  t.handlers.click();
  assert.deepEqual(t.responses, ['I am done.']);
  assert.equal(t.timers.size, 0, 'No stray send timers after manual finish');
}

// A microphone permission failure keeps the entire draft for continuing.
{
  const t = fixture();
  t.handlers.click();
  const first = t.SpeechRecognition.instances[0];
  t.speak(first, 'Keep everything I said');
  first.onerror({ error: 'not-allowed' });
  first.onend();
  t.advance(20000);
  assert.deepEqual(t.responses, []);
  assert.equal(t.state.transcript, 'Keep everything I said');
  t.handlers.click();
  const second = t.SpeechRecognition.instances.at(-1);
  t.speak(second, 'and these additional words.');
  t.handlers.click();
  assert.deepEqual(t.responses, ['Keep everything I said and these additional words.']);
}

// Silence before any transcript must never start an empty API request.
{
  const t = fixture();
  t.handlers.click();
  t.SpeechRecognition.instances[0].onend();
  t.advance(30000);
  assert.deepEqual(t.responses, []);
}

console.log('PASS: auto turn detection, pauses, browser restarts, partials, manual finish and safe recovery');
