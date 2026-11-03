import test from 'node:test';
import assert from 'node:assert/strict';
import {CaptionClient,CaptionFailure} from './caption-client.mjs';
const id='d'.repeat(32),job={id,state:'uploading',expires:2000000000};
const reply=(value,status=200)=>Response.json(value,{status});

test('retry resumes the same upload; a new suggestion gets a new request ID',async()=>{
  const sent=[],client=new CaptionClient(async(path,options)=>{sent.push({path,...options});return reply(job,202);});
  const spec={videoSha256:'a'.repeat(64),context:'A product demo'};
  await client.create(spec);await client.create(spec);
  assert.equal(JSON.parse(sent[0].body).requestId,JSON.parse(sent[1].body).requestId);
  client.forget();await client.create(spec);
  assert.notEqual(JSON.parse(sent[0].body).requestId,JSON.parse(sent[2].body).requestId);
  for(const request of sent){assert.match(request.headers.Authorization,/^Bearer [a-f0-9]{64}$/);assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');}
});

test('cancellation during metadata creation revokes the accepted upload before returning',async()=>{
  let finish;const sent=[],signal=new AbortController();
  const client=new CaptionClient(async(path,options)=>{
    sent.push([path,options.method]);
    if(path==='/api/captions/jobs')return new Promise(resolve=>{finish=()=>resolve(reply(job,202));});
    return reply({...job,state:'cancelled'});
  });
  const creating=client.create({context:''},signal.signal);signal.abort();finish();
  await assert.rejects(creating,{name:'AbortError'});
  assert.deepEqual(sent,[['/api/captions/jobs','POST'],['/api/captions/jobs/'+id,'DELETE']]);
});

test('an actual maximum audio chunk stays inside the bounded JSON transport',async()=>{
  let received;const client=new CaptionClient(async(path,options)=>{received={path,...options};return reply({received:true});});
  const bytes=new Uint8Array(65536).fill(123);
  await client.part(id,{kind:'audio',index:59},bytes);
  assert.equal(received.path,'/api/captions/jobs/'+id+'/parts/audio/59');
  assert(received.body.length<98304);assert.deepEqual(Buffer.from(JSON.parse(received.body).data,'base64'),Buffer.from(bytes));
  await assert.rejects(client.part(id,{kind:'audio',index:60},bytes),CaptionFailure);
});

test('wrong-job, malformed ready results and oversized responses never become captions',async()=>{
  const client=new CaptionClient(async()=>reply({...job,id:'a'.repeat(32),state:'ready',caption:'Unrelated reply',summary:'Unsupported'}));
  await assert.rejects(client.status(id),CaptionFailure);
  client.fetcher=async()=>reply({...job,state:'ready',caption:'',summary:'Missing caption'});
  await assert.rejects(client.status(id),CaptionFailure);
  client.fetcher=async()=>reply({data:'x'.repeat(17000)});
  await assert.rejects(client.status(id),CaptionFailure);
});

test('a server error preserves a useful stable error and never exposes private diagnostics',async()=>{
  const client=new CaptionClient(async()=>reply({error:'caption_unverified',internal:'private model details'},503));
  await assert.rejects(client.create({context:''}),error=>error.code==='caption_unverified'&&!error.message.includes('private'));
});

test('creative proposals are explicitly unverified and cannot bypass the existing job verification flow',async()=>{
 const candidates=['Silence is not a setting I enabled for supervised sleep.'];
 let sent;const client=new CaptionClient(async(url,options)=>{sent={url,options};return Response.json({candidates,requiresVideoVerification:true,profile:'sheema-voice-20261103-v2'});});
 assert.deepEqual(await client.voice('a'.repeat(32),{context:'',tone:'natural',previous:[]}),candidates);
 assert.equal(sent.url,'/api/captions/jobs/'+'a'.repeat(32)+'/voice');assert.equal(sent.options.method,'POST');
 assert.equal(sent.options.headers.Authorization,'Bearer '+client.owner);
 const fake=new CaptionClient(async()=>Response.json({candidates,requiresVideoVerification:false,profile:'x'}));
 await assert.rejects(fake.voice('a'.repeat(32),{context:'',tone:'natural',previous:[]}),e=>e.code==='caption_voice_unverified');
});
test('daily limit errors show the actual reset time instead of a misleading tomorrow',async()=>{
 const retryAt=(Math.floor(Date.now()/86400000)+1)*86400;
 const client=new CaptionClient(async()=>Response.json({error:'caption_daily_limit',retryAt},{status:429}));
 await assert.rejects(client.create({}),error=>error.code==='caption_daily_limit'&&error.retryAt===retryAt&&/resets/.test(error.message)&&!/tomorrow/.test(error.message));
 const writing=new CaptionClient(async()=>Response.json({error:'caption_voice_allowance',retryAt},{status:429}));
 await assert.rejects(writing.voice('a'.repeat(32),{context:'',tone:'natural',previous:[]}),error=>error.code==='caption_voice_allowance'&&error.retryAt===retryAt&&/currently unavailable/.test(error.message)&&!/tomorrow/.test(error.message));
});
