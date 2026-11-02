import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('what-do-i-say/service-worker.js','utf8'),origin='https://sparkle.example';
function worker(response=Response.json({state:'analyzing'})){
  const events={},calls={opened:0,stored:0,fetched:0};
  vm.runInNewContext(source,{URL,Request,Response,self:{location:{origin},addEventListener:(name,fn)=>events[name]=fn},
    caches:{open:async()=>{calls.opened++;return {match:async()=>null,put:async()=>{calls.stored++;}};}},
    fetch:async()=>{calls.fetched++;return response;}});
  return {calls,dispatch:request=>{let handling;events.fetch({request,respondWith:p=>handling=p});return handling;}};
}
test('private job status and capabilities always bypass the offline cache',()=>{
  for(const path of ['/api/captions/capabilities','/api/captions/jobs/'+'a'.repeat(32),'/api/video/jobs/'+'b'.repeat(32),'/api/health']){
    const {dispatch,calls}=worker();assert.equal(dispatch(new Request(origin+path)),undefined);assert.equal(calls.opened,0);
  }
});
test('authenticated requests and explicit no-store requests never open a cache',()=>{
  for(const options of [{headers:{Authorization:'Bearer explicit-test-only'}},{cache:'no-store'}]){
    const {dispatch,calls}=worker();assert.equal(dispatch(new Request(origin+'/private-example',options)),undefined);assert.equal(calls.opened,0);
  }
});
test('a no-store or private server response is returned without persisting its body',async()=>{
  for(const cacheControl of ['no-store','private, max-age=0']){
    const {dispatch,calls}=worker(Response.json({private:'test-only'},{headers:{'Cache-Control':cacheControl}}));
    const response=await dispatch(new Request(origin+'/example-data'));assert.equal((await response.json()).private,'test-only');
    assert.equal(calls.fetched,1);assert.equal(calls.stored,0);
  }
});
