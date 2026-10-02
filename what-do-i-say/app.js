(() => {
  const FREE_LIMIT = 3;
  const keys = {
    uses: 'wdis_free_uses_v1',
    founder: 'wdis_founder_v1',
    history: 'wdis_history_v1'
  };

  const state = {
    mode: 'write',
    last: '',
    variation: 0,
    installPrompt: null
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const form = $('#message-form');
  const prompt = $('#prompt');
  const promptLabel = $('#prompt-label');
  const situation = $('#situation');
  const personName = $('#person-name');
  const resultPanel = $('#result-panel');
  const result = $('#result');
  const trialCount = $('#trial-count');
  const paywall = $('#paywall');
  const installButton = $('.install-button');

  const readInt = (key) => {
    const value = Number(localStorage.getItem(key) || '0');
    return Number.isFinite(value) ? value : 0;
  };
  const isFounder = () => localStorage.getItem(keys.founder) === '1';
  const uses = () => readInt(keys.uses);
  const remaining = () => isFounder() ? '∞' : Math.max(0, FREE_LIMIT - uses());

  function track(event, params = {}) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', event, { page_path: location.pathname, page_title: document.title, ...params });
    }
  }

  function updateTrial() {
    trialCount.textContent = remaining();
    trialCount.parentElement.lastChild.textContent = isFounder()
      ? ' messages available on this device'
      : ' free messages left on this device';
  }

  function clean(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .trim();
  }

  function sentenceCase(text) {
    const t = clean(text);
    if (!t) return '';
    const first = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?]$/.test(first) ? first : `${first}.`;
  }

  function greeting(name, tone) {
    if (!name) return '';
    if (tone === 'professional') return `Hi ${name},`;
    if (tone === 'casual') return `Hey ${name},`;
    return `Hi ${name},`;
  }

  function signoff(tone) {
    if (tone === 'professional') return 'Thank you for understanding.';
    if (tone === 'warm') return 'I appreciate you understanding.';
    if (tone === 'firm') return 'Thanks for respecting that.';
    return '';
  }

  function soften(text) {
    let out = clean(text);
    const swaps = [
      [/\bI need you to\b/gi, 'I’d really appreciate it if you could'],
      [/\byou need to\b/gi, 'could you please'],
      [/\bI won’t\b/gi, 'I’m not able to'],
      [/\bI can’t\b/gi, 'I’m not able to'],
      [/\bThis is unacceptable\b/gi, 'This has been frustrating'],
      [/\bNo\b/g, 'I’m going to pass']
    ];
    swaps.forEach(([a,b]) => { out = out.replace(a,b); });
    if (!/appreciate|thank|understand/i.test(out)) out += ' I appreciate your understanding.';
    return sentenceCase(out);
  }

  function firmer(text) {
    let out = clean(text)
      .replace(/\bjust\b/gi, '')
      .replace(/\bmaybe\b/gi, '')
      .replace(/\bI think\b/gi, '')
      .replace(/\bif that’s okay\b/gi, '')
      .replace(/\bif possible\b/gi, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    if (!/\bI need\b|\bI will\b|\bI’m not able\b|\bI won’t\b/i.test(out)) {
      out = `I want to be clear: ${out.charAt(0).toLowerCase()}${out.slice(1)}`;
    }
    return sentenceCase(out);
  }

  function professionalize(text) {
    let out = clean(text);
    const swaps = [
      [/\bhey\b/gi, 'Hello'],
      [/\byeah\b/gi, 'yes'],
      [/\bnope\b/gi, 'no'],
      [/\bwanna\b/gi, 'want to'],
      [/\bgonna\b/gi, 'going to'],
      [/\bcan’t\b/gi, 'am unable to'],
      [/\basap\b/gi, 'as soon as possible'],
      [/\bthanks\b/gi, 'thank you']
    ];
    swaps.forEach(([a,b]) => { out = out.replace(a,b); });
    return sentenceCase(out);
  }

  function shorten(text) {
    const sentences = clean(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    if (sentences.length <= 2) return clean(text);
    return sentences.slice(0, 2).join(' ').trim();
  }

  function formatMessage(parts) {
    return parts.filter(Boolean).join('\n\n');
  }

  function writeMessage(context, tone, kind, name, variant) {
    const g = greeting(name, tone);
    const detail = sentenceCase(context);
    const end = signoff(tone);
    const variants = {
      general: [
        [g, detail, end],
        [g, `I wanted to reach out about this: ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`, end]
      ],
      work: [
        [g, `I wanted to let you know that ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`, tone === 'professional' ? 'Please let me know if there is anything you need from me in the meantime.' : end],
        [g, `I’m reaching out to give you a heads up: ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`, 'Thank you for understanding.']
      ],
      boundary: [
        [g, `I want to be clear about something. ${detail}`, tone === 'firm' ? 'I need this boundary to be respected going forward.' : 'I care about keeping things respectful, and this is what I need moving forward.'],
        [g, `${detail} I’m not comfortable continuing with this as it is, so I’m setting a boundary here.`, end]
      ],
      apology: [
        [g, `I want to apologize. ${detail}`, 'I understand the impact matters more than my intention, and I’ll do better going forward.'],
        [g, `I owe you an apology. ${detail}`, 'I’m sorry, and I appreciate you hearing me out.']
      ],
      cancel: [
        [g, `I need to cancel or reschedule. ${detail}`, 'I’m sorry for the inconvenience, and I appreciate your flexibility.'],
        [g, `Something changed on my end, so I won’t be able to make the original plan. ${detail}`, 'Can we find another time that works?']
      ],
      decline: [
        [g, `Thank you for thinking of me. ${detail}`, tone === 'firm' ? 'I’m going to pass, but I appreciate the invitation.' : 'I’m not able to say yes this time, but I appreciate you asking.'],
        [g, `${detail} I’m going to have to say no this time.`, 'Thank you for understanding.']
      ],
      followup: [
        [g, `I’m following up about this: ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`, 'When you have a moment, could you let me know where things stand? Thank you.'],
        [g, `Just checking back in regarding this: ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`, 'I’d appreciate an update when you’re able.']
      ],
      refund: [
        [g, `I’m reaching out because ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`, 'I’d like this resolved with a refund or appropriate replacement. Please let me know the next step.'],
        [g, `${detail} I’d like to request a refund and confirmation once it has been processed.`, 'Thank you.']
      ],
      relationship: [
        [g, `I want to talk about something honestly. ${detail}`, tone === 'firm' ? 'I need us to take this seriously and address it directly.' : 'I’m bringing it up because I care about being clear with each other.'],
        [g, `There’s something I’ve been trying to put into words. ${detail}`, 'I’d rather talk about it openly than let it sit between us.']
      ]
    };
    const set = variants[kind] || variants.general;
    return formatMessage(set[variant % set.length]);
  }

  function replyMessage(incoming, tone, kind, name, variant) {
    const g = greeting(name, tone);
    const lower = incoming.toLowerCase();
    let body;

    if (/sorry|apolog/i.test(lower)) {
      body = tone === 'firm'
        ? 'I hear your apology. I need some time and I also need the situation not to repeat itself.'
        : 'Thank you for apologizing. I appreciate you acknowledging it, and I’d like us to move forward with more care.';
    } else if (/can you|could you|would you|need you|please/i.test(lower)) {
      body = tone === 'firm'
        ? 'I understand what you’re asking. I’m not able to commit to that, so I need to say no.'
        : 'I understand what you’re asking. Let me be clear about what I can realistically do from my side.';
    } else if (/refund|order|charge|replace|delivery|package/i.test(lower) || kind === 'refund') {
      body = 'Thanks for the update. I’m looking for a clear resolution here, preferably a refund or replacement, along with confirmation of the next step.';
    } else if (/love|relationship|space|together|feel/i.test(lower) || kind === 'relationship') {
      body = tone === 'firm'
        ? 'I hear what you’re saying. I need us to be direct about what this means and what happens next.'
        : 'I hear you. I want to respond honestly instead of reacting too quickly, because I care about handling this conversation well.';
    } else {
      body = tone === 'professional'
        ? 'Thank you for reaching out. I’ve read your message and wanted to respond clearly.'
        : tone === 'casual'
          ? 'I hear you. I wanted to think about it before replying.'
          : 'I hear what you’re saying, and I wanted to respond thoughtfully.';
    }

    const tails = {
      warm: 'I’m open to talking about it as long as we can keep the conversation respectful.',
      direct: 'Here’s where I stand, and I want to be clear about that.',
      professional: 'Please let me know if any clarification is needed.',
      casual: 'That’s where I’m at with it right now.',
      firm: 'I’m not going to argue about the boundary I’m setting.',
      concise: ''
    };

    const alt = variant % 2 === 1 ? 'I wanted to make sure I answered clearly.' : '';
    return formatMessage([g, body, alt, tails[tone]]);
  }

  function fixMessage(draft, tone, variant) {
    let out = sentenceCase(draft);
    if (tone === 'warm') out = soften(out);
    if (tone === 'firm') out = firmer(out);
    if (tone === 'professional') out = professionalize(out);
    if (tone === 'concise') out = shorten(out);
    if (tone === 'casual') out = out.replace(/Hello/gi, 'Hey').replace(/Thank you/gi, 'Thanks');
    if (variant % 2 === 1 && out.length > 80) out = shorten(out);
    return out;
  }

  function currentTone() {
    return document.querySelector('input[name="tone"]:checked')?.value || 'warm';
  }

  function generate() {
    const text = clean(prompt.value);
    const tone = currentTone();
    const kind = situation.value;
    const name = clean(personName.value);
    if (!text) return '';
    if (state.mode === 'reply') return replyMessage(text, tone, kind, name, state.variation);
    if (state.mode === 'fix') return fixMessage(text, tone, state.variation);
    return writeMessage(text, tone, kind, name, state.variation);
  }

  function showPaywall() {
    paywall.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.paywall-close')?.focus();
    track('wdis_paywall_view');
  }

  function hidePaywall() {
    paywall.hidden = true;
    document.body.style.overflow = '';
  }

  function saveHistory(text) {
    let history = [];
    try { history = JSON.parse(localStorage.getItem(keys.history) || '[]'); } catch (_) {}
    history.unshift({ text, at: Date.now() });
    history = history.slice(0, 12);
    localStorage.setItem(keys.history, JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    const wrap = $('#history');
    let history = [];
    try { history = JSON.parse(localStorage.getItem(keys.history) || '[]'); } catch (_) {}
    if (!history.length) {
      wrap.innerHTML = '<p class="empty">Nothing saved yet.</p>';
      return;
    }
    wrap.innerHTML = history.map((item, index) => {
      const preview = item.text.length > 125 ? `${item.text.slice(0, 125)}…` : item.text;
      return `<div class="history-item"><button type="button" data-history-index="${index}"><span>${escapeHtml(preview)}</span><br><small>${new Date(item.at).toLocaleString()}</small></button></div>`;
    }).join('');
    $$('[data-history-index]').forEach((button) => button.addEventListener('click', () => {
      const item = history[Number(button.dataset.historyIndex)];
      if (!item) return;
      state.last = item.text;
      result.textContent = item.text;
      resultPanel.hidden = false;
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }

  function deliverMessage() {
    if (!isFounder() && uses() >= FREE_LIMIT) {
      showPaywall();
      return;
    }
    state.variation += 1;
    const text = generate();
    if (!text) return;
    state.last = text;
    result.textContent = text;
    resultPanel.hidden = false;
    if (!isFounder()) localStorage.setItem(keys.uses, String(uses() + 1));
    updateTrial();
    saveHistory(text);
    track('wdis_generate', { mode: state.mode, situation: situation.value, tone: currentTone() });
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $$('.mode').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      $$('.mode').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      if (state.mode === 'reply') {
        promptLabel.childNodes[0].nodeValue = 'What did they send you? ';
        prompt.placeholder = 'Paste the message you need to reply to…';
      } else if (state.mode === 'fix') {
        promptLabel.childNodes[0].nodeValue = 'Paste your draft ';
        prompt.placeholder = 'Paste what you wrote and choose how you want it to sound…';
      } else {
        promptLabel.childNodes[0].nodeValue = 'What are you trying to say? ';
        prompt.placeholder = 'Tell me what happened, what you need to say, and what you want to happen next…';
      }
      track('wdis_mode_select', { mode: state.mode });
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    deliverMessage();
  });

  $('#copy').addEventListener('click', async () => {
    if (!state.last) return;
    try {
      await navigator.clipboard.writeText(state.last);
      $('#copy').textContent = 'Copied';
      setTimeout(() => { $('#copy').textContent = 'Copy'; }, 1500);
      track('wdis_copy');
    } catch (_) {
      result.focus();
      window.getSelection()?.selectAllChildren(result);
    }
  });

  $$('[data-refine]').forEach((button) => button.addEventListener('click', () => {
    if (!state.last) return;
    const action = button.dataset.refine;
    if (action === 'shorter') state.last = shorten(state.last);
    if (action === 'softer') state.last = soften(state.last);
    if (action === 'firmer') state.last = firmer(state.last);
    if (action === 'professional') state.last = professionalize(state.last);
    if (action === 'another') {
      if (!isFounder() && uses() >= FREE_LIMIT) return showPaywall();
      state.variation += 1;
      state.last = generate();
      if (!isFounder()) localStorage.setItem(keys.uses, String(uses() + 1));
      updateTrial();
    }
    result.textContent = state.last;
    saveHistory(state.last);
    track('wdis_refine', { action });
  }));

  $$('.founder-unlock').forEach((button) => button.addEventListener('click', () => {
    localStorage.setItem(keys.founder, '1');
    updateTrial();
    hidePaywall();
    button.textContent = 'Founding access unlocked on this device';
    track('wdis_founder_unlock');
  }));

  $$('[data-founder-checkout]').forEach((link) => link.addEventListener('click', () => {
    track('wdis_founder_checkout_click', { offer: '19.99_lifetime_beta' });
  }));

  $('.paywall-close')?.addEventListener('click', hidePaywall);
  paywall?.addEventListener('click', (event) => { if (event.target === paywall) hidePaywall(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !paywall.hidden) hidePaywall(); });

  $('#clear-history').addEventListener('click', () => {
    localStorage.removeItem(keys.history);
    renderHistory();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    installButton.hidden = true;
    track('wdis_install_prompt');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/what-do-i-say/service-worker.js', { scope: '/what-do-i-say/' }).catch(() => {});
    });
  }

  updateTrial();
  renderHistory();
})();