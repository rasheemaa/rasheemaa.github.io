(() => {
  'use strict';
  const start = document.getElementById('start-creator-draft');
  const tools = document.getElementById('studio-tools');
  const task = document.getElementById('task');
  if (!start || !tools || !task) return;
  start.addEventListener('click', () => {
    tools.open = true;
    // Let the browser finish opening details before focusing the task picker.
    requestAnimationFrame(() => {
      // On a phone the visitor can start typing before this frame runs.
      // Do not move focus back to the picker after they chose another field.
      const active = document.activeElement;
      if (!tools.open || (active !== start && active !== document.body && active !== tools)) return;
      task.focus({preventScroll:true});
      task.scrollIntoView({behavior:'instant',block:'center'});
    });
  });
})();
