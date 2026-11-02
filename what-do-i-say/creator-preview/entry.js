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
      task.focus({preventScroll:true});
      task.scrollIntoView({behavior:'instant',block:'center'});
    });
  });
})();