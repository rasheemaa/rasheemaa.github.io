(() => {
  'use strict';
  const KEY = 'sparkle_creator_projects_v1';
  const $ = id => document.getElementById(id);
  const status = message => { $('save-status').textContent = message; };
  let editingId = null;
  const fields = ['project','idea','audience','task','tone'];
  const snapshot = () => JSON.stringify(fields.map(id => $(id).value));
  let cleanSnapshot = snapshot();
  const confirmDiscard = () => snapshot() === cleanSnapshot || window.confirm('Discard unsaved changes to the current project?');
  const read = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(p => p && typeof p.id === 'string').slice(0, 30) : [];
    } catch (_) { return []; }
  };
  const refresh = () => {
    const selector = $('saved');
    const previous = selector.value;
    const query = $('project-search').value.trim().toLocaleLowerCase();
    selector.replaceChildren(new Option('Select project', ''));
    read().filter(p => String(p.name || '').toLocaleLowerCase().includes(query))
      .forEach(p => selector.add(new Option(p.name || 'Untitled', p.id)));
    if ([...selector.options].some(o => o.value === previous)) selector.value = previous;
  };
  $('project-search').addEventListener('input', refresh);
  $('new-project').addEventListener('click', () => {
    if (!confirmDiscard()) return;
    editingId = null;
    $('project').value = '';
    $('idea').value = '';
    $('audience').value = '';
    $('task').selectedIndex = 0;
    $('tone').selectedIndex = 0;
    $('project-search').value = '';
    refresh();
    $('saved').value = '';
    $('idea').dispatchEvent(new Event('input', { bubbles: true }));
    cleanSnapshot = snapshot();
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
    const existing = projects.find(p => p.id === editingId);
    const record = {
      id: existing ? existing.id : String(Date.now()) + '_' + Math.random().toString(36).slice(2, 9),
      name: name.slice(0, 80),
      task: $('task').value,
      idea: $('idea').value.slice(0, 4000),
      audience: $('audience').value.slice(0, 160),
      tone: $('tone').value,
      saved: new Date().toISOString()
    };
    try {
      localStorage.setItem(KEY, JSON.stringify([record, ...projects.filter(p => p.id !== record.id)].slice(0, 30)));
      $('project-search').value = '';
      refresh(); $('saved').value = record.id; editingId = record.id; cleanSnapshot = snapshot(); status(existing ? 'Selected project updated on this device.' : 'New project saved on this device.');
    } catch (_) { status('Browser storage is unavailable or full.'); }
  });
  $('load').addEventListener('click', () => {
    const p = read().find(item => item.id === $('saved').value);
    if (!p) { status('Choose a saved project first.'); return; }
    if (!confirmDiscard()) return;
    editingId = p.id;
    $('project').value = p.name || '';
    $('idea').value = p.idea || '';
    $('audience').value = p.audience || '';
    if ([...$('task').options].some(o => o.value === p.task)) $('task').value = p.task;
    if ([...$('tone').options].some(o => o.value === p.tone)) $('tone').value = p.tone;
    $('idea').dispatchEvent(new Event('input', { bubbles: true }));
    cleanSnapshot = snapshot();
    status('Project loaded. Save again to update this selected project.');
  });
  $('delete').addEventListener('click', () => {
    const selected = $('saved').value;
    if (!selected) { status('Choose a saved project first.'); return; }
    const projects = read();
    const match = projects.find(p => p.id === selected);
    if (!match) { status('This project is no longer saved.'); refresh(); return; }
    if (!window.confirm('Delete selected project from this browser?')) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(projects.filter(p => p.id !== selected)));
      if (editingId === selected) editingId = null;
      refresh();
      status('Selected project deleted. Other projects are unchanged.');
    } catch (_) { status('Could not delete selected project.'); }
  });
  $('clear').addEventListener('click', () => {
    if (!window.confirm('Delete all saved Creator Studio projects from this browser?')) return;
    try { localStorage.removeItem(KEY); refresh(); status('Saved projects deleted from this browser.'); }
    catch (_) { status('Could not clear browser storage.'); }
  });
  refresh();
})();