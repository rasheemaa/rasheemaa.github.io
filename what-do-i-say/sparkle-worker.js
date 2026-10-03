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
    let canTryWebGPU = false;
    if (!preferLite && self.navigator?.gpu) {
      try {
        const adapter = await self.navigator.gpu.requestAdapter();
        canTryWebGPU = Boolean(adapter?.features.has('shader-f16'));
      } catch (_) {}
    }

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
  const source = compact(payload.text, 3500);
  const current = compact(payload.currentMessage, 5000);
  const name = compact(payload.personName, 60);
  const refine = String(payload.refine || '');
  const shorterWords = Math.max(8, Math.floor(current.split(/\s+/).length * 0.7));
  const instruction = ({
    shorter: `Rewrite in at most ${shorterWords} words. Remove filler and combine sentences.`,
    softer: 'Rewrite in a gentle, considerate tone. Make requests polite while keeping the same decision.',
    firmer: 'Rewrite confidently. Replace tentative questions with polite, direct requests. Keep the same decision.',
    professional: 'Rewrite professionally. Use a professional greeting and no contractions.',
    another: 'Rewrite with different sentence structure and wording. Keep the same meaning.'
  })[refine];
  if (instruction && current) return `${instruction} Keep all names, dates, times, amounts, and facts. Return only the rewritten message.\n\n${current}`;
  const task = instruction || (payload.mode === 'fix'
    ? 'Correct my draft spelling and grammar. Preserve my point of view and requests. Do not answer the draft.'
    : payload.mode === 'reply'
      ? 'Write my reply, using my stated intent. Do not speak for the other person.'
      : 'Turn my notes into a message I can send directly to the person.');
  return [
    task,
    instruction ? '' : `Style: ${toneText(payload.tone)}.`,
    name ? `Recipient: ${name}.` : '',
    'Preserve names, dates, times including AM/PM, amounts, and refusals. Do not add promises or reasons.',
    instruction ? `My message to edit:\n${current}` : `My ${payload.mode === 'fix' ? 'draft' : 'notes'}:\n${source}`,
    'Output only my complete message, with no explanation or instructions.'
  ].filter(Boolean).join('\n\n');
}

function buildMessages(payload) {
  const refinementExamples = {
    shorter: ['I wanted to let you know that I cannot join the call tomorrow. Would it be possible to move it to next week?', "I can't join tomorrow's call. Can we move it to next week?"],
    softer: ['I cannot help tomorrow. Ask someone else.', "I'm sorry, but I won't be able to help tomorrow. Could you please ask someone else?"],
    firmer: ["I'm sorry, but I don't think I can help tomorrow. Maybe you could ask someone else?", "I cannot help tomorrow. Please ask someone else."],
    professional: ["hey Lee i cant make the call tomorrow. can we do next week?", "Hello Lee, I am unable to attend tomorrow's call. Would you be available next week?"],
    another: ["Hi Lee, I cannot join tomorrow's call. Could we move it to next week?", "Lee, would next week work for our call? I am unavailable tomorrow."]
  };
  const refinementExample = refinementExamples[payload.refine];
  const example = refinementExample
    ? [`Rewrite this message. Action: ${payload.refine}. Message: ${refinementExample[0]}`, refinementExample[1]]
    : payload.mode === 'fix'
    ? ["Edit my draft: hi Sam i paid $20 for order 42. it arrived broken. i want a refund not a replacement.",
       "Hi Sam, I paid $20 for order 42. It arrived broken. I want a refund, not a replacement."]
    : payload.mode === 'reply'
      ? ["Write my reply. Lee asked if I can help Tuesday. I cannot help Tuesday, but I can help Thursday at 10 AM.",
         "I can't help on Tuesday, but I can help on Thursday at 10 AM."]
      : ["Write a message from my notes: Tell Alex I cannot come to lunch tomorrow. Ask if we can meet next week instead.",
         "Hi Alex, I can't come to lunch tomorrow. Could we meet next week instead?"];
  return [
    { role: 'system', content: payload.refine ? 'You are a copy editor. Follow the requested editing task. Return only the edited message.' : 'You edit and write messages on behalf of the user. Speak as the user directly to the recipient. Keep their facts and intent. Output just the message.' },
    { role: 'user', content: example[0] },
    { role: 'assistant', content: example[1] },
    { role: 'user', content: buildPrompt(payload) }
  ];
}

