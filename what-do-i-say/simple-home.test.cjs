/* Regression for Sparkle's task-first navigation, no AI, no visual redesign. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const html = readFileSync(join(__dirname,'index.html'),'utf8');
const script = readFileSync(join(__dirname,'simple-home.js'),'utf8');
const style = readFileSync(join(__dirname,'simple-home.css'),'utf8');

assert.match(html, /<nav class="sparkle-choices"/);
assert.equal((html.match(/data-sparkle-start="/g)||[]).length,3);
assert.match(html, /href="\/what-do-i-say\/creator-preview\/"/);
assert.match(html, /Video generation is not available yet\./);
assert.match(html, /simple-home\.js\?v=1/);
assert.match(html, /simple-home\.css\?v=1/);

for(const task of ['write','reply','fix']){
  assert.match(html,new RegExp('data-sparkle-start="'+task+'"'));
  assert.match(html,new RegExp('data-sparkle-panel="'+task+'" hidden'));
  assert.match(script,new RegExp(task+': \\{ title:'));
  assert.match(script,new RegExp("mode === '"+task+"'|"+task+": make"));
}
for(const id of ['sparkle-task-workspace','sparkle-task-form','sparkle-task-back','sparkle-task-result','sparkle-prepared-text','sparkle-copy-request','sparkle-write-type','sparkle-write-idea','sparkle-reply-message','sparkle-reply-idea','sparkle-reply-goal','sparkle-fix-draft','sparkle-fix-style']) {
  assert.match(html,new RegExp('id="'+id+'"'), 'Missing task-specific control '+id);
}
assert.match(script,/choices\.hidden = true/);
assert.match(script,/workspace\.hidden = false/);
assert.match(script,/choices\.hidden = false/);
assert.match(script,/workspace\.hidden = true/);
assert.match(script,/draft\.error/);
assert.match(script,/output\.value = draft\.text/);
assert.match(script,/navigator\.clipboard\.writeText/);
assert.match(script,/window\.SPARKLE_STAGING_ONLY === true/);
assert.doesNotMatch(script,/\bfetch\s*\(/, 'Task picker must not call AI or external endpoints');
assert.doesNotMatch(script,/\b\.submit\s*\(/, 'Task buttons must not auto-send');

assert.match(style, /focus-visible/);
assert.match(style, /prefers-reduced-motion/);
assert.match(style, /var\(--ink\)/);
assert.match(style, /var\(--muted\)/);
assert.doesNotMatch(style,/radial-gradient|backdrop-filter|box-shadow/, 'Do not redesign the original Sparkle brand in task-specific styling');
console.log('PASS Sparkle task navigation: three distinct draft flows, Creator Studio separate, no AI send, original brand styling retained');
