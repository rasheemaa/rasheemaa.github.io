(() => {
  const S = { last: '', base: null, pending: false, working: null, retry: null, installPrompt: null,
    assistantMode: false, assistantHistory: [], websitePending: false, currentWebsite: null, lastUserText: '' };
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
    if (!refinable) return m;
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
    actions.append(right,more,options); m.stack.append(actions); scrollDown(); return m;
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

  function isWritingRequest(text) {
    const value = String(text || '').trim();
    if (/^(?:please\s+)?(?:write|draft|compose)\s+(?:code|a\s+website|a\s+webpage|a\s+site)\b/i.test(value)) return false;
    if (/^(?:they|he|she|someone|my\s+\w+)\s+(?:said|sent|texted|asked|wrote|messaged)\b/i.test(value)) return true;
    if (/^can\s+you\s+(?:loan|lend)\s+me\b/i.test(value)) return true;
    return /^(?:please\s+)?(?:write|draft|compose|fix|rewrite|reword|edit|polish|proofread|reply|respond|text|message|tell)\b/i.test(value)
      || /^(?:i\s+(?:want|need)\s+to\s+say|how\s+do\s+i\s+(?:tell|say)|what\s+do\s+i\s+say\s+to)\b/i.test(value);
  }

  function isWebsiteRequest(text) {
    return /\b(?:create|build|design|make|generate|draft)\b/i.test(text) &&
      /\b(?:website|web\s*site|webpage|web\s*page|landing\s*page)\b/i.test(text);
  }

  function hasWebsiteDetails(text) {
    const value = String(text || '').trim();
    return /(?:\b(?:for|about|called|selling|business|portfolio|showcase|services)\b)\s+\S.{3,}/i.test(value)
      || value.split(/\s+/).length >= 12;
  }

  function isWritingRefinement(text) {
    const value = String(text || '').trim();
    if (isWebsiteRequest(value)) return false;
    return /^(?:make\s+it|make\s+this|can\s+you\s+make\s+it|try\s+another|shorter|softer|firmer|more\s+(?:concise|warm|natural|professional|direct|friendly|formal)|less\s+(?:formal|wordy|harsh)|keep\s+the\s+same\s+message|change\s+the\s+(?:tone|wording)|add\s+(?:a\s+)?(?:greeting|closing))\b/i.test(value);
  }

  function wantsAssistant(text) {
    const value = String(text || '').trim();
    if (isWritingRequest(value)) return false;
    return isWebsiteRequest(value)
      || /^(?:no[,! ]+)?(?:i(?:'m| am)\s+asking\s+you|i\s+(?:want|need)\s+you\s+to\s+do\s+(?:it|that)|do\s+(?:it|that)\s+for\s+me)\b/i.test(value)
      || /^(?:please\s+)?(?:create|build|design|make|plan|explain|analyze|brainstorm|summarize|research|teach|help\s+me\s+(?:build|create|plan|understand|figure\s+out))\b/i.test(value)
      || /^(?:what|why|how|when|where|who|is|are|do|does|can\s+you|could\s+you|tell\s+me\s+about)\b/i.test(value)
      || !/^(?:hi|hello|hey|dear|i\s+(?:wanted\s+to\s+let\s+you\s+know|am\s+writing\s+to|just\s+wanted\s+to\s+say)|thank\s+you\s+for)\b/i.test(value);
  }

  async function askAssistant(text, retry = false) {
    if (S.pending) return;
    const original = String(text || '').trim();
    if (!original) return;
    if (!retry) {
      message('user', original);
      el.prompt.value = '';
      resize();
    }
    if (!S.assistantMode && S.last && S.lastUserText) {
      S.assistantHistory = [
        { role: 'user', content: S.lastUserText },
        { role: 'assistant', content: S.last }
      ];
      if (isWebsiteRequest(S.lastUserText)) S.websitePending = true;
    }
    S.assistantMode = true;
    S.last = '';
    S.base = null;
    if (isWebsiteRequest(original)) S.websitePending = true;
    if (/^(?:cancel|never mind|forget (?:the|that) website)\b/i.test(original)) S.websitePending = false;
    const revision = !!S.currentWebsite && /^(?:make|change|update|add|remove|switch|redesign|revise|edit|give\s+it|use\s+(?:a|the))\b/i.test(original);
    const task = revision || (S.websitePending && hasWebsiteDetails(original)) ? 'website' : 'chat';
    S.retry = { assistant: true, text: original };
    clearError();
    loading(true, task === 'website' ? 'Sparkle is creating your website draft…' : 'Sparkle is thinking…');
    try {
      if (!window.SparkleAssistant?.ask) throw new Error('Sparkle assistant has not loaded. Refresh the page.');
      const data = await window.SparkleAssistant.ask(original, S.assistantHistory, task, status, task === 'website' ? S.currentWebsite : null);
      const answer = String(data.message || '').trim();
      const result = assistant(answer, false);
      if (data.type === 'website' && data.website) {
        if (!window.SparkleSiteDraft?.show) throw new Error('Website preview is not ready. Refresh the page.');
        window.SparkleSiteDraft.show(data.website, result.stack);
        S.currentWebsite = data.website;
        S.websitePending = false;
      }
      S.assistantHistory.push({ role: 'user', content: original }, { role: 'assistant', content: answer });
      S.assistantHistory = S.assistantHistory.slice(-8);
      el.prompt.placeholder = 'Ask a follow up or request a change…';
      updateAccess();
    } catch (error) {
      if (error?.code === 'sparkle_cancelled') status({ phase: 'idle', message: 'Stopped. Your request was not sent again.' });
      else {
        status({ phase: 'error', message: 'Sparkle could not finish that request.' });
        showError(error?.message || 'Sparkle could not answer right now.');
      }
      if (!el.prompt.value) { el.prompt.value = original; resize(); }
    } finally {
      loading(false);
      el.prompt.focus();
    }
  }

  async function first(text) {
    if (S.pending) return;
    text = text.trim(); if (!text) return;
    message('user',text); el.prompt.value=''; resize();
    S.lastUserText = text;
    const payload=initialPayload(text); S.retry={payload,kind:''}; await generate(payload,'');
  }
  async function refine(kind, display, instruction='', selection=null) {
    if (S.pending || !S.last) return;
    if (kind === 'custom') { el.prompt.value=''; resize(); }
    message('user',display); const payload=refinePayload(kind,instruction,selection); const base=selection?.base || S.base; S.retry={payload,kind,base}; await generate(payload,kind,base);
  }

  function reset() {
    if (S.pending) return;
    S.last=''; S.base=null; S.retry=null; S.assistantMode=false; S.assistantHistory=[]; S.websitePending=false; S.currentWebsite=null; S.lastUserText=''; el.conversation.innerHTML=''; el.welcome.hidden=false; el.newTop.hidden=true; el.prompt.value=''; el.prompt.placeholder='Tell Sparkle what you need, or paste a message…';
    clearError(); status({phase:'idle',message:'Sparkle is ready.'}); resize(); el.prompt.focus();
  }

  el.form.onsubmit = e => { e.preventDefault(); const text=el.prompt.value.trim(); if(!text)return;
    if (S.assistantMode && isWritingRequest(text)) { S.assistantMode=false; S.assistantHistory=[]; S.websitePending=false; S.currentWebsite=null; S.last=''; S.base=null; }
    if (S.last && isWritingRefinement(text)) refine('custom',text,text);
    else if (S.assistantMode || wantsAssistant(text)) askAssistant(text);
    else S.last ? refine('custom',text,text) : first(text);
  };
  el.prompt.oninput = resize;
  el.stop.onclick = () => { window.SparkleAssistant?.cancel(); window.Sparkle?.cancel(); };
  el.retry.onclick = () => { if(!S.retry || S.pending) return;
    if (S.retry.assistant) askAssistant(S.retry.text, true);
    else generate(S.retry.payload,S.retry.kind,S.retry.base);
  };
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
