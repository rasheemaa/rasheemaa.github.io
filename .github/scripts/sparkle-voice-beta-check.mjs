import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const base='what-do-i-say/voice-beta/';
const html=readFileSync(base+'index.html','utf8');
const js=readFileSync(base+'lab.js','utf8');
const css=readFileSync(base+'voice.css','utf8');
assert(html.includes('name="robots" content="noindex,nofollow"'));
for(const id of ['voice-file','audio','talk','settings','stop','type-form','replay']) assert(html.includes('id="'+id+'"'));
assert(!html.includes('class="step"') && !html.includes('Give her something NEW to say'), 'No three-box test interface');
assert(js.includes('cloneVoice(prepared') && js.includes('state.tts.generate(text'), 'Clone prepared reference and generate on device');
assert(js.includes('SpeechRecognition') && js.includes('/api/voice-conversation'), 'Voice UI is connected to conversational endpoint');
assert(js.includes('DEFAULT_SAMPLE_URL') && js.includes('/api/voice-reference'), 'Load official Sparkle reference automatically');
assert(js.includes('chunksToWavBlob'));
assert(!/\bFormData\b|XMLHttpRequest|fetch\s*\(\s*(?:file|state.voiceFile)/.test(js), 'No voice-file uploads');
assert(!readdirSync(base).some(name=>/\.(mp3|wav|ogg|m4a|flac)$/i.test(name)), 'Never publish reference MP3');
assert(!js.includes('serviceWorker.register'), 'Keep main Sparkle app untouched');
assert(css.includes('.orb') && css.includes('.talk-button'), 'Voice-first design');
console.log('PASS: voice-first interface, microphone, private sample, isolated backend, no sample publication');

assert(html.includes('id="download"'), 'Voice download must exist before JavaScript accesses it');
assert(html.includes('<details class="voice-details">'), 'Technical text should be collapsed');
assert(!html.includes('Experimental beta. Voice generation runs locally'), 'Remove wall of technical text');
assert(!js.includes('ui.voiceFile.click()'), 'Microphone must never ask users to pick MP3');
assert(!html.includes('Choose Sparkle\'s voice <span'), 'No visible voice selection requirement');

assert(html.includes('The reference recording is publicly accessible.'), 'Disclose public reference audio');
assert(html.includes('voice.css?v=4') && html.includes('lab.js?v=7'), 'Cache-bust the redesigned voice interface');
assert(js.includes('await loadDefaultVoice();'), 'Voice must be fetched before generating speech');
assert(!html.includes("Choose Sparkle's recording once"), 'No setup instructions');

assert(!js.includes('VoiceClarityProcessor') && !js.includes('clarity.process'), 'Unprocessed native Pocket TTS audio by default');
assert(js.includes('state.player.play(samples, meta)') && js.includes('chunks.push(samples.slice())'), 'No compressing or limiting the custom voice');
assert(html.includes('lab.js?v=7'), 'Reference-prep update must bypass cached audio script');

assert(js.includes('prepareVoiceReference(mono, decoded.sampleRate)'), 'Use phrase-complete clip before cloning');
assert(js.includes('state.player.play(samples, meta)') && !js.includes('VoiceClarityProcessor'), 'Keep unprocessed playback after reference fix');
