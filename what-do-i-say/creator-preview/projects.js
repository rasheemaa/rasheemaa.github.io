(() => {
  'use strict';
  const KEY = 'sparkle_creator_projects_v1';
  const DRAFT_KEY = 'sparkle_creator_unsaved_draft_v1';
  const $ = id => document.getElementById(id);
  const status = message => { $('save-status').textContent = message; };
  let editingId = null;
  let editingVersion = null;
  const fields = ['project','idea','audience','task','tone'];
  const snapshot = () => JSON.stringify(fields.map(id => $(id).value));
  let cleanSnapshot = snapshot();
  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {} };
  let suspendDraft = false;
  const saveDraft = () => {
    if (suspendDraft) return;
    try {
      if (snapshot() === cleanSnapshot) { clearDraft(); return; }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ fields: fields.map(id => $(id).value), time: Date.now() }));
    } catch (_) {}
  };
  fields.forEach(id => {
    $(id).addEventListener('input', saveDraft);
    $(id).addEventListener('change', saveDraft);
  });
  const confirmDiscard = () => snapshot() === cleanSnapshot || window.confirm('Discard unsaved changes to the current project?');
  const confirmOutputReplace = () => !window.SparkleCreatorDrafts || window.SparkleCreatorDrafts.confirmReplace();
  const resetOutput = () => {
    window.SparkleCreatorAI?.cancel();
    if (window.SparkleCreatorDrafts?.restoreProject) {
      window.SparkleCreatorDrafts.restoreProject('');
      return;
    }
    const output = $('output');
    if (output) output.textContent = 'Choose a goal and describe your idea to see a structured starter brief.';
    for (const id of ['draft-editor','draft-editor-label','apply-draft']) {
      const element = $(id);
      if (element) element.hidden = true;
    }
  };
  window.addEventListener('beforeunload', event => {
    if (snapshot() === cleanSnapshot) return;
    event.preventDefault();
    event.returnValue = '';
  });
  const read = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(parsed) || parsed.some(p => !p || typeof p.id !== 'string')) throw new Error('Unreadable projects');
      return parsed;
    } catch (_) { status('Could not read saved projects. Your stored data was left untouched. You can export a backup.'); return null; }
  };
  const refresh = () => {
    const selector = $('saved');
    const previous = selector.value;
    const query = $('project-search').value.trim().toLocaleLowerCase();
    selector.replaceChildren(new Option('Select project', ''));
    (read() || []).filter(p => String(p.name || '').toLocaleLowerCase().includes(query))
      .forEach(p => selector.add(new Option(p.name || 'Untitled', p.id)));
    if ([...selector.options].some(o => o.value === previous)) selector.value = previous;
  };
  $('project-search').addEventListener('input', refresh);
  $('new-project').addEventListener('click', () => {
    if (!confirmDiscard() || !confirmOutputReplace()) return;
    resetOutput();
    editingId = null;
    editingVersion = null;
    $('project').value = '';
    $('idea').value = '';
    $('audience').value = '';
    $('task').selectedIndex = 0;
    $('tone').selectedIndex = 0;
    $('project-search').value = '';
    refresh();
    $('saved').value = '';
    suspendDraft = true;
    $('idea').dispatchEvent(new Event('input', { bubbles: true }));
    suspendDraft = false;
    cleanSnapshot = snapshot(); clearDraft();
    status('New project started. Saved projects remain unchanged.');
    $('project').focus();
  });
  $('saved').addEventListener('change', () => {
    if ($('saved').value !== editingId) { editingId = null; status('Selection changed. Load a project to edit it, or Save to create a new project.'); }
  });
  $('save').addEventListener('click', () => {
    const name = $('project').value.trim();
    if (!name || !$('idea').value.trim()) { status('Enter a project name and idea first.'); return; }
    const projects = read();
    if (!projects) return;
    let existing = projects.find(p => p.id === editingId);
    if (existing && JSON.stringify(existing) !== editingVersion) {
      if (!window.confirm('This project changed in another tab. Save your version as a separate project instead?')) return;
      existing = null;
    }
    if (!existing && projects.length >= 30) {
      status('You have reached 30 saved projects. Delete one before saving a new project. Nothing was overwritten.');
      return;
    }
    const record = {
      id: existing ? existing.id : String(Date.now()) + '_' + Math.random().toString(36).slice(2, 9),
      name: name.slice(0, 80),
      task: $('task').value,
      idea: $('idea').value.slice(0, 4000),
      audience: $('audience').value.slice(0, 160),
      tone: $('tone').value,
      saved: new Date().toISOString(),
      draft: window.SparkleCreatorDrafts?.projectText?.() || ''
    };
    try {
      localStorage.setItem(KEY, JSON.stringify([record, ...projects.filter(p => p.id !== record.id)]));
      $('project-search').value = '';
      refresh(); $('saved').value = record.id; editingId = record.id; editingVersion = JSON.stringify(record); cleanSnapshot = snapshot(); clearDraft();
      window.SparkleCreatorDrafts?.markProjectSaved?.();
      status(existing ? 'Selected project and draft updated on this device.' : 'New project and draft saved on this device.');
    } catch (_) { status('Browser storage is unavailable or full.'); }
  });
  $('load').addEventListener('click', () => {
    const p = read()?.find(item => item.id === $('saved').value);
    if (!p) { status('Choose a saved project first.'); return; }
    if (!confirmDiscard() || !confirmOutputReplace()) return;
    resetOutput();
    editingId = p.id;
    editingVersion = JSON.stringify(p);
    $('project').value = p.name || '';
    $('idea').value = p.idea || '';
    $('audience').value = p.audience || '';
    if ([...$('task').options].some(o => o.value === p.task)) $('task').value = p.task;
    if ([...$('tone').options].some(o => o.value === p.tone)) $('tone').value = p.tone;
    if (typeof p.draft === 'string' && p.draft.length <= 12000) window.SparkleCreatorDrafts?.restoreProject?.(p.draft);
    $('idea').dispatchEvent(new Event('input', { bubbles: true }));
    cleanSnapshot = snapshot(); clearDraft();
    status('Project loaded. Save again to update this selected project.');
  });
  $('delete').addEventListener('click', () => {
    const selected = $('saved').value;
    if (!selected) { status('Choose a saved project first.'); return; }
    const projects = read();
    if (!projects) return;
    const match = projects.find(p => p.id === selected);
    if (!match) { status('This project is no longer saved.'); refresh(); return; }
    if (!window.confirm('Delete selected project from this browser?')) return;
    try {
      const latest = read();
      if (!latest) return;
      localStorage.setItem(KEY, JSON.stringify(latest.filter(p => p.id !== selected)));
      if (editingId === selected) editingId = null;
      refresh();
      status('Selected project deleted. Other projects are unchanged.');
    } catch (_) { status('Could not delete selected project.'); }
  });
  $('clear').addEventListener('click', () => {
    if (!window.confirm('Delete all saved Creator Studio projects from this browser?')) return;
    try { localStorage.removeItem(KEY); editingId = null; refresh(); $('saved').value = ''; status('Saved projects deleted from this browser. The current form remains available as an unsaved project.'); }
    catch (_) { status('Could not clear browser storage.'); }
  });
  refresh();
  $('export-projects').addEventListener('click', () => {
    try {
      const raw = localStorage.getItem(KEY) || '[]';
      const file = new Blob([raw], {type: 'application/json'});
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = 'sparkle-projects-backup.json';
      link.click(); URL.revokeObjectURL(url);
      status('Project backup downloaded. Keep it somewhere private.');
    } catch (_) { status('Could not export the backup. Your stored projects were left untouched.'); }
  });
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (draft && Array.isArray(draft.fields) && draft.fields.length === fields.length && draft.fields.every(value => typeof value === 'string') && Number.isFinite(draft.time) && draft.time <= Date.now()) {
      if (window.confirm('Restore your unsaved Creator Studio draft from this tab?')) {
        fields.forEach((id, i) => { $(id).value = draft.fields[i]; });
        suspendDraft = true;
        $('idea').dispatchEvent(new Event('input', { bubbles: true }));
        suspendDraft = false;
        status('Unsaved draft restored. Save your project to keep it.');
      } else status('Your unsaved form remains in this tab until you start another project.');
    } else if (draft) status('Your unsaved form could not be read. Its stored data was left untouched.');
  } catch (_) { status('Your unsaved form could not be read. Its stored data was left untouched.'); }
})();
