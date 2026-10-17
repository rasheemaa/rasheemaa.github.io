(() => {
  const S = { last: '', base: null, pending: false, working: null, retry: null, installPrompt: null };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const el = {
    form: $('#message-form'), prompt: $('#prompt'), label: $('#prompt-label'), conversation: $('#conversation'),
    thread: $('#chat-thread'), welcome: $('#welcome-card'), send: $('#generate'), stop: $('#sparkle-cancel'),
    status: $('#sparkle-status'), statusText: $('#sparkle-status-text'), error: $('#ai-error'), errorText: $('#ai-error-message'),
    retry: $('#ai-retry'), newTop: $('#new-message-top'), trial: $('#trial-status'), trialDetail: $('#trial-detail'),
    install: $('.install-button')
  };
  const labels = { shorter: 'Make it shorter', softer: 'Make it softer', firmer: 'Make it firmer', professional: 'Make it professional', another: 'Try another version' };

  function inferRecipient(text) {
    const source = String(text || '').trim();
    const match = source.match(/^(?:please\s+)?(?:tell|text|message)\s+(.{1,60}?)\s+(?:that\s+)?(?:I|we)\b/i);
    if (!match) return '';
    const recipient = String(match[1] || '').trim().replace(/[,:;.!?]+$/, '');
    if (!recipient || recipient.split(/\s+/).length > 4) return '';
    if (/^(?:them|him|her|someone|somebody|the recipient|my\s+(?:friend|mom|mother|dad|father|boss|manager|partner|boyfriend|girlfriend|husband|wife))$/i.test(recipient)) return '';
    return recipient.slice(0, 60);
  }

  function hasUserRefusal(value) {
    return /\b(?:I|we)\s+(?:cannot|can['’]?t|cant|won['’]?t|wont|will\s+not|(?:am|are)\s+unable|do\s+not|don['’]?t|dont)\b/i.test(String(value || ''));
  }

  function isNonDraftResponse(value, payload = {}) {
    const output = String(value || '').trim();
    if (!output) return true;
    if (/\b(?:as an ai|as a language model|I (?:do not|don't) have (?:the )?(?:ability|capability)|I (?:cannot|can't|can’t) physically)\b/i.test(output)) return true;

    const capability = /^(?:I(?:'m| am) sorry\s*,?\s*(?:but\s+)?)?I\s+(?:cannot|can['’]?t|cant|won['’]?t|wont|am unable to)\s+(?:do that|do this|help with (?:that|this)|assist with (?:that|this)|fulfill (?:that|this)|perform (?:that|this)|provide (?:that|this)|lend\b|loan\b|send (?:you )?money\b)/i;
    if (!capability.test(output)) return false;

    const source = String(payload?.currentMessage || payload?.text || '');
    return !hasUserRefusal(source);
  }

  function updateAccess() {
    el.trial.textContent = 'Free for everyone';
    el.trialDetail.textContent = ' · no payment required';
  }

  function scrollDown() { requestAnimationFrame(() => { el.thread.scrollTop = el.thread.scrollHeight; }); }
  function resize() { el.prompt.style.height = 'auto'; el.prompt.style.height = `${Math.min(el.prompt.scrollHeight,160)}px`; }
  function clearError() { el.error.hidden = true; el.errorText.textContent = ''; }
  function showError(msg) { el.errorText.textContent = msg; el.error.hidden = false; }

  function message(role, text) {
    const row = document.createElement('div'); row.className = `message-row ${role}`;
    const stack = document.createElement('div'); stack.className = 'message-stack';
    const who = document.createElement('span'); who.className = 'speaker'; who.textContent = role === 'user' ? 'You' : 'Sparkle';
    const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = text;
    stack.append(who, bubble); row.append(stack); el.conversation.append(row);
    if (role === 'user') { el.welcome.hidden = true; el.newTop.hidden = false; }
    scrollDown(); return { row, stack, bubble };
  }

  function working(text) {
    S.working?.remove();
    const m = message('assistant', text); m.row.classList.add('working'); S.working = m.row;
  }
  function stopWorking() { S.working?.remove(); S.working = null; }
  function status(d = {}) {
    const phase = String(d.phase || d.status || '').toLowerCase();
    el.status.dataset.state = phase || 'idle';
    let text = d.message || '';
    if (d.type === 'progress' && Number.isFinite(d.progress)) text = `Downloading Sparkle… ${Math.round(d.progress)}%`;
    if (!text && phase === 'generating') text = 'Sparkle is writing your message…';
    if (!text && phase === 'checking') text = 'Sparkle is checking the details…';
    if (!text && phase === 'complete') text = 'Ready on this device.';
    el.statusText.textContent = text || 'Private on-device AI';
    if (S.pending && S.working && text) S.working.querySelector('.bubble').textContent = text;
  }

  function loading(on, text = 'Sparkle is finding the words…') {
    S.pending = on; el.send.disabled = on; el.send.dataset.loading = on ? 'true' : 'false'; el.send.textContent = on ? '…' : 'Send'; el.stop.hidden = !on;
    $$('.just-right,.more-options,.refine-options button').forEach(b => b.disabled = on);
    on ? working(text) : stopWorking();
  }

  async function copy(text, button) {
    try { await navigator.clipboard.writeText(text); button.textContent = 'Copied ✓'; }
    catch { button.textContent = 'Just right ✓'; }
  }

  function assistant(text, refinable = true) {
    const m = message('assistant', text);
    if (!refinable) return;
    const base = { ...(S.base || initialPayload(text)) };
    const actions = document.createElement('div'); actions.className = 'response-actions';
    const right = document.createElement('button'); right.type = 'button'; right.className = 'just-right'; right.textContent = 'Just right ✓';
    const more = document.createElement('button'); more.type = 'button'; more.className = 'more-options'; more.textContent = 'More options'; more.setAttribute('aria-expanded','false');
    const options = document.createElement('div'); options.className = 'refine-options'; options.hidden = true;
    right.onclick = async () => {
      if (!actions.querySelector('.start-new')) { const n = document.createElement('button'); n.type='button'; n.className='start-new'; n.textContent='Start a new message'; n.onclick=reset; actions.append(n); }
      await copy(text,right);
    };
    more.onclick = () => { const open = more.getAttribute('aria-expanded') === 'true'; more.setAttribute('aria-expanded',String(!open)); more.textContent = open ? 'More options' : 'Fewer options'; options.hidden = open; };
    Object.entries(labels).forEach(([key,label]) => { const b=document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=()=>{ if(!S.pending) refine(key,label,'',{message:text,base}); }; options.append(b); });
    actions.append(right,more,options); m.stack.append(actions); scrollDown();
  }

  // One composer, no mode chooser. Older desktop models still need an internal task
  // label; mobile Cloudflare AI can infer intent directly from the full message.
  function inferDesktopIntent(text) {
    const source = String(text || '').trim();
    if (/^(?:please\s+)?(?:fix|rewrite|reword|edit|polish|proofread|correct|clean up)\b/i.test(source)
      || /^(?:my\s+)?(?:draft|message\s+to\s+fix)\s*:/i.test(source)
      || /^(?:hi|hello|hey|dear)\s+[^,\n]{1,50}[,!]?(?:\s|$)/i.test(source)) return 'fix';
    if (/^(?:please\s+)?(?:reply|respond|text\s+back|write\s+(?:a\s+)?reply|help\s+me\s+reply|what\s+do\s+i\s+say\s+back)\b/i.test(source)
      || /\b(?:they|he|she|my\s+(?:friend|boss|mom|dad|partner)|someone)\s+(?:said|sent|texted|asked|wrote)\b/i.test(source)
      || /\b(?:they|he|she)\s+(?:messaged|texted)\s+me\b/i.test(source)) return 'reply';
    return 'write';
  }

  function initialPayload(text) {
    const source = String(text || '');
    const mode = window.__WDIS_MOBILE_CLOUD_SPARKLE === true ? 'auto' : inferDesktopIntent(source);
    return { mode, tone:'warm', situation:'general', personName:inferRecipient(source), text:source, refine:'', currentMessage:'' };
  }
  function refinePayload(kind, instruction='', selection=null) {
    const current = selection?.message || S.last;
    const base = selection?.base || S.base || initialPayload(current);
    if (kind === 'custom') return { ...base, text:instruction, refine:'custom', currentMessage:current };
    return { ...base, refine:kind, currentMessage:current };
  }

  async function generate(payload, kind='', base=null) {
    if (!window.Sparkle?.generate) { showError('Sparkle has not loaded yet. Refresh the page and try again.'); return; }
    clearError(); loading(true, kind ? 'Sparkle is reworking it…' : 'Sparkle is finding the words…');
    try {
      const out = await window.Sparkle.generate(payload,{onStatus:status});
      if (!out) throw new Error('Sparkle came back empty. Please try again.');
      const validDraft = !isNonDraftResponse(out, payload);
      if (validDraft) {
        S.last = out;
        if (base) S.base = {...base};
        else if (!kind) S.base = {...payload, refine:'', currentMessage:''};
      }
      assistant(out, validDraft);
      updateAccess();
      if (validDraft) el.prompt.placeholder='Tell Sparkle what to change…';
    } catch (e) {
      if (!el.prompt.value && (!kind || kind === 'custom')) { el.prompt.value = payload.text; resize(); }
      if (e?.code === 'sparkle_cancelled') status({phase:'idle',message:'Stopped. Your message is still here.'});
      else { status({phase:'error',message:'Sparkle could not run on this device right now.'}); showError(e?.message || 'Sparkle could not answer right now. Please try again.'); }
    } finally { loading(false); el.prompt.focus(); }
  }

  async function first(text) {
    if (S.pending) return;
    text = text.trim(); if (!text) return;
    message('user',text); el.prompt.value=''; resize();
    const payload=initialPayload(text); S.retry={payload,kind:''}; await generate(payload,'');
  }
  async function refine(kind, display, instruction='', selection=null) {
    if (S.pending || !S.last) return;
    if (kind === 'custom') { el.prompt.value=''; resize(); }
    message('user',display); const payload=refinePayload(kind,instruction,selection); const base=selection?.base || S.base; S.retry={payload,kind,base}; await generate(payload,kind,base);
  }

  function reset() {
    if (S.pending) return;
    S.last=''; S.base=null; S.retry=null; el.conversation.innerHTML=''; el.welcome.hidden=false; el.newTop.hidden=true; el.prompt.value=''; el.prompt.placeholder='Tell Sparkle what you need, or paste a message…';
    clearError(); status({phase:'idle',message:'Sparkle is ready.'}); resize(); el.prompt.focus();
  }

  el.form.onsubmit = e => { e.preventDefault(); const text=el.prompt.value.trim(); if(!text)return; S.last ? refine('custom',text,text) : first(text); };
  el.prompt.oninput = resize;
  el.stop.onclick = () => window.Sparkle?.cancel();
  el.retry.onclick = () => { if(S.retry && !S.pending) generate(S.retry.payload,S.retry.kind,S.retry.base); };
  el.newTop.onclick = reset;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); S.installPrompt = event;
    if (el.install) el.install.hidden = false;
  });
  el.install?.addEventListener('click', async () => {
    if (!S.installPrompt) return;
    el.install.disabled = true;
    try { await S.installPrompt.prompt(); await S.installPrompt.userChoice; } catch (_) {}
    S.installPrompt = null; el.install.hidden = true; el.install.disabled = false;
  });
  window.addEventListener('appinstalled', () => { S.installPrompt = null; if (el.install) el.install.hidden = true; });

  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/what-do-i-say/service-worker.js',{scope:'/what-do-i-say/',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}));
  updateAccess(); resize();
})();
