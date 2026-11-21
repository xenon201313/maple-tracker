import assert from 'node:assert/strict';
import '../assets/enhancement-ledger.js';
import {FriendsSession,friendsRoute} from '../cloudflare-worker/friends.mjs';
const E=globalThis.MapleEnhancements;
const raw={id:'event-1',character_name:'테스트',target_item:'아케인셰이드 무기',date_create:'2026-09-06T16:00:00+09:00',item_level:200,potential_type:'잠재능력',before_potential_option:[{grade:'유니크'}],after_potential_option:[{grade:'레전드리'}]};
const event=E.event('potential',raw,'account');
const fullOptions=Array.from({length:12},(_,index)=>({grade:'유니크',value:'옵션 '+(index+1)}));
for(const kind of ['potential','cube']) {
  const fixture={...raw,item_equipment_part:'무기',potential_type:'에디셔널 잠재능력 재설정',cube_type:'프라임 에디셔널 큐브',
    before_potential_option:[{grade:'레어',value:'기존 일반 옵션'}],after_potential_option:[{grade:'에픽',value:'이후 일반 옵션'}],
    before_additional_potential_option:[{grade:'에픽',value:'기존 에디셔널 옵션'}],after_additional_potential_option:fullOptions,
    upgrade_guarantee:false,upgrade_guarantee_count:0};
  const parsed=E.event(kind,fixture,'account',40);
  assert.equal(parsed.schemaVersion,3);
  assert.equal(parsed.equipmentPart,'무기');
  assert.equal(parsed.optionTrack,'에디셔널 잠재능력');
  assert.equal(parsed.grade,'에픽');
  assert.deepEqual(parsed.beforeOptions,fixture.before_additional_potential_option);
  assert.deepEqual(parsed.options,fullOptions,'모든 결과 옵션의 원래 순서를 유지');
  assert.deepEqual(parsed.otherBeforeOptions,fixture.before_potential_option);
  assert.deepEqual(parsed.otherOptions,fixture.after_potential_option);
  assert.equal(parsed.guaranteed,false);
  assert.equal(parsed.guaranteeCount,0);
  const legacy={...parsed,schemaVersion:2,observedAt:50,options:parsed.options.slice(0,9)};
  delete legacy.beforeOptions;
  const old={events:[legacy]};
  const final=E.confirm(old,E.reports(old)[0],'100','old-saved');
  const repaired=E.merge(final,{events:[parsed]});
  assert.equal(repaired.events.length,1);
  assert.deepEqual(repaired.events[0].beforeOptions,parsed.beforeOptions);
  assert.equal(E.profits(repaired)[0].costs[0].price,'100');
  assert.deepEqual(E.merge(repaired,old).events[0],parsed);
}
assert.equal(E.event('starforce',{...raw,starcatch_result:'성공'},'account').starcatchResult,'성공');
assert.equal(event.guaranteed,undefined,'누락된 보장 여부를 거짓으로 단정하지 않음');
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
const otherTimestampFormat=E.event('potential',{...raw,date_create:'2026-09-06T07:00:00Z'},'friends-account');
assert.equal(E.identity(secondAuth),E.identity(otherTimestampFormat));
assert.equal(E.groups(E.merge(confirmed,{events:[otherTimestampFormat]})).length,0);
const oldSource={...E.event('potential',raw,'a-friends',50),schemaVersion:2,grade:'',options:[]};
delete oldSource.beforeOptions;
const newSource=E.event('potential',{...raw,before_potential_option:[{grade:'유니크',value:'변경 전'}],after_potential_option:[{grade:'레전드리',value:'변경 후'}]},'z-api-key',40);
const oldPrice={key:E.groups({events:[oldSource]})[0].key,unit:'12345',attempts:1,updatedAt:60};
const bothSources=E.merge({events:[oldSource],rates:[oldPrice]},{events:[newSource]});
const combined=E.groups(bothSources);
assert.equal(combined.length,1);
assert.equal(combined[0].events[0].key,oldSource.key,'기존 장부의 관리 버튼과 확인 이력 연결 유지');
assert.deepEqual(combined[0].events[0].beforeOptions,newSource.beforeOptions,'다른 인증 경로로 재조회해도 새 상세 표시');
assert.deepEqual(combined[0].events[0].options,newSource.options);
assert.equal(combined[0].estimate,'12345','기존 미확정 단가 보존');
const newProfile={key:E.reports({events:[newSource]})[0].key,attempts:3,updatedAt:65};
assert.equal(E.groups(E.merge(bothSources,{profiles:[newProfile]}))[0].estimate,'37035','두 조회 경로에서 최근 수정한 조건 우선');
const withDistinct=E.merge(bothSources,{events:[E.event('potential',{...raw,character_name:'다른 캐릭터'},'z-api-key')]});
assert.equal(E.groups(withDistinct).length,2,'이력 ID만 같은 다른 캐릭터의 기록을 합치지 않음');
assert.equal(E.profits(E.confirm(bothSources,combined[0],'12345','one-payment')).length,1);
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
assert.deepEqual(await E.collect(async()=>({potential_history:[raw]}),'potential','2026-09-05','account'),[]);
const mixed=await E.collect(async(_kind,{cursor})=>cursor
  ? {potential_history:[raw,{...raw,id:'late'}],next_cursor:null}
  : {potential_history:[raw,{...raw,id:'past',date_create:'2026-09-05T13:00:00Z'}],next_cursor:'continue'},
  'potential','2026-09-06','account');
