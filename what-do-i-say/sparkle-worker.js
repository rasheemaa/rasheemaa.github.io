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

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function replyIntent(text) {
  const source = compact(text, 3500);
  const marker = /\b(?:i want to say|i want my reply to (?:say|communicate)|i want to tell (?:them|him|her)|i need to say|i need my reply to (?:say|communicate)|my reply should (?:say|communicate)|reply that|respond that)\b\s*[:,-]?\s*/ig;
  let match;
  let last = null;
  while ((match = marker.exec(source))) last = match;
  if (!last) return source;
  const intent = source.slice(last.index + last[0].length).trim();
  return intent.length >= 4 ? intent : source;
}

function recipientPerspectiveHint(source, recipient) {
  if (!recipient) return '';
  const escaped = escapeRegex(recipient);
  if (!new RegExp(`\\b(?:ask|tell)\\s+${escaped}\\b`, 'i').test(source)) return '';
  return `Perspective check: “ask ${recipient}…” or “tell ${recipient}…” in my notes is an instruction for this outgoing message, not wording to copy. Carry out that request directly to ${recipient} using “you/your”.`;
}

function buildPrompt(payload) {
  const source = payload.mode === 'write' && !payload.refine
    ? directAddressGuard(compact(payload.text, 3500), payload)
    : compact(payload.text, 3500);
  const current = compact(payload.currentMessage, 5000);
  const name = compact(payload.personName, 60);
  const refine = String(payload.refine || '');
  const shorterWords = Math.max(8, Math.floor(current.split(/\s+/).length * 0.8));
  const instruction = ({
    shorter: `Rewrite in at most ${shorterWords} words. Remove filler and combine sentences, but preserve every concrete fact, name, date, time, request, and refusal.`,
    softer: 'Rewrite in a gentle, considerate tone. Make requests polite while keeping the same decision.',
    firmer: 'Rewrite confidently with different wording. Keep every refusal, name, date, and time. Remove unnecessary apologies. Do not add dangling words such as “Please” by themselves.',
    professional: 'Rewrite professionally. Use a natural professional greeting, no contractions, and complete sentences. Keep every concrete fact and decision.',
    another: 'Rewrite with different sentence structure and wording. Keep the same meaning.'
  })[refine];
  if (instruction && current) {
    const preserve = refine === 'firmer'
      ? 'Keep all names, dates, times, amounts, and refusals.'
      : 'Keep all names, dates, times, amounts, refusals, and questions.';
    return `${instruction} ${preserve} Return only the rewritten message.\n\n${current}`;
  }
  const task = instruction || (payload.mode === 'fix'
    ? 'Correct my draft spelling and grammar. Preserve my point of view and requests. Do not answer the draft.'
    : payload.mode === 'reply'
      ? 'Write my reply using my stated intent. Keep who feels or does each thing exactly correct. If my intent says “I am not angry at them,” the reply means “I am not angry at you,” never “you are not angry at me.” Address the sender directly as “you” when my intent refers to that person as them, him, or her.'
      : 'Turn my notes into a message I can send directly to the recipient. Treat note-taking directions such as “ask the recipient…” or “tell the recipient…” as instructions to perform, never as wording to repeat.');
  const replyIntentText = payload.mode === 'reply' ? replyIntent(source) : '';
  return [
    task,
    instruction ? '' : `Style: ${toneText(payload.tone)}.`,
    name ? `Recipient: ${name}. Address ${name} directly.` : '',
    payload.mode === 'write' ? recipientPerspectiveHint(source, name) : '',
    'Preserve the user’s facts, important people and relationships, names, dates, times including AM/PM, amounts, requests, and refusals. Do not invent promises, reasons, people, dates, or events.',
    payload.mode === 'reply' && replyIntentText !== source ? `Conversation and incoming message:\n${source}\n\nMy reply intent:\n${replyIntentText}` : '',
    instruction ? `My message to edit:\n${current}` : payload.mode === 'reply' && replyIntentText !== source ? '' : `My ${payload.mode === 'fix' ? 'draft' : 'notes'}:\n${source}`,
    'Output only my complete sendable message, with no explanation or instructions.'
  ].filter(Boolean).join('\n\n');
}

