import assert from 'node:assert/strict';
import {test} from 'node:test';
import {VideoClient,VideoFailure} from '../../what-do-i-say/video-planner/video-client.mjs';
const ID='a'.repeat(32),job={id:ID,state:'queued',expires:1800000100};
const caps={ready:true,formats:['16:9','9:16'],seconds:5,audio:false};
test('unavailable or malformed capability never advertises generation',async()=>{
  for(const value of [{}, {...caps,ready:false},{...caps,seconds:30},{...caps,audio:true},{...caps,formats:['1:1']}]){
    const client=new VideoClient(async()=>Response.json(value));assert.equal(await client.capabilities(),null);
  }
  assert.deepEqual(await new VideoClient(async()=>Response.json(caps)).capabilities(),caps);
});
test('creation is same-origin, private and idempotent after a transport failure',async()=>{
  const calls=[];const client=new VideoClient(async(path,options)=>{
    calls.push({path,options});if(calls.length===1)throw Error('network');return Response.json(job,{status:202});
  });
  await assert.rejects(client.create('A silver leaf in warm light.','16:9'),VideoFailure);
  assert.deepEqual(await client.create('A silver leaf in warm light.','16:9'),job);
  assert.deepEqual(JSON.parse(calls[0].options.body),JSON.parse(calls[1].options.body));
  for(const {path,options} of calls){
    assert.equal(path,'/api/video/jobs');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    assert.match(options.headers.Authorization,/^Bearer [a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(),['format','prompt','requestId']);
  }
});
test('a changed idea or explicit regeneration gets a new nonce, never a client-selected endpoint',async()=>{
  const values=[];const client=new VideoClient(async(path,options)=>{values.push(JSON.parse(options.body));return Response.json(job);});
  await client.create('A silver leaf.','16:9');await client.create('An amber bowl.','16:9');
  client.forget();await client.create('An amber bowl.','16:9');
  assert.equal(new Set(values.map(x=>x.requestId)).size,3);
  for(const id of ['../escape','https://example.invalid/video','a'.repeat(31)])await assert.rejects(client.file(id),VideoFailure);
});
test('only a matching status and bounded MP4 blob become playable media',async()=>{
  const client=new VideoClient(async()=>Response.json({...job,id:'b'.repeat(32)}));
  await assert.rejects(client.status(ID),VideoFailure);
  client.fetcher=async()=>new Response('MP4',{headers:{'Content-Type':'video/mp4'}});
  assert.equal((await client.file(ID)).type,'video/mp4');assert.equal(await (await client.file(ID)).text(),'MP4');
  client.fetcher=async()=>new Response('providerUrl',{headers:{'Content-Type':'text/html'}});
  await assert.rejects(client.file(ID),VideoFailure);
  client.fetcher=async()=>new Response(new Uint8Array(32*1024*1024+1),{headers:{'Content-Type':'video/mp4'}});
  await assert.rejects(client.file(ID),VideoFailure);
});
test('unknown backend messages and oversized JSON never enter the interface',async()=>{
  const client=new VideoClient(async()=>Response.json({error:'private service key: secret'},{status:503}));
  await assert.rejects(client.status(ID),error=>!error.message.includes('secret'));
  client.fetcher=async()=>Response.json({padding:'x'.repeat(17000)});
  await assert.rejects(client.status(ID),VideoFailure);
});
