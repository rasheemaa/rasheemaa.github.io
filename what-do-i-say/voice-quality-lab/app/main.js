import { prepareVoiceReference } from '../../voice-beta/reference-prep.mjs';

const $ = id => document.getElementById(id);
const button = $('generate'), cancelButton = $('cancel'), status = $('status'), progress = $('progress'),
  error = $('error'), input = $('words'), result = $('result'), audio = $('rendered'), save = $('save');
let worker = null, pending = null, sequence = 0, active = false, wavUrl = null;
const setStatus = message => { status.textContent = message; };
const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent || '') ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isAppleMobile) {
  button.hidden = true;
  button.disabled = true;
  cancelButton.hidden = true;
  progress.hidden = true;
  setStatus('Mobile voice comparison paused to prevent browser crashes. You can listen to the original recording above.');
}

function teardown() {
  worker?.terminate();
  worker = null;
  if (pending) { pending.reject(new Error('Test stopped.')); pending = null; }
  active = false;
  button.disabled = isAppleMobile;
  cancelButton.hidden = true;
  progress.hidden = true;
}
function request(type, data, transfer = []) {
  if (!worker) throw new Error('Voice worker is not running.');
  const id = ++sequence;
  return new Promise((resolve,reject) => {
    pending = { id, resolve, reject };
    worker.postMessage({ id, type, data }, transfer);
  });
}
function makeWorker() {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', event => {
    const msg = event.data;
    if (msg?.type === 'progress') {
      const d = msg.data || {};
      if (d.status === 'progress' && Number.isFinite(d.progress)) {
        progress.hidden = false;
        progress.value = Math.min(100, Math.max(0, d.progress));
        setStatus('Downloading the voice model: ' + Math.floor(progress.value) + '%');
      } else if (d.status === 'initiate' || d.status === 'download') {
        setStatus('Getting voice model files ready…');
      }
      return;
    }
    if (pending && msg.id === pending.id) {
      const task = pending;
      pending = null;
      if (msg.type === 'error') task.reject(new Error(msg.message));
      else task.resolve(msg.data);
    }
  });
  worker.addEventListener('error', () => {
    if (pending) pending.reject(new Error('Voice engine failed to load. This device may not have enough memory.'));
    pending = null;
  });
}
async function getReference24k() {
  const res = await fetch('/what-do-i-say/voice-beta/Sparkle_HD_soft.mp3', { mode: 'same-origin' });
  if (!res.ok) throw new Error('Approved Sparkle reference is not available.');
  const raw = await res.arrayBuffer();
  if (raw.byteLength !== 753687) throw new Error('Unexpected Sparkle voice reference.');
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await ctx.decodeAudioData(raw);
    const rate = decoded.sampleRate;
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const pcm = decoded.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) mono[i] += pcm[i] / decoded.numberOfChannels;
    }
    const trimmed = prepareVoiceReference(mono, rate);
    const buf = ctx.createBuffer(1, trimmed.length, rate);
    buf.copyToChannel(trimmed, 0);
    const offline = new OfflineAudioContext(1, Math.ceil(trimmed.length * 24000 / rate), 24000);
    const source = offline.createBufferSource();
    source.buffer = buf;
    source.connect(offline.destination);
    source.start();
    const resampled = await offline.startRendering();
    return resampled.getChannelData(0).slice();
  } finally {
    await ctx.close();
  }
}
function encodeWav(pcm, sampleRate = 24000) {
  const array = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(array);
  const text = (at, word) => { for (let i = 0; i < word.length; i++) view.setUint8(at + i, word.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, array.byteLength - 8, true);
  text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, Number.isFinite(pcm[i]) ? pcm[i] : 0));
    view.setInt16(44 + 2 * i, Math.round(s * 32767), true);
  }
  return new Blob([array], { type: 'audio/wav' });
}
button.addEventListener('click', async () => {
  const text = input.value.trim();
  if (!text || active || isAppleMobile) return;
  active = true; button.disabled = true; cancelButton.hidden = false; error.hidden = true; result.hidden = true;
  if (wavUrl) { URL.revokeObjectURL(wavUrl); wavUrl = null; }
  try {
    if (!window.Worker || !window.OfflineAudioContext) throw new Error('Required local audio features are unavailable in this browser.');
    makeWorker();
    setStatus('Checking your phone or computer…');
    const capability = await request('capability');
    if (!capability.gpu) throw new Error('WebGPU is not available on this device. For now this quality model needs a modern WebGPU-capable browser. Normal Sparkle chat is unchanged.');
    setStatus('Preparing Chatterbox. The first download is approximately 1.5 GB…');
    await request('load');
    progress.hidden = true;
    setStatus('Learning from Sparkle_HD_soft.mp3…');
    const ref = await getReference24k();
    const samples = ref.buffer;
    await request('clone', samples, [samples]);
    setStatus('Generating a brand-new sentence in Sparkle’s voice…');
    const buffer = await request('generate', { text });
    const voice = new Float32Array(buffer);
    if (voice.length < 2400) throw new Error('The model returned an incomplete result.');
    wavUrl = URL.createObjectURL(encodeWav(voice));
    audio.src = wavUrl;
    save.href = wavUrl;
    result.hidden = false;
    setStatus('Ready. Compare her new sentence with the original recording.');
  } catch (err) {
    error.textContent = err?.message || String(err);
    error.hidden = false;
    setStatus('No change was made to the live Sparkle voice.');
  } finally {
    teardown();
  }
});
cancelButton.addEventListener('click', () => {
  teardown(); setStatus('Stopped. Nothing changed on the live site.');
});
window.addEventListener('pagehide', () => {
  teardown();
  if (wavUrl) URL.revokeObjectURL(wavUrl);
});
