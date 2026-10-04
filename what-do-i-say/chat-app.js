(() => {
  const API = String(window.WDIS_API_BASE || '').trim().replace(/\/$/, '');
  const VERIFY = API ? `${API}/api/verify-payment` : '';
  const TRIAL_MS = 3 * 86400000;
  const K = {
    trial: 'wdis_trial_started_at_v2',
    founder: 'wdis_founder_session_v1',
    pending: 'wdis_pending_founder_session_v1'
  };
  const S = { mode: 'write', last: '', base: null, pending: false, founder: false, working: null, retry: null, installPrompt: null };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const el = {
    form: $('#message-form'), prompt: $('#prompt'), label: $('#prompt-label'), conversation: $('#conversation'),
    thread: $('#chat-thread'), welcome: $('#welcome-card'), send: $('#generate'), stop: $('#sparkle-cancel'),
    status: $('#sparkle-status'), statusText: $('#sparkle-status-text'), error: $('#ai-error'), errorText: $('#ai-error-message'),
    retry: $('#ai-retry'), newTop: $('#new-message-top'), paywall: $('#paywall'), trial: $('#trial-status'), trialDetail: $('#trial-detail'),
    install: $('.install-button')
  };
  const labels = { shorter: 'Make it shorter', softer: 'Make it softer', firmer: 'Make it firmer', professional: 'Make it professional', another: 'Try another version' };
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k,v) => { try { localStorage.setItem(k,v); } catch {} };
  const del = k => { try { localStorage.removeItem(k); } catch {} };
  const start = () => Number(get(K.trial) || 0);
  const trialOK = () => S.founder || !start() || Date.now() - start() < TRIAL_MS;
  const setFounderStatus = msg => $$('[data-founder-status]').forEach(n => n.textContent = msg);

  function inferRecipient(text) {
    const source = String(text || '').trim();
    const match = source.match(/^(?:please\s+)?(?:tell|text|message)\s+(.{1,60}?)\s+(?:that\s+)?(?:I|we)\b/i);
    if (!match) return '';
    const recipient = String(match[1] || '').trim().replace(/[,:;.!?]+$/, '');
    if (!recipient || recipient.split(/\s+/).length > 4) return '';
    if (/^(?:them|him|her|someone|somebody|the recipient|my\s+(?:friend|mom|mother|dad|father|boss|manager|partner|boyfriend|girlfriend|husband|wife))$/i.test(recipient)) return '';
    return recipient.slice(0, 60);
  }

  function updateTrial() {
    if (S.founder) { el.trial.textContent = 'Founding Member'; el.trialDetail.textContent = ' · access unlocked'; return; }
    if (!start()) { el.trial.textContent = '3-day free trial'; el.trialDetail.textContent = ' · starts with your first message'; return; }
    const left = TRIAL_MS - (Date.now() - start());
    if (left <= 0) { el.trial.textContent = 'Trial ended'; el.trialDetail.textContent = ' · unlock Founding access'; return; }
    const h = Math.max(1, Math.ceil(left / 3600000));
    el.trial.textContent = h > 24 ? `${Math.ceil(h / 24)} days left` : `${h} ${h === 1 ? 'hour' : 'hours'} left`;
    el.trialDetail.textContent = ' · free trial active';
  }

  function gate() {
    if (trialOK()) return true;
    updateTrial();
    el.paywall.hidden = false;
    document.body.style.overflow = 'hidden';
    return false;
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
    $$('.mode,.just-right,.more-options,.refine-options button').forEach(b => b.disabled = on);
    on ? working(text) : stopWorking();
  }

  async function copy(text, button) {
    try { await navigator.clipboard.writeText(text); button.textContent = 'Copied ✓'; }
    catch { button.textContent = 'Just right ✓'; }
  }

  function assistant(text) {
    const m = message('assistant', text);
    const actions = document.createElement('div'); actions.className = 'response-actions';
    const right = document.createElement('button'); right.type = 'button'; right.className = 'just-right'; right.textContent = 'Just right ✓';
    const more = document.createElement('button'); more.type = 'button'; more.className = 'more-options'; more.textContent = 'More options'; more.setAttribute('aria-expanded','false');
    const options = document.createElement('div'); options.className = 'refine-options'; options.hidden = true;
    right.onclick = async () => {
      S.last = text;
      if (!actions.querySelector('.start-new')) { const n = document.createElement('button'); n.type='button'; n.className='start-new'; n.textContent='Start a new message'; n.onclick=reset; actions.append(n); }
      await copy(text,right);
    };
    more.onclick = () => { const open = more.getAttribute('aria-expanded') === 'true'; more.setAttribute('aria-expanded',String(!open)); more.textContent = open ? 'More options' : 'Fewer options'; options.hidden = open; };
    Object.entries(labels).forEach(([key,label]) => { const b=document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=()=>{ if(!S.pending){ S.last=text; refine(key,label); } }; options.append(b); });
    actions.append(right,more,options); m.stack.append(actions); scrollDown();
  }

  function initialPayload(text) {
    return { mode:S.mode, tone:'warm', situation:'general', personName:S.mode === 'write' ? inferRecipient(text) : '', text, refine:'', currentMessage:'' };
  }
  function refinePayload(kind, instruction='') {
    const base = S.base || initialPayload(S.last);
    if (kind === 'custom') return { ...base, text:`Edit request: ${instruction}\n\nMessage to edit:\n${S.last}`, refine:'custom', currentMessage:S.last };
    return { ...base, refine:kind, currentMessage:S.last };
  }

  async function generate(payload, kind='') {
    if (!window.Sparkle?.generate) { showError('Sparkle has not loaded yet. Refresh the page and try again.'); return; }
    clearError(); loading(true, kind ? 'Sparkle is reworking it…' : 'Sparkle is finding the words…');
    try {
      const out = await window.Sparkle.generate(payload,{onStatus:status});
      if (!out) throw new Error('Sparkle came back empty. Please try again.');
      S.last = out; if (!kind) S.base = {...payload, refine:'', currentMessage:''}; assistant(out);
      if (!S.founder && !start()) set(K.trial,String(Date.now())); updateTrial(); el.prompt.placeholder='Tell Sparkle what to change…';
    } catch (e) {
      if (e?.code === 'sparkle_cancelled') status({phase:'idle',message:'Stopped. Your message is still here.'});
      else { status({phase:'error',message:'Sparkle could not run on this device right now.'}); showError(e?.message || 'Sparkle could not answer right now. Please try again.'); }
    } finally { loading(false); el.prompt.focus(); }
  }

  async function first(text) {
    if (S.pending || !gate()) return;
    text = text.trim(); if (!text) return;
    message('user',text); el.prompt.value=''; resize();
    const payload=initialPayload(text); S.retry={payload,kind:''}; await generate(payload,'');
  }
  async function refine(kind, display, instruction='') {
    if (S.pending || !S.last || !gate()) return;
    if (kind === 'custom') { el.prompt.value=''; resize(); }
    message('user',display); const payload=refinePayload(kind,instruction); S.retry={payload,kind}; await generate(payload,kind);
  }

  function reset() {
    if (S.pending) return;
    S.mode='write'; S.last=''; S.base=null; S.retry=null; el.conversation.innerHTML=''; el.welcome.hidden=false; el.newTop.hidden=true; el.prompt.value=''; el.prompt.placeholder='Tell me what you’re trying to say…';
    $$('.mode').forEach(b=>{const a=b.dataset.mode==='write'; b.classList.toggle('active',a); b.setAttribute('aria-selected',String(a));}); clearError(); status({phase:'idle',message:'Private on-device AI'}); resize(); el.prompt.focus();
  }

  $$('.mode').forEach(b => b.onclick = () => {
    if(S.pending)return; S.mode=b.dataset.mode; $$('.mode').forEach(x=>{const a=x===b;x.classList.toggle('active',a);x.setAttribute('aria-selected',String(a));});
    if(S.mode==='reply'){el.label.textContent='What did they send you, and what do you want to say back?';el.prompt.placeholder='Paste what they sent, then tell me what you want your reply to say…';}
    else if(S.mode==='fix'){el.label.textContent='Paste your message';el.prompt.placeholder='Paste your message and tell me what feels off…';}
    else {el.label.textContent='What are you trying to say?';el.prompt.placeholder='Tell me what you’re trying to say…';}
    el.prompt.focus();
  });
  el.form.onsubmit = e => { e.preventDefault(); const text=el.prompt.value.trim(); if(!text)return; S.last ? refine('custom',text,text) : first(text); };
  el.prompt.oninput = resize;
  el.stop.onclick = () => window.Sparkle?.cancel();
  el.retry.onclick = () => { if(S.retry && !S.pending) generate(S.retry.payload,S.retry.kind); };
  el.newTop.onclick = reset;
  $('.paywall-close')?.addEventListener('click',()=>{el.paywall.hidden=true;document.body.style.overflow='';});
  el.paywall?.addEventListener('click',e=>{if(e.target===el.paywall){el.paywall.hidden=true;document.body.style.overflow='';}});

  async function verify(session, quiet=false) {
    session=String(session||'').trim();
    if(!/^cs_live_[A-Za-z0-9]+$/.test(session) || !VERIFY){ if(!quiet)setFounderStatus('No verified payment was found. Founding Member access stays locked.'); return false; }
    if(!quiet)setFounderStatus('Verifying your Stripe payment…');
    try {
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),16000);
      const r=await fetch(VERIFY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:session}),signal:c.signal,cache:'no-store',credentials:'omit',mode:'cors'}); clearTimeout(t);
      let d={}; try{d=await r.json();}catch{}
      if(!r.ok || d.paid!==true){
        if (r.ok || r.status === 400) { del(K.founder); del(K.pending); S.founder=false; updateTrial(); }
        if(!quiet)setFounderStatus(d.error || 'Stripe has not marked this checkout as paid. Founding access stays locked.');
        return false;
      }
      S.founder=true; set(K.founder,session); del(K.pending); updateTrial(); el.paywall.hidden=true; document.body.style.overflow=''; setFounderStatus('Payment verified by Stripe. Founding Member access is unlocked. 💗'); return true;
    } catch { if(!quiet)setFounderStatus('We could not verify your payment right now. Refresh this page to try again.'); return false; }
  }

  async function initAccess() {
    const q=new URLSearchParams(location.search), checkout=q.get('checkout'), session=q.get('session_id');
    if(checkout==='cancelled'){setFounderStatus('Checkout canceled. No payment was made.');history.replaceState({},'',location.pathname);}
    if(checkout==='success'){if(/^cs_live_[A-Za-z0-9]+$/.test(String(session||'')))set(K.pending,session);await verify(session,false);history.replaceState({},'',location.pathname);return;}
    const saved=get(K.founder)||get(K.pending); if(saved)await verify(saved,true);
  }

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
  updateTrial(); resize(); initAccess().finally(updateTrial); setInterval(updateTrial,60000);
})();