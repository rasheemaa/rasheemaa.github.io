import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

const PROFILE = {
  model: 'onnx-community/SmolLM2-135M-Instruct-ONNX',
  device: 'wasm',
  dtype: 'q8',
  label: 'Sparkle Mobile',
  approxDownload: '~140 MB'
};

let generatorPromise = null;
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
    profile: PROFILE.label,
    backend: PROFILE.device
  });
}

async function createGenerator(id) {
  if (generatorPromise) return generatorPromise;
  progressRequestId = id;
  generatorPromise = (async () => {
    post(id, 'status', {
      phase: 'loading',
      message: `Loading ${PROFILE.label} on this iPad…`,
      profile: PROFILE.label,
      approxDownload: PROFILE.approxDownload,
      backend: PROFILE.device
    });
    const generator = await pipeline('text-generation', PROFILE.model, {
      device: PROFILE.device,
      dtype: PROFILE.dtype,
      progress_callback: progress
    });
    post(id, 'status', {
      phase: 'ready',
      message: `${PROFILE.label} is ready on this device.`,
      profile: PROFILE.label,
      backend: PROFILE.device
    });
    return generator;
  })();

  try {
    return await generatorPromise;
  } catch (error) {
    generatorPromise = null;
    throw error;
  } finally {
    progressRequestId = null;
  }
}

