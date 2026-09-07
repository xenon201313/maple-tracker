import assert from 'node:assert/strict';
import '../assets/enhancement-ledger.js';
import {FriendsSession,friendsRoute} from '../cloudflare-worker/friends.mjs';
const E=globalThis.MapleEnhancements;
const raw={id:'event-1',character_name:'테스트',target_item:'아케인셰이드 무기',date_create:'2026-09-06T16:00:00+09:00',item_level:200,potential_type:'잠재능력',before_potential_option:[{grade:'유니크'}],after_potential_option:[{grade:'레전드리'}]};
const event=E.event('potential',raw,'account');
assert.equal(E.dateKst('2026-09-05T16:00:00Z'),'2026-09-06');
assert.equal(E.dateKst('2026-09-06'),'');
assert.equal(E.defaultUnit(event),'38250000','Use the pre-upgrade grade');
assert.equal(E.defaultUnit({...event,potentialType:'에디셔널 잠재능력',level:250,grade:'레전드리'}),'98000000');
for (const level of [null,0,301]) assert.equal(E.defaultUnit({...event,level}),null);
assert.equal(E.defaultUnit({...event,kind:'starforce'}),null);
assert.equal(E.defaultUnit({...event,multiResult:true}),null);
assert.equal(E.amount('1e8'),null);
assert.equal(E.amount('-2'),null);
assert.equal(E.normalize({events:[{}],batches:[{id:'broken'}]}).events.length,0);
assert.equal(E.normalize({events:[{...event,character:null}]}).events.length,0);
assert.deepEqual(E.profits({batches:[{id:'broken'}]}),[]);
const state=E.merge({events:[event,event]});
assert.equal(state.events.length,1);
assert.equal(E.merge(state,{events:[E.event('potential',raw,'other-account')]}).events.length,2);
let group=E.groups(state)[0];
assert.equal(group.estimate,'38250000');
assert.deepEqual(E.profits(state),[],'Unconfirmed estimates must not affect statistics');
const confirmed=E.confirm(state,group,'40000000','batch-1');
assert.equal(E.profits(confirmed)[0].costs[0].price,'40000000');
assert.equal(E.groups(E.merge(confirmed,state)).length,0,'Reimport must not reopen confirmed events');
const secondAuth=E.event('potential',raw,'friends-account');
assert.equal(E.groups(E.merge(confirmed,{events:[secondAuth]})).length,0,'Switching from API key to Friends must not reimport the same event');
assert.throws(()=>E.confirm(confirmed,group,'40000000','batch-2'));
const concurrent=E.merge(confirmed,E.confirm(state,group,'50000000','batch-3'));
assert.equal(E.profits(concurrent).length,1,'Concurrent confirmations must not double charge');
assert.equal(E.allocated(concurrent).conflicts.length,1);
const excluded=E.merge(confirmed,{batches:[{...confirmed.batches[0],status:'excluded',updatedAt:Date.now()+1000}]});
assert.equal(E.profits(excluded).length,0);
assert.equal(E.groups(E.merge(excluded,state)).length,0,'Excluded history must stay excluded');
assert.deepEqual(E.merge(confirmed,excluded),E.merge(excluded,confirmed),'Cloud merge must be commutative');
assert.deepEqual(E.profits(E.normalize(JSON.parse(JSON.stringify(confirmed)))),E.profits(confirmed));
const second=E.event('potential',{...raw,id:'event-2'},'account');
assert.equal(E.groups(E.merge(confirmed,{events:[second]}))[0].count,1,'Late events do not modify a confirmed batch');
const rate=E.merge(state,{rates:[{key:group.key,unit:'1000000000000000000',attempts:3,updatedAt:1}]});
assert.equal(E.groups(rate)[0].estimate,'3000000000000000000','Amounts stay integer-precise');
let calls=0;
const collected=await E.collect(async(kind,params)=>{calls++;return calls===1?{potential_history:[raw],next_cursor:'next'}:{potential_history:[{...raw,id:'event-2'}],next_cursor:''};},'potential','2026-09-06','account');
assert.equal(calls,2,'A short page with a cursor is not the last page');
assert.equal(collected.length,2);
await assert.rejects(E.collect(async()=>({potential_history:[raw],next_cursor:'repeat'}),'potential','2026-09-06','account'),/반복/);
await assert.rejects(E.collect(async()=>({}),'potential','2026-09-06','account'),/응답/);
await assert.rejects(E.collect(async()=>({potential_history:[raw]}),'potential','2026-09-05','account'),/날짜/);
const controller=new AbortController();controller.abort();
await assert.rejects(E.collect(async()=>{throw new Error('should not run');},'potential','2026-09-06','account',controller.signal));