function buildMessages(payload) {
  if (payload.refine) {
    return [
      { role: 'system', content: 'You are Sparkle, a focused communication editor. Understand the intended meaning first, preserve every concrete fact and decision, then make only the requested edit. Do not borrow facts or wording from unrelated examples. Silently verify that the result is natural and sendable. Return only the edited message.' },
      { role: 'user', content: buildPrompt(payload) }
    ];
  }

  if (payload.mode === 'fix') {
    return [
      { role: 'system', content: 'You are Sparkle, a focused communication editor. Correct the user’s draft without changing their facts, point of view, requests, or decision. Silently verify the result is natural and sendable. Return only the edited message.' },
      { role: 'user', content: 'Edit my draft: hi Sam i paid $20 for order 42. it arrived broken. i want a refund not a replacement.' },
      { role: 'assistant', content: 'Hi Sam, I paid $20 for order 42. It arrived broken. I want a refund, not a replacement.' },
      { role: 'user', content: buildPrompt(payload) }
    ];
  }

  const system = payload.mode === 'reply'
    ? 'You are Sparkle. Understand what the user actually wants to communicate, preserve their facts, stance, and who feels or does each thing, then write a direct reply as the user to the sender. Use first person for the user and address the sender as “you.” Never reverse the speaker and recipient. Silently verify the reply is natural, complete, and ready to send. Output only the sendable reply.'
    : 'You are Sparkle. Understand what the user actually wants to communicate, preserve their facts and stance, then write the outgoing message as the user to the recipient. Note-taking directions such as “ask Priya” or “tell Jordan” are instructions to perform, not phrases to copy. Address the recipient directly as “you/your” where appropriate. Silently verify the message is natural, complete, and ready to send. Output only the sendable message.';

  return [
    { role: 'system', content: system },
    { role: 'user', content: buildPrompt(payload) }
  ];
}

function anchors(text) {
  return [...new Set(normalizeTimes(text).match(/\$?\d+(?:[.,:/-]\d+)*(?:\s*(?:AM|PM|%))?|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi) || [])];
}

