const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const html=fs.readFileSync('index.html','utf8');
const section=(from,to)=>{
  const start=html.indexOf(from),end=html.indexOf(to,start);
  assert(start>=0 && end>start);
  return html.slice(start,end);
};
const source=[
  section('async function encryptCloudSnapshot','async function decryptCloudSnapshot'),
  section('function cloudHistoryUrl','function hasLocalTrackerData'),
  section('function cloudUrl','function createCommunityStatsId'),
  section('async function pullCloudSnapshot','function initCloudSyncControls')
].join('\n');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  const timers=new Map(),storage=new Map(),statuses=[],writes=[],applied=[],history=[];
  let timerId=0;
  const c={assert,Date,JSON,TextEncoder,Uint8Array,console,
    db:{updatedAt:1,records:{},settings:{nexonApiKey:'account-a'}},
    cloudSync:{ready:true,initializing:false,syncing:false,runId:1,pendingUpload:false,timer:0,syncId:'account-a',encryptionKey:'key-a'},
    CLOUD_SYNC_VERSION:1,CLOUD_SYNC_ENDPOINT:'https://fixture.invalid',LS_KEY:'fixture',cloudHuntRecoverySources:[],
    setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    localStorage:{setItem(k,v){storage.set(k,v);}},
    nexonApiKey:()=>c.db.settings.nexonApiKey,
    cloudSnapshot:()=>({version:1,updatedAt:c.db.updatedAt,data:JSON.parse(JSON.stringify(c.db))}),
    exportDb:()=>JSON.parse(JSON.stringify(c.db)),
    bytesToBase64:bytes=>Buffer.from(bytes).toString('base64'),
    crypto:{getRandomValues:bytes=>bytes,subtle:{encrypt:async(_algo,key,plain)=>plain}},
    refreshCloudSyncControls(){},cloudSyncStatus:(text,kind)=>statuses.push({text,kind}),alert(){},scheduleNexonAutoRefresh(){},
    decryptCloudSnapshot:async raw=>JSON.parse(raw),
    applyCloudSnapshot(snapshot){applied.push(snapshot);c.db=snapshot.data;return {needsUpload:false};},
    cloudCredentials:async()=>({syncId:'account-a',encryptionKey:'key-a'}),
    preserveCloudWeeklyDrops:()=>false,hasLocalTrackerData:()=>false,renderWeeklyDropRecoveryPanel(){},
    mergeHuntRecoveryHistory:value=>history.push(value),mergeHuntJournal:value=>history.push(value),
    activePageName:()=>'',renderHuntRecoveryPanel(){},ensureObj:value=>value||{},
    fetch:async(url,options={})=>{writes.push({url,options});return {ok:true,status:200};}
  };
  vm.createContext(c);vm.runInContext(source,c);
  return {c,timers,statuses,writes,applied,history,async flush(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());await tick();}};
}
test('Edits during an upload are sent after it finishes',async()=>{
  const s=setup(),gate=deferred();
  s.c.fetch=async(url,options)=>{s.writes.push(JSON.parse(options.body));if(s.writes.length===1)await gate.promise;return {ok:true};};
  const first=s.c.uploadCloudSnapshot();await tick();
  s.c.db.updatedAt=2;s.c.db.records.latest={meso:'200'};
  s.c.queueCloudSync();await s.flush();
  gate.resolve();await first;await s.flush();
  assert.equal(s.writes.length,2,'A save made while syncing was dropped');
  assert.equal(s.writes[1].updatedAt,2);
  assert.equal(s.c.cloudSync.syncing,false);
});
test('Encrypted payload metadata uses the same captured snapshot',async()=>{
  const s=setup(),gate=deferred();
  s.c.crypto.subtle.encrypt=async(_algo,_key,plain)=>{await gate.promise;return plain;};
  const pending=s.c.encryptCloudSnapshot();s.c.db.updatedAt=2;gate.resolve();
  const payload=await pending,decoded=JSON.parse(Buffer.from(payload.ciphertext,'base64').toString());
  assert.equal(payload.updatedAt,decoded.updatedAt,'An old snapshot must not claim a later revision');
});
test('Changing accounts during encryption must not send the old payload',async()=>{
  const s=setup(),gate=deferred();
  s.c.crypto.subtle.encrypt=async(_algo,_key,plain)=>{await gate.promise;return plain;};
  const pending=s.c.uploadCloudSnapshot();
  s.c.resetCloudSync();s.c.cloudSync.syncId='account-b';s.c.cloudSync.encryptionKey='key-b';s.c.cloudSync.syncing=true;
  gate.resolve();await pending;
  assert.equal(s.writes.length,0,'Old account payload was sent to a different account');
  assert.equal(s.c.cloudSync.syncing,true,'Old request released the new request lock');
});
test('Changing accounts during a pull discards the obsolete response',async()=>{
  const s=setup(),gate=deferred();
  s.c.fetch=async()=>{await gate.promise;return {ok:true,status:200,text:async()=>JSON.stringify({data:{from:'account-a'}})};};
  const pending=s.c.pullCloudSnapshot();s.c.resetCloudSync();
  s.c.cloudSync.syncing=true;s.c.db.settings.nexonApiKey='account-b';
  gate.resolve();await pending;
  assert.equal(s.applied.length,0,'Obsolete account data was applied');
  assert.equal(s.c.cloudSync.syncing,true);
});
test('A cloud pull does not replace local edits made while loading',async()=>{
  const s=setup(),gate=deferred();
  s.c.fetch=async()=>{await gate.promise;return {ok:true,status:200,text:async()=>JSON.stringify({data:{updatedAt:1,records:{}}})};};
  const pending=s.c.pullCloudSnapshot();
  s.c.db.records.latest={meso:'200'};
  gate.resolve();await pending;
  assert.equal(s.applied.length,0,'A concurrent local edit was overwritten');
  assert.equal(s.c.db.records.latest.meso,'200');
});
test('Old account recovery history is not merged after a key change',async()=>{
  const s=setup(),gate=deferred();
  s.c.fetch=async()=>({ok:true,status:200,json:async()=>{await gate.promise;return {snapshots:[{payload:JSON.stringify({data:{records:{}},huntRecovery:['old'],huntJournal:['old']})}]};}});
  const pending=s.c.refreshCloudHuntRecoverySources();await tick();s.c.resetCloudSync();gate.resolve();await pending;
  assert.equal(s.history.length,0);
  assert.equal(s.c.cloudHuntRecoverySources.length,0);
});
test('Upload failures stop without an infinite retry loop',async()=>{
  const s=setup();s.c.fetch=async()=>{throw new Error('offline');};
  assert.equal(await s.c.uploadCloudSnapshot(),false);
  assert.equal(s.c.cloudSync.syncing,false);assert.equal(s.timers.size,0);
});
test('A successful pull can queue the merged data for upload',async()=>{
  const s=setup();
  s.c.fetch=async(url,options={})=>{
    if(options.method==='PUT'){s.writes.push(JSON.parse(options.body));return {ok:true};}
    return {ok:true,status:200,text:async()=>JSON.stringify({data:{updatedAt:2,settings:{nexonApiKey:'account-a'},records:{remote:{meso:'200'}}}}),json:async()=>({snapshots:[]})};
  };
  s.c.applyCloudSnapshot=snapshot=>{s.applied.push(snapshot);s.c.db=snapshot.data;s.c.queueCloudSync();};
  assert.equal(await s.c.pullCloudSnapshot(),true);
  await s.flush();
  assert.equal(s.applied.length,1);assert.equal(s.writes.length,1);assert.equal(s.writes[0].updatedAt,2);
});
test('An old completed upload does not release another account lock',async()=>{
  const s=setup(),gate=deferred();
  s.c.fetch=async()=>{await gate.promise;return {ok:true};};
  const pending=s.c.uploadCloudSnapshot();await tick();s.c.resetCloudSync();s.c.cloudSync.syncing=true;
  const before=s.statuses.length;gate.resolve();await pending;
  assert.equal(s.statuses.length,before);assert.equal(s.c.cloudSync.syncing,true);
});
test('An initialization upload failure is not reported as a successful save',async()=>{
  const s=setup();
  s.c.fetch=async(_url,options={})=>{if(options.method==='PUT')throw new Error('offline');return {ok:true,status:204};};
  await s.c.initializeCloudSync();
  assert.match(s.statuses.at(-1).text,/동기화 실패/);
  assert.equal(s.statuses.at(-1).kind,'err');
});
