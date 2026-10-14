/**
 * Sparkle Voice Beta: one-screen, turn-by-turn voice conversation.
 * Speech recognition may use a device/browser provider; recognized TEXT is
 * sent to the existing Cloudflare backend. Reference voice/audio remains
 * local, optionally saved in IndexedDB after the user picks the file.
 */
import { PocketTTS, StreamingPlayer, chunksToWavBlob } from "./pocket-tts/index.js?v=4";
import { prepareVoiceReference } from "./reference-prep.mjs";
import { turnSilenceMs } from "./turn-detection.mjs";

const $ = id => document.getElementById(id);
const ui = {
  app: $("voice-app"), talk: $("talk"), stop: $("stop"), replay: $("replay"),
  endConversation: $("end-conversation"),
  title: $("phase-title"), subtitle: $("phase-subtitle"), status: $("status"),
  error: $("error"), transcript: $("transcript"), heard: $("heard"), reply: $("reply"),
  settings: $("settings"), settingsButton: $("settings-button"),
  voiceFile: $("voice-file"), voiceState: $("voice-state"), forget: $("forget"),
  typeToggle: $("type-toggle"), typeForm: $("type-form"), typed: $("typed-message"),
  progress: $("progress"), audio: $("audio"), download: $("download")
};

const DB_NAME = "sparkle-voice-device-v1";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const MAX_VOICE_MESSAGE_CHARS = 6000;
const state = {
  phase: "idle", busy: false, listening: false, recognition: null,
  transcript: "", partial: "", resumeDraft: false, finishRequested: false,
  restartTimer: null, finishTimer: null, autoTimer: null,
  handsFree: false, followUpTimer: null,
  micStartTimer: null, awaitingMicStart: false,
  pendingInterim: false, lastSpeechActivity: 0, restartFailures: 0,
  lastHeard: "", history: [], request: null,
  tts: null, player: null, playback: null, voice: null,
  voiceFile: null, voiceKey: "", url: null, cancelled: false
};