function normalizeTimes(value) {
  return String(value || '').replace(/\b(0?[1-9]|1[0-2])(?::00)?\s*([ap])\.?m\.?(?!\w)/gi,
    (_match, hour, period) => `${Number(hour)} ${period.toUpperCase()}M`);
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function outputProblem(text, payload) {
  if (payload.refine && text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === String(payload.currentMessage || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')) return 'Use different wording to make the requested change. Do not copy the original.';
  if (payload.refine === 'shorter' && wordCount(payload.currentMessage) > 12 && wordCount(text) > Math.ceil(wordCount(payload.currentMessage) * 0.85)) return 'Make the message meaningfully shorter without losing any facts. Combine sentences and remove filler.';
  if (!text || /<\/?think>|<\|/i.test(text)) return 'The message was empty or contained model markup.';
  if (!payload.refine && payload.mode !== 'fix' && /^(?:tell|ask|write|reply should|my reply should)\b/i.test(text)) return 'Speak directly to the recipient. Do not repeat my instructions.';
  const reference = payload.refine ? payload.currentMessage : payload.mode === 'reply' ? replyIntent(payload.text) : payload.text;
  const negative = /\b(?:cannot|can't|won't|don't|dont|not|no|unable|unavailable|decline)\b/i;
  const writeRefusal = payload.mode === 'write' && /\b(?:cannot|can't|can’t|won't|won’t|will not|unable|unavailable|decline)\b/i.test(reference);
  if ((payload.refine || payload.mode === 'fix' || payload.mode === 'reply' || writeRefusal) && negative.test(reference) && !negative.test(text)) return 'Preserve my refusal or negative statement explicitly.';
  if (payload.refine !== 'firmer' && (payload.refine || payload.mode === 'fix' || payload.mode === 'reply') && String(reference).includes('?') && !/[?]|\b(?:please|let me know|confirm)\b/i.test(text)) return 'Keep my question or request for confirmation.';
  const normalized = normalizeTimes(text).toLowerCase().replace(/\s/g, '');
  const missing = anchors(reference).filter(value => !normalized.includes(value.toLowerCase().replace(/\s/g, '')));
  if (missing.length) return `Keep these exact details: ${missing.join(', ')}.`;
  const allowedNumberSource = payload.mode === 'reply' && !payload.refine ? `${replyIntent(payload.text)} ${payload.personName || ''}` : `${payload.text} ${payload.currentMessage || ''} ${payload.personName || ''}`;
  const referenceNumbers = new Set(anchors(allowedNumberSource).filter(v => /\d/.test(v)).map(v => v.toLowerCase().replace(/\s/g, '')));
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
  output = output.replace(/\s*Important:\s*(?:Keep these exact details:|Do not introduce or change numbers|Preserve my refusal|Keep my question|Use different wording|Make the message meaningfully shorter)[\s\S]*$/i, '').trim();
  if ((output.startsWith('“') && output.endsWith('”')) || (output.startsWith('"') && output.endsWith('"'))) {
    output = output.slice(1, -1).trim();
  }
  if (output && !/[.!?…]["”')]*$/.test(output)) output += '.';
  return output.slice(0, 5000);
}

function directAddressGuard(text, payload) {
  if (payload?.refine || payload?.mode !== 'write') return text;
  const recipient = compact(payload.personName, 60)
    || compact(payload.text).match(/^(?:Please\s+)?tell\s+(.{1,60}?)\s+(?:that\s+)?(?:I|we)\b/i)?.[1]
    || '';
  // An unnamed confirmation request is still an instruction to address the reader.
  text = text.replace(/(^|[.!?]\s+)Ask\s+(if|whether)\s+/ig, '$1Please let me know $2 ');
  if (!recipient) return text;
  const escaped = escapeRegex(recipient);
  const copiedConfirmation = new RegExp(`\\bAsk\\s+${escaped}\\s+to\\s+confirm\\s+(?:she|he|they)\\s+received\\s+(?:the|this)\\s+message\\.?`, 'ig');
  return text
    .replace(copiedConfirmation, 'Please confirm you received this message.')
    .replace(new RegExp(`(^|[.!?]\\s+)Ask\\s+${escaped}\\s+(if|whether)\\s+`, 'ig'), '$1Please let me know $2 ')
    .replace(new RegExp(`(^|[.!?]\\s+)Tell\\s+${escaped}\\s+(?:that\\s+)?(?=I\\b)`, 'ig'), '$1')
    .replace(/\s{2,}/g, ' ').trim();
}

function replyPerspectiveGuard(text, payload) {
  if (payload?.refine || payload?.mode !== 'reply') return text;
  const intent = replyIntent(payload.text);
  const feeling = intent.match(/\bI\s+(?:am|['’]m)\s+not\s+(mad|angry|upset)\s+(?:at|with)\s+(?:them|him|her)\b/i);
  if (!feeling) return text;
  const reversed = /^\s*you(?:'re| are)\s+not\s+(?:mad|angry|upset)\s+(?:at|with)\s+me\s*[,.;:!-]?\s*/i;
  if (!reversed.test(text)) return text;
  return cleanOutput(text.replace(reversed, `I'm not ${feeling[1].toLowerCase()} at you. `));
}

function safeShorterFallback(value) {
  let output = cleanOutput(value);
  output = output.replace(/^Hi\s+([^,\n]{1,60}),\s*/i, '$1, ');
  output = output.replace(/\bI wanted to let you know that\b\s*/gi, '');
  output = output.replace(/\bI just wanted to let you know that\b\s*/gi, '');
  output = output.replace(/\b(?:just|really|actually)\b\s*/gi, '');
  output = output.replace(/\bon\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, '$1');
  output = output.replace(/\bI'm sorry\b/gi, 'Sorry');
  output = output.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return cleanOutput(output);
}

function professionalFallback(value, recipient) {
  let output = cleanOutput(value)
    .replace(/\bcan't\b/gi, 'cannot')
    .replace(/\bwon't\b/gi, 'will not')
    .replace(/\bdon't\b/gi, 'do not')
    .replace(/\bdoesn't\b/gi, 'does not')
    .replace(/\bdidn't\b/gi, 'did not')
    .replace(/\bI'm\b/g, 'I am')
    .replace(/\bI'll\b/g, 'I will')
    .replace(/\bI've\b/g, 'I have')
    .replace(/\bwe're\b/gi, 'we are')
    .replace(/\bwe'll\b/gi, 'we will')
    .replace(/\s+(?:Sorry|Please)\.$/i, '.');
  const name = compact(recipient, 60);
  if (name) {
    const directName = new RegExp(`^${escapeRegex(name)},\\s*`, 'i');
    if (directName.test(output)) output = output.replace(directName, `Hello ${name}, `);
    else if (!/^(?:Hello|Hi|Dear)\b/i.test(output)) output = `Hello ${name}, ${output}`;
  }
  return cleanOutput(output.replace(/\s{2,}/g, ' ').trim());
}

function polishRefinement(text, payload) {
  if (payload?.refine === 'firmer') {
    return cleanOutput(text.replace(/\s+(?:Please|Sorry)\.$/i, '.'));
  }
  if (payload?.refine === 'professional') {
    return professionalFallback(text, payload.personName);
  }
  return text;
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
  const inputWords = wordCount(payload?.refine ? payload.currentMessage : payload?.text || '');
  const tokenLimit = Math.min(512, Math.max(160, Math.ceil(inputWords * 2.2)));
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
    text = directAddressGuard(cleanOutput(output?.[0]?.generated_text || ''), payload || {});
    text = replyPerspectiveGuard(text, payload || {});
    text = polishRefinement(text, payload || {});
    const problem = outputProblem(text, payload || {});
    if (!problem) break;
    if (attempt === 1) {
      if (payload?.refine === 'shorter') {
        const fallback = safeShorterFallback(payload.currentMessage);
        if (!outputProblem(fallback, payload || {})) {
          text = fallback;
          break;
        }
      }
      if (payload?.refine === 'professional') {
        const fallback = professionalFallback(payload.currentMessage, payload.personName);
        if (!outputProblem(fallback, payload || {})) {
          text = fallback;
          break;
        }
      }
      const issue = problem.includes('refusal') ? 'The refusal did not stay explicit.'
        : problem.startsWith('Keep these exact details') ? 'A date, time, or amount was missing.'
        : problem.startsWith('Do not introduce') ? 'A date, time, or amount changed.'
        : problem.includes('question') ? 'The question or confirmation request was lost.'
        : problem.includes('different wording') ? 'The requested wording change was not made.'
        : problem.includes('shorter') ? 'The message was not made shorter.'
        : problem.includes('recipient') ? 'The wording still contained instructions instead of a direct message.'
        : 'The result was not a complete message.';
      const error = new Error(`Sparkle could not keep all the details reliably. ${issue} Your previous message has not been replaced. Please try again.`);
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
