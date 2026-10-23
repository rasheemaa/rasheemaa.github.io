(() => {
  'use strict';
  const KEY = 'sparkle_creator_saved_output_v1';
  const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  const $ = id => document.getElementById(id);
  const status = message => { $('output-status').textContent = message; };
  const editor = $('draft-editor');
  const output = $('output');
  const hideEditor = () => {
    editor.hidden = true;
    $('draft-editor-label').hidden = true;
    $('apply-draft').hidden = true;
  };
  const currentText = () => editor.hidden ? output.textContent : editor.value;
  const initialPlaceholder = 'Choose a goal and describe your idea to see a structured starter brief.';
  const hasUnsavedOutput = () => {
    const text = currentText();
    return Boolean(text.trim() && text !== initialPlaceholder && text !== savedText);
  };
  let savedText = null;
  const readSaved = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!v || typeof v.text !== 'string' || v.text.length > 12000 || !Number.isFinite(v.saved) || v.saved > Date.now() || Date.now() - v.saved >= MAX_AGE) return null;
      return v.text;
    } catch (_) { return null; }
  };
  savedText = readSaved();
  window.SparkleCreatorDrafts = {
    hasUnsavedOutput,
    confirmReplace: () => {
      if (!hasUnsavedOutput()) return true;
      return window.confirm('Replace your current unsaved draft? Save or copy it first if you want to keep it.');
    }
  };
  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedOutput()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  $('save-output').addEventListener('click', () => {
    const text = currentText();
    if (!text.trim() || text.length > 12000) {
      status('Write a draft of up to 12,000 characters before saving.');
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify({text, task:$('task').value, saved:Date.now()}));
      savedText = text;
      status('Draft saved locally on this device. It will be available when you return.');
    } catch (_) { status('Could not save your draft. Browser storage may be full or disabled.'); }
  });
  $('clear-output').addEventListener('click', () => {
    if (!window.confirm('Delete the saved Creator Studio draft from this browser?')) return;
    try { localStorage.removeItem(KEY); savedText = null; status('Saved draft deleted from this device. The current draft remains on screen.'); }
    catch (_) { status('Could not delete the saved draft.'); }
  });
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (stored && typeof stored.text === 'string' && stored.text.length <= 12000 && Number.isFinite(stored.saved) && stored.saved <= Date.now() && Date.now() - stored.saved < MAX_AGE) {
      if (window.confirm('Restore your saved Creator Studio draft from this device?')) {
        output.textContent = stored.text;
        savedText = stored.text;
        hideEditor();
        status('Your saved draft has been restored. Nothing was sent or published.');
      } else {
        status('Your saved draft remains on this device. Use this page again to restore it.');
      }
    } else if (stored) {
      localStorage.removeItem(KEY);
    }
  } catch (_) { status('Saved draft could not be read. Your current work is unaffected.'); }
})();