function anchors(text) {
  return [...new Set(String(text).match(/\$?\d+(?:[.,:/-]\d+)*(?:\s*(?:AM|PM|a\.m\.|p\.m\.|%))?|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi) || [])];
}

function outputProblem(text, payload) {
  if (payload.refine && text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === String(payload.currentMessage || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')) return 'Use different wording to make the requested change. Do not copy the original.';
  if (payload.refine === 'shorter' && String(payload.currentMessage || '').length > 80 && text.length > payload.currentMessage.length * 0.85) return 'Make the message at least 15 percent shorter without losing facts. Combine sentences and remove filler.';
  if (!text || /<\/?think>|<\|/i.test(text)) return 'The message was empty or contained model markup.';
  if (!/[.!?…]["”')]*$/.test(text)) return 'Finish the last sentence.';
  if (!payload.refine && payload.mode !== 'fix' && /^(?:tell|ask|write|reply should|my reply should)\b/i.test(text)) return 'Speak directly to the recipient. Do not repeat my instructions.';
  const reference = payload.refine ? payload.currentMessage : payload.text;
  const normalized = text.toLowerCase().replace(/\s/g, '');
  const missing = anchors(reference).filter(value => !normalized.includes(value.toLowerCase().replace(/\s/g, '')));
  if (missing.length) return `Keep these exact details: ${missing.join(', ')}.`;
  const referenceNumbers = new Set(anchors(`${payload.text} ${payload.currentMessage || ''} ${payload.personName || ''}`).filter(v => /\d/.test(v)).map(v => v.toLowerCase().replace(/\s/g, '')));
  if (anchors(text).filter(v => /\d/.test(v)).some(v => !referenceNumbers.has(v.toLowerCase().replace(/\s/g, '')))) return 'Do not introduce or change numbers, dates, amounts or times.';
  return '';
}

function cleanOutput(value) {
  let output = String(value || '').trim();
  output = output.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (/^<think>/i.test(output)) return '';
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
  if (error?.code === 'sparkle_quality') return { code: error.code, message: error.message };
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

  const messages = buildMessages(payload || {});
  const another = payload?.refine === 'another';
  const wordCount = String(payload?.refine ? payload.currentMessage : payload?.text || '').split(/\s+/).length;
  const tokenLimit = Math.min(512, Math.max(160, Math.ceil(wordCount * 2.2)));
  let text = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const chatPrompt = generator.tokenizer.apply_chat_template(messages, {
      tokenize: false,
      add_generation_prompt: true,
      enable_thinking: false
    });
    const output = await generator(chatPrompt, {
      max_new_tokens: tokenLimit,
      do_sample: another,
      ...(another ? { temperature: 0.7, top_p: 0.8, top_k: 20 } : {}),
      repetition_penalty: 1.0,
      return_full_text: false
    });
    text = cleanOutput(output?.[0]?.generated_text || '');
    const problem = outputProblem(text, payload || {});
    if (!problem) break;
    if (attempt === 1) {
      const error = new Error('Sparkle could not keep all the details reliably. Try a shorter draft with the key facts. Your previous message has not been replaced.');
      error.code = 'sparkle_quality';
      throw error;
    }
    messages[messages.length - 1].content += `\n\nImportant: ${problem}`;
    post(id, 'status', { phase: 'checking', message: 'Sparkle is checking the details before showing your message…' });
  }

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
