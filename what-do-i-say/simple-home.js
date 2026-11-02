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
  // An audited same-origin AI deployment must explicitly opt in; never infer availability from a URL.
  const aiEnabled = window.SPARKLE_TASK_AI_ENABLED === true;
  let active = null;
  const drafts = new Map();
  const initial = {
    write: { title: 'Write', hint: 'Start from your idea.', action: 'Create draft', focus: 'sparkle-write-idea' },
    reply: { title: 'Reply', hint: 'Use the message you received and your own answer.', action: 'Draft reply', focus: 'sparkle-reply-message' },
    fix: { title: 'Fix', hint: 'Polish an existing draft.', action: 'Polish draft', focus: 'sparkle-fix-draft' }
  };
  let mode = '';

  function setBusy(busy) {
    form.setAttribute('aria-busy', String(busy));
    byId('sparkle-task-continue').disabled = busy;
    byId('sparkle-task-continue').textContent = busy ? 'Sparkle is writing…' :
      aiEnabled ? 'Generate with Sparkle' : initial[mode]?.action || 'Prepare draft';
    byId('sparkle-task-cancel').hidden = !busy;
  }
  function cancelPending(message = '') {
    if (!active) return;
    const request = active;
    active = null;
    clearTimeout(request.timer);
    request.controller.abort();
    setBusy(false);
    if (message) status.textContent = message;
  }
  const inputSnapshot = () => JSON.stringify([mode, ...[
    'sparkle-write-type','sparkle-write-idea','sparkle-write-to',
    'sparkle-reply-message','sparkle-reply-idea','sparkle-reply-goal',
    'sparkle-fix-draft','sparkle-fix-style'
  ].map(id => byId(id).value)]);
  function rememberDraft() {
    if (mode && !result.hidden) drafts.set(mode, {
      text: output.value, origin: byId('sparkle-draft-origin').textContent
    });
  }
  function showDraft(text, origin) {
    output.value = text;
    byId('sparkle-draft-origin').textContent = origin;
    result.hidden = false;
    rememberDraft();
  }

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
    rememberDraft();
    cancelPending();
    mode = next;
    const cfg = initial[mode];
    if (welcome) welcome.dataset.activeTask = mode;
    thread?.classList.add('sparkle-task-open');
    byId('sparkle-task-title').textContent = cfg.title;
    byId('sparkle-task-help').textContent = cfg.hint;
    byId('sparkle-task-continue').textContent = aiEnabled ? 'Generate with Sparkle' : cfg.action;
    choices.hidden = true;
    workspace.hidden = false;
    sections.forEach(panel => { panel.hidden = panel.dataset.sparklePanel !== mode; });
    const saved = drafts.get(mode);
    result.hidden = !saved;
    if (saved) showDraft(saved.text, saved.origin);
    status.textContent = '';
    enableGeneric(false);
    // Keep the keyboard closed on small touchscreens and let the user see the whole form.
    if (thread) thread.scrollTop = 0;
    byId('sparkle-task-title')?.focus({ preventScroll: true });
  }

  function home() {
    rememberDraft();
    cancelPending();
    mode = '';
    if (welcome) delete welcome.dataset.activeTask;
    thread?.classList.remove('sparkle-task-open');
    choices.hidden = false;
    workspace.hidden = true;
    result.hidden = true;
    status.textContent = '';
    enableGeneric(!staging && !aiEnabled);
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
  byId('sparkle-task-cancel').addEventListener('click', () =>
    cancelPending('Request cancelled. Your words and last draft are preserved.'));
  for (const event of ['input','change']) form.addEventListener(event, () =>
    cancelPending('Your input changed, so the request was cancelled. Your last draft is preserved.'));
  output.addEventListener('input', () => {
    cancelPending('Your draft changed, so the request was cancelled.');
    rememberDraft();
  });
  function aiPayload() {
    if (mode === 'write') {
      const idea = content('sparkle-write-idea');
      if (!idea) return {error:'Tell Sparkle what you want to say.'};
      const type = byId('sparkle-write-type').value;
      const recipient = content('sparkle-write-to');
      return {mode:'write',text:'Write a '+type+' using only these notes: '+idea+(recipient?'\nRecipient or audience: '+recipient:''),tone:'warm'};
    }
    if (mode === 'reply') {
      const incoming = content('sparkle-reply-message');
      const intent = content('sparkle-reply-idea');
      if (!incoming) return {error:'Paste the message you received.'};
      if (!intent) return {error:'Add what you want to say back.'};
      const tones={friendly:'warm',decline:'firm',agree:'warm',clarify:'direct',firm:'firm'};
      const goal = byId('sparkle-reply-goal').value;
      return {mode:'reply',tone:tones[goal]||'warm',text:'MESSAGE RECEIVED (not spoken by me):\n'+incoming+'\n\nWHAT I WANT TO SAY BACK:\n'+intent+'\n\nApproach: '+goal};
    }
    if (mode === 'fix') {
      const draft = content('sparkle-fix-draft');
      if (!draft) return {error:'Paste your draft to polish.'};
      const style = byId('sparkle-fix-style').value;
      if (style==='clearer') return {mode:'fix',text:draft,tone:'direct'};
      return {mode:'fix',refine:style,currentMessage:draft,text:'',tone:style==='firmer'?'firm':'warm'};
    }
    return {error:'Choose Write, Reply, or Fix.'};
  }
  async function generateWithAI() {
    if (active) return;
    const payload=aiPayload();
    if (payload.error){status.textContent=payload.error;return;}
    rememberDraft();
    const controller=new AbortController();
    const request={controller, snapshot:inputSnapshot(), timer:setTimeout(()=>controller.abort(),30000)};
    active=request;
    setBusy(true);
    status.textContent='Creating your draft securely. Nothing is sent to anyone.';
    try {
      const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,body:JSON.stringify(payload)});
      const data=await res.json().catch(()=>({}));
      if(active!==request||controller.signal.aborted||inputSnapshot()!==request.snapshot)return;
      if(!res.ok||typeof data.message!=='string'||!data.message.trim()||data.message.length>6000){
        status.textContent=res.status===429?'Sparkle has reached her free allowance. Try again later.':
          res.status===503?'AI writing is unavailable right now. Your words are safe.':
          'Sparkle could not finish this draft. Your words are safe. Please try again.';
        return;
      }
      showDraft(data.message.trim(),'Created with Sparkle AI. Review and edit before sharing.');
      status.textContent='Review and edit before sharing.';
      output.focus({preventScroll:true});
    } catch (_) {
      if(active!==request)return;
      if(controller.signal.aborted)status.textContent='The request was stopped or timed out. Your words and last draft are safe.';
      else status.textContent='Sparkle could not connect. Your words and last draft are safe.';
    } finally {
      clearTimeout(request.timer);
      if(active===request){active=null;setBusy(false);}
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!mode || active) return;
    if(aiEnabled){void generateWithAI();return;}
    const draft = mode === 'write' ? makeWrite() : mode === 'reply' ? makeReply() : makeFix();
    if (draft.error) {
      status.textContent = draft.error;
      return;
    }
    status.textContent = '';
    showDraft(draft.text, 'Created on your device. AI isn’t connected in this preview.');
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
  if (staging || aiEnabled) enableGeneric(false);
})();
