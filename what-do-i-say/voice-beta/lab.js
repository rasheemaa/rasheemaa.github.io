// Isolated, no-cost reference voice test. No audio uploads.
import { PocketTTS, StreamingPlayer, chunksToWavBlob } from "./pocket-tts/index.js";
const $ = id => document.getElementById(id);
const fileInput = $("voice-file"), words = $("words"), generate = $("generate"), stop = $("stop");
const status = $("status"), error = $("error"), progress = $("progress"), audio = $("audio");
const result = $("result"), download = $("download");
let tts = null, player = null, playbackContext = null, voice = null, voiceKey = "", soundUrl = null, busy = false, isStopping = false;
const setStatus = message => { status.textContent = message; };
function update() { generate.disabled = busy || !fileInput.files?.length || !words.value.trim(); stop.disabled = !busy; }
function clearAudio() { if (soundUrl) URL.revokeObjectURL(soundUrl); soundUrl = null; audio.pause(); audio.removeAttribute("src"); download.removeAttribute("href"); result.hidden = true; }
function showError(e) { error.textContent = "This device couldn't complete the test: " + (e?.message || String(e)); error.hidden = false; setStatus("No audio was uploaded. You can try again."); }
fileInput.addEventListener("change", () => { voice = null; voiceKey = ""; error.hidden = true; clearAudio(); setStatus(fileInput.files?.length ? "Ready. Your voice recording stays in this browser." : "Choose the reference MP3 to begin."); update(); });
words.addEventListener("input", update);
async function getVoice(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error("Choose an audio file smaller than 30 MB.");
  const context = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration < 3 || decoded.duration > 40) throw new Error("Reference clips must be 3–40 seconds long.");
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const channel = decoded.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels;
    }
    // Only passes samples into the browser's local inference Web Worker.
    return await tts.cloneVoice(mono, { inputSampleRate: decoded.sampleRate, name: "sparkle-local" });
  } finally { await context.close(); }
}
generate.addEventListener("click", async () => {
  const file = fileInput.files?.[0], text = words.value.trim();
  if (!file || !text || busy) return;
  busy = true; isStopping = false; update(); error.hidden = true; clearAudio(); progress.hidden = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !window.Worker || !window.WebAssembly) throw new Error("This browser lacks required on-device audio features.");
    // iOS requires the first playback unlock during a user interaction.
    if (!playbackContext) playbackContext = new AC();
    await playbackContext.resume();
    if (!tts) {
      setStatus("Downloading the local voice model. Please keep this tab open…");
      tts = new PocketTTS({ language: "english_2026-04", quantized: true, voiceCloning: true });
      await tts.load(info => {
        if (info.type === "progress" && info.total) {
          progress.hidden = false;
          progress.value = Math.round(info.loaded / info.total * 100);
          setStatus("Downloading " + (info.label || "model") + ": " + progress.value + "%");
        } else if (info.status) setStatus("Preparing model: " + info.status);
      });
      player = new StreamingPlayer({ sampleRate: tts.sampleRate, audioContext: playbackContext });
    }
    const key = file.name + ":" + file.size + ":" + file.lastModified;
    if (voiceKey !== key || !voice) { setStatus("Cloning the approved voice locally…"); voice = await getVoice(file); voiceKey = key; }
    if (isStopping) return;
    progress.hidden = true; player.reset(); setStatus("Generating a new sentence using her voice…");
    const chunks = [];
    const data = await tts.generate(text, { voice, onChunk: (pcm, meta) => { player.play(pcm, meta); chunks.push(pcm.slice()); } });
    player.flush();
    if (isStopping) return;
    if (!chunks.length) throw new Error("No speech was generated.");
    soundUrl = URL.createObjectURL(chunksToWavBlob(chunks, tts.sampleRate));
    audio.src = soundUrl; download.href = soundUrl; result.hidden = false;
    setStatus("Done! Listen to the preview and decide if it sounds like Sparkle." + (data?.genTime ? " (" + data.genTime.toFixed(1) + "s)" : ""));
  } catch (e) {
    player?.stop(); if (!isStopping) showError(e);
    if (!tts?.ready) { tts?.destroy(); tts = null; player = null; voice = null; voiceKey = ""; }
  } finally { progress.hidden = true; busy = false; update(); }
});
stop.addEventListener("click", async () => { if (!busy) return; isStopping = true; setStatus("Stopping…"); try { await tts?.stop(); } catch {} player?.stop(); setStatus("Stopped."); });
window.addEventListener("pagehide", () => { if (soundUrl) URL.revokeObjectURL(soundUrl); tts?.destroy(); playbackContext?.close(); });
update();
