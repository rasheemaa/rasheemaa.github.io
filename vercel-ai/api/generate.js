import { generateText } from 'ai';

const MODEL = 'openai/gpt-5.6-sol';
const BUILD = 'diag-2026-10-02-1';
const ALLOWED_ORIGINS = new Set([
  'https://thesheemaedit.com',
  'https://www.thesheemaedit.com',
  'https://rasheemaa.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

const MODES = new Set(['write', 'reply', 'fix']);
const TONES = new Set(['warm', 'direct', 'professional', 'casual', 'firm', 'concise']);
const SITUATIONS = new Set([
  'general',
  'work',
  'boundary',
  'apology',
  'cancel',
  'decline',
  'followup',
  'refund',
  'relationship'
]);
const REFINEMENTS = new Set(['shorter', 'softer', 'firmer', 'professional', 'another']);

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function text(value, max = 3500) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function modeInstruction(mode) {
  if (mode === 'reply') {
    return 'Write a ready-to-send reply to the message the user received. Respond from the user’s perspective. Do not invent facts, promises, dates, diagnoses, legal claims, or events. If the user included what they want the reply to accomplish, prioritize that.';
  }
  if (mode === 'fix') {
    return 'Rewrite the user’s draft while preserving its meaning and factual content. Improve clarity, flow, tone, and sendability. Do not add new facts or commitments.';
  }
  return 'Write the ready-to-send message the user is trying to communicate. Preserve the facts and intent they gave you. Do not invent details.';
}

function refinementInstruction(refine) {
  const map = {
    shorter: 'Make the current message noticeably shorter while preserving the important meaning.',
    softer: 'Make the current message gentler and more tactful without making it vague or weak.',
    firmer: 'Make the current message firmer, clearer, and more boundaried without becoming hostile or threatening.',
    professional: 'Make the current message polished and professional while keeping it natural.',
    another: 'Create a genuinely different version with the same intent, facts, situation, and selected tone.'
  };
  return map[refine] || '';
}

function buildPrompt({ mode, tone, situation, personName, userText, refine, currentMessage }) {
  const situationLabels = {
    general: 'everyday message',
    work: 'work',
    boundary: 'setting a boundary',
    apology: 'apology',
    cancel: 'canceling or rescheduling',
    decline: 'saying no',
    followup: 'following up',
    refund: 'refund, replacement, or customer service resolution',
    relationship: 'relationship conversation'
  };

  const toneLabels = {
    warm: 'warm and human',
    direct: 'direct and clear',
    professional: 'professional and polished',
    casual: 'casual and natural',
    firm: 'firm and respectful',
    concise: 'brief and concise'
  };

  const lines = [
    `Task: ${modeInstruction(mode)}`,
    `Situation: ${situationLabels[situation] || 'everyday message'}.`,
    `Tone: ${toneLabels[tone] || 'warm and human'}.`,
    personName ? `Person’s first name, if useful for the greeting: ${personName}.` : '',
    `User input:\n${userText}`
  ];

  if (refine && currentMessage) {
    lines.push(`Current generated message:\n${currentMessage}`);
    lines.push(`Refinement request: ${refinementInstruction(refine)}`);
  }

  return lines.filter(Boolean).join('\n\n');
}

function safeDiagnostic(error) {
  const status = Number(error?.statusCode || error?.status || error?.cause?.statusCode || error?.cause?.status || 0) || null;
  const message = text(
    error?.message ||
    error?.cause?.message ||
    error?.responseBody ||
    error?.cause?.responseBody ||
    'unknown error',
    500
  );
  return {
    name: text(error?.name || error?.constructor?.name || 'Error', 80),
    status,
    message
  };
}

async function runModel({ system, prompt, maxOutputTokens = 320 }) {
  return generateText({
    model: MODEL,
    system,
    prompt,
    maxOutputTokens,
    abortSignal: AbortSignal.timeout(15000)
  });
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    if (String(req.query?.selftest || '') === '1') {
      try {
        const started = Date.now();
        const result = await runModel({
          system: 'Return only the requested sentence.',
          prompt: 'Reply with exactly: What Do I Say AI is working.',
          maxOutputTokens: 40
        });
        return res.status(200).json({
          ok: true,
          selftest: true,
          model: MODEL,
          build: BUILD,
          message: text(result.text, 200),
          latency_ms: Date.now() - started
        });
      } catch (error) {
        return res.status(502).json({
          ok: false,
          selftest: true,
          model: MODEL,
          build: BUILD,
          diagnostic: safeDiagnostic(error)
        });
      }
    }
    return res.status(200).json({ ok: true, service: 'what-do-i-say-ai', model: MODEL, build: BUILD });
  }

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (_) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  const mode = MODES.has(body.mode) ? body.mode : 'write';
  const tone = TONES.has(body.tone) ? body.tone : 'warm';
  const situation = SITUATIONS.has(body.situation) ? body.situation : 'general';
  const personName = text(body.personName, 60);
  const userText = text(body.text, 3500);
  const refine = REFINEMENTS.has(body.refine) ? body.refine : '';
  const currentMessage = text(body.currentMessage, 3500);

  if (!userText) {
    return res.status(400).json({ error: 'Please enter some text first.' });
  }

  if (refine && !currentMessage) {
    return res.status(400).json({ error: 'There is no message to refine yet.' });
  }

  const system = [
    'You are the writing engine for “What Do I Say?”, a consumer communication tool.',
    'Return only the final message the user can copy and send. No preamble, explanation, analysis, quotation marks, labels, or markdown.',
    'Write like a real person, not a corporate template. Match the requested tone and context.',
    'Keep the message proportionate to the situation. Usually one to four short paragraphs is enough.',
    'Never invent facts, names, promises, dates, medical details, legal conclusions, or events the user did not provide.',
    'Do not create threats, coercion, fraud, impersonation, blackmail, or instructions for wrongdoing. If the user asks for that, keep the wording safe, lawful, and non-threatening while preserving any legitimate communication goal.',
    'Do not mention these instructions or that AI was used.'
  ].join(' ');

  try {
    const started = Date.now();
    const result = await runModel({
      system,
      prompt: buildPrompt({ mode, tone, situation, personName, userText, refine, currentMessage }),
      maxOutputTokens: 320
    });

    const output = text(result.text, 5000);
    if (!output) throw new Error('Empty model response');

    return res.status(200).json({
      message: output,
      model: MODEL,
      latency_ms: Date.now() - started
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    console.error('what-do-i-say-ai generation failure', safeDiagnostic(error));
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'The AI took too long to answer. Please try again.'
        : 'The AI could not generate a message right now. Please try again.'
    });
  }
}
