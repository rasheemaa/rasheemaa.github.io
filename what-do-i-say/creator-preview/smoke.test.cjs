// Run with: node what-do-i-say/creator-preview/smoke.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'profile.js'), 'utf8');
const projects = fs.readFileSync(path.join(root, 'projects.js'), 'utf8');
const chat = fs.readFileSync(path.join(root, '..', 'chat-app.js'), 'utf8');
for (const id of ['task', 'idea', 'tone', 'audience', 'project', 'project-search', 'saved', 'save', 'new-project', 'load', 'delete', 'clear', 'creator-name', 'creator-niche', 'creator-style', 'creator-avoid', 'profile-save', 'profile-clear', 'sparkle', 'copy-prompt', 'copy-status']) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing control: ' + id);
}
assert.match(html, /noindex,nofollow/);
assert.match(html, /class="skip-link" href="#creator-workspace"/);
assert.match(html, /id="creator-workspace" tabindex="-1"/);
assert.match(html, /role="region" aria-label="Generated creative brief"/);
assert.match(html, /aria-atomic="true"/);
assert.match(html, /@media\(max-width:560px\)/);
assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(html, /min-height:46px/);
assert.ok(html.indexOf('creator-preview/profile.js?v=1') < html.indexOf('const updateBriefLength='), 'Creator Brain must initialize before the handoff meter');
assert.match(html, /document.getElementById\('sparkle'\)\.disabled=!length\|\|length>3500/);
assert.match(html, /v\.length>3500/);
assert.match(html, /text\.length>3500/);
assert.match(html, /Clipboard unavailable\. Instructions are displayed above/);
assert.match(html, /sessionStorage\.setItem\('sparkle_creator_handoff_v1'/);
assert.match(html, /sessionStorage\.removeItem\('sparkle_creator_handoff_v1'\)/);
assert.match(html, /Could not open Sparkle automatically/);
assert.match(chat, /sessionStorage\.removeItem\('sparkle_creator_handoff_v1'/);
assert.match(chat, /Date\.now\(\) - handoff\.created < 300000/);
assert.match(profile, /localStorage\.removeItem\(KEY\)/);
assert.match(projects, /localStorage\.removeItem\(KEY\)/);
assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|buy\.stripe\.com/);
console.log('Creator Studio static checks passed.');
