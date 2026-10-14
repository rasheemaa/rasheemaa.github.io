(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const scene = $('scene');
  const prepared = $('prepared');
  const panel = $('prepared-panel');
  const status = $('composer-status');
  const samples = {
    street: 'A woman walks through Philadelphia at dusk after a light rain. Reflections move across wet pavement as buses pass. Her hair shifts naturally in the breeze. The pedestrians behind her move independently and realistically.',
    portrait: 'A close cinematic portrait of an adult woman sitting at a cafe window. She looks up and gives a small natural smile. Her breathing, blinking, skin texture and movements are subtle and realistic. People walk past outside in soft focus.',
    nature: 'A red fox quietly steps through a misty pine forest at sunrise. Dew clings to the plants and a breeze moves the tree branches. Its fur and movement look natural, like documentary footage.'
  };
  const cameras = {
    natural: 'Natural handheld camera with subtle stabilization',
    dolly: 'Slow cinematic dolly camera movement',
    locked: 'Locked-off tripod camera with no artificial camera movement',
    tracking: 'Smooth tracking camera that follows the main subject',
    close: 'Intimate shallow-depth-of-field close-up camera'
  };
  const lights = {
    natural: 'Physically realistic natural lighting and shadows',
    golden: 'Warm golden-hour sunlight with realistic soft shadows',
    studio: 'Soft studio lighting with lifelike skin tones',
    night: 'Moody nighttime practical lights with natural reflections',
    overcast: 'Soft overcast daylight with believable diffuse shadows'
  };
  const sounds = {
    ambient: 'Subtle synchronized, realistic environmental sounds',
    quiet: 'Restrained quiet atmosphere with appropriate natural ambience',
    cinematic: 'Detailed synchronized cinematic environmental audio'
  };
  function selected(id, map) {
    const value = $(id).value;
    return Object.prototype.hasOwnProperty.call(map, value) ? map[value] : '';
  }
  function setStatus(message) { status.textContent = message; }
  function prepare() {
    const description = scene.value.replace(/\s+/g, ' ').trim();
    if (!description) {
      scene.focus();
      setStatus('First describe what you want to see in the video.');
      return;
    }
    const format = $('format').value;
    prepared.value = [
      description,
      'Visual style: Photorealistic live-action cinema, lifelike anatomy and motion, consistent subjects, physically plausible movement and lighting. Avoid animated or illustrated appearance, distortions, morphing, and inconsistent faces.',
      'Camera: ' + selected('camera', cameras) + '.',
      'Lighting: ' + selected('lighting', lights) + '.',
      'Audio: ' + selected('sound', sounds) + '.',
      'Composition: ' + format + ' frame; maintain composition and visual continuity throughout the shot.'
    ].join('\n\n');
    panel.hidden = false;
    setStatus('Your prompt is ready. Copy it, paste it into the generator and choose the same frame shape there.');
    prepared.focus();
  }
  async function copyPrompt() {
    if (!prepared.value) return;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard not available');
      await navigator.clipboard.writeText(prepared.value);
      setStatus('Prompt copied! Paste it into the generator and select Generate Video.');
    } catch (_) {
      prepared.focus();
      prepared.select();
      setStatus('Select Copy from your device menu. Your entire prompt is selected.');
    }
  }
  $('prepare').addEventListener('click', prepare);
  $('copy').addEventListener('click', copyPrompt);
  document.querySelectorAll('[data-sample]').forEach((button) => {
    button.addEventListener('click', () => {
      const example = samples[button.getAttribute('data-sample')];
      if (!example) return;
      scene.value = example;
      panel.hidden = true;
      setStatus('Example loaded. Change anything you like, then prepare your prompt.');
      scene.focus();
    });
  });
  scene.addEventListener('input', () => {
    if (!panel.hidden) {
      panel.hidden = true;
      setStatus('Scene changed. Prepare your prompt again to include your edits.');
    }
  });
  for (const id of ['camera', 'lighting', 'format', 'sound']) {
    $(id).addEventListener('change', () => {
      if (!panel.hidden) {
        panel.hidden = true;
        setStatus('Settings changed. Prepare your prompt again to include them.');
      }
    });
  }
})();