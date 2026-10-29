import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newProjectId, newProject, exampleProject, normalizeProject, totalSeconds, fitTiming, exportIssues, renderBrief, encodeBackup, decodeBackup, MAX_BACKUP_BYTES} from '../../what-do-i-say/video-planner/model.mjs';

test('new plans leave creative details to the user', () => {
  const p = newProject();
  assert.equal(p.concept, ''); assert(p.scenes.every(s => !s.action && !s.audio));
  assert(exportIssues(p).length >= 5); assert.throws(() => renderBrief(p), /name/);
});
test('project identifiers work on HTTPS, HTTP previews and limited browsers', () => {
  assert.equal(newProjectId({randomUUID: () => 'test-uuid'}), 'test-uuid');
  assert.equal(newProjectId({getRandomValues: bytes => bytes.fill(12)}), '0c'.repeat(16));
  assert.match(newProjectId({}), /^[\w-]{1,80}$/);
  assert.notEqual(newProjectId({}), newProjectId({}));
});
test('the illustrative sample exports an honest timed plan', () => {
  const p = exampleProject(), brief = renderBrief(p);
  assert.equal(totalSeconds(p), 15); assert.deepEqual(exportIssues(p), []);
  assert(brief.includes('Time: 10 to 15 seconds')); assert(brief.includes('No video or audio has been generated.'));
  assert(!/[\u002d\u2013\u2014]/u.test(brief), 'Built in sample and generated copy do not add hyphens.');
});
test('all supported target lengths fit every supported scene count exactly', () => {
  for (const duration of [15, 30, 60]) for (let count = 1; count <= 8; count++) {
    const p = exampleProject(); p.duration = duration; p.scenes = Array.from({length: count}, () => ({...p.scenes[0]}));
    const fitted = fitTiming(p);
    assert.equal(totalSeconds(fitted), duration); assert(fitted.scenes.every(s => Number.isInteger(s.seconds) && s.seconds >= 1));
    assert.equal(p.scenes[0].seconds, 5, 'Original plan is not mutated');
  }
});
test('full export rejects contradictory duration or missing shots', () => {
  const p = exampleProject(); p.duration = 30;
  assert.throws(() => renderBrief(p), /total 30/);
  p.duration = 15; p.scenes[1].action = '  ';
  assert.throws(() => renderBrief(p), /scene 2/);
});
test('backup restoration round trips Unicode and incomplete drafts', () => {
  const p = newProject(); p.title = 'Sheema ✦ café'; p.scenes[0].action = '<img src=x onerror=alert(1)>';
  assert.deepEqual(decodeBackup(encodeBackup(p)), p);
});
test('malformed, oversized, foreign and unsupported backups fail', () => {
  for (const value of ['broken', 'null', '[]', '{}', JSON.stringify({app:'other',version:1,project:exampleProject()}), ' '.repeat(MAX_BACKUP_BYTES + 1)]) assert.throws(() => decodeBackup(value));
  const p = exampleProject();
  for (const mutation of [p => p.duration = 4, p => p.format = 'file:///secret', p => p.scenes[0].seconds = Infinity, p => p.scenes[0].seconds = 1.5, p => p.scenes[0].seconds = 0, p => p.scenes = [], p => p.scenes = Array(9).fill(p.scenes[0]), p => p.concept = 'x'.repeat(2001), p => p.scenes[0].action = '\u0000']) {
    const copy = structuredClone(p); mutation(copy); assert.throws(() => normalizeProject(copy));
  }
});
test('backup projection carries no provider URLs or authorization flags', () => {
  const p = exampleProject(); p.videoUrl = 'https://example.invalid/video'; p.moderationApproved = true;
  p.scenes[0].generationEndpoint = 'https://example.invalid/api';
  const restored = decodeBackup(encodeBackup(p));
  assert(!('videoUrl' in restored)); assert(!('moderationApproved' in restored)); assert(!('generationEndpoint' in restored.scenes[0]));
});
test('the workspace cannot connect to a generator or embed an external provider', () => {
  const html = readFileSync(new URL('../../what-do-i-say/video-planner/index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../what-do-i-say/video-planner/app.mjs', import.meta.url), 'utf8');
  assert(html.includes("connect-src 'none'")); assert(html.includes("frame-src 'none'"));
  assert(!/<(?:iframe|video|audio)\b/i.test(html)); assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(script));
  assert(!/innerHTML|insertAdjacentHTML|\.outerHTML\s*=/.test(script));
});
