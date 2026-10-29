export const FORMATS = ['9:16', '16:9', '1:1'];
export const STYLES = ['Cinematic realism', 'Product film', '3D animation', 'Illustrated story'];
export const CAMERAS = ['Locked frame', 'Slow push in', 'Slow pull back', 'Tracking shot', 'Close detail', 'Overhead'];
export const MAX_SCENES = 8;
export const MAX_BACKUP_BYTES = 131072;
// Local record identifiers are not authentication tokens. HTTP development
// previews do not expose randomUUID, while production HTTPS normally does.
export function newProjectId(random = globalThis.crypto) {
  if (typeof random?.randomUUID === 'function') return random.randomUUID();
  if (typeof random?.getRandomValues === 'function') {
    return Array.from(random.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This is not a supported video plan.');
  return value;
}
function text(value, limit) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new Error('A plan field is invalid or too long.');
  return value;
}
function option(value, choices) {
  if (!choices.includes(value)) throw new Error('A plan setting is not supported.');
  return value;
}
export function normalizeProject(value) {
  const p = object(value);
  if (!Array.isArray(p.scenes) || p.scenes.length < 1 || p.scenes.length > MAX_SCENES) throw new Error('A video plan needs 1 to 8 scenes.');
  const scenes = p.scenes.map(value => {
    const s = object(value);
    if (!Number.isInteger(s.seconds) || s.seconds < 1 || s.seconds > 60) throw new Error('Each scene needs 1 to 60 whole seconds.');
    return {title: text(s.title, 80), action: text(s.action, 1000), seconds: s.seconds, camera: option(s.camera, CAMERAS), audio: text(s.audio, 400)};
  });
  return {title: text(p.title, 80), concept: text(p.concept, 2000), format: option(p.format, FORMATS), duration: option(p.duration, [15, 30, 60]), style: option(p.style, STYLES), continuity: text(p.continuity, 1000), sound: text(p.sound, 600), scenes};
}
export function newScene(index = 0) {
  return {title: ['Opening', 'Development', 'Closing'][index] || 'Next scene', action: '', seconds: 5, camera: 'Locked frame', audio: ''};
}
export function newProject() {
  return {title: '', concept: '', format: '9:16', duration: 15, style: 'Cinematic realism', continuity: '', sound: '', scenes: [0, 1, 2].map(newScene)};
}
export function exampleProject() {
  return {title: 'After the rain', concept: 'A quiet city evening after rain. Reflections, warm windows and a moment of stillness. No people appear.', format: '9:16', duration: 15, style: 'Cinematic realism', continuity: 'One empty city street at blue hour. Wet pavement, warm amber windows, deep violet shadows. Keep the weather and light consistent.', sound: 'Soft rainfall and distant city ambience. No speech or music.', scenes: [
    {title: 'The first reflection', seconds: 5, camera: 'Close detail', action: 'A puddle reflects one warm window. A single drop breaks the reflection into ripples.', audio: 'One clear water drop over soft rain.'},
    {title: 'The street breathes', seconds: 5, camera: 'Slow push in', action: 'Reveal the empty street and the same amber window. Light rests on the wet paving stones.', audio: 'Soft rain continues with a distant passing car.'},
    {title: 'A little stillness', seconds: 5, camera: 'Locked frame', action: 'Return to the puddle as the ripples settle and the window reflection becomes still.', audio: 'Let the city ambience fade gently.'}
  ]};
}
export const totalSeconds = project => project.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
export function fitTiming(value) {
  const p = normalizeProject(value);
  const base = Math.floor(p.duration / p.scenes.length), remainder = p.duration % p.scenes.length;
  return {...p, scenes: p.scenes.map((scene, index) => ({...scene, seconds: base + (index < remainder ? 1 : 0)}))};
}
export function exportIssues(value) {
  const p = normalizeProject(value), issues = [];
  if (!p.title.trim()) issues.push('Give your project a name.');
  if (!p.concept.trim()) issues.push('Describe your video idea.');
  p.scenes.forEach((scene, index) => {if (!scene.action.trim()) issues.push('Describe what happens in scene ' + (index + 1) + '.');});
  if (totalSeconds(p) !== p.duration) issues.push('Scene timing must total ' + p.duration + ' seconds. Use Fit timing or edit the scene lengths.');
  return issues;
}
export function renderBrief(value) {
  const p = normalizeProject(value), issues = exportIssues(p);
  if (issues.length) throw new Error(issues[0]);
  let start = 0;
  const scenes = p.scenes.map((scene, index) => {
    const end = start + scene.seconds;
    const result = '\nSCENE ' + (index + 1) + ': ' + (scene.title.trim() || 'Untitled scene') + '\nTime: ' + start + ' to ' + end + ' seconds\nCamera: ' + scene.camera + '\nAction: ' + scene.action.trim() + '\nAudio: ' + (scene.audio.trim() || 'Not specified');
    start = end;
    return result;
  });
  return ['SPARKLE VIDEO PLAN', p.title.trim(), '\nIDEA\n' + p.concept.trim(), '\nDIRECTION\nFormat: ' + p.format + '\nTarget length: ' + p.duration + ' seconds\nVisual style: ' + p.style, '\nCONTINUITY\n' + (p.continuity.trim() || 'Not specified'), '\nSOUND\n' + (p.sound.trim() || 'Not specified'), '\nSHOT PLAN', ...scenes, '\nPOLICY\nAny people depicted must be adults. No minors or sexual violence.', '\nThis is a manually edited production plan. No video or audio has been generated.'].join('\n');
}
export function encodeBackup(project) {
  return JSON.stringify({app: 'Sparkle Video Planner', version: 1, project: normalizeProject(project)}, null, 2);
}
export function decodeBackup(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error('Choose a video plan backup smaller than 128 KB.');
  let value;
  try {value = JSON.parse(raw);} catch {throw new Error('This file is not readable JSON.');}
  object(value);
  if (value.app !== 'Sparkle Video Planner' || value.version !== 1) throw new Error('Choose a Sparkle Video Planner backup, version 1.');
  return normalizeProject(value.project);
}