function compact(value, max = 3200) {
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

function replyIntent(text) {
  const source = compact(text, 3200);
  const marker = /\b(?:i want to say|i want my reply to (?:say|communicate)|i want to tell (?:them|him|her)|i need to say|i need my reply to (?:say|communicate)|my reply should (?:say|communicate)|reply that|respond that)\b\s*[:,-]?\s*/ig;
  let match;
  let last = null;
  while ((match = marker.exec(source))) last = match;
  if (!last) return source;
  const intent = source.slice(last.index + last[0].length).trim();
  return intent.length >= 4 ? intent : source;
}

function buildPrompt(payload) {
  const source = compact(payload.text, 3200);
  const current = compact(payload.currentMessage, 4200);
  const name = compact(payload.personName, 60);
  const refine = String(payload.refine || '');
  const instruction = ({
    shorter: 'Rewrite this message noticeably shorter. Remove filler but preserve every concrete fact, name, date, time, amount, request, refusal, and question.',
    softer: 'Rewrite this message in a gentler, considerate tone while keeping the same facts and decision.',
    firmer: 'Rewrite this message confidently and respectfully. Keep every refusal, fact, name, date, time, and amount. Remove unnecessary apologies.',
    professional: 'Rewrite this message professionally with complete natural sentences. Preserve every concrete fact and decision.',
    another: 'Rewrite this message with different wording and sentence structure while keeping exactly the same meaning and facts.'
  })[refine];

  if (instruction && current) {
    return `${instruction}\n\nReturn only the complete sendable message.\n\nMessage:\n${current}`;
  }

  if (payload.mode === 'fix') {
    return `Correct spelling, grammar, and wording in my draft. Preserve my point of view, facts, requests, refusals, names, dates, times, and amounts. Do not answer the draft. Return only the corrected sendable message.\n\nDraft:\n${source}`;
  }

  if (payload.mode === 'reply') {
    const intent = replyIntent(source);
    return `Write my reply to the sender. Speak as me in first person and address the sender as “you.” Preserve who feels or does each thing, every concrete fact, refusal, request, name, date, time, and amount. Style: ${toneText(payload.tone)}.${name ? ` The sender is ${name}.` : ''}\n\nConversation and my instructions:\n${source}${intent !== source ? `\n\nWhat I want my reply to communicate:\n${intent}` : ''}\n\nReturn only my complete sendable reply.`;
  }

  return `Turn my notes into a message I can send directly to the recipient. Carry out instructions such as “tell Brandon” or “ask Jordan” instead of repeating those instructions. Preserve every fact, refusal, request, name, date, time, and amount. Do not invent reasons, promises, dates, or events. Style: ${toneText(payload.tone)}.${name ? ` Recipient: ${name}. Address ${name} directly.` : ''}\n\nMy notes:\n${source}\n\nReturn only the complete sendable message.`;
}

function buildMessages(payload) {
  return [
    {
      role: 'system',
      content: 'You are Sparkle, a focused communication assistant. Understand the user’s intended meaning, preserve all concrete facts and decisions, and return only one natural message that is ready to send. Never explain your work.'
    },
    { role: 'user', content: buildPrompt(payload || {}) }
  ];
}

function normalizeTimes(value) {
  return String(value || '').replace(/\b(0?[1-9]|1[0-2])(?::00)?\s*([ap])\.?m\.?(?!\w)/gi,
    (_match, hour, period) => `${Number(hour)} ${period.toUpperCase()}M`);
}

function anchors(value) {
  return [...new Set(normalizeTimes(value).match(/\$?\d+(?:[.,:/-]\d+)*(?:\s*(?:AM|PM|%))?|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi) || [])];
}

function cleanOutput(value) {
  let output = String(value || '').trim();
  output = output.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  output = output.replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, '').trim();
  output = output.replace(/^(?:assistant|sparkle|final message|message|rewritten message|revised message|reply|response|rewrite)\s*:\s*/i, '').trim();
  output = output.replace(/^(?:here(?:'s| is)(?: a| the)?(?: rewritten| revised| polished)?(?: message| reply)?\s*:?\s*)/i, '').trim();
  return output.replace(/\s{2,}/g, ' ').trim();
}

function sentenceClauses(value) {
  return (String(value || '').match(/[^.!?\n]+[.!?]?/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function negativeClauses(value) {
  const negative = /\b(?:cannot|can['’]t|won['’]t|will not|do not|don['’]t|not|no|unable|unavailable|decline)\b/i;
  return sentenceClauses(value)
    .filter((sentence) => negative.test(sentence))
    .slice(0, 2);
}

function explicitFirstPersonBoundaries(value) {
  const firstPersonBoundary = /\bi\s+(?:do not|don['’]t|cannot|can['’]t|won['’]t|will not|am not|never)\b/i;
  return sentenceClauses(value)
    .filter((sentence) => sentence && firstPersonBoundary.test(sentence))
    .slice(0, 2);
}

const CONTENT_STOPWORDS = new Set([
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours',
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'for', 'of', 'in', 'on', 'at',
  'with', 'from', 'by', 'as', 'that', 'this', 'it', 'is', 'am', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'
]);

function contentTokens(value) {
  return (String(value || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter((token) => token.length > 1 && !CONTENT_STOPWORDS.has(token));
}

function firstPersonFactClauses(value) {
  return sentenceClauses(value)
    .filter((sentence) => /^i\b/i.test(sentence))
    .filter((sentence) => contentTokens(sentence).length >= 2)
    .slice(0, 4);
}

function missingFirstPersonFactClauses(text, reference) {
  const outputTokens = new Set(contentTokens(text));
  return firstPersonFactClauses(reference).filter((clause) => {
    const tokens = [...new Set(contentTokens(clause))];
    const present = tokens.filter((token) => outputTokens.has(token)).length;
    return present < Math.max(1, Math.ceil(tokens.length * 0.6));
  });
}

function askDirectives(value) {
  return sentenceClauses(value).flatMap((sentence) => {
    const askIf = sentence.match(/^ask(?:\s+.+?)?\s+(?:if|whether)\s+(.+?)[.!?]?$/i);
    if (askIf) return [{ kind: 'question', detail: askIf[1].trim(), clause: sentence }];
    const askTo = sentence.match(/^ask\s+.+?\s+to\s+(.+?)[.!?]?$/i);
    if (askTo) return [{ kind: 'action', detail: askTo[1].trim(), clause: sentence }];
    return [];
  }).slice(0, 3);
}

function missingAskDirectives(text, reference) {
  const outputTokens = new Set(contentTokens(text));
  const explicitQuestion = /\?|\b(?:let me know|tell me|can you|could you|would you|please confirm|please let me know)\b/i;
  return askDirectives(reference).filter((request) => {
    const tokens = [...new Set(contentTokens(request.detail))];
    const present = tokens.filter((token) => outputTokens.has(token)).length;
    const hasDetail = present >= Math.max(1, Math.ceil(tokens.length * 0.6));
    if (!hasDetail) return true;
    return request.kind === 'question' && !explicitQuestion.test(text);
  });
}

function tellDirectives(value) {
  return sentenceClauses(value).flatMap((sentence) => {
    const match = sentence.match(/^tell\s+([^,.;!?]+?)\s+(.+?)[.!?]?$/i);
    if (!match) return [];
    return [{ target: match[1].trim(), detail: match[2].trim(), clause: sentence }];
  }).slice(0, 3);
}

function repeatedTellDirectives(text, reference) {
  const lower = String(text || '').toLowerCase();
  return tellDirectives(reference).filter((request) => lower.includes(`tell ${request.target.toLowerCase()}`));
}

function referenceText(payload) {
  return payload.refine
    ? String(payload.currentMessage || '')
    : payload.mode === 'reply'
      ? replyIntent(payload.text)
      : String(payload.text || '');
}

function restoreExplicitFirstPersonBoundary(text, payload) {
  const output = cleanOutput(text);
  const outputNegative = /\b(?:cannot|can['’]t|won['’]t|will not|do not|don['’]t|not|no|unable|unavailable|decline)\b/i;
  if (!output || outputNegative.test(output)) return output;
  const boundaries = explicitFirstPersonBoundaries(referenceText(payload || {}));
  if (!boundaries.length) return output;
  return cleanOutput(`${output} ${boundaries.join(' ')}`);
}

function directAddressAction(value) {
  return String(value || '')
    .replace(/\b(?:he|she|they)\b/gi, 'you')
    .replace(/\b(?:his|her|their)\b/gi, 'your')
    .trim();
}

function sourcePreservingWriteFallback(payload) {
  const source = compact(payload?.text, 3200);
  const name = compact(payload?.personName, 60);
  if (!source) return '';
  let inferredRecipient = name;
  const sentences = sentenceClauses(source).map((sentence) => {
    const tell = sentence.match(/^tell\s+([^,.;!?]+?)\s+(.+?)([.!?]?)$/i);
    if (tell) {
      if (!inferredRecipient) inferredRecipient = tell[1].trim();
      const detail = directAddressAction(tell[2]).replace(/[.!?]+$/, '');
      return `${detail}${tell[3] || '.'}`;
    }
    const askIf = sentence.match(/^ask(?:\s+.+?)?\s+(?:if|whether)\s+(.+?)([.!?]?)$/i);
    if (askIf) {
      const condition = directAddressAction(askIf[1]).replace(/[.!?]+$/, '');
      return `Please let me know if ${condition}.`;
    }
    const askTo = sentence.match(/^ask\s+(.+?)\s+to\s+(.+?)([.!?]?)$/i);
    if (askTo) {
      const action = directAddressAction(askTo[2]).replace(/[.!?]+$/, '');
      return `Please ${action}.`;
    }
    return sentence;
  });
  const body = sentences.join(' ').trim();
  return cleanOutput(inferredRecipient ? `Hi ${inferredRecipient}, ${body}` : body);
}

function qualityIssue(text, payload) {
  if (!text || /<\/?think>|<\|/i.test(text)) return 'Return one complete message with no model markup.';
  const reference = referenceText(payload);
  const normalized = normalizeTimes(text).toLowerCase().replace(/\s/g, '');
  const missing = anchors(reference).filter((value) => !normalized.includes(value.toLowerCase().replace(/\s/g, '')));
  if (missing.length) return `Keep these exact details: ${missing.join(', ')}.`;
  const missingFacts = missingFirstPersonFactClauses(text, reference);
  if (missingFacts.length) return `Keep this first-person fact or request: ${missingFacts.map((clause) => `“${clause}”`).join(' ')}`;
  const missingRequests = missingAskDirectives(text, reference);
  if (missingRequests.length) return `Carry out this request explicitly instead of dropping it: ${missingRequests.map((request) => `“${request.clause}”`).join(' ')}`;
  const repeatedTell = repeatedTellDirectives(text, reference);
  if (repeatedTell.length) return `Address the recipient directly instead of repeating this instruction: ${repeatedTell.map((request) => `“${request.clause}”`).join(' ')}`;
  const negative = /\b(?:cannot|can['’]t|won['’]t|will not|do not|don['’]t|not|no|unable|unavailable|decline)\b/i;
  if (negative.test(reference) && !negative.test(text)) {
    const clauses = negativeClauses(reference);
    if (clauses.length) return `Keep this explicit refusal or negative statement: ${clauses.map((clause) => `“${clause}”`).join(' ')}`;
    return 'Keep the refusal or negative statement explicit.';
  }
  if (payload.refine === 'another') {
    const a = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const b = String(payload.currentMessage || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (a === b) return 'Use different wording while keeping the same meaning.';
  }
  return '';
}

function classifyFailure(error) {
  if (error?.code === 'sparkle_quality') return { code: error.code, message: error.message };
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (self.navigator?.onLine === false) return { code: 'sparkle_offline', message: 'Sparkle Mobile needs an internet connection the first time so its setup files can download.' };
  if (/quota|storage|disk|space|cache/.test(text)) return { code: 'sparkle_storage', message: 'Sparkle Mobile needs a little more Safari storage. Free some device space and try again.' };
  if (/memory|allocation|out of memory|oom/.test(text)) return { code: 'sparkle_memory', message: 'Safari ran low on memory while starting Sparkle. Close other tabs or apps and try again.' };
  if (/network|fetch|download|load|connection/.test(text)) return { code: 'sparkle_download', message: 'Sparkle Mobile could not download one of its setup files. Check your connection and try again.' };
  return { code: 'sparkle_compatibility', message: 'Sparkle Mobile could not start in Safari. Refresh the page and try again.' };
}

async function generate(id, payload) {
  const generator = await createGenerator(id);
  post(id, 'status', {
    phase: 'generating',
    message: 'Sparkle Mobile is finding the words on your iPad…',
    profile: PROFILE.label,
    backend: PROFILE.device
  });

  const messages = buildMessages(payload || {});
  const inputWords = String(payload?.refine ? payload.currentMessage : payload?.text || '').trim().split(/\s+/).filter(Boolean).length;
  const tokenLimit = Math.min(220, Math.max(72, Math.ceil(inputWords * 2.4)));
  let text = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const chatPrompt = generator.tokenizer.apply_chat_template(messages, {
      tokenize: false,
      add_generation_prompt: true
    });
    const output = await generator(chatPrompt, {
      max_new_tokens: tokenLimit,
      do_sample: payload?.refine === 'another',
      ...(payload?.refine === 'another' ? { temperature: 0.7, top_p: 0.85 } : {}),
      repetition_penalty: 1.05,
      return_full_text: false
    });
    text = cleanOutput(output?.[0]?.generated_text || '');
    let issue = qualityIssue(text, payload || {});
    if (!issue) break;
    if (attempt === 1) {
      const repaired = restoreExplicitFirstPersonBoundary(text, payload || {});
      const repairedIssue = qualityIssue(repaired, payload || {});
      if (!repairedIssue) {
        text = repaired;
        break;
      }
      if (payload?.mode === 'write') {
        const fallback = sourcePreservingWriteFallback(payload || {});
        const fallbackIssue = qualityIssue(fallback, payload || {});
        if (!fallbackIssue) {
          text = fallback;
          break;
        }
      }
      issue = repairedIssue;
      const error = new Error(`Sparkle could not keep all the details reliably. ${issue} Your previous message has not been replaced. Please try again.`);
      error.code = 'sparkle_quality';
      throw error;
    }
    messages[messages.length - 1].content += `\n\nImportant: ${issue}`;
    post(id, 'status', { phase: 'checking', message: 'Sparkle Mobile is checking the details before showing your message…', backend: PROFILE.device });
  }

  post(id, 'result', {
    message: text,
    profile: PROFILE.label,
    backend: PROFILE.device
  });
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'generate' || !data.id) return;
  generate(data.id, data.payload || {}).catch((error) => {
    post(data.id, 'error', classifyFailure(error));
  });
});