// Regression coverage for the actual Sparkle microphone functions.
// Fake SpeechRecognition simulates Safari's silent automatic restart and
// real audio event confirmations. No messages are logged or sent to a server.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { turnSilenceMs } from "../../what-do-i-say/voice-beta/turn-detection.mjs";

const source = readFileSync("what-do-i-say/voice-beta/lab.js", "utf8");
const begin = source.indexOf("function joinSpeech(...parts)");
const end = source.indexOf('ui.stop.addEventListener("click", cancel);', begin);
assert(begin > 0 && end > begin, "Need actual microphone functions, not a copied implementation");
const engine = source.slice(begin, end);
assert(source.includes("startListening({ automatic: true })"), "Playback completion must request monitored auto resume");
assert(source.includes("await state.player.waitForCompletion()"), "Do not restart until speech playback completes");
assert(source.includes("playedReply && state.handsFree && !state.cancelled"), "Only completed replies may reopen the mic");
assert(source.includes("MIC_START_TIMEOUT_MS = 6500"), "Make silent iOS restart observable");
assert(!/console\.(?:log|debug)\([\s\S]*?state\.transcript/.test(engine), "Never log captured message contents");

function createFixture() {
  let now = 10000, serial = 0;
  const timers = new Map(), messages = [], phases = [], requests = [];
  const handlers = {};
  class FakeSpeechRecognition {
    static instances = [];
    constructor() { FakeSpeechRecognition.instances.push(this); this.started = false; this.aborted = false; }
    start() { this.started = true; this.onstart?.(); }
    stop() { this.onend?.(); }
    abort() { this.aborted = true; }
  }
  const state = {
    phase: "idle", busy: false, listening: false, recognition: null,
    transcript: "", partial: "", resumeDraft: false, finishRequested: false,
    restartTimer: null, finishTimer: null, autoTimer: null,
    handsFree: true, followUpTimer: null,
    micStartTimer: null, awaitingMicStart: false,
    pendingInterim: false, lastSpeechActivity: 0, restartFailures: 0,
    cancelled: false, history: [{ role: "assistant", content: "previous response" }]
  };
  const ui = {
    talk: { addEventListener(type, cb) { handlers[type] = cb; } },
    typeForm: { hidden: true }, typed: { focus() {} },
    error: { hidden: true, textContent: "" }
  };
  const delay = (fn, ms) => {
    const id = ++serial; timers.set(id, { time: now + ms, callback: fn }); return id;
  };
  const clear = id => timers.delete(id);
  const DateMock = { now: () => now };
  let returned = new Function(
    "state", "ui", "SpeechRecognition", "turnSilenceMs",
    "ensurePlayback", "report", "phase", "say", "showTurn", "processTurn",
    "setTimeout", "clearTimeout", "Date",
    engine + "\nreturn { startListening, startSpeechSegment, failAutoMicRestart, clearMicStartWatchdog, pauseSpeech };"
  )(state, ui, FakeSpeechRecognition, turnSilenceMs,
    () => Promise.resolve(),
    err => { throw err; },
    (name, title) => { state.phase = name; phases.push({ name, title }); },
    msg => messages.push(msg),
    () => {},
    msg => requests.push(msg),
    delay, clear, DateMock
  );
  function advance(ms) {
    const target = now + ms;
    for (let n = 0; n < 1000; n++) {
      const entry = [...timers].sort((a, b) => a[1].time - b[1].time)[0];
      if (!entry || entry[1].time > target) { now = target; return; }
      now = entry[1].time;
      timers.delete(entry[0]);
      entry[1].callback();
    }
    throw Error("timer loop");
  }
  return { ...returned, state, ui, timers, requests, messages, phases, handlers, advance, FakeSpeechRecognition };
}
function output(t, words) {
  t.state.recognition.onresult({ results: [{ 0: { transcript: words }, isFinal: true }] });
}

// iOS may fire onstart without actually supplying audio. It must not be
// incorrectly treated as confirmed listening: report failure after 6.5s.
{
  const t = createFixture();
  t.startListening({ automatic: true });
  const stuck = t.FakeSpeechRecognition.instances[0];
  assert.equal(stuck.started, true);
  assert.equal(t.state.awaitingMicStart, true, "onstart alone is not mic audio");
  t.advance(6499);
  assert.equal(t.state.listening, true);
  t.advance(1);
  assert.equal(t.state.listening, false);
  assert.equal(t.state.awaitingMicStart, false);
  assert.equal(t.ui.error.hidden, false);
  assert.match(t.ui.error.textContent, /Tap the microphone once/);
  assert.equal(t.state.phase, "idle", "Never display fake listening state");
  assert.equal(t.state.handsFree, false, "Prevent unconfirmed automatic retry");
  assert.equal(stuck.aborted, true);
  assert.equal(t.timers.size, 0);
  assert.equal(t.state.history.length, 1, "Preserve conversation history");
  t.handlers.click();
  assert.equal(t.state.listening, true);
  assert.equal(t.FakeSpeechRecognition.instances.length, 2);
  output(t, "The manual gesture restored my microphone.");
  t.handlers.click();
  assert.deepEqual(t.requests, ["The manual gesture restored my microphone."]);
}

// Audio capture is affirmative; 6.5-second watchdog must be cancelled,
// and genuine speech should be sent once.
{
  const t = createFixture();
  t.startListening({ automatic: true });
  const s = t.FakeSpeechRecognition.instances[0];
  s.onaudiostart();
  assert.equal(t.state.awaitingMicStart, false);
  t.advance(11000);
  assert.equal(t.state.listening, true);
  assert.equal(t.ui.error.hidden, true);
  output(t, "This is turn one.");
  t.advance(turnSilenceMs("This is turn one."));
  assert.deepEqual(t.requests, ["This is turn one."]);
  t.startListening({ automatic: true });
  const second = t.FakeSpeechRecognition.instances[1];
  second.onaudiostart();
  output(t, "This is turn two.");
  t.advance(turnSilenceMs("This is turn two."));
  assert.deepEqual(t.requests, ["This is turn one.", "This is turn two."]);
  assert.equal(t.state.history.length, 1);
}

// Safari sometimes supplies speech events without onaudiostart.
for (const eventName of ["onsoundstart", "onspeechstart"]) {
  const t = createFixture();
  t.startListening({ automatic: true });
  t.FakeSpeechRecognition.instances[0][eventName]();
  assert.equal(t.state.awaitingMicStart, false, eventName + " should confirm");
  t.advance(7000);
  assert.equal(t.state.listening, true);
}
{
  const t = createFixture();
  t.startListening({ automatic: true });
  output(t, "An audio result also proves listening was working.");
  assert.equal(t.state.awaitingMicStart, false);
  t.advance(6500);
  assert.equal(t.state.listening, true);
}

// If WebKit dispatches an error or ends the session before audio started,
// prevent silent retry loops. The user can tap to recover.
for (const kind of ["error", "end"]) {
  const t = createFixture();
  t.startListening({ automatic: true });
  const speech = t.FakeSpeechRecognition.instances[0];
  if (kind === "error") speech.onerror({ error: "network" });
  else speech.onend();
  assert.equal(t.state.listening, false);
  assert.equal(t.state.awaitingMicStart, false);
  assert.equal(t.timers.size, 0);
  t.handlers.click();
  assert.equal(t.FakeSpeechRecognition.instances.length, 2);
  assert.equal(t.state.listening, true);
}

// Manual tapping during a hung automatic resume should immediately replace
// the dead recognition session, not stop it or lose captured words.
{
  const t = createFixture();
  t.startListening({ automatic: true });
  const hung = t.FakeSpeechRecognition.instances[0];
  t.state.transcript = "Please keep";
  t.state.partial = "these words";
  t.handlers.click();
  assert.equal(hung.aborted, true);
  assert.equal(t.state.recognition, t.FakeSpeechRecognition.instances[1]);
  assert.equal(t.state.awaitingMicStart, false);
  assert.equal(t.state.transcript, "Please keep these words");
  assert.equal(t.state.listening, true);
  assert.equal(t.timers.size, 0);
}

// Starting from a physical tap should not impose an unnecessary watchdog.
{
  const t = createFixture();
  t.handlers.click();
  assert.equal(t.state.awaitingMicStart, false);
  t.advance(10000);
  assert.equal(t.state.listening, true);
}

console.log("PASS: iPhone silent auto-mic failure, audio confirmation, two consecutive turns, timeout, onend, onerror, and one-tap recovery");
