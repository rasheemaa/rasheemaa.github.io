import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const base='what-do-i-say/voice-beta/';
const html=readFileSync(base+'index.html','utf8');
const js=readFileSync(base+'lab.js','utf8');
const css=readFileSync(base+'voice.css','utf8');
const worker=readFileSync(base+'pocket-tts/worker.js','utf8');
const adapter=readFileSync(base+'pocket-tts/index.js','utf8');
assert(!worker.includes('CHUNK_GAP_SEC') && !worker.includes('isSilence: true'), 'No fixed silent PCM chunk may be inserted between synthesized text spans');
assert(worker.includes('chunkStart: isFirstAudioChunkOfTextChunk') && worker.includes('isSilence: false'), 'Keep the original synthesized chunk metadata');
assert(adapter.includes('./worker.js?v=4') && js.includes('./pocket-tts/index.js?v=4'), 'Load the updated voice worker without stale browser cache');
assert(html.includes('name="robots" content="noindex,nofollow"'));
for(const id of ['voice-file','audio','talk','settings','stop','type-form','replay']) assert(html.includes('id="'+id+'"'));
assert(!html.includes('class="step"') && !html.includes('Give her something NEW to say'), 'No three-box test interface');
assert(js.includes('cloneVoice(prepared') && js.includes('state.tts.generate(text'), 'Clone prepared reference and generate on device');
assert(js.includes('SpeechRecognition') && js.includes('/api/voice-conversation'), 'Voice UI is connected to conversational endpoint');
assert(js.includes('DEFAULT_SAMPLE_URL = "/what-do-i-say/voice-beta/Sparkle_reference.wav"'), 'Load approved HD audio from same-origin site');
assert(js.includes('chunksToWavBlob'));
assert(!/\bFormData\b|XMLHttpRequest|fetch\s*\(\s*(?:file|state.voiceFile)/.test(js), 'No voice-file uploads');
assert(readdirSync(base).includes('Sparkle_reference.wav'), 'Approved Sparkle HD MP3 must be in website files');
assert(!js.includes('serviceWorker.register'), 'Keep main Sparkle app untouched');
assert(css.includes('.orb') && css.includes('.talk-button'), 'Voice-first design');
console.log('PASS: voice-first interface, microphone, private sample, isolated backend, no sample publication');

assert(html.includes('id="download"'), 'Voice download must exist before JavaScript accesses it');
assert(html.includes('<details class="voice-details">'), 'Technical text should be collapsed');
assert(!html.includes('Experimental beta. Voice generation runs locally'), 'Remove wall of technical text');
assert(!js.includes('ui.voiceFile.click()'), 'Microphone must never ask users to pick MP3');
assert(!html.includes('Choose Sparkle\'s voice <span'), 'No visible voice selection requirement');

assert(html.includes('The reference recording is publicly accessible'), 'Disclose public reference audio');
assert(html.includes('voice.css?v=6') && html.includes('lab.js?v=19'), 'Cache-bust the redesigned voice interface');
assert(js.includes('await loadDefaultVoice();'), 'Voice must be fetched before generating speech');
assert(!html.includes("Choose Sparkle's recording once"), 'No setup instructions');

assert(!js.includes('VoiceClarityProcessor') && !js.includes('clarity.process'), 'Unprocessed native Pocket TTS audio by default');
assert(js.includes('state.player.play(samples, meta)') && js.includes('chunks.push(samples.slice())'), 'Preserve unprocessed native audio chunks');
assert(js.indexOf('await state.tts.generate(text,') < js.indexOf('state.player.play(samples, meta)'), 'Buffer full synthesis before playback');
assert(!js.includes('text.slice(0, 1500)'), 'Do not cut off spoken answers mid-sentence');
assert(html.includes('lab.js?v=19'), 'Voice listening fix must bypass cached JavaScript');

assert(js.includes('prepareVoiceReference(mono, decoded.sampleRate)'), 'Use phrase-complete clip before cloning');
assert(js.includes('state.player.play(samples, meta)') && !js.includes('VoiceClarityProcessor'), 'Keep unprocessed playback after reference fix');

assert(js.includes('fetch(DEFAULT_SAMPLE_URL') && js.includes('mode: "same-origin"'), 'Load HD MP3 without external dependency');
assert(!js.includes('api/voice-reference'), 'Never request old audio proxy');
assert(js.includes('blob.size !== 891016'), 'Validate approved HD asset size');

assert(js.includes('speech.continuous = true'), 'Speech recognition must support multiple sentences');
assert(js.includes('state.restartTimer = setTimeout('), 'Resume listening after browser-initiated silence or session end');
assert(js.includes('if (state.finishRequested) { completeSpeechTurn(); return; }'), 'Manual and automatic finishes must both use safe completion');
assert(js.includes('finishListening()') && js.includes('speech.stop()'), 'Manual finish remains available alongside automatic detection');
assert(!js.includes('speech.continuous = false'), 'No one-shot speech recognition');
assert(!js.includes('text.slice(0, 1200)'), 'Never silently truncate the spoken turn at 1200 characters');
assert(html.includes('Tap again to send'), 'Voice UI should explain explicit send');
assert(html.includes('<textarea id="typed-message"'), 'Long transcripts remain editable after interruption');

assert(js.includes('import { turnSilenceMs } from "./turn-detection.mjs"'), 'Use tested conservative auto turn classifier');
assert(js.includes('speech.onspeechstart') && js.includes('speech.onspeechend'), 'Detect the start and end of speech, not browser session end');
assert(js.includes('scheduleAutoTurn()') && js.includes('clearAutoTurn()'), 'Auto-send can be cancelled when speaking resumes');
assert(js.includes('if (state.finishRequested) { completeSpeechTurn(); return; }'), 'Browser session end does not immediately send');
assert(html.includes('She waits through short pauses'), 'Explain the automatic voice behavior');

assert(html.includes('id="end-conversation"'), 'Hands-free conversation has an explicit stop control');
assert(js.includes('state.handsFree = true'), 'Starting the microphone starts an ongoing voice session');
assert(js.includes('await state.player.waitForCompletion()'), 'Never reopen the mic while Sparkle is still speaking');
assert(js.includes('playedReply && state.handsFree && !state.cancelled'), 'Reopen mic only after a successful spoken answer');
assert(js.includes('if (document.hidden && state.handsFree) void cancel()'), 'Stop voice session when tab is backgrounded');
assert(css.includes('.end-conversation'), 'Provide a discreet always-accessible voice stop');
