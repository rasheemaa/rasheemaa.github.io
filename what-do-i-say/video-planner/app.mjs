import {MAX_SCENES, MAX_BACKUP_BYTES, newProjectId, newProject, newScene, exampleProject, normalizeProject, totalSeconds, fitTiming, renderBrief, encodeBackup, decodeBackup} from './model.mjs?v=1';

const KEY = 'sparkle_video_plans_v1', RECOVERY = 'sparkle_video_plan_recovery_v1';
const $ = id => document.getElementById(id);
const fields = ['title', 'concept', 'format', 'duration', 'style', 'continuity', 'sound'];
let project = newProject(), activeId = null, activeVersion = null, clean = JSON.stringify(project);
const message = text => { $('status').textContent = text; };
const dirty = () => JSON.stringify(project) !== clean;
const discard = () => !dirty() || window.confirm('Replace this unsaved video plan? Download a backup first if you want to keep it.');
const id = () => newProjectId();
const withStoreLock = work => navigator.locks?.request ? navigator.locks.request(KEY, work) : Promise.resolve().then(work);

function readProjects() {
  try {
    const records = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(records) || records.length > 20) throw new Error();
    const ids = new Set();
    return records.map(record => {
      if (!record || typeof record.id !== 'string' || !/^[\w-]{1,80}$/.test(record.id) || ids.has(record.id) || typeof record.updated !== 'string' || !Number.isFinite(Date.parse(record.updated))) throw new Error();
      ids.add(record.id);
      return {id: record.id, updated: record.updated, project: normalizeProject(record.project)};
    });
  } catch {
    message('Saved projects could not be read. Stored data has been left untouched. Download a backup of your current plan to keep it.');
    return null;
  }
}
function refreshProjects() {
  const selected = $('saved-projects').value, records = readProjects();
  $('saved-projects').replaceChildren(new Option('Choose a project', ''));
  if (!records) return;
  records.forEach(record => $('saved-projects').add(new Option(record.project.title || 'Untitled video plan', record.id)));
  if (records.some(record => record.id === selected)) $('saved-projects').value = selected;
}
function remember() {
  try {sessionStorage.setItem(RECOVERY, JSON.stringify({project, activeId, activeVersion, clean}));}
  catch {message('Tab recovery is unavailable. Save your project or download a backup to keep your changes.');}
}
function updateOverview() {
  const total = totalSeconds(project), valid = total === project.duration;
  $('timing').textContent = total + ' of ' + project.duration + ' seconds' + (valid ? ' · Timing fits' : ' · Adjust scene lengths');
  $('timing').parentElement.dataset.valid = String(valid);
  $('scene-count').textContent = project.scenes.length + (project.scenes.length === 1 ? ' scene' : ' scenes');
  $('add-scene').disabled = project.scenes.length >= MAX_SCENES;
  $('frame-label').textContent = project.format;
  $('frame').dataset.format = project.format;
  $('overview-title').textContent = project.title.trim() || 'Your next idea starts here.';
  $('frame-meta').textContent = project.duration + ' seconds · ' + project.style;
  const timeline = $('timeline');
  timeline.replaceChildren();
  let start = 0;
  for (const [index, scene] of project.scenes.entries()) {
    const li = document.createElement('li'), time = document.createElement('time'), content = document.createElement('div'), title = document.createElement('strong'), action = document.createElement('p');
    time.textContent = start + 's'; start += scene.seconds;
    title.textContent = (index + 1) + '. ' + (scene.title.trim() || 'Untitled scene');
    action.textContent = scene.action.trim() || 'Add your scene direction.';
    content.append(title, action); li.append(time, content); timeline.append(li);
  }
}
function changed() {
  $('plan-review').hidden = true;
  updateOverview(); remember();
}
function renderScenes() {
  const scenes = $('scenes'); scenes.replaceChildren();
  project.scenes.forEach((scene, index) => {
    const fragment = $('scene-template').content.cloneNode(true), article = fragment.querySelector('article');
    article.querySelector('h3').textContent = 'SCENE ' + String(index + 1).padStart(2, '0');
    for (const field of ['title','seconds','action','camera','audio']) {
      const control = article.querySelector('[data-field="' + field + '"]');
      control.id = 'scene-' + index + '-' + field;
      const label = article.querySelector('[data-label="' + field + '"]');
      label.htmlFor = control.id;
      control.setAttribute('aria-label', 'Scene ' + (index + 1) + ': ' + label.textContent);
      control.value = scene[field];
      control.addEventListener('input', () => {
        if (field === 'seconds') {
          const n = Number(control.value);
          if (!control.value || !Number.isInteger(n) || n < 1 || n > 60) {
            control.setCustomValidity('Use a whole number from 1 to 60.');
            message('Scene ' + (index + 1) + ' needs 1 to 60 whole seconds.'); return;
          }
          control.setCustomValidity(''); project.scenes[index].seconds = n;
        } else project.scenes[index][field] = control.value;
        changed();
      });
    }
    const buttons = {};
    for (const action of ['up','down','remove']) {
      const button = article.querySelector('[data-action="' + action + '"]'); buttons[action] = button;
      button.setAttribute('aria-label', action === 'remove' ? 'Remove scene ' + (index + 1) : 'Move scene ' + (index + 1) + ' ' + action);
      button.addEventListener('click', () => {
        let next = index;
        if (action === 'remove') {
          if (project.scenes.length <= 1) return;
          if ((scene.action.trim() || scene.audio.trim()) && !window.confirm('Remove this scene from the current plan?')) return;
          project.scenes.splice(index, 1); next = Math.min(index, project.scenes.length - 1);
        } else {
          next = index + (action === 'up' ? -1 : 1);
          if (next < 0 || next >= project.scenes.length) return;
          [project.scenes[index], project.scenes[next]] = [project.scenes[next], project.scenes[index]];
        }
        renderScenes(); changed();
        $('scene-' + next + '-title').focus();
        message(action === 'remove' ? 'Scene removed. Check the total timing before exporting.' : 'Scene moved. Your shot order is updated.');
      });
    }
    buttons.up.disabled = index === 0; buttons.down.disabled = index === project.scenes.length - 1; buttons.remove.disabled = project.scenes.length === 1;
    scenes.append(fragment);
  });
}
function render() {
  fields.forEach(field => {$(field).value = project[field];});
  renderScenes(); updateOverview(); $('plan-review').hidden = true;
}
function inputIsValid() {
  for (const control of document.querySelectorAll('input:not([type=file]),textarea,select')) {
    if (!control.checkValidity()) {control.reportValidity(); control.focus(); return false;}
  }
  return true;
}
function fullPlan() {
  if (!inputIsValid()) return null;
  try {return renderBrief(project);} catch (error) {message(error.message); return null;}
}
function download(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function replaceProject(next, notice) {
  if (!discard()) return false;
  project = normalizeProject(next); activeId = null; activeVersion = null;
  clean = JSON.stringify(newProject()); $('saved-projects').value = '';
  render(); remember(); message(notice); return true;
}

fields.forEach(field => $(field).addEventListener('input', () => {
  project[field] = field === 'duration' ? Number($(field).value) : $(field).value;
  changed();
}));
$('fit').addEventListener('click', () => {
  project = fitTiming(project); renderScenes(); changed(); message('Scene lengths now fit your ' + project.duration + ' second target.');
});
$('add-scene').addEventListener('click', () => {
  if (project.scenes.length >= MAX_SCENES) return;
  project.scenes.push(newScene(project.scenes.length)); renderScenes(); changed();
  $('scene-' + (project.scenes.length - 1) + '-action').focus(); message('New scene added. Fit timing when your shot list is ready.');
});
$('sample').addEventListener('click', () => replaceProject(exampleProject(), 'Sample loaded. This is an editable example plan, not generated footage.'));
$('new').addEventListener('click', () => {
  if (replaceProject(newProject(), 'A fresh plan is ready. Saved projects are still available.')) {clean = JSON.stringify(project); remember(); $('title').focus();}
});
$('save').addEventListener('click', async () => {
  if (!inputIsValid()) return;
  if (!project.title.trim()) {message('Give your video project a name before saving.'); $('title').focus(); return;}
  try {await withStoreLock(() => {
  const records = readProjects(); if (!records) return;
  let existing = records.find(record => record.id === activeId), conflict = false;
  if (existing && JSON.stringify(existing) !== activeVersion) {existing = null; conflict = true;}
  if (!existing && records.length >= 20) {message('You have 20 saved video plans. Download a backup to keep this one. Nothing was overwritten.'); return;}
  const record = {id: existing?.id || id(), updated: new Date().toISOString(), project: normalizeProject(project)};
  try {
    localStorage.setItem(KEY, JSON.stringify([record, ...records.filter(item => item.id !== record.id)]));
    activeId = record.id; activeVersion = JSON.stringify(record); clean = JSON.stringify(project);
    refreshProjects(); $('saved-projects').value = record.id; remember();
    message(conflict ? 'The saved project changed in another tab. Your version was saved as a separate copy.' : 'Video plan saved in this browser. Download a backup to keep a separate copy.');
  } catch {message('Browser storage is full or unavailable. Download a backup to keep this plan.');}
  });} catch {message('The project could not be saved safely. Download a backup to keep this plan.');}
});
$('delete-project').addEventListener('click', async () => {
  const selected = $('saved-projects').value;
  const record = readProjects()?.find(item => item.id === selected);
  if (!record) {message('Choose a saved video project before deleting.'); return;}
  const expected = JSON.stringify(record);
  if (!window.confirm('Delete the selected saved video project? Your open plan stays available. Download a backup first if you need a separate copy.')) return;
  try {await withStoreLock(() => {
    const records = readProjects(); if (!records) return;
    const latest = records.find(item => item.id === selected);
    if (latest && JSON.stringify(latest) !== expected) {message('This project changed in another tab. Open it again before deleting.'); return;}
    localStorage.setItem(KEY, JSON.stringify(records.filter(item => item.id !== selected)));
    if (activeId === selected) {activeId = null; activeVersion = null; clean = JSON.stringify(newProject()); remember();}
    refreshProjects(); message('The selected saved project was deleted. Your open plan is still available to save or back up.');
  });} catch {message('The saved project could not be deleted. Stored data was left untouched.');}
});
$('load').addEventListener('click', () => {
  const record = readProjects()?.find(item => item.id === $('saved-projects').value);
  if (!record) {message('Choose a saved video project first.'); return;}
  if (!discard()) return;
  project = record.project; activeId = record.id; activeVersion = JSON.stringify(record); clean = JSON.stringify(project);
  render(); remember(); message('Saved video plan opened. Your scene direction is ready to edit.');
});
$('show-plan').addEventListener('click', () => {
  const text = fullPlan(); if (!text) return;
  $('plan-text').textContent = text; $('plan-review').hidden = false; $('plan-text').focus(); message('Your complete shot plan is ready to review.');
});
$('copy').addEventListener('click', async () => {
  const text = fullPlan(); if (!text) return;
  let timeout;
  try {
    await Promise.race([navigator.clipboard.writeText(text), new Promise((_, reject) => {timeout = setTimeout(() => reject(new Error()), 2000);})]);
    message('Video plan copied.');
  } catch {$('plan-text').textContent = text; $('plan-review').hidden = false; $('plan-text').focus(); message('Clipboard unavailable. Your full plan is shown below for manual copying.');}
  finally {clearTimeout(timeout);}
});
$('download-plan').addEventListener('click', () => {const text = fullPlan(); if (text) {download(text, 'text/plain;charset=utf-8', 'sparkle-video-plan.txt'); message('Text plan download requested. This is a production brief, not a video file.');}});
$('backup').addEventListener('click', () => {if (!inputIsValid()) return; download(encodeBackup(project), 'application/json', 'sparkle-video-plan.json'); message('Video plan backup download requested. It contains the current plan only.');});
$('restore').addEventListener('click', () => $('backup-file').click());
$('backup-file').addEventListener('change', async () => {
  const file = $('backup-file').files?.[0]; if (!file) return;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Choose a video plan backup smaller than 128 KB.');
    const snapshot = JSON.stringify(project), raw = await file.text();
    if (JSON.stringify(project) !== snapshot) throw new Error('The plan changed while reading the file. Choose the backup again when you are ready.');
    replaceProject(decodeBackup(raw), 'Backup restored as an unsaved plan. Save it to add a project. Existing saved projects are unchanged.');
  } catch (error) {message(error.message || 'The backup could not be read. Your current plan is unchanged.');}
  finally {$('backup-file').value = '';}
});
window.addEventListener('storage', event => {if (event.key === KEY) {refreshProjects(); message('Saved projects changed in another tab. Your current plan is still here.');}});
window.addEventListener('beforeunload', event => {if (dirty()) {event.preventDefault(); event.returnValue = '';}});
try {
  const recovery = JSON.parse(sessionStorage.getItem(RECOVERY) || 'null');
  if (recovery) {
    project = normalizeProject(recovery.project);
    if (typeof recovery.clean !== 'string' || recovery.clean.length > MAX_BACKUP_BYTES) throw new Error();
    normalizeProject(JSON.parse(recovery.clean)); clean = recovery.clean;
    activeId = typeof recovery.activeId === 'string' ? recovery.activeId : null;
    activeVersion = typeof recovery.activeVersion === 'string' ? recovery.activeVersion : null;
    message('Your video plan was recovered in this tab. Save or download a backup to keep it.');
  }
} catch {message('Tab recovery could not be read. Stored projects were left untouched.');}
render(); refreshProjects();