function say(text) { ui.status.textContent = text; }
function phase(name, title, subtitle) {
  state.phase = name;
  ui.app.dataset.phase = name;
  ui.title.textContent = title;
  ui.subtitle.textContent = subtitle;
  ui.stop.hidden = name !== "thinking" && name !== "speaking";
  ui.talk.hidden = name === "thinking" || name === "speaking";
  ui.endConversation.hidden = !state.handsFree;
  ui.talk.setAttribute("aria-label", name === "listening" ? "Finish speaking and send to Sparkle" : state.resumeDraft ? "Continue speaking" : "Talk to Sparkle");
  ui.talk.setAttribute("aria-pressed", String(name === "listening"));
  ui.typeToggle.disabled = name === "thinking" || name === "speaking" || name === "listening";
}
function report(e) {
  ui.error.textContent = e?.message || String(e);
  ui.error.hidden = false;
  phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
  say("You can try again or type instead.");
}
function clearResult() {
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = null;
  ui.audio.pause(); ui.audio.removeAttribute("src");
  ui.replay.disabled = true;
  ui.download.removeAttribute("href");
  ui.download.hidden = true;
}
function voiceKey(file) { return file ? String(file.name || "sparkle") + ":" + file.size + ":" + (file.lastModified || 0) : ""; }
function showVoiceState() {
  ui.voiceState.textContent = "✓ Sparkle’s approved voice is set for everyone.";
  ui.forget.hidden = true;
}
function openSettings() {
  if (!ui.settings.open) ui.settings.showModal();
}
function dbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("Local storage unavailable.")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("samples")) req.result.createObjectStore("samples");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Local storage failed."));
  });
}
async function fromStore() {
  const db = await dbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("samples", "readonly");
      const req = tx.objectStore("samples").get("approved");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
async function saveToStore(record) {
  const db = await dbOpen();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("samples", "readwrite");
      tx.objectStore("samples").put(record, "approved");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function forgetStore() {
  const db = await dbOpen();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("samples", "readwrite");
      tx.objectStore("samples").delete("approved");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function restoreSample() {
  try {
    const sample = await fromStore();
    if (sample?.blob instanceof Blob) {
      state.voiceFile = sample.blob;
      state.voiceFile.name = sample.name || "sparkle.mp3";
      state.voiceFile.lastModified = sample.lastModified || 0;
    }
  } catch {
    // Storage may be unavailable in private browsing; use in-memory sample.
  }
  showVoiceState();
}
ui.settingsButton.addEventListener("click", openSettings);
ui.voiceFile.addEventListener("change", async () => {
  const file = ui.voiceFile.files?.[0];
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) {
    ui.voiceState.textContent = "Please select a recording smaller than 30 MB.";
    return;
  }
  state.voiceFile = file;
  state.voice = null;
  state.voiceKey = "";
  try {
    await saveToStore({ blob: file.slice(0, file.size, file.type), name: file.name, lastModified: file.lastModified });
    ui.voiceState.textContent = "✓ Saved privately in this browser.";
  } catch {
    ui.voiceState.textContent = "✓ Voice loaded for this session. Your browser couldn't save it for later.";
  }
  showVoiceState();
  ui.settings.close();
  ui.error.hidden = true;
  say("Voice ready. Tap the microphone to talk.");
});
ui.forget.addEventListener("click", async () => {
  await cancel();
  state.voiceFile = null; state.voice = null; state.voiceKey = "";
  ui.voiceFile.value = "";
  try { await forgetStore(); } catch {}
  clearResult();
  showVoiceState();
  say("Saved voice cleared from this browser.");
});

const DEFAULT_SAMPLE_URL = "/what-do-i-say/voice-beta/Sparkle_reference.wav";
let defaultVoicePending = null;

async function loadDefaultVoice() {
  if (state.voiceFile?.name === "Sparkle_reference.wav") return state.voiceFile;
  if (defaultVoicePending) return defaultVoicePending;
  defaultVoicePending = (async () => {
    // Same-origin source: no OneDrive, Cloudflare audio proxy or file-picker required.
    const response = await fetch(DEFAULT_SAMPLE_URL, {
      method: "GET", mode: "same-origin", credentials: "same-origin", cache: "no-store"
    });
    if (!response.ok) throw new Error("Sparkle's original voice reference is temporarily unavailable. Try again shortly.");
    const blob = await response.blob();
    if (blob.size !== 891016) throw new Error("Sparkle's original recording was not delivered correctly.");
    const bytes = await blob.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      value => value.toString(16).padStart(2, "0")).join("");
    if (digest !== "b59e9c4d70864fcd0cb0b4e9c5f4a25b4854464e53104b7a6a5449d24a54ea20") {
      throw new Error("Sparkle's updated voice recording could not be verified. Please reload and try again.");
    }
    const header = new Uint8Array(bytes, 0, 12);
    if (String.fromCharCode(...header.slice(0, 4)) !== "RIFF" ||
        String.fromCharCode(...header.slice(8, 12)) !== "WAVE") {
      throw new Error("Sparkle's original voice reference is not a valid WAV.");
    }
    const file = new File([blob], "Sparkle_reference.wav", { type: "audio/wav" });
    state.voiceFile = file;
    state.voice = null;
    state.voiceKey = "";
    showVoiceState();
    return file;
  })();
  try { return await defaultVoicePending; }
  catch (error) { defaultVoicePending = null; throw error; }
}

function ensurePlayback() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("Your browser doesn't support the required audio features.");
  if (!state.playback) state.playback = new AC();
  // Called directly within user actions when possible to unlock iOS playback.
  return state.playback.resume();
}
function showTurn(heard, response) {
  ui.transcript.hidden = false;
  ui.heard.textContent = heard;
  ui.reply.textContent = response || "";
  ui.reply.hidden = !response;
}
async function clone(file) {
  if (!(file instanceof Blob) || file.size > 30 * 1024 * 1024) throw new Error("Choose a voice sample smaller than 30 MB.");
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration < 3 || decoded.duration > 40) throw new Error("The sample needs to be 3–40 seconds long.");
    const mono = new Float32Array(decoded.length);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const samples = decoded.getChannelData(ch);
      for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / decoded.numberOfChannels;
    }
    let prepared = prepareVoiceReference(mono, decoded.sampleRate);
    let preparedRate = decoded.sampleRate;
    // Resample the voice reference with the browser's band-limited audio engine.
    // The TTS adapter's linear downsampler can alias 48 kHz sibilance into the
    // 24 kHz voice embedding, producing unwanted harshness before synthesis.
    // This changes only the reference preparation, never Sparkle's actual MP3.
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (preparedRate !== state.tts.sampleRate && OfflineCtx) {
      const outputRate = state.tts.sampleRate;
      const offline = new OfflineCtx(1, Math.ceil(prepared.length * outputRate / preparedRate), outputRate);
      const sourceBuffer = offline.createBuffer(1, prepared.length, preparedRate);
      sourceBuffer.copyToChannel(prepared, 0);
      const source = offline.createBufferSource();
      source.buffer = sourceBuffer;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      prepared = rendered.getChannelData(0).slice();
      preparedRate = outputRate;
    }
    return state.tts.cloneVoice(prepared, { inputSampleRate: preparedRate, name: "sparkle-voice-local" });
  } finally { await ctx.close(); }
}
async function ensureVoice() {
  await loadDefaultVoice();
  if (!window.Worker || !window.WebAssembly) throw new Error("This browser can't run local voice generation.");
  if (!state.tts) {
    say("Downloading Sparkle's free voice model. The first load can be large…");
    state.tts = new PocketTTS({ language: "english_2026-04", quantized: true, fullPrecisionAudio: true, voiceCloning: true });
    try {
      await state.tts.load(info => {
        if (info.type === "progress" && info.total) {
          ui.progress.hidden = false;
          ui.progress.value = Math.min(100, Math.max(0, Math.round(info.loaded / info.total * 100)));
          say("Preparing Sparkle's voice: " + (info.label || "model") + " " + ui.progress.value + "%");
        }
      });
      state.player = new StreamingPlayer({ sampleRate: state.tts.sampleRate, audioContext: state.playback });
    } catch (e) {
      state.tts.destroy(); state.tts = null;
      throw e;
    } finally { ui.progress.hidden = true; }
  }
  const key = voiceKey(state.voiceFile);
  if (!state.voice || key !== state.voiceKey) {
    say("Learning the sound of Sparkle's voice on this device…");
    state.voice = await clone(state.voiceFile);
    state.voiceKey = key;
  }
}
async function speak(text) {
  // Buffer native PCM before playback to avoid live inference underruns on
  // slower devices. This preserves the model's raw output and exact pacing.
  phase("thinking", "Preparing Sparkle's voice", "Making sure her reply plays smoothly.");
  await ensureVoice();
  if (state.cancelled) return;
  state.player.reset();
  const chunks = [];
  const chunkMeta = [];
  say("Preparing a continuous voice reply…");
  await state.tts.generate(text, {
    voice: state.voice,
    onChunk: (samples, meta) => {
      if (state.cancelled) return;
      chunks.push(samples.slice());
      chunkMeta.push(meta);
    }
  });
  if (state.cancelled) return;
  if (!chunks.length) throw new Error("Sparkle couldn't produce voice audio on this device.");

  clearResult();
  state.url = URL.createObjectURL(chunksToWavBlob(chunks, state.tts.sampleRate));
  ui.audio.src = state.url;
  ui.download.href = state.url;
  ui.download.hidden = false;
  ui.replay.disabled = false;
  phase("speaking", "Sparkle is speaking", "Listen to her answer.");
  // All chunks are already available, so schedule them together with no gap
  // caused by on-device inference falling behind real-time playback.
  for (let i = 0; i < chunks.length; i++) {
    if (state.cancelled) return;
    const samples = chunks[i];
    const meta = chunkMeta[i];
    state.player.play(samples, meta);
  }
  state.player.flush();
  await state.player.waitForCompletion();
  if (state.cancelled) return;
  say(state.handsFree ? "Sparkle has finished. The microphone will reopen next." : "Tap to speak again, or replay her last answer.");
}
async function processTurn(text) {
  text = String(text || "").trim();
  if (!text || state.busy) return;
  // Show a recoverable full draft rather than silently truncating the message.
  if (text.length > MAX_VOICE_MESSAGE_CHARS) {
    state.transcript = text;
    state.resumeDraft = true;
    ui.typed.value = text;
    ui.typeForm.hidden = false;
    ui.error.textContent = "Your full transcript is saved below, but it's too long to send in one message. Please divide it into parts. Nothing was cut off or sent.";
    ui.error.hidden = false;
    phase("idle", "Your words are saved", "Edit your transcript below.");
    say("Nothing was sent. Your whole message is still here.");
    return;
  }
  state.cancelled = false;
  state.busy = true;
  state.lastHeard = text;
  ui.error.hidden = true;
  showTurn(text, "");
  phase("thinking", "Sparkle is thinking", "One moment…");
  say("Understanding what you said…");
  let playedReply = false;
  const oldHistory = state.history.slice(-4).map(turn => ({
    role: turn.role, content: String(turn.content || "").slice(0, 850)
  }));
  try {
    state.request = new AbortController();
    const base = String(window.WDIS_API_BASE || "").replace(/\/$/, "");
    if (!base) throw new Error("Sparkle's conversation service isn't configured.");
    const response = await fetch(base + "/api/voice-conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: state.request.signal,
      body: JSON.stringify({ text, history: oldHistory })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "Sparkle couldn't respond. Try again.");
    const reply = String(data?.message || "").trim();
    if (!reply) throw new Error("Sparkle returned an empty answer.");
    if (state.cancelled) return;
    state.history = [...state.history, { role: "user", content: text }, { role: "assistant", content: reply }].slice(-8);
    showTurn(text, reply);
    await speak(reply);
    playedReply = !state.cancelled;
  } catch (e) {
    if (!state.cancelled && e?.name !== "AbortError") {
      state.transcript = text;
      state.resumeDraft = true;
      ui.typed.value = text;
      report(e);
    }
  } finally {
    state.request = null;
    state.busy = false;
    ui.progress.hidden = true;
    if (!state.cancelled && state.phase !== "idle") phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
    if (playedReply && state.handsFree && !state.cancelled) {
      clearTimeout(state.followUpTimer);
      state.followUpTimer = setTimeout(() => {
        state.followUpTimer = null;
        if (state.handsFree && !state.busy && !state.listening && !document.hidden) startListening({ automatic: true });
      }, 650);
    }
  }
}
async function cancel() {
  state.cancelled = true;
  state.handsFree = false;
  clearMicStartWatchdog();
  state.awaitingMicStart = false;
  clearTimeout(state.followUpTimer);
  state.followUpTimer = null;
  state.request?.abort();
  clearTimeout(state.restartTimer);
  clearTimeout(state.finishTimer);
  clearTimeout(state.autoTimer);
  state.restartTimer = null;
  state.finishTimer = null;
  state.autoTimer = null;
  state.finishRequested = false;
  if (state.recognition) { try { state.recognition.abort(); } catch {} }
  state.recognition = null;
  state.listening = false;
  state.partial = "";
  state.transcript = "";
  state.resumeDraft = false;
  if (state.tts && state.busy) { try { await state.tts.stop(); } catch {} }
  state.player?.stop();
  state.busy = false;
  phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
  say("Stopped. Tap the microphone whenever you're ready.");
}

