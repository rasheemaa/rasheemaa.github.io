(() => {
  'use strict';
  const KEY = 'sparkle_creator_projects_v1';
  const MAX_BYTES = 2000000;
  const $ = id => document.getElementById(id);
  const button = $('import-projects'), input = $('project-backup');
  const status = message => { $('backup-status').textContent = message; };
  const tasks = new Set(['content','growth','reply','sell','deal','pdf','performance']);
  const tones = new Set(['Relatable and confident','Warm and conversational','Playful and bold','Clear and professional']);
  let busy = false, sequence = 0;
  const fail = message => { throw new Error(message); };
  const string = (value, limit, required = false) => typeof value === 'string'
    && value.length <= limit && (!required || value.trim().length > 0);
  const normalize = value => {
    if (!Array.isArray(value) || value.length > 30) fail('Choose a Sparkle project backup containing at most 30 projects. Nothing was changed.');
    const ids = new Set();
    return value.map(p => {
      if (!p || typeof p !== 'object' || Array.isArray(p)
        || !string(p.id,128,true) || ids.has(p.id)
        || !string(p.name,80,true) || !string(p.idea,4000,true)
        || !string(p.audience,160) || !tasks.has(p.task) || !tones.has(p.tone)
        || !string(p.saved,64,true) || !Number.isFinite(Date.parse(p.saved))
        || (p.draft !== undefined && !string(p.draft,12000))) {
        fail('This backup contains an unsupported or damaged project. Nothing was changed.');
      }
      ids.add(p.id);
      return {id:p.id,name:p.name,task:p.task,idea:p.idea,audience:p.audience,tone:p.tone,saved:p.saved,draft:p.draft || ''};
    });
  };
  const content = p => JSON.stringify([p.name,p.task,p.idea,p.audience,p.tone,p.saved,p.draft || '']);
  const readFile = async file => {
    let timer;
    try {
      return await Promise.race([
        file.text(),
        new Promise((_,reject) => { timer = setTimeout(() => reject(new Error('The backup could not be read in time. Try choosing it again. Nothing was changed.')),10000); })
      ]);
    } finally { clearTimeout(timer); }
  };
  button.addEventListener('click', () => { if (!busy) input.click(); });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || busy) return;
    busy = true; button.disabled = true; input.disabled = true;
    status('Reading your project backup…');
    try {
      if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_BYTES) fail('Choose a project backup smaller than 2 MB. Nothing was changed.');
      const text = await readFile(file);
      if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BYTES) fail('This backup is too large. Nothing was changed.');
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { fail('This file is not a readable JSON backup. Nothing was changed.'); }
      const incoming = normalize(parsed);
      let raw, existing;
      try { raw = localStorage.getItem(KEY); existing = JSON.parse(raw || '[]'); normalize(existing); }
      catch (_) { fail('Existing saved projects could not be verified. Export them before restoring a backup. Nothing was changed.'); }
      const ids = new Set(existing.map(p => p.id));
      const additions = [];
      let duplicates = 0, copies = 0;
      for (const project of incoming) {
        const alreadySaved = existing.some(p => (p.id === project.id || p.restoredFromId === project.id) && content(p) === content(project));
        if (alreadySaved) { duplicates++; continue; }
        let next = project;
        if (ids.has(project.id)) {
          let id;
          do { id = 'restored_' + Date.now() + '_' + (++sequence) + '_' + Math.random().toString(36).slice(2,9); } while (ids.has(id));
          next = {...project,id,restoredFromId:project.id}; copies++;
        }
        ids.add(next.id); additions.push(next);
      }
      if (!additions.length) {
        status(incoming.length ? 'These projects are already saved here. Nothing was changed.' : 'This backup contains no projects. Nothing was changed.');
        return;
      }
      if (existing.length + additions.length > 30) fail('Restoring this backup would exceed 30 saved projects. Export your current projects and make room before trying again. Nothing was changed.');
      if (!window.confirm('Restore ' + additions.length + ' project' + (additions.length === 1 ? '' : 's') + ' from this backup? Existing projects and your current draft will be kept.')) {
        status('Restore cancelled. Nothing was changed.'); return;
      }
      if (localStorage.getItem(KEY) !== raw) fail('Saved projects changed while you reviewed the backup. Choose the file again to restore safely. Nothing was changed.');
      try { localStorage.setItem(KEY,JSON.stringify([...additions,...existing])); }
      catch (_) { fail('Browser storage is unavailable or full. The backup was not restored; existing projects were kept.'); }
      window.dispatchEvent(new Event('sparkle:projects-restored'));
      status(additions.length + ' project' + (additions.length === 1 ? '' : 's') + ' restored on this device.'
        + (copies ? ' Matching IDs were restored as separate copies.' : '')
        + (duplicates ? ' Already saved projects were kept once.' : '')
        + ' Your current form and draft are unchanged.');
    } catch (error) {
      status(error instanceof Error ? error.message : 'The backup could not be restored. Nothing was changed.');
    } finally {
      busy = false; button.disabled = false; input.disabled = false; input.value = '';
    }
  });
})();
