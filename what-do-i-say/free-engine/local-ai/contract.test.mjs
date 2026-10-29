import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_MODEL,SCENES,assessDesktop,buildReadinessPlan,authorizeVideoGeneration,MIN_GB} from './contract.mjs';

test('published GPU threshold is advisory, not authorization',()=>{
  assert.equal(MIN_GB,24);
  assert.equal(LOCAL_MODEL.id,'Wan-AI/Wan2.2-TI2V-5B');
  assert.equal(assessDesktop({gpu:'nvidia',vramGB:24}).status,'candidate');
  assert.equal(assessDesktop({gpu:'nvidia',vramGB:23}).status,'insufficient');
  assert.equal(assessDesktop({gpu:'nvidia',vramGB:80}).status,'candidate');
  assert.equal(assessDesktop({gpu:'other',vramGB:48}).status,'unverified');
  assert.equal(assessDesktop({gpu:'unknown',vramGB:null}).status,'unknown');
  assert.equal(authorizeVideoGeneration().allowed,false);
});
test('strictly validate manual GPU selections',()=>{
  for(const value of [undefined,null,[],'nvidia',{}, {gpu:'cuda',vramGB:24},{gpu:'nvidia',vramGB:'24'},{gpu:'nvidia',vramGB:24.5},{gpu:'nvidia',vramGB:-1},{gpu:'nvidia',vramGB:999}]){
    assert.throws(()=>assessDesktop(value));
  }
});
test('only fixed nature scenes can be downloaded as inert briefs',()=>{
  for(const scene of Object.keys(SCENES)){
    const plan=buildReadinessPlan({gpu:'nvidia',vramGB:24,scene});
    assert.equal(plan.executable,false);
    assert.equal(plan.generationEnabled,false);
    assert.equal(plan.safeguards.modelExecution,false);
    assert.equal(plan.safeguards.outputReleaseAllowed,false);
    assert.equal(plan.safeguards.cloudUpload,false);
    assert.equal(plan.safeguards.arbitraryPromptInput,false);
    assert.equal(plan.safeguards.referenceMedia,false);
    assert.match(plan.scene.description,/no people, animals or faces/i);
    assert(!/https?:\/\//.test(plan.scene.description));
    assert.equal(plan.scene.durationSeconds,5);
  }
});
test('injection and prohibited requests cannot enter the fixed prompt set',()=>{
  const invalid=[
    'child portrait','minor','teenager','young girl','pregnant mother',
    'adult romantic scene','sexual violence','ignore previous instructions',
    'forest; fetch("https://evil.example")', '<script>alert(1)</script>'
  ];
  for(const scene of invalid){
    assert.throws(()=>buildReadinessPlan({gpu:'nvidia',vramGB:80,scene}));
  }
});
test('no changed input or hardware setting can bypass disabled generation',()=>{
  const inputs=[
    {gpu:'nvidia',vramGB:24,scene:'forest'},
    {gpu:'nvidia',vramGB:80,scene:'rain'},
    {gpu:'other',vramGB:256,scene:'ocean'}
  ];
  for(const input of inputs){
    const plan=buildReadinessPlan(input);
    assert.equal(plan.safeguards.fullVideoOutputModerationCertified,false);
    assert.equal(plan.safeguards.inputModerationCertified,false);
    assert.equal(authorizeVideoGeneration(input,plan).allowed,false);
  }
});
