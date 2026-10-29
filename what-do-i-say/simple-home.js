/* Three genuinely different, local-first tasks. Never sends or invents a reply. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const workspace = byId('sparkle-task-workspace');
  const welcome = byId('welcome-card');
  const thread = byId('chat-thread');
  const choices = document.querySelector('#welcome-card .sparkle-choices');
  if (!workspace || !choices) return;

  const form = byId('sparkle-task-form');
  const sections = [...workspace.querySelectorAll('[data-sparkle-panel]')];
  const result = byId('sparkle-task-result');
  const output = byId('sparkle-prepared-text');
  const status = byId('sparkle-task-status');
  const generic = byId('message-form');
  const genericStatus = byId('sparkle-status');
  const staging = window.SPARKLE_STAGING_ONLY === true;
  const initial = {
    write: { title: 'Write', hint: 'Start from your idea.', action: 'Create draft', focus: 'sparkle-write-idea' },
    reply: { title: 'Reply', hint: 'Use the message you received and your own answer.', action: 'Draft reply', focus: 'sparkle-reply-message' },
    fix: { title: 'Fix', hint: 'Polish an existing draft.', action: 'Polish draft', focus: 'sparkle-fix-draft' }
  };
  let mode = '';

  const content = id => (byId(id)?.value || '').trim();
  const clean = value => String(value || '').replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const endSentence = value => /[.!?…]$/.test(value) ? value : value + '.';

  function enableGeneric(enabled) {
    if (generic) generic.hidden = !enabled;
    if (genericStatus && staging) genericStatus.hidden = !enabled;
  }

  function choose(next) {
    if (!Object.prototype.hasOwnProperty.call(initial, next)) return;
    mode = next;
    const cfg = initial[mode];
    if (welcome) welcome.dataset.activeTask = mode;
    byId('sparkle-task-title').textContent = cfg.title;
    byId('sparkle-task-help').textContent = cfg.hint;
    byId('sparkle-task-continue').textContent = cfg.action;
    choices.hidden = true;
    workspace.hidden = false;
    sections.forEach(panel => { panel.hidden = panel.dataset.sparklePanel !== mode; });
    result.hidden = true;
    status.textContent = '';
    enableGeneric(false);
    // Keep the keyboard closed on small touchscreens and let the user see the whole form.
    if (thread) thread.scrollTop = 0;
    byId('sparkle-task-title')?.focus({ preventScroll: true });
  }

  function home() {
    mode = '';
    if (welcome) delete welcome.dataset.activeTask;
    choices.hidden = false;
    workspace.hidden = true;
    result.hidden = true;
    status.textContent = '';
    enableGeneric(!staging);
    document.querySelector('[data-sparkle-start="write"]')?.focus();
  }

  function makeWrite() {
    const idea = clean(content('sparkle-write-idea'));
    if (!idea) return { error: 'Tell Sparkle what you want to say.' };
    const person = clean(content('sparkle-write-to')).replace(/[\r\n]/g, ' ').slice(0, 100);
    const type = byId('sparkle-write-type').value;
    const greeting = person ? 'Hi ' + person + ',' : 'Hi,';
    if (type === 'email') return { text: (person ? 'Hello ' + person + ',' : 'Hello,') + '\n\n' + idea + '\n\nBest regards,' };
    if (type === 'caption') return { text: idea };
    return { text: greeting + '\n\n' + idea };
  }

  function makeReply() {
    const received = clean(content('sparkle-reply-message'));
    const idea = clean(content('sparkle-reply-idea'));
    if (!received) return { error: 'Paste the message you received.' };
    if (!idea) return { error: 'Add what you want to say back, in your own words.' };
    // The received message guides the user but is never copied into the outbound reply.
    const opening = {
      friendly: 'Thanks for your message. ',
      decline: 'Thanks for asking. ',
      agree: 'That sounds good. ',
      clarify: 'Thanks for reaching out. ',
      firm: ''
    }[byId('sparkle-reply-goal').value] || '';
    return { text: opening + endSentence(idea) };
  }

  function makeFix() {
    const draft = clean(content('sparkle-fix-draft'));
    if (!draft) return { error: 'Paste a draft to polish.' };
    const style = byId('sparkle-fix-style').value;
    let text = draft.replace(/[ \t]+([,.!?])/g, '$1').replace(/([!?]){3,}/g, '$1$1');
    if (style === 'shorter') {
      text = text.replace(/\bI (?:just )?wanted to (?:let you know|say)\b/gi, 'I')
        .replace(/\bI was (?:just )?wondering if\b/gi, 'Can')
        .replace(/\b(?:basically|actually|really|very)\s+/gi, '');
    } else if (style === 'softer') {
      text = text.replace(/\bYou need to\b/g, 'Could you please')
        .replace(/\bI want you to\b/g, 'Could you')
        .replace(/\bDo this now\b/g, 'Could you take care of this soon');
    } else if (style === 'firmer') {
      text = text.replace(/\b(?:I (?:just )?think that|I guess)\s+/gi, '')
        .replace(/\b(?:maybe|perhaps)\s+/gi, '');
    } else if (style === 'professional') {
      text = text.replace(/\bHey\b/g, 'Hello')
        .replace(/\bgonna\b/gi, 'going to')
        .replace(/\bwanna\b/gi, 'want to');
    }
    return { text: clean(text), note: 'Basic on-device edits only. Check your wording before using it.' };
  }

  document.querySelectorAll('[data-sparkle-start]').forEach(button => {
    button.addEventListener('click', () => choose(button.dataset.sparkleStart));
  });
  byId('sparkle-task-back')?.addEventListener('click', home);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!mode) return;
    const draft = mode === 'write' ? makeWrite() : mode === 'reply' ? makeReply() : makeFix();
    if (draft.error) {
      result.hidden = true;
      status.textContent = draft.error;
      return;
    }
    status.textContent = '';
    output.value = draft.text;
    result.hidden = false;
    if (draft.note) status.textContent = draft.note;
    output.focus();
    output.setSelectionRange(0, 0);
  });
  byId('sparkle-copy-request')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      status.textContent = 'Draft copied.';
    } catch (_) {
      output.focus();
      output.select();
      status.textContent = 'Select Copy to copy your draft.';
    }
  });
  // The staging environment does not expose an active AI chat or send button.
  if (staging) enableGeneric(false);
})();