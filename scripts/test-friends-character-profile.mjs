import assert from 'node:assert/strict';
import { FriendsSession, friendsRoute } from '../cloudflare-worker/friends.mjs';

// 실제 계정·API 키·네트워크를 사용하지 않는 캐릭터 로그인 조회 회귀 검사.
const originalFetch=globalThis.fetch, originalNow=Date.now;
let now=Date.parse('2026-09-29T15:10:00Z'); // KST 9/30: UTC 날짜로 범위를 판정하면 틀린다.
Date.now=()=>now;
const proof='a'.repeat(64), stateId='b'.repeat(64), account='c'.repeat(64);
const ocid='1'.repeat(32), renamedId='2'.repeat(32), otherId='3'.repeat(32);
const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(proof))).toString('hex');
const fixtures={calls:[],list:[{ocid,character_name:'검사캐릭터',world_name:'크로아',character_class:'비숍',character_level:285}],statFail:false,historyFail:null,blankWorld:false,basicFail:false,redirect:false,statName:'전투력',statValue:'120000000',costs:{}};
const serviceKey='private-server-api-key-fixture', access='private-nexon-access-fixture';
const env={NEXON_CLIENT_SECRET:'private-client-secret-fixture',NEXON_API_KEY:serviceKey};
const values=new Map();
const storage={get:async key=>structuredClone(values.get(key)),put:async(key,value)=>values.set(key,structuredClone(value)),deleteAll:async()=>values.clear(),setAlarm:async()=>{}};
const instance=new FriendsSession({storage,blockConcurrencyWhile:async callback=>callback()},env);
env.FRIENDS_SESSIONS={idFromName:value=>value,get:id=>{assert.equal(id,stateId);return instance;}};
const reset=()=>{
  values.set('session',{challenge,account,scopes:['maplestory.characterlist','maplestory.scheduler'],access,refresh:'private-refresh-fixture',accessUntil:now+3600000,expires:now+86400000,requests:0,window:now,pending:false});
  fixtures.calls=[];fixtures.list=[{ocid,character_name:'검사캐릭터',world_name:'크로아',character_class:'비숍',character_level:285}];fixtures.statFail=false;fixtures.historyFail=null;fixtures.blankWorld=false;fixtures.basicFail=false;fixtures.redirect=false;fixtures.statName='전투력';fixtures.statValue='120000000';fixtures.costs={};
  instance.characterCache=null;instance.profileCache.clear();env.NEXON_API_KEY=serviceKey;
};
const req=(path,body,origin='https://maple-trackers.com')=>new Request('https://worker.test/v1/friends/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify({state:stateId,proof,...body}):undefined});
const call=(body={characterName:'검사캐릭터'})=>friendsRoute(req('character-profile',body),env);
const check=async(title,callback)=>{reset();await callback();console.log('통과: '+title);};
globalThis.fetch=async(input,init)=>{
  const url=new URL(input);fixtures.calls.push({url:url.href,headers:init.headers});
  assert(init.signal instanceof AbortSignal,'실제 업스트림 요청에 제한 시간 signal 전달');
  if(url.href==='https://openid.nexon.com/oauth2/token'){
    now+=fixtures.costs.token || 0;
    return Response.json({access_token:access,refresh_token:'private-refresh-fixture',expires_in:1800,refresh_token_expires_in:1209600});
  }
  assert.equal(url.origin,'https://open.api.nexon.com');assert.equal(init.redirect,'manual');
  if(url.pathname==='/maplestory/v1/character/list'){
    now+=fixtures.costs.list || 0;
    assert.equal(init.headers.Authorization,'Bearer '+access);assert(!init.headers['x-nxopen-api-key']);
    return Response.json({account_list:[{account_id:'maple-account-one',character_list:fixtures.list.map(row=>({...row,private_token:'do-not-forward'}))}],private_token:'do-not-forward'});
  }
  assert.equal(init.headers['x-nxopen-api-key'],serviceKey);assert(!init.headers.Authorization);
  assert(['/maplestory/v1/character/basic','/maplestory/v1/character/stat'].includes(url.pathname),'허용한 공개 API 두 개만 호출');
  const id=url.searchParams.get('ocid'), date=url.searchParams.get('date');
  now+=fixtures.costs[url.pathname.endsWith('/stat')?'stat':date?'history':'basic'] || 0;
  assert(fixtures.list.some(row=>row.ocid===id),'본인 목록으로 검증한 OCID만 서비스 키로 조회');
  assert.deepEqual([...url.searchParams.keys()].sort(),date?['date','ocid']:['ocid']);
  if(fixtures.redirect)return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'+serviceKey}});
  if(url.pathname.endsWith('/stat')){
    if(fixtures.statFail)return Response.json({error:{name:'OPENAPI00009',message:serviceKey}}, {status:400});
    return Response.json({date:null,character_class:'비숍',final_stat:[{stat_name:fixtures.statName,stat_value:fixtures.statValue,private_token:'do-not-forward'}],private_token:'do-not-forward'});
  }
  if(fixtures.basicFail || (date && date===fixtures.historyFail))return Response.json({error:{name:'OPENAPI00009',message:serviceKey}},{status:400});
  const row=fixtures.list.find(item=>item.ocid===id);
  return Response.json({...row,date:date?date+'T00:00+09:00':null,world_name:fixtures.blankWorld?'  ':row.world_name,character_image:'https://open.api.nexon.com/static/maplestory/character/look/fixture',character_exp:100000000,character_exp_rate:'10.00',private_token:'do-not-forward'});
};
try {
  await check('설정 준비 상태는 키 값을 공개하지 않음',async()=>{
    const ready=await (await friendsRoute(req('config'),env)).json();
    assert.equal(ready.characterProfileReady,true);assert(!JSON.stringify(ready).includes(serviceKey));
    delete env.NEXON_API_KEY;
    assert.equal((await (await friendsRoute(req('config'),env)).json()).characterProfileReady,false);
    const response=await call(),text=await response.text();assert.equal(response.status,503);assert.match(text,/PROFILE_UNAVAILABLE/);assert.equal(fixtures.calls.length,0);
  });
  await check('개인 키 없이 계정 목록 검증 후 이미지·레벨·전투력·경험치를 반환',async()=>{
    const response=await call({characterName:'검사캐릭터',dates:['2026-09-29','2026-09-24']}),data=await response.json();
    assert.equal(response.status,200);assert.equal(data.ocid,ocid);assert.equal(data.basic.character_level,285);assert.match(data.basic.character_image,/open\.api\.nexon\.com/);assert.equal(data.stat.final_stat[0].stat_value,'120000000');
    assert.deepEqual(data.history.map(row=>row.date),['2026-09-24','2026-09-29']);
    const text=JSON.stringify(data);for(const secret of [serviceKey,access,'do-not-forward','private-client-secret-fixture'])assert(!text.includes(secret));
    assert.equal(fixtures.calls.length,5);
  });
  await check('잘못된 날짜·과도한 기간·식별자는 API 호출 전에 거부',async()=>{
    for(const body of [{characterName:'검사캐릭터',dates:['2026-09-30']},{characterName:'검사캐릭터',dates:['2026-09-23']},{characterName:'검사캐릭터',dates:['2026-09-31']},{characterName:'검사캐릭터',dates:Array(7).fill('2026-09-29')},{characterName:'검사캐릭터',dates:'2026-09-29'},{characterName:'',ocid:''},{characterName:'검사캐릭터',ocid:'../userinfo'},{characterName:'검사\n캐릭터'},{}])assert.equal((await call(body)).status,400);
    assert.equal(fixtures.calls.length,0);
  });
  await check('세션·출처·동의와 캐릭터 소유권을 검증',async()=>{
    assert.equal((await call({proof:'d'.repeat(64),characterName:'검사캐릭터'})).status,401);
    assert.equal((await friendsRoute(req('character-profile',{characterName:'검사캐릭터'},'https://untrusted.example'),env)).status,403);
    const response=await call({ocid:otherId,characterName:'다른유저'});assert.equal(response.status,403);assert.equal((await response.json()).errorCode,'CHARACTER_NOT_OWNED');assert(fixtures.calls.every(item=>item.url.endsWith('/character/list')));
    fixtures.calls=[];values.get('session').scopes=[];
    assert.equal((await call()).status,403);assert.equal(fixtures.calls.length,0);
  });
  await check('동일 OCID의 닉네임 변경과 이름 기반 월드 리프를 복구',async()=>{
    fixtures.list[0].character_name='새닉네임';
    let data=await (await call({ocid,characterName:'이전닉네임'})).json();assert.equal(data.ocid,ocid);assert.equal(data.basic.character_name,'새닉네임');
    reset();fixtures.list[0].ocid=renamedId;
    data=await (await call({ocid,characterName:'검사캐릭터'})).json();assert.equal(data.ocid,renamedId);
    reset();fixtures.list.push({...fixtures.list[0],ocid:otherId});
    assert.equal((await call()).status,403,'이름만으로 둘 중 어느 캐릭터인지 모르면 잘못 연결하지 않음');
  });
  await check('캐시로 중복 호출을 줄이고 캐시에서 못 찾은 리프는 목록 재조회',async()=>{
    const query={ocid,characterName:'검사캐릭터',dates:['2026-09-29']};
    assert.equal((await call(query)).status,200);const count=fixtures.calls.length;
    assert.equal((await call(query)).status,200);assert.equal(fixtures.calls.length,count);
    now+=61000;assert.equal((await call(query)).status,200);assert.equal(fixtures.calls.length,count*2);
    fixtures.list.push({ocid:renamedId,character_name:'새캐릭터',world_name:'크로아',character_level:280});
    assert.equal((await call({characterName:'새캐릭터'})).status,200);
    assert.equal(fixtures.calls.filter(item=>item.url.endsWith('/character/list')).length,3);
  });
  await check('전투력·과거 경험치 일부 실패는 기존 값을 지울 빈 값을 반환하지 않음',async()=>{
    fixtures.statFail=true;fixtures.historyFail='2026-09-28';
    const response=await call({characterName:'검사캐릭터',dates:['2026-09-28','2026-09-29']}),data=await response.json();assert.equal(response.status,200);
    assert(!Object.hasOwn(data,'stat'));assert.equal(data.history.length,1);assert.equal(data.history[0].date,'2026-09-29');assert.match(data.profileWarning,/기존 값을 유지/);assert.match(data.profileWarning,/2026-09-28/);assert(!JSON.stringify(data).includes(serviceKey));
  });
  await check('보스 전투력 이름을 지원하고 빈 수치·사냥 전투력으로 기존 값을 덮지 않음',async()=>{
    for(const name of ['보스 전투력','전투력','Boss Combat Power']){
      instance.profileCache.clear();fixtures.statName=name;const data=await (await call()).json();assert.equal(data.stat.final_stat[0].stat_name,name);
    }
    for(const value of [null,'', 'NaN', '-1']){
      instance.profileCache.clear();fixtures.statValue=value;const data=await (await call()).json();assert(!Object.hasOwn(data,'stat'));assert.match(data.profileWarning,/기존 값을 유지/);
    }
    instance.profileCache.clear();fixtures.statName='사냥 전투력';fixtures.statValue='120000000';assert(!Object.hasOwn(await (await call()).json(),'stat'));
  });
  await check('토큰 갱신부터 24초 예산 안에 최신 프로필과 성공한 과거 기록을 반환',async()=>{
    const timeouts=[],savedTimeout=AbortSignal.timeout;
    AbortSignal.timeout=milliseconds=>{timeouts.push(milliseconds);return savedTimeout(milliseconds);};
    try{
      values.get('session').accessUntil=now;fixtures.costs={token:8000,list:1000,basic:1000,stat:12000,history:2000};const started=now;
      const response=await call({characterName:'검사캐릭터',dates:['2026-09-24','2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29']}),data=await response.json();
      assert.equal(response.status,200);assert.equal(now-started,24000);assert.equal(data.history.length,1);assert.equal(data.history[0].date,'2026-09-24');assert.equal(data.basic.character_level,285);
      assert.equal(fixtures.calls.filter(item=>item.url.includes('date=')).length,1,'예산 소진 후 남은 다섯 날짜의 요청을 시작하지 않음');
      assert.match(data.profileWarning,/2026-09-29/);assert(timeouts.includes(16000),'토큰 갱신 8초를 제외한 조회 예산');assert(timeouts.includes(2000),'마지막 조회에는 남은 2초만 허용');
      assert(!JSON.stringify(data).includes(serviceKey));
    }finally{AbortSignal.timeout=savedTimeout;}
  });
  await check('최신 기본 정보 실패·빈 월드·리다이렉트를 성공으로 캐시하지 않음',async()=>{
    fixtures.basicFail=true;let response=await call();assert.equal(response.status,502);assert(!JSON.stringify(await response.json()).includes(serviceKey));assert.equal(instance.profileCache.size,0);
    fixtures.basicFail=false;fixtures.blankWorld=true;response=await call();assert.equal(response.status,502);assert.equal(instance.profileCache.size,0);
    fixtures.blankWorld=false;fixtures.redirect=true;response=await call();assert.equal(response.status,502);assert.equal(instance.profileCache.size,0);
  });
  await check('로그아웃 후 캐시 프로필을 반환하지 않음',async()=>{
    assert.equal((await call()).status,200);assert(instance.profileCache.size>0);
    await friendsRoute(req('logout',{}),env);assert.equal(instance.profileCache.size,0);assert.equal(instance.characterCache,null);assert.equal((await call()).status,401);
  });
  console.log('넥슨 로그인 캐릭터 프로필 서버 검사 11개 통과');
} finally { globalThis.fetch=originalFetch;Date.now=originalNow; }
