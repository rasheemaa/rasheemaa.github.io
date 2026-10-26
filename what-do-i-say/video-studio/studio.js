(() => {
  'use strict';
  // Fail closed: no prompt preparation, video provider, or API request is
  // available while mandatory moderation is not implemented and verified.
  // This client lock is only a supplementary safeguard. Production must enforce
  // policy on the server and inspect inputs, uploads, generated frames and audio.
  const safetyLocked = true;
  const $ = id => document.getElementById(id);
  const scene = $('scene');
  const panel = $('prepared-panel');
  const status = $('composer-status');
  const samples = {
    street: 'An adult woman walks through Philadelphia at dusk after a light rain. Reflections move across wet pavement as buses pass.',
    portrait: 'A close cinematic portrait of an adult woman sitting at a cafe window in soft natural light.',
    nature: 'A red fox quietly steps through a misty pine forest at sunrise.'
  };
  function block() {
    panel.hidden = true;
    $('prepared').value = '';
    status.textContent = 'Video generation and prompt preparation are unavailable until mandatory server side moderation is verified.';
  }
  $('prepare').disabled = true;
  $('prepare').addEventListener('click', block);
  $('copy').addEventListener('click', block);
  document.querySelectorAll('[data-sample]').forEach(button => {
    button.addEventListener('click', () => {
      const example = samples[button.getAttribute('data-sample')];
      if (!example) return;
      scene.value = example;
      block();
      scene.focus();
    });
  });
  scene.addEventListener('input', block);
  for (const id of ['camera', 'lighting', 'format', 'sound']) {
    $(id).addEventListener('change', block);
  }
  if (safetyLocked) block();
})();
