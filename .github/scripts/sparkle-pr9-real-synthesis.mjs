// Runs the actual PR #9 Pocket TTS ONNX Web Worker in Chromium on GitHub Actions.
// Compares real generated PCM to the identical PCM with legacy fixed 250 ms
// silences reinserted. Never labels this reconstruction as a separate old run.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const HOST = "http://127.0.0.1:8765";
const OUT = "sparkle-real-tts-artifacts";
const CHROME_CANDIDATES = [
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium", "/usr/bin/chromium-browser"
];
function findChrome() {
  for (const item of CHROME_CANDIDATES) {
    try { execFileSync("test", ["-x", item]); return item; } catch {}
  }
  return undefined;
}
async function waitForServer(url) {
  for (let i = 0; i < 45; ++i) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Local static server failed to start.");
}
const server = spawn("python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], { stdio: "ignore" });
let browser;
try {
  await waitForServer(HOST + "/what-do-i-say/voice-beta/Sparkle_reference.wav");
  browser = await chromium.launch({
    headless: true,
    executablePath: findChrome(),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"]
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 850 } });
  page.on("console", msg => { if (msg.type() === "error") console.log("BROWSER-CONSOLE:", msg.text().slice(0, 900)); });
  page.on("pageerror", err => console.log("PAGEERROR:", err.message.slice(0, 1500)));
  console.log("CHROME:", await browser.version());
  await page.goto(HOST + "/what-do-i-say/voice-beta/", { waitUntil: "domcontentloaded" });
  page.setDefaultTimeout(90000);

  // Execute original production modules directly, not a mocked engine.
  const result = await page.evaluate(async () => {
    const { PocketTTS, chunksToWavBlob } = await import("./pocket-tts/index.js?v=4");
    const { prepareVoiceReference } = await import("./reference-prep.mjs");
    const referenceResponse = await fetch("./Sparkle_reference.wav", { cache: "no-store" });
    if (!referenceResponse.ok) throw new Error("Reference WAV unavailable");
    const bytes = await referenceResponse.arrayBuffer();
    const digestBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const referenceSha = Array.from(digestBytes, b => b.toString(16).padStart(2, "0")).join("");
    if (referenceSha !== "b59e9c4d70864fcd0cb0b4e9c5f4a25b4854464e53104b7a6a5449d24a54ea20")
      throw new Error("Wrong Sparkle reference WAV: " + referenceSha);

    const ctx = new AudioContext({ sampleRate: 24000 });
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    const mono = new Float32Array(decoded.length);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const chan = decoded.getChannelData(ch);
      for (let i = 0; i < mono.length; i++) mono[i] += chan[i] / decoded.numberOfChannels;
    }
    let prepared = prepareVoiceReference(mono, decoded.sampleRate);
    let inputSampleRate = decoded.sampleRate;
    if (inputSampleRate !== 24000 && globalThis.OfflineAudioContext) {
      const o = new OfflineAudioContext(1, Math.ceil(prepared.length * 24000 / inputSampleRate), 24000);
      const buffer = o.createBuffer(1, prepared.length, inputSampleRate);
      buffer.copyToChannel(prepared, 0);
      const source = o.createBufferSource();
      source.buffer = buffer;
      source.connect(o.destination);
      source.start();
      prepared = (await o.startRendering()).getChannelData(0).slice();
      inputSampleRate = 24000;
    }
    await ctx.close();
    const tts = new PocketTTS({
      language: "english_2026-04",
      quantized: true,
      fullPrecisionAudio: true,
      voiceCloning: true,
      cache: false,
      maxThreads: 2,
      modelBaseUrl: "http://127.0.0.1:8765/.cache/sparkle-pocket-tts"
    });
    console.log("Real Pocket TTS WASM model loading");
    await tts.load(msg => {
      if (msg.type === "status") console.log("Pocket TTS status:", msg.status);
      if (msg.type === "progress" && msg.loaded === msg.total) console.log("Model loaded", msg.label);
    });
    const voice = await tts.cloneVoice(prepared, { inputSampleRate, name: "sparkle-original-pr9-test" });
    const sampleRate = tts.sampleRate;
    console.log("Real Pocket TTS voice cloned. Output rate:", sampleRate);

    function base64(arr) {
      let out = "";
      // Each intermediate base64 block must be a multiple of 3 bytes.
      // Otherwise btoa pads every block and Node stops decoding at the first '='.
      for (let i = 0; i < arr.length; i += 32766)
        out += btoa(String.fromCharCode(...arr.subarray(i, i + 32766)));
      return out;
    }
    function measure(chunks) {
      let samples = 0, max = 0, sum = 0, over = 0, nan = 0;
      for (const c of chunks) for (let i = 0; i < c.length; i++) {
        let value = c[i];
        if (!Number.isFinite(value)) { nan++; continue; }
        samples++; max = Math.max(max, Math.abs(value)); sum += value * value;
        if (Math.abs(value) >= 0.999) over++;
      }
      return { samples, seconds: samples / sampleRate, peak: max, rms: Math.sqrt(sum / Math.max(samples, 1)), clipped: over, nonFinite: nan };
    }
    const results = [];
    const utterances = [
      {
        name: "short",
        text: "Hey, I'm right here. Tell me what's on your mind, and we'll figure it out together."
      },
      {
        name: "multi-sentence",
        text: "You don't have to find the perfect words all at once. Sometimes the first thing we say is just a starting point. We can give your thoughts a little room, keep the important details, and make sure the message still sounds like you. If you need a softer response, we can try that. If you want to be more direct, that's okay too. Take your time. The goal is to say exactly what you mean in a way that feels natural, clear, and comfortable."
      }
    ];
    for (const item of utterances) {
      const chunks = [], metadata = [];
      console.log("Synthesizing", item.name, item.text.length, "characters");
      const started = performance.now();
      const metrics = await tts.generate(item.text, {
        voice,
        onChunk(samples, meta) {
          chunks.push(samples.slice());
          metadata.push(meta || {});
        }
      });
      const natural = measure(chunks);
      if (chunks.length < 1 || natural.samples < 2400 || !natural.rms || natural.nonFinite > 0)
        throw new Error("Generated " + item.name + " WAV was empty, silent, or contained invalid samples");
      const reconstructedLegacy = [];
      let oldGaps = 0;
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0 && metadata[i].chunkStart === true) {
          reconstructedLegacy.push(new Float32Array(Math.floor(sampleRate * 0.25)));
          oldGaps++;
        }
        reconstructedLegacy.push(chunks[i]);
      }
      const legacy = measure(reconstructedLegacy);
      if (item.name === "multi-sentence" && !oldGaps)
        throw new Error("Multi-sentence test failed to cross any text chunk boundary.");
      const pcmBytes = new Uint8Array(await chunksToWavBlob(chunks, sampleRate).arrayBuffer());
      const baselineBytes = new Uint8Array(await chunksToWavBlob(reconstructedLegacy, sampleRate).arrayBuffer());
      results.push({
        name: item.name, text: item.text, sampleRate,
        chunks: chunks.length, textChunkBoundaries: oldGaps,
        natural, legacy, generatedBy: "real Pocket TTS PR #9 worker",
        comparison: "same actual generated audio with exactly 250 ms of silence added at each text boundary",
        metrics, wallClockSeconds: (performance.now() - started) / 1000,
        naturalWavBase64: base64(pcmBytes), legacyWavBase64: base64(baselineBytes)
      });
      console.log("FINISHED", item.name, natural.seconds, "seconds; removed", oldGaps * 0.25, "seconds of forced silence");
    }
    tts.destroy();
    return { referenceSha, source: "PR #9 Pocket TTS browser worker", results };
  }, { timeout: 0 });

  mkdirSync(OUT, { recursive: true });
  const summary = { source: result.source, referenceSha: result.referenceSha, head: process.env.GITHUB_SHA, tests: [] };
  for (const r of result.results) {
    const naturalPath = OUT + "/sparkle-pr9-" + r.name + ".wav";
    const baselinePath = OUT + "/sparkle-reconstructed-250ms-" + r.name + ".wav";
    const naturalWav = Buffer.from(r.naturalWavBase64, "base64");
    const baselineWav = Buffer.from(r.legacyWavBase64, "base64");
    // Do not report success on partially-decoded or truncated WAV exports.
    for (const [audio, stats] of [[naturalWav, r.natural], [baselineWav, r.legacy]]) {
      assert.equal(audio.toString("ascii", 0, 4), "RIFF");
      assert.equal(audio.toString("ascii", 8, 12), "WAVE");
      assert.equal(audio.readUInt32LE(24), r.sampleRate);
      assert.equal(audio.readUInt32LE(40), stats.samples * 2);
      assert.equal(audio.byteLength, 44 + stats.samples * 2);
    }
    writeFileSync(naturalPath, naturalWav);
    writeFileSync(baselinePath, baselineWav);
    const {naturalWavBase64,legacyWavBase64,...details} = r;
    summary.tests.push({...details, naturalPath, baselinePath});
    assert(r.natural.nonFinite === 0 && r.natural.rms > 0.001 && r.natural.seconds > 0.1);
    assert(Math.abs(r.legacy.seconds - r.natural.seconds - r.textChunkBoundaries * 0.25) < 0.001);
    console.log("REAL SYNTHESIS PASS:", r.name, JSON.stringify({
      generatedSeconds: r.natural.seconds, textChunkBoundaries: r.textChunkBoundaries,
      oldForcedPauseSeconds: r.textChunkBoundaries * 0.25, peak: r.natural.peak, rms: r.natural.rms
    }));
  }
  writeFileSync(OUT + "/results.json", JSON.stringify(summary, null, 2) + "\n");
  console.log("SUCCESS: Real PR #9 Pocket TTS WAV outputs generated and verified. Human audible quality and real iPhone use still require separate confirmation.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
