/* Start a guided draft without sending anything automatically. */
(() => {
  const prompts = {
    write: "Help me write a message, caption, or email about: ",
    reply: "Help me reply to this message: ",
    fix: "Make this sound better while keeping my meaning: "
  };
  document.querySelectorAll('[data-sparkle-start]').forEach(button => {
    button.addEventListener('click', () => {
      const field = document.getElementById('prompt');
      if (!field) return;
      const kind = button.getAttribute('data-sparkle-start');
      if (!Object.prototype.hasOwnProperty.call(prompts, kind)) return;
      if (!field.value.trim()) field.value = prompts[kind];
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    });
  });
})();
