import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

const PRIMARY = {
  model: 'onnx-community/SmolLM2-360M-Instruct-ONNX',
  device: 'webgpu',
  dtype: 'q4f16',
  label: 'Sparkle',
  approxDownload: '~300 MB'
};

const FALLBACK = {
  model: 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA',
  device: 'wasm',
  dtype: 'q8',
  label: 'Sparkle Lite',
  approxDownload: '~150 MB'
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
      } catch (error) {
        post(id, 'status', {
          phase: 'fallback',
          message: 'This device needs the lighter local engine. Switching to Sparkle Lite…',
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

function buildUserPrompt(payload) {
  const toneMap = {
    warm: 'warm, natural, and sincere',
    direct: 'direct and clear',
    professional: 'professional but human',
    casual: 'casual and natural',
    firm: 'firm, clear, and respectful',
    concise: 'short and direct'
  };
  const situationMap = {
    general: 'an everyday message',
    work: 'a work message',
    boundary: 'a boundary-setting message',
    apology: 'an apology',
    cancel: 'a cancellation or reschedule message',
    decline: 'a polite refusal',
    followup: 'a follow-up message',
    refund: 'a customer-service request',
    relationship: 'a relationship conversation'
  };
  const refineMap = {
    shorter: 'Rewrite the message so it is much shorter. Keep the same meaning.',
    softer: 'Rewrite the message so it sounds gentler and more considerate. Keep the same meaning.',
    firmer: 'Rewrite the message so it sounds firmer and clearer without sounding hostile. Keep the same meaning.',
    professional: 'Rewrite the message so it sounds polished and professional but still natural. Keep the same meaning.',
    another: 'Write a genuinely different natural version of the message. Keep the same facts and intent.'
  };

  const mode = String(payload.mode || 'write');
  const tone = toneMap[payload.tone] || toneMap.warm;
  const situation = situationMap[payload.situation] || situationMap.general;
  const personName = compact(payload.personName, 60);
  const source = compact(payload.text, 3500);
  const currentMessage = compact(payload.currentMessage, 5000);
  const refinement = refineMap[payload.refine] || '';

  if (refinement && currentMessage) {
    return [
      refinement,
      `Tone: ${tone}.`,
      `Message:\n${currentMessage}`,
      'Output only the rewritten message. No explanation, label, heading, notes, or quotation marks.'
    ].join('\n\n');
  }

  let instruction = 'Write one ready-to-send message based on the details below.';
  if (mode === 'reply') {
    instruction = 'Write only my ready-to-send reply based on what they sent and what I want to communicate below.';
  } else if (mode === 'fix') {
    instruction = 'Rewrite my draft below into one ready-to-send message. Keep the facts and intended meaning.';
  }

  return [
    instruction,
    `Tone: ${tone}.`,
    `Context: ${situation}.`,
    personName ? `Use the name ${personName} only if it naturally belongs in the message.` : '',
    `Details:\n${source}`,
    'Output only the final message I can send. Do not explain, analyze, introduce, label, or quote it. Do not invent facts.'
  ].filter(Boolean).join('\n\n');
}

function cleanOutput(value) {
  let output = String(value || '').trim();
  output = output.replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, '').trim();
  output = output.replace(/^(?:assistant|sparkle|final message|message|rewritten message|revised message|reply|response)\s*:\s*/i, '').trim();
  output = output.replace(/^(?:here(?:'s| is)(?: a| the)?(?: rewritten| revised| polished| shorter| softer| firmer| professional| different| natural)?(?: version| message| reply)?[^:]{0,50}:\s*)/i, '').trim();
  if ((output.startsWith('“') && output.endsWith('”')) || (output.startsWith('"') && output.endsWith('"'))) {
    output = output.slice(1, -1).trim();
  }
  return output.slice(0, 5000);
}

function classifyFailure(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();

  if (self.navigator?.onLine === false) {
    return {
      code: 'sparkle_offline',
      message: 'Sparkle could not finish offline on this device. Connect to the internet once so any missing setup files can download, then try again.'
    };
  }

  if (/quota|storage|disk|space|cache/.test(text)) {
    return {
      code: 'sparkle_storage',
      message: 'Sparkle needs a little more browser storage for its on-device model. Free up some device space or browser storage, then try again.'
    };
  }

  if (/memory|allocation|out of memory|oom/.test(text)) {
    return {
      code: 'sparkle_memory',
      message: 'This device ran low on memory while starting Sparkle. Close a few apps or browser tabs, then try again. Sparkle will use its lighter local engine when possible.'
    };
  }

  if (/network|fetch|download|load|connection/.test(text)) {
    return {
      code: 'sparkle_download',
      message: 'Sparkle could not download one of its setup files. Check your connection and try again. After setup, the model is cached on this device.'
    };
  }

  return {
    code: 'sparkle_compatibility',
    message: 'Sparkle could not start on this browser. Try updating Safari or Chrome, turning off Low Power Mode, or using another device.'
  };
}

async function generate(id, payload, preferLite) {
  const generator = await createGenerator(id, preferLite);
  post(id, 'status', {
    phase: 'generating',
    message: `${activeProfile?.label || 'Sparkle'} is finding the words on your device…`,
    profile: activeProfile?.label || 'Sparkle',
    backend: activeProfile?.device || ''
  });

  const system = [
    'You are Sparkle. Write one natural message the user can send.',
    'Return only the message itself.',
    'Never explain, analyze, introduce, label, or quote your answer.',
    'Keep the user’s facts and intent. Do not invent details.',
    'Keep the writing concise, human, and appropriate for the requested tone.',
    'Do not produce threats, coercion, fraud, impersonation, blackmail, or instructions for wrongdoing.'
  ].join(' ');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: buildUserPrompt(payload || {}) }
  ];

  const another = payload?.refine === 'another';
  const shorter = payload?.refine === 'shorter';
  const options = {
    max_new_tokens: shorter ? 80 : 140,
    do_sample: another,
    repetition_penalty: 1.08
  };
  if (another) {
    options.temperature = 0.72;
    options.top_p = 0.9;
  }

  const output = await generator(messages, options);

  const generated = output?.[0]?.generated_text;
  let text = '';
  if (Array.isArray(generated)) {
    text = generated.at(-1)?.content || '';
  } else {
    text = generated || '';
  }
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