const originalFetch=globalThis.fetch;
const stores=new Map();
let exchanges=0,upstreamFailure=null;
globalThis.fetch=async (url,init)=>{
  url=String(url);
  if(url==='https://openid.nexon.com/oauth2/token') {
    exchanges++;
    assert.equal(init.body.get('client_secret'),'server-only-fixture');
    if(upstreamFailure) return new Response(JSON.stringify(upstreamFailure),{status:401});
    return new Response(JSON.stringify({access_token:'private-access',refresh_token:'private-refresh',expires_in:1800,refresh_token_expires_in:1209600}));
  }
  if(url==='https://openid.nexon.com/oauth2/userinfo') return new Response(JSON.stringify({result:{uid:'fixture-uid',scope:['maplestory.starforce','maplestory.potential']}}));
  assert.match(url,/https:\/\/open.api.nexon.com\/maplestory\/v1\/history\/(potential|cube)/);
  assert.equal(init.headers.Authorization,'Bearer private-access');
  if(url.includes('/history/cube')) return new Response(JSON.stringify({cube_history:[],next_cursor:''}));
  return new Response(JSON.stringify({potential_history:[raw],next_cursor:''}));
};
const env={NEXON_CLIENT_SECRET:'server-only-fixture'};
env.FRIENDS_SESSIONS={idFromName:name=>name,get:id=>{
  if(!stores.has(id)) {
    const map=new Map();
    const storage={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),deleteAll:async()=>map.clear(),setAlarm:async()=>{}};
    stores.set(id,new FriendsSession({storage,blockConcurrencyWhile:fn=>fn()},env));
  }
  return stores.get(id);
}};
const request=(path,body,origin='https://maple-trackers.com')=>new Request('https://worker.example/v1/friends/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
try {
  assert.equal((await friendsRoute(request('config'),{})).status,200);
  assert.equal((await (await friendsRoute(request('config'),{})).json()).ready,false);
  assert.equal((await friendsRoute(request('config',null,'https://evil.example'),env)).status,403);
  const proof='a'.repeat(64);
  const challenge=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(proof))),b=>b.toString(16).padStart(2,'0')).join('');
  const start=await (await friendsRoute(request('start',{challenge}),env)).json();
  const auth=new URL(start.url);
  assert.equal(auth.searchParams.get('state'),start.state);
  assert.equal(auth.searchParams.get('scope'),'maplestory.characterlist,maplestory.starforce,maplestory.potential,maplestory.scheduler,maplestory.cube');
  assert.equal((await friendsRoute(request('finish',{state:start.state,proof:'b'.repeat(64),code:'code'}),env)).status,401);
  const finish=await friendsRoute(request('finish',{state:start.state,proof,code:'code'}),env);
  const connection=await finish.json();
  assert.equal(connection.connected,true);
  assert(!JSON.stringify(connection).includes('private-'),'Nexon tokens must never reach the browser');
  assert.equal((await friendsRoute(request('finish',{state:start.state,proof,code:'code'}),env)).status,400);
  assert.equal(exchanges,1,'OAuth state must not be reused');
  const history=await friendsRoute(request('history',{state:start.state,proof,kind:'potential',date:'2026-09-06'}),env);
  assert.equal((await history.json()).potential_history.length,1);
  assert.equal((await friendsRoute(request('history',{state:start.state,proof,kind:'../../oauth2/token',date:'2026-09-06'}),env)).status,400);
  assert.deepEqual((await (await friendsRoute(request('history',{state:start.state,proof,kind:'cube',date:'2026-09-06'}),env)).json()).cube_history,[]);
  for(const kind of ['characterlist','scheduler']) assert.equal((await friendsRoute(request('history',{state:start.state,proof,kind,date:'2026-09-06'}),env)).status,400,'Unused authorized data must not be queried');
  assert.equal((await friendsRoute(request('history',{state:start.state,proof,kind:'potential',date:'invalid'}),env)).status,400);
  assert.equal((await friendsRoute(request('logout',{state:start.state,proof}),env)).status,200);
  assert.equal((await friendsRoute(request('status',{state:start.state,proof}),env)).status,401);
  for(const name of ['OPENAPI00012','private-access']) {
    const retry=await (await friendsRoute(request('start',{challenge}),env)).json();
    upstreamFailure={error:{name,message:'server-only-fixture private-access private-refresh'}};
    const failure=await (await friendsRoute(request('finish',{state:retry.state,proof,code:'code'}),env)).json();
    assert.equal(failure.errorCode,'TOKEN_EXCHANGE / '+(name==='OPENAPI00012'?name:'401'));
    assert(!JSON.stringify(failure).includes('private-'));
    assert(!JSON.stringify(failure).includes('server-only-fixture'));
    const count=exchanges;
    assert.equal((await friendsRoute(request('finish',{state:retry.state,proof,code:'code'}),env)).status,401);
    assert.equal(exchanges,count,'A failed exchange must consume its authorization state');
  }
} finally {globalThis.fetch=originalFetch;}
console.log('Enhancement ledger and Friends OAuth safety tests passed.');
