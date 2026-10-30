/* Contextual Creator Studio prompts. Presentation only, no inference or network calls.
   Existing task values and saved project structure are intentionally unchanged. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const task = $('task'), idea = $('idea'), audience = $('audience'), tone = $('tone');
  const choices = Object.freeze({
    content:{
      title:'Plan a post or video',
      intro:'Turn your idea into an editable content brief with a clear direction.',
      idea:'What is your post or video idea?',
      example:'I want to make a relatable POV about setting boundaries without sounding preachy.',
      hint:'Share the message and the kind of post you imagine. No personal experiences will be invented.',
      audience:'Who should this content reach? (optional)',
      audienceExample:'People navigating boundaries, my followers…',
      tone:'What vibe should the post have?',
      options:['Relatable and confident','Warm and conversational','Playful and bold','Clear and professional'],
      button:'Create content brief',
      draft:'Your content brief',
      result:'Review your hooks, scene ideas, caption structure and next steps.'
    },
    growth:{
      title:'Plan your content schedule',
      intro:'Turn a realistic posting goal into an organized weekly plan.',
      idea:'What is your content goal?',
      example:'I can film two days a week and want a seven day Instagram and TikTok posting plan.',
      hint:'Include your platforms, available time and goals. Sparkle will not invent platform updates.',
      audience:'Who are you trying to reach? (optional)',
      audienceExample:'New creators, existing followers…',
      tone:'What approach fits your planning style?',
      options:['Practical and encouraging','Clear and professional','Warm and conversational','Relatable and confident'],
      button:'Create posting plan',
      draft:'Your posting plan',
      result:'Review content pillars, posting rhythm and measurable experiments.'
    },
    reply:{
      title:'Plan your response',
      intro:'Organize a reply in your own words. Nothing will be sent automatically.',
      idea:'What did they say, and what do you want to say back?',
      example:'Message received: Can you deliver the video tomorrow?\nWhat I want to say: I need until Friday.',
      hint:'Include both their message and your intended response so Sparkle does not mix up who said what.',
      audience:'Who are you replying to? (optional)',
      audienceExample:'A customer, creator, brand contact…',
      tone:'How should your reply sound?',
      options:['Warm and conversational','Firm and respectful','Friendly and casual','Clear and professional'],
      button:'Create reply outline',
      draft:'Your reply outline',
      result:'Review the response framework before editing or sending it yourself.'
    },
    sell:{
      title:'Plan an offer',
      intro:'Explain the value of your offer without pressure or invented claims.',
      idea:'What are you offering and why does it help?',
      example:'I offer 30 minute creator brainstorming sessions. Help explain who it is for and what is included.',
      hint:'Describe your real offer, its benefits and any verified price or limitations.',
      audience:'Who is the offer for? (optional)',
      audienceExample:'New creators, potential customers…',
      tone:'How should the promotion sound?',
      options:['Friendly and helpful','Relatable and confident','Clear and professional','Warm and conversational'],
      button:'Create promotion brief',
      draft:'Your promotion brief',
      result:'Review the offer, honest benefits and a gentle call to action.'
    },
    deal:{
      title:'Review a brand deal',
      intro:'Sort out the details before you accept or negotiate anything.',
      idea:'What is the brand offering or requesting?',
      example:'A brand wants two videos and 90 days of usage rights, but has not shared a budget.',
      hint:'Include the fee, deliverables, rights, deadlines and any missing terms. No acceptance is sent.',
      audience:'Who would see this partnership? (optional)',
      audienceExample:'My TikTok audience, the brand’s customers…',
      tone:'How should your negotiation sound?',
      options:['Clear and professional','Firm and respectful','Warm and conversational','Relatable and confident'],
      button:'Create deal review',
      draft:'Your brand deal review',
      result:'Review missing terms, questions and a possible negotiation structure.'
    },
    pdf:{
      title:'Outline a digital product',
      intro:'Shape a journal, guide, workbook or other product before making the final file.',
      idea:'What digital product do you want to make?',
      example:'A gentle weekly reflection journal with prompts, a tracker and accessible formatting.',
      hint:'Describe who it helps and what sections it needs. This creates an outline, not a downloadable PDF.',
      audience:'Who will use it? (optional)',
      audienceExample:'Beginners, busy parents, my community…',
      tone:'How should the product read?',
      options:['Warm and conversational','Clear and professional','Practical and encouraging','Relatable and confident'],
      button:'Create product outline',
      draft:'Your product outline',
      result:'Review sections, activities and accessibility considerations.'
    },
    performance:{
      title:'Review your content metrics',
      intro:'Find practical next steps using only numbers you provide.',
      idea:'What were your actual results, and from when?',
      example:'Last week on TikTok: 1,000 views, 90 likes, 15 saves and 4 shares. What should I test next?',
      hint:'Include the date range and real metrics. Sparkle will separate facts from hypotheses.',
      audience:'Which audience or account is this for? (optional)',
      audienceExample:'My TikTok page, Instagram followers…',
      tone:'How should the analysis be presented?',
      options:['Clear and professional','Practical and encouraging','Warm and conversational','Relatable and confident'],
      button:'Create metrics review',
      draft:'Your metrics review',
      result:'Review observed metrics, uncertainties and testable improvements.'
    }
  });
  const refresh = ({preserveTone=false} = {}) => {
    const selected = choices[task.value] || choices.content;
    const oldTone = tone.value;
    $('composer-title').textContent = selected.title;
    $('composer-description').textContent = selected.intro;
    $('idea-label').textContent = selected.idea;
    idea.placeholder = selected.example;
    $('task-help').textContent = selected.hint;
    $('audience-label').textContent = selected.audience;
    audience.placeholder = selected.audienceExample;
    $('tone-label').textContent = selected.tone;
    const options = selected.options.map(label => new Option(label,label));
    if (preserveTone && oldTone && !selected.options.includes(oldTone)) {
      // Keep earlier saved projects readable rather than silently resetting tone.
      options.push(new Option(oldTone,oldTone));
    }
    tone.replaceChildren(...options);
    if (preserveTone && oldTone && [...tone.options].some(option => option.value === oldTone)) tone.value = oldTone;
    $('make').textContent = selected.button;
    $('draft-title').textContent = selected.draft;
    $('draft-description').textContent = selected.result;
    $('composer').dataset.creatorTask = task.value;
    $('output').dataset.creatorTask = task.value;
    // Never overwrite an existing draft or editor when changing task.
    $('task-mode-status').textContent = 'Updated for: ' + selected.title + '. Existing drafts stay untouched until you create another.';
  };
  task.addEventListener('change',()=>{
    refresh();
    // Update the existing saved-form snapshot after the contextual tone changes.
    tone.dispatchEvent(new Event('change',{bubbles:true}));
  });
  window.SparkleCreatorTaskFlow={refresh};
  refresh({preserveTone:true});
})();