function joinSpeech(...parts) {
  return parts.map(part => String(part || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function showSpeechDraft() {
  const words = joinSpeech(state.transcript, state.partial);
  if (words) showTurn(words, "");
}
function clearAutoTurn() {
  clearTimeout(state.autoTimer);
  state.autoTimer = null;
}
// Safari may accept SpeechRecognition.start() without ever opening audio.
// Only an audio/speech/result event confirms the microphone is usable.
const MIC_START_TIMEOUT_MS = 6500;
function clearMicStartWatchdog() {
  clearTimeout(state.micStartTimer);
  state.micStartTimer = null;
}
function confirmMicStarted(speech) {
  if (!state.awaitingMicStart || state.recognition !== speech || !state.listening) return;
  state.awaitingMicStart = false;
  clearMicStartWatchdog();
  say("Listening… Take your time.");
}
function failAutoMicRestart(speech) {
  if (!state.awaitingMicStart || state.recognition !== speech) return;
  clearMicStartWatchdog();
  state.awaitingMicStart = false;
  state.recognition = null;
  state.transcript = joinSpeech(state.transcript, state.partial);
  state.partial = "";
  state.pendingInterim = false;
  state.handsFree = false;
  // Avoid a browser onend event re-triggering an automatic retry loop.
  try { speech.abort(); } catch {}
  pauseSpeech("Microphone didn't reconnect. Tap the microphone to continue. Your conversation is saved.");
  ui.error.textContent = "Automatic microphone restart failed. Tap the microphone once to continue speaking.";
  ui.error.hidden = false;
}
function noteSpeechActivity() {
  state.lastSpeechActivity = Date.now();
  clearAutoTurn();
}
function scheduleAutoTurn() {
  clearAutoTurn();
  if (!state.listening || state.finishRequested || state.busy || state.pendingInterim) return;
  const words = joinSpeech(state.transcript, state.partial);
  const delay = turnSilenceMs(words);
  if (delay == null) return;
  const activity = state.lastSpeechActivity;
  state.autoTimer = setTimeout(() => {
    state.autoTimer = null;
    if (!state.listening || state.finishRequested || state.pendingInterim || state.busy || activity !== state.lastSpeechActivity) return;
    say("Sparkle is responding…");
    finishListening();
  }, delay);
  say("Keep talking if you need to. Sparkle will respond when you're done.");
}
function pauseSpeech(message) {
  clearMicStartWatchdog();
  state.awaitingMicStart = false;
  clearAutoTurn();
  clearTimeout(state.restartTimer);
  state.restartTimer = null;
  state.listening = false;
  state.finishRequested = false;
  state.resumeDraft = Boolean(state.transcript);
  phase("idle", "Listening paused", "Your words are still here.");
  say(message || "Nothing sent. Tap the microphone to continue, or type instead.");
  showSpeechDraft();
}
function completeSpeechTurn() {
  if (!state.finishRequested) return;
  clearAutoTurn();
  clearTimeout(state.finishTimer);
  state.finishTimer = null;
  state.finishRequested = false;
  const words = state.transcript.trim();
  state.transcript = "";
  state.partial = "";
  state.resumeDraft = false;
  phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
  if (words) void processTurn(words);
  else say("I didn't catch that. Tap the microphone to try again.");
}
function startSpeechSegment() {
  if (!state.listening || state.finishRequested) return;
  const speech = new SpeechRecognition();
  speech.lang = "en-US";
  speech.continuous = true;
  speech.interimResults = true;
  speech.maxAlternatives = 1;
  state.recognition = speech;
  // onstart alone confirms the service, not live microphone audio on iOS.
  speech.onstart = () => {
    if (state.recognition === speech && state.awaitingMicStart) say("Reconnecting microphone audio…");
  };
  speech.onaudiostart = () => confirmMicStarted(speech);
  speech.onsoundstart = () => confirmMicStarted(speech);
  // Event support varies across browsers; finalized results provide a fallback.
  speech.onspeechstart = () => {
    confirmMicStarted(speech);
    if (state.recognition !== speech || !state.listening) return;
    state.pendingInterim = true;
    noteSpeechActivity();
    say("Listening… take your time.");
  };
  speech.onspeechend = () => {
    if (state.recognition !== speech || !state.listening) return;
    if (!state.pendingInterim) scheduleAutoTurn();
  };
  state.partial = "";
  speech.onresult = event => {
    if (state.recognition !== speech) return;
    const finals = [], interims = [];
    // Browsers repeat previous results, so rebuild each segment without duplicates.
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const words = result?.[0]?.transcript || "";
      if (result?.isFinal) finals.push(words);
      else interims.push(words);
    }
    state.partial = joinSpeech(finals.join(" "), interims.join(" "));
    state.pendingInterim = interims.length > 0;
    if (state.partial) {
      confirmMicStarted(speech);
      state.restartFailures = 0;
      noteSpeechActivity();
    }
    showSpeechDraft();
    if (finals.length && !state.pendingInterim && state.listening) scheduleAutoTurn();
  };
  speech.onerror = event => {
    if (state.recognition !== speech || state.cancelled) return;
    const error = event.error || "unknown";
    if (state.awaitingMicStart && error !== "aborted") {
      failAutoMicRestart(speech);
      return;
    }
    if (["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(error)) {
      state.listening = false;
      ui.error.textContent = "Microphone access stopped. Your captured words are saved. Tap to try again or type instead.";
      ui.error.hidden = false;
    } else if (error !== "no-speech" && error !== "aborted") {
      state.restartFailures++;
      ui.error.textContent = "Speech recognition had a connection problem. Your words have been saved.";
      ui.error.hidden = false;
    }
  };
  speech.onend = () => {
    if (state.recognition !== speech) return;
    if (state.awaitingMicStart) {
      failAutoMicRestart(speech);
      return;
    }
    state.recognition = null;
    const segmentWords = state.partial;
    state.transcript = joinSpeech(state.transcript, segmentWords);
    state.partial = "";
    state.pendingInterim = false;
    if (state.finishRequested) { completeSpeechTurn(); return; }
    if (!state.listening || state.restartFailures >= 4) {
      pauseSpeech("Microphone paused. Nothing was sent. Tap the microphone to continue or type instead.");
      return;
    }
    // Browser onend can be a hard time limit or a pause; do not send yet.
    if (state.transcript && segmentWords) {
      // A new segment resets the grace. An empty browser restart does not.
      noteSpeechActivity();
      scheduleAutoTurn();
    } else if (state.transcript && !state.autoTimer) {
      scheduleAutoTurn();
    } else if (!state.transcript) say("Still listening… Take your time.");
    state.restartTimer = setTimeout(() => {
      state.restartTimer = null;
      startSpeechSegment();
    }, state.restartFailures ? 850 : 250);
  };
  try {
    speech.start();
    if (state.awaitingMicStart && state.recognition === speech) {
      clearMicStartWatchdog();
      state.micStartTimer = setTimeout(() => failAutoMicRestart(speech), MIC_START_TIMEOUT_MS);
    }
  }
  catch {
    if (state.recognition !== speech) return;
    state.recognition = null;
    state.transcript = joinSpeech(state.transcript, state.partial);
    state.partial = "";
    ui.error.textContent = "Your browser couldn't restart the microphone. Your words are saved.";
    ui.error.hidden = false;
    pauseSpeech("Nothing sent. Tap the microphone to continue or type instead.");
  }
}
function finishListening() {
  if (!state.listening) return;
  clearMicStartWatchdog();
  state.awaitingMicStart = false;
  clearAutoTurn();
  state.listening = false;
  state.finishRequested = true;
  clearTimeout(state.restartTimer);
  state.restartTimer = null;
  say("Finishing your message…");
  const speech = state.recognition;
  if (!speech) { completeSpeechTurn(); return; }
  try { speech.stop(); }
  catch {
    state.recognition = null;
    state.transcript = joinSpeech(state.transcript, state.partial);
    state.partial = "";
    completeSpeechTurn();
    return;
  }
  // Some providers dispatch onend synchronously, so don't schedule after send.
  if (!state.finishRequested) return;
  // A broken provider must not strand a deliberate user finish.
  state.finishTimer = setTimeout(() => {
    if (state.recognition === speech) {
      try { speech.abort(); } catch {}
      state.recognition = null;
      state.transcript = joinSpeech(state.transcript, state.partial);
      state.partial = "";
    }
    completeSpeechTurn();
  }, 1800);
}
function startListening({ automatic = false } = {}) {
  if (!SpeechRecognition) {
    state.handsFree = false;
    ui.endConversation.hidden = true;
    say("Your browser doesn't support speech recognition here. Type instead.");
    ui.typeForm.hidden = false;
    ui.typed.focus();
    return;
  }
  if (state.listening) { finishListening(); return; }
  if (state.busy || state.finishRequested) return;
  if (!state.resumeDraft) state.transcript = "";
  state.resumeDraft = false;
  state.listening = true;
  state.cancelled = false;
  state.awaitingMicStart = automatic;
  state.restartFailures = 0;
  state.pendingInterim = false;
  state.lastSpeechActivity = Date.now();
  clearAutoTurn();
  ui.error.hidden = true;
  phase("listening", automatic ? "Reconnecting microphone" : "I'm listening", "Keep talking naturally. I'll respond when you're done.");
  say(automatic ? "Reopening your microphone… Tap to reconnect manually if needed." : "Listening… Short pauses are okay. Tap again to send sooner.");
  startSpeechSegment();
}
ui.talk.addEventListener("click", () => {
  if (state.awaitingMicStart && state.recognition) {
    // User gesture is the reliable Safari fallback after silent auto-resume.
    const stalled = state.recognition;
    clearMicStartWatchdog();
    state.awaitingMicStart = false;
    state.recognition = null;
    state.listening = false;
    state.transcript = joinSpeech(state.transcript, state.partial);
    state.partial = "";
    try { stalled.abort(); } catch {}
  }
  if (state.listening) { finishListening(); return; }
  if (state.busy || state.finishRequested) return;
  ui.typeForm.hidden = true;
  try { ensurePlayback(); } catch (e) { report(e); return; }
  state.handsFree = true;
  startListening();
});
ui.stop.addEventListener("click", cancel);
ui.endConversation.addEventListener("click", cancel);
ui.typeToggle.addEventListener("click", () => {
  if (state.listening) return;
  ui.typeForm.hidden = !ui.typeForm.hidden;
  if (!ui.typeForm.hidden) {
    if (state.resumeDraft && !ui.typed.value) ui.typed.value = state.transcript;
    ui.typed.focus();
  }
});
ui.typeForm.addEventListener("submit", event => {
  event.preventDefault();
  const text = ui.typed.value.trim();
  if (!text || state.busy || state.listening || state.finishRequested) return;
  try { ensurePlayback(); } catch (e) { report(e); return; }
  if (text.length <= MAX_VOICE_MESSAGE_CHARS) {
    ui.typed.value = "";
    ui.typeForm.hidden = true;
    state.transcript = "";
    state.resumeDraft = false;
  }
  processTurn(text);
});
ui.replay.addEventListener("click", async () => {
  if (!state.url) return;
  try { await ensurePlayback(); ui.audio.currentTime = 0; await ui.audio.play(); }
  catch (e) { report(e); }
});
window.addEventListener("pagehide", () => {
  state.handsFree = false;
  clearMicStartWatchdog();
  state.awaitingMicStart = false;
  clearTimeout(state.followUpTimer);
  clearTimeout(state.restartTimer);
  clearTimeout(state.finishTimer);
  clearAutoTurn();
  state.listening = false;
  try { state.recognition?.abort(); } catch {}
  state.request?.abort();
  if (state.url) URL.revokeObjectURL(state.url);
  state.tts?.destroy();
  state.playback?.close();
});
// Don't keep the microphone open when someone backgrounds their phone.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.handsFree) void cancel();
});
// Do not load any legacy stored or user-selected voice; the official sample is default.
showVoiceState();
void loadDefaultVoice().catch(() => { /* Retried when a voice answer is requested. */ });
phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
