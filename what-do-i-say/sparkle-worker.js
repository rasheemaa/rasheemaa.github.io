import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

const SPARKLE_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';

const PRIMARY = {
  model: SPARKLE_MODEL,
  device: 'webgpu',
  dtype: 'q4f16',
  label: 'Sparkle',
  approxDownload: '~570 MB'
};

const FALLBACK = {
  model: SPARKLE_MODEL,
  device: 'wasm',
  dtype: 'q8',
  label: 'Sparkle Compatible',
  approxDownload: '~620 MB'
};

let generatorPromise = null;
let activeProfile = null;
let progressRequestId = null;

function post(id, type, payload = {}) {
  self.postMessage({ id, type, ...payload });
}

function progress(info) {
  if (!progressRequestId || !info) return;
  const raw = Number(info.progress);
  post(progressRequestId, 'progress', {
    status: String(info.status || ''),
    file: String(info.file || ''),
    progress: Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : null,
    loaded: Number.isFinite(Number(info.loaded)) ? Number(info.loaded) : null,
    total: Number.isFinite(Number(info.total)) ? Number(info.total) : null,
    profile: activeProfile?.label || ''
  });
}

async function createGenerator(id, preferLite = false) {
  if (generatorPromise) return generatorPromise;
  progressRequestId = id;

  generatorPromise = (async () => {
    const canTryWebGPU = !preferLite && Boolean(self.navigator?.gpu);

    if (canTryWebGPU) {
      activeProfile = PRIMARY;
      post(id, 'status', {
        phase: 'loading',
        message: `Loading ${PRIMARY.label} on this device…`,
        profile: PRIMARY.label,
        approxDownload: PRIMARY.approxDownload,
        backend: PRIMARY.device
      });
      try {
        const generator = await pipeline('text-generation', PRIMARY.model, {
          device: PRIMARY.device,
          dtype: PRIMARY.dtype,
          progress_callback: progress
        });
        post(id, 'status', {
          phase: 'ready',
          message: `${PRIMARY.label} is ready on this device.`,
          profile: PRIMARY.label,
          backend: PRIMARY.device
        });
        return generator;
      } catch (_) {
        post(id, 'status', {
          phase: 'fallback',
          message: 'This device needs the compatibility engine. Switching Sparkle to a broader browser mode…',
          profile: FALLBACK.label,
          backend: FALLBACK.device
        });
      }
    }

    activeProfile = FALLBACK;
    post(id, 'status', {
      phase: 'loading',
      message: `Loading ${FALLBACK.label} on this device…`,
      profile: FALLBACK.label,
      approxDownload: FALLBACK.approxDownload,
      backend: FALLBACK.device
    });
    const generator = await pipeline('text-generation', FALLBACK.model, {
      device: FALLBACK.device,
      dtype: FALLBACK.dtype,
      progress_callback: progress
    });
    post(id, 'status', {
      phase: 'ready',
      message: `${FALLBACK.label} is ready on this device.`,
      profile: FALLBACK.label,
      backend: FALLBACK.device
    });
    return generator;
  })();

  try {
    return await generatorPromise;
  } catch (error) {
    generatorPromise = null;
    activeProfile = null;
    throw error;
  } finally {
    progressRequestId = null;
  }
}

function compact(value, max = 3000) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function toneText(tone) {
  return ({
    warm: 'warm, natural, and sincere',
    direct: 'direct and clear',
    professional: 'professional and human',
    casual: 'casual and natural',
    firm: 'firm, clear, and respectful',
    concise: 'short and direct'
  })[tone] || 'warm, natural, and sincere';
}