assert.deepEqual(mixed.map(row=>row.id).sort(),['event-1','late'],'다른 날짜가 섞여도 다음 페이지까지 현재 날짜의 이력을 중복 없이 수집');
await assert.rejects(E.collect(async()=>({potential_history:[raw],next_cursor:34}),'potential','2026-09-06','account'),/페이지/);
const controller=new AbortController();controller.abort();
await assert.rejects(E.collect(async()=>{throw new Error('should not run');},'potential','2026-09-06','account',controller.signal));

// 소울 API 원본에는 월드·장비 레벨·사용 메소·1회/3회 구분이 없습니다.
const singleSoulOptions=Array.from({length:3},()=>({grade:'레전드리',value:'새 옵션'}));
const soulRaw={id:'soul-1',character_name:'소울 테스트',target_item:'제네시스 스태프',date_create:'2026-09-24T12:00:00+09:00',soul_potential_amplified_grade:3,soul_potential_grade:'레전드리',before_soul_potential_option:[{grade:'유니크',value:'이전 옵션'}],after_soul_potential_option:singleSoulOptions,upgrade_guarantee:true};
const soul=E.event('soul-potential',soulRaw,'soul-account');
assert.equal(soul.world,'');
assert.equal(soul.grade,'유니크','재설정 전 옵션 등급으로 비용을 산정해야 함');
assert.equal(soul.beforeOptions[0].value,'이전 옵션');
assert.equal(soul.options[0].value,'새 옵션');
assert.equal(soul.soulStage,3);
assert.equal(E.defaultUnit(soul),'65000000');
assert.equal(E.defaultUnit({...soul,grade:''}),null,'최종 등급에서 이전 등급을 추측하지 않음');
let soulState=E.merge({events:[soul,soul]});
let soulReport=E.reports(soulState)[0];
assert.equal(soulReport.estimate,'65000000','한 묶음의 결과는 실제 전 등급의 고정비를 자동 산정');
assert.deepEqual(E.profits(soulState),[],'가져온 소울 이력은 지출 확정 전 통계에서 제외');
soulState=E.merge({events:[E.event('soul-potential',{...soulRaw,after_soul_potential_option:[...singleSoulOptions,...singleSoulOptions,...singleSoulOptions]},'soul-account')]});
soulReport=E.reports(soulState)[0];
assert.equal(soulReport.estimate,'195000000');
const missingSoul=E.event('soul-potential',{...soulRaw,after_soul_potential_option:[]},'soul-account');
assert.equal(E.reports({events:[missingSoul]})[0].estimate,null,'결과를 제공하지 않은 사용의 횟수는 단정할 수 없음');
const soulConfirmed=E.confirm(soulState,soulReport,'195000000','soul-batch');
assert.equal(E.profits(soulConfirmed)[0].type,'soul_ether');
assert.equal(E.profits(soulConfirmed)[0].costs[0].price,'195000000');
assert.equal(E.reports(E.merge(soulConfirmed,{events:[soul]})).length,0,'소울 재조회로 중복 지출을 만들지 않음');
assert.equal((await E.collect(async()=>({soul_potential_history:[soulRaw],next_cursor:''}),'soul-potential','2026-09-24','soul-account')).length,1);

const originalFetch=globalThis.fetch;
const stores=new Map();
let exchanges=0,upstreamFailure=null,upstreamStatus=401;
globalThis.fetch=async (url,init)=>{
  url=String(url);
  assert.equal(init.redirect,'manual','Worker requests must reject redirects manually');
  if(url==='https://openid.nexon.com/oauth2/token') {
    exchanges++;
    assert.equal(init.body.get('client_secret'),'server-only-fixture');
    if(upstreamFailure) return new Response(JSON.stringify(upstreamFailure),{status:upstreamStatus,headers:{Location:'https://untrusted.example/never-follow'}});
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
  assert.equal(auth.searchParams.get('scope'),'maplestory.characterlist,maplestory.starforce,maplestory.potential,maplestory.scheduler,maplestory.cube,maplestory.soulpotential');
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
  for(const name of ['OPENAPI00012','private-access','redirect']) {
    const retry=await (await friendsRoute(request('start',{challenge}),env)).json();
    upstreamFailure={error:{name,message:'server-only-fixture private-access private-refresh'}};
    upstreamStatus=name==='redirect'?302:401;
    const failure=await (await friendsRoute(request('finish',{state:retry.state,proof,code:'code'}),env)).json();
    assert.equal(failure.errorCode,'TOKEN_EXCHANGE / '+(name==='OPENAPI00012'?name:String(upstreamStatus)));
    assert(!JSON.stringify(failure).includes('private-'));
    assert(!JSON.stringify(failure).includes('server-only-fixture'));
    const count=exchanges;
    assert.equal((await friendsRoute(request('finish',{state:retry.state,proof,code:'code'}),env)).status,401);
    assert.equal(exchanges,count,'A failed exchange must consume its authorization state');
  }
} finally {globalThis.fetch=originalFetch;}
console.log('Enhancement ledger and Friends OAuth safety tests passed.');
