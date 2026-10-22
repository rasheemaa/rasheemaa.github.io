(() => {
  'use strict';
  const KEY = 'sparkle_creator_projects_v1';
  const $ = id => document.getElementById(id);
  const status = message => { $('save-status').textContent = message; };
  const read = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(p => p && typeof p.id === 'string').slice(0, 30) : [];
    } catch (_) { return []; }
  };
  const refresh = () => {
    const selector = $('saved');
    selector.replaceChildren(new Option('Select project', ''));
    read().forEach(p => selector.add(new Option(p.name || 'Untitled', p.id)));
  };
  $('save').addEventListener('click', () => {
    const name = $('project').value.trim();
    if (!name || !$('idea').value.trim()) { status('Enter a project name and idea first.'); return; }
    const projects = read();
    const record = {
      id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 9),
      name: name.slice(0, 80),
      task: $('task').value,
      idea: $('idea').value.slice(0, 4000),
      audience: $('audience').value.slice(0, 160),
      tone: $('tone').value,
      saved: new Date().toISOString()
    };
    try {
      localStorage.setItem(KEY, JSON.stringify([record, ...projects].slice(0, 30)));
      refresh(); $('saved').value = record.id; status('Saved on this device.');
    } catch (_) { status('Browser storage is unavailable or full.'); }
  });
  $('load').addEventListener('click', () => {
    const p = read().find(item => item.id === $('saved').value);
    if (!p) { status('Choose a saved project first.'); return; }
    $('project').value = p.name || '';
    $('idea').value = p.idea || '';
    $('audience').value = p.audience || '';
    if ([...$('task').options].some(o => o.value === p.task)) $('task').value = p.task;
    if ([...$('tone').options].some(o => o.value === p.tone)) $('tone').value = p.tone;
    status('Project loaded. Review it before sending anything.');
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