function buildPrompt(payload) {
  const mode = String(payload.mode || 'write');
  const tone = toneText(payload.tone);
  const source = compact(payload.text, 3500);
  const current = compact(payload.currentMessage, 5000);
  const name = compact(payload.personName, 60);
  const refine = String(payload.refine || '');

  if (refine && current) {
    const instruction = ({
      shorter: 'Make it noticeably shorter. Keep every fact and the same request.',
      softer: 'Make it gentler and more considerate. Keep every fact and the same request.',
      firmer: 'Make it firmer and clearer without hostility. Keep every fact and the same request.',
      professional: 'Make it polished and professional but still human. Keep every fact and the same request.',
      another: 'Write a genuinely different natural version. Keep every fact and the same request.'
    })[refine] || 'Rewrite it naturally without changing any facts.';

    return [
      '/no_think',
      'Rewrite the ORIGINAL message below.',
      `Instruction: ${instruction}`,
      `Tone: ${tone}.`,
      'Do not explain. Do not add a subject line. Output only the rewritten message.',
      '',
      'ORIGINAL:',
      current,
      '',
      'REWRITE:'
    ].join('\n');
  }

  if (mode === 'reply') {
    return [
      '/no_think',
      'Write MY reply to the situation below.',
      'The situation includes what the other person said and what I want to communicate back.',
      'Speak in first person as me. Do not answer as an AI assistant.',
      'Keep every fact exactly. Do not invent, remove, or change the meaning.',
      `Tone: ${tone}.`,
      name ? `Their name is ${name}. Use it only if natural.` : '',
      'Do not explain. Do not add a subject line. Output only my reply.',
      '',
      'SITUATION:',
      source,
      '',
      'MY REPLY:'
    ].filter(Boolean).join('\n');
  }

  if (mode === 'fix') {
    return [
      '/no_think',
      'Polish the DRAFT below into a ready-to-send message.',
      'Keep every fact, date, request, and meaning exactly the same.',
      `Tone: ${tone}.`,
      name ? `Their name is ${name}. Use it only if natural.` : '',
      'Do not explain. Do not add a subject line. Output only the polished message.',
      '',
      'DRAFT:',
      source,
      '',
      'MESSAGE:'
    ].filter(Boolean).join('\n');
  }

  return [
    '/no_think',
    'Write a ready-to-send message using ONLY the facts below.',
    'Keep every fact, date, and request exactly as given.',
    'Do not turn the request into a different event or task.',
    `Tone: ${tone}.`,
    name ? `Their name is ${name}. Use it only if natural.` : '',
    'Do not explain. Do not add a subject line. Output only the message.',
    '',
    'FACTS:',
    source,
    '',
    'MESSAGE:'
  ].filter(Boolean).join('\n');
}

function cleanOutput(value) {
  let output = String(value || '').trim();
  output = output.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  output = output.replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, '').trim();
  output = output.replace(/^(?:assistant|sparkle|final message|message|rewritten message|revised message|reply|response|rewrite)\s*:\s*/i, '').trim();
  output = output.replace(/^subject\s*:[^\n]*\n+/i, '').trim();
  output = output.replace(/^(?:here(?:'s| is)(?: a| the)?(?: rewritten| revised| polished| shorter| softer| firmer| professional| different| natural)?(?: version| message| reply)?[^:]{0,50}:\s*)/i, '').trim();
  if ((output.startsWith('“') && output.endsWith('”')) || (output.startsWith('"') && output.endsWith('"'))) {
    output = output.slice(1, -1).trim();
  }
  return output.slice(0, 5000);
}

function classifyFailure(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (self.navigator?.onLine === false) return { code: 'sparkle_offline', message: 'Sparkle could not finish offline on this device. Connect to the internet once so any missing setup files can download, then try again.' };
  if (/quota|storage|disk|space|cache/.test(text)) return { code: 'sparkle_storage', message: 'Sparkle needs a little more browser storage for its on-device model. Free up some device space or browser storage, then try again.' };
  if (/memory|allocation|out of memory|oom/.test(text)) return { code: 'sparkle_memory', message: 'This device ran low on memory while starting Sparkle. Close a few apps or browser tabs, then try again.' };
  if (/network|fetch|download|load|connection/.test(text)) return { code: 'sparkle_download', message: 'Sparkle could not download one of its setup files. Check your connection and try again. After setup, the model is cached on this device.' };
  return { code: 'sparkle_compatibility', message: 'Sparkle could not start on this browser. Try updating Safari or Chrome, turning off Low Power Mode, or using another device.' };
}

async function generate(id, payload, preferLite) {
  const generator = await createGenerator(id, preferLite);
  post(id, 'status', {
    phase: 'generating',
    message: `${activeProfile?.label || 'Sparkle'} is finding the words on your device…`,
    profile: activeProfile?.label || 'Sparkle',
    backend: activeProfile?.device || ''
  });

  const messages = [{ role: 'user', content: buildPrompt(payload || {}) }];
  const another = payload?.refine === 'another';
  const shorter = payload?.refine === 'shorter';
  const output = await generator(messages, {
    max_new_tokens: shorter ? 72 : 120,
    do_sample: true,
    temperature: another ? 0.8 : 0.7,
    top_p: 0.8,
    top_k: 20,
    repetition_penalty: 1.08
  });

  const generated = output?.[0]?.generated_text;
  let text = '';
  if (Array.isArray(generated)) text = generated.at(-1)?.content || '';
  else text = generated || '';

  text = cleanOutput(text);
  if (!text) throw new Error('Sparkle returned an empty message.');

  post(id, 'result', {
    message: text,
    profile: activeProfile?.label || 'Sparkle',
    backend: activeProfile?.device || ''
  });
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'generate' || !data.id) return;
  generate(data.id, data.payload || {}, Boolean(data.preferLite)).catch((error) => {
    const failure = classifyFailure(error);
    post(data.id, 'error', failure);
  });
});
