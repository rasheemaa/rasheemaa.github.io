/**
 * Sparkle Voice Beta: one-screen, turn-by-turn voice conversation.
 * Speech recognition may use a device/browser provider; recognized TEXT is
 * sent to the existing Cloudflare backend. Reference voice/audio remains
 * local, optionally saved in IndexedDB after the user picks the file.
 */
import { PocketTTS, StreamingPlayer, chunksToWavBlob } from "./pocket-tts/index.js";

const $ = id => document.getElementById(id);
const ui = {
  app: $("voice-app"), talk: $("talk"), stop: $("stop"), replay: $("replay"),
  title: $("phase-title"), subtitle: $("phase-subtitle"), status: $("status"),
  error: $("error"), transcript: $("transcript"), heard: $("heard"), reply: $("reply"),
  settings: $("settings"), settingsButton: $("settings-button"),
  voiceFile: $("voice-file"), voiceState: $("voice-state"), forget: $("forget"),
  typeToggle: $("type-toggle"), typeForm: $("type-form"), typed: $("typed-message"),
  progress: $("progress"), audio: $("audio"), download: $("download")
};

const DB_NAME = "sparkle-voice-device-v1";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const state = {
  phase: "idle", busy: false, listening: false, recognition: null,
  transcript: "", lastHeard: "", history: [], request: null,
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
  ui.talk.setAttribute("aria-label", name === "listening" ? "Stop listening" : "Talk to Sparkle");
  ui.talk.setAttribute("aria-pressed", String(name === "listening"));
  ui.typeToggle.disabled = name === "thinking" || name === "speaking";
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
}
function voiceKey(file) { return file ? String(file.name || "sparkle") + ":" + file.size + ":" + (file.lastModified || 0) : ""; }
function showVoiceState() {
  ui.voiceState.textContent = state.voiceFile
    ? "✓ Sparkle's reference is ready on this device."
    : "No voice reference saved yet.";
  ui.forget.hidden = !state.voiceFile;
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
    return state.tts.cloneVoice(mono, { inputSampleRate: decoded.sampleRate, name: "sparkle-voice-local" });
  } finally { await ctx.close(); }
}
async function ensureVoice() {
  if (!state.voiceFile) throw new Error("Set up Sparkle's voice in Settings first.");
  if (!window.Worker || !window.WebAssembly) throw new Error("This browser can't run local voice generation.");
  if (!state.tts) {
    say("Downloading Sparkle's free voice model. The first load can be large…");
    state.tts = new PocketTTS({ language: "english_2026-04", quantized: true, voiceCloning: true });
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
  phase("speaking", "Sparkle is speaking", "Listen to her answer.");
  await ensureVoice();
  if (state.cancelled) return;
  state.player.reset();
  const chunks = [];
  say("Speaking in Sparkle's custom voice…");
  await state.tts.generate(text.slice(0, 1500), {
    voice: state.voice,
    onChunk: (samples, meta) => {
      if (state.cancelled) return;
      state.player.play(samples, meta);
      chunks.push(samples.slice());
    }
  });
  state.player.flush();
  if (state.cancelled) return;
  if (!chunks.length) throw new Error("Sparkle couldn't produce voice audio on this device.");
  clearResult();
  state.url = URL.createObjectURL(chunksToWavBlob(chunks, state.tts.sampleRate));
  ui.audio.src = state.url;
  ui.download.href = state.url;
  ui.replay.disabled = false;
  say("Tap to speak again, or replay her last answer.");
}
async function processTurn(text) {
  if (!text || state.busy) return;
  state.cancelled = false;
  state.busy = true;
  state.lastHeard = text;
  ui.error.hidden = true;
  showTurn(text, "");
  phase("thinking", "Sparkle is thinking", "One moment…");
  say("Understanding what you said…");
  const oldHistory = state.history.slice(-8);
  try {
    state.request = new AbortController();
    const base = String(window.WDIS_API_BASE || "").replace(/\/$/, "");
    if (!base) throw new Error("Sparkle's conversation service isn't configured.");
    const response = await fetch(base + "/api/voice-conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: state.request.signal,
      body: JSON.stringify({ text: text.slice(0, 1200), history: oldHistory })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "Sparkle couldn't respond. Try again.");
    const reply = String(data?.message || "").trim();
    if (!reply) throw new Error("Sparkle returned an empty answer.");
    if (state.cancelled) return;
    state.history = [...oldHistory, { role: "user", content: text.slice(0, 1200) }, { role: "assistant", content: reply }].slice(-8);
    showTurn(text, reply);
    await speak(reply);
  } catch (e) {
    if (!state.cancelled && e?.name !== "AbortError") report(e);
  } finally {
    state.request = null;
    state.busy = false;
    ui.progress.hidden = true;
    if (!state.cancelled && state.phase !== "idle") phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
  }
}
async function cancel() {
  state.cancelled = true;
  state.request?.abort();
  if (state.recognition && state.listening) {
    try { state.recognition.abort(); } catch {}
  }
  state.recognition = null;
  state.listening = false;
  if (state.tts && state.busy) { try { await state.tts.stop(); } catch {} }
  state.player?.stop();
  state.busy = false;
  phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
  say("Stopped. Tap the microphone whenever you're ready.");
}
function startListening() {
  if (!SpeechRecognition) {
    say("Your browser doesn't support speech recognition here. Type instead.");
    ui.typeForm.hidden = false;
    ui.typed.focus();
    return;
  }
  if (state.listening) {
    try { state.recognition?.stop(); } catch {}
    return;
  }
  const speech = new SpeechRecognition();
  speech.lang = "en-US";
  speech.continuous = false;
  speech.interimResults = true;
  speech.maxAlternatives = 1;
  state.recognition = speech;
  state.listening = true;
  state.transcript = "";
  ui.error.hidden = true;
  phase("listening", "I'm listening", "Go ahead. I'm here.");
  say("Listening… Speech recognition may use your device's speech provider.");
  speech.onresult = event => {
    let full = "";
    for (let i = 0; i < event.results.length; i++) full += (event.results[i]?.[0]?.transcript || "") + " ";
    state.transcript = full.trim();
    if (state.transcript) showTurn(state.transcript, "");
  };
  speech.onerror = event => {
    if (state.recognition !== speech || state.cancelled) return;
    ui.error.textContent = event.error === "not-allowed" ? "Microphone permission was denied. You can type instead." : event.error === "no-speech" ? "I didn't hear anything. Try again." : "Speech recognition stopped: " + event.error;
    ui.error.hidden = false;
  };
  speech.onend = () => {
    if (state.recognition !== speech) return;
    state.recognition = null;
    state.listening = false;
    const text = state.transcript;
    state.transcript = "";
    phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
    if (!state.cancelled && text) processTurn(text);
    else if (!state.cancelled) say("Tap the microphone to try again.");
  };
  try { speech.start(); }
  catch (e) {
    state.listening = false;
    state.recognition = null;
    report(e);
  }
}
ui.talk.addEventListener("click", () => {
  if (state.listening) { state.recognition?.stop(); return; }
  if (state.busy) return;
  ui.typeForm.hidden = true;
  if (!state.voiceFile) {
    say("Choose Sparkle's approved MP3 once in settings.");
    openSettings();
    return;
  }
  state.cancelled = false;
  try { ensurePlayback(); } catch (e) { report(e); return; }
  startListening();
});
ui.stop.addEventListener("click", cancel);
ui.typeToggle.addEventListener("click", () => {
  ui.typeForm.hidden = !ui.typeForm.hidden;
  if (!ui.typeForm.hidden) ui.typed.focus();
});
ui.typeForm.addEventListener("submit", event => {
  event.preventDefault();
  const text = ui.typed.value.trim();
  if (!text || state.busy) return;
  if (!state.voiceFile) { openSettings(); say("Choose the approved Sparkle MP3 once to hear her respond."); return; }
  try { ensurePlayback(); } catch (e) { report(e); return; }
  ui.typed.value = "";
  ui.typeForm.hidden = true;
  processTurn(text);
});
ui.replay.addEventListener("click", async () => {
  if (!state.url) return;
  try { await ensurePlayback(); ui.audio.currentTime = 0; await ui.audio.play(); }
  catch (e) { report(e); }
});
window.addEventListener("pagehide", () => {
  state.request?.abort();
  if (state.url) URL.revokeObjectURL(state.url);
  state.tts?.destroy();
  state.playback?.close();
});
restoreSample();
phase("idle", "Talk to Sparkle", "Just say what's on your mind.");
