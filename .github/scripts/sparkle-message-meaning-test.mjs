import assert from 'node:assert/strict';
import { requestProblem } from '../../what-do-i-say/message-meaning.mjs';
const notes = 'Help me write a warm text to a friend saying I cannot make dinner tonight and asking if Saturday at 6 pm works instead. Keep it short and do not add a reason.';
const payload = { mode: 'write', text: notes };
assert(requestProblem(payload, "I can't make dinner tonight, but I can make it Saturday at 6 pm."));
assert(requestProblem(payload, "I can't make dinner tonight, but I can make it Saturday at 6 pm. Would you like to plan something?"));
assert.equal(requestProblem(payload, "I can't make dinner tonight. Would Saturday at 6 PM work instead?"), '');
assert.equal(requestProblem(payload, "I can't make dinner tonight. Please let me know if Saturday at 6 pm works instead."), '');
assert(requestProblem({ mode: 'write', text: 'Can you loan me a dollar?' }, 'I can loan you a dollar.'));
assert.equal(requestProblem({ mode: 'reply', text: 'They said: Are you mad? I want to say I need a quiet night.' }, 'I need a quiet night.'), '');
assert.equal(requestProblem({ mode: 'auto', text: 'They said: Are you mad? I want to say I need a quiet night.' }, 'I need a quiet night.'), '');
assert(requestProblem({ refine: 'firmer', currentMessage: 'Would Saturday at 6 PM work?' }, 'Saturday at 6 PM works.'));
assert.equal(requestProblem({ refine: 'custom', currentMessage: 'Would Saturday at 6 PM work?', text: 'Remove the question and say I will confirm tomorrow.' }, 'I will confirm tomorrow.'), '');
console.log('PASS open questions, matching proposals, reply perspective, and explicit custom changes');
assert.equal(requestProblem({ mode:'fix', text:'hi Jordan i cannot make Friday at 7 PM can you do Saturday at 2 PM?' }, 'Hi Jordan, I cannot make Friday at 7 PM. Can you do Saturday at 2 PM?'), '', 'A statement before the question must not turn into required question details');

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// Validate that the desktop worker actually invokes the semantic guard.
{
  const source = readFileSync('what-do-i-say/sparkle-worker.js', 'utf8');
  const section = source.slice(source.indexOf('function compact('), source.indexOf('function classifyFailure('));
  const { outputProblem, buildPrompt } = new Function('requestProblem', section + '\nreturn { outputProblem, buildPrompt };')(requestProblem);
  assert.match(outputProblem("I cannot make dinner tonight, but Saturday at 6 PM works.", payload), /question/);
  assert.equal(outputProblem("I cannot make dinner tonight. Would Saturday at 6 PM work?", payload), '');
  const custom = { mode:'write', refine:'custom', text:'Change Saturday to Sunday.', currentMessage:'Would Saturday at 6 PM work?' };
  assert.match(buildPrompt(custom), /Change Saturday to Sunday/);
  assert.equal(outputProblem('Would Sunday at 6 PM work?', custom), '');
}
// Exercise the actual mobile adapter and outer editor, including cancellation.
{
  const calls = [];
  let block = false;
  const window = { WDIS_API_BASE:'https://api.example.test' };
  const context = {
    window, navigator:{userAgent:'iPhone',maxTouchPoints:1}, AbortController,
    fetch:async (_url, options) => {
      calls.push(JSON.parse(options.body));
      if (block) return new Promise((_resolve,reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));
      return {ok:true,json:async()=>({message:'Would Sunday at 6 PM work?'})};
    }
  };
  vm.runInNewContext(readFileSync('what-do-i-say/sparkle-cloud-mobile.js','utf8'), context);
  vm.runInNewContext(readFileSync('what-do-i-say/sparkle-quality-hotfix.js','utf8'), context);
  const out = await window.Sparkle.generate({mode:'auto',refine:'custom',text:'Change Saturday to Sunday.',currentMessage:'Would Saturday at 6 PM work?'});
  assert.equal(out, 'Would Sunday at 6 PM work?');
  assert.equal(calls.at(-1).refine, 'custom');
  assert.equal(calls.at(-1).text, 'Change Saturday to Sunday.');
  block = true;
  const pending = window.Sparkle.generate({mode:'auto',text:'Tell Jordan thank you.'});
  window.Sparkle.cancel();
  await assert.rejects(pending, error => error.code === 'sparkle_cancelled');
}
console.log('PASS real desktop and mobile adapters: question validation, custom edit routing, and stop');


