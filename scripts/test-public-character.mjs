import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import worker from '../cloudflare-worker/maple-tracker-sync.mjs';

const origin = 'https://maple-trackers.com';
const ocid = 'a'.repeat(32);
const image = 'https://open.api.nexon.com/static/maplestory/character/look/TEST';
const serviceKey = 'test-service-key';
const basic = {character_name:'테스트캐릭터',character_image:image,character_class:'비숍',character_level:280,world_name:'크로아',character_exp:'7654321',character_exp_rate:'42.75'};
const dates = ['2026-11-19','2026-11-20','2026-11-21','2026-11-22','2026-11-23','2026-11-24'];
const originalFetch = globalThis.fetch;
const originalCache = globalThis.caches;
const originalNow = Date.now;
let env, calls, entries, nextProfile, nextStat, allowed, limited, failures, now;
function query(params, options = {}) {
  const url = new URL('/v1/public-character'+(options.equipment?'/equipment':''),'https://worker.example');
  url.search = new URLSearchParams(params);
  return worker.fetch(new Request(url, {
    method:options.method || 'GET',
    headers:{Origin:options.origin || origin,'CF-Connecting-IP':'192.0.2.7'}
  }),env);
}

beforeEach(() => {
  calls = []; failures = new Set(); limited = 0; allowed = true;
  now = Date.parse('2026-11-24T15:10:00Z');
  Date.now = () => now;
  nextProfile = {...basic,character_exp:7654321,guild_secret:'omitted',private_token:serviceKey};
  nextStat = [
    {stat_name:'사냥 전투력',stat_value:'9999999'},
    {stat_name:'전투력',stat_value:'4321'},
    {stat_name:'보스 전투력',stat_value:'5432',private_token:serviceKey}
  ];
  env = {NEXON_API_KEY:serviceKey,PUBLIC_CHARACTER_LIMIT:{limit:async({key}) => {
    assert.equal(key,'192.0.2.7'); limited++; return {success:allowed};
  }}};
  entries = new Map();
  globalThis.caches = {default:{
    match:async key => entries.get(key)?.clone(),
    put:async (key,response) => entries.set(key,response.clone())
  }};
  globalThis.fetch = async(input,init) => {
    const url = new URL(input);
    const kind = url.pathname.replace('/maplestory/v1/','');
    const date = url.searchParams.get('date') || '';
    calls.push(kind+(date?':'+date:''));
    assert.equal(url.origin,'https://open.api.nexon.com');
    assert.deepEqual(init.headers,{'x-nxopen-api-key':serviceKey});
    assert.equal(init.redirect,'manual');
    assert(init.signal instanceof AbortSignal);
    if (failures.has(kind) || failures.has(date)) return new Response(null,{status:503});
    if (kind === 'id') {
      assert.deepEqual([...url.searchParams.keys()],['character_name']);
      return Response.json({ocid});
    }
    assert.equal(url.searchParams.get('ocid'),ocid);
    assert.deepEqual([...url.searchParams.keys()],date?['ocid','date']:['ocid']);
    if (kind==='character/stat') return Response.json({final_stat:nextStat,private_token:serviceKey});
    if (kind==='character/item-equipment') return Response.json({item_equipment:[{item_name:'검',item_equipment_slot:'무기',potential_option_1:'STR',log:serviceKey}],private_token:serviceKey});
    if (kind==='character/symbol-equipment') return Response.json({symbol:[{symbol_name:'아케인심볼',symbol_level:3,log:serviceKey}]});
    assert.equal(kind,'character/basic');
    if (date) return new Response('{"character_level":279,"character_exp":9007199254740993,"character_exp_rate":"0.01","private_token":"omitted"}');
    return Response.json(nextProfile);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch; Date.now = originalNow;
  if (originalCache === undefined) delete globalThis.caches;
  else globalThis.caches = originalCache;
});

test('로그인 없이 최신 프로필·보스 전투력과 KST 기준 지난 6일 경험치만 반환',async() => {
  const res = await query({name:basic.character_name});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(res.headers.get('Cache-Control'),'no-store');
  const data = await res.json();
  assert.deepEqual(data,{ocid,basic,stat:{final_stat:[{stat_name:'보스 전투력',stat_value:'5432'}]},
    history:dates.map(date=>({date,basic:{character_level:279,character_exp:'9007199254740993',character_exp_rate:'0.01'}}))});
  assert.equal(limited,9);
  assert.deepEqual(calls,['id','character/basic','character/stat',...dates.map(date=>'character/basic:'+date)]);
  allowed = false;
  for (const params of [{name:basic.character_name},{ocid}]) {
    const cached = await query(params,{origin:'https://www.maple-trackers.com'});
    assert.equal(cached.status,200);
    assert.equal(cached.headers.get('Access-Control-Allow-Origin'),'https://www.maple-trackers.com');
    assert.deepEqual(await cached.json(),data);
  }
  assert.equal(limited,9);
  for (const response of entries.values()) assert(!response.headers.has('Access-Control-Allow-Origin'));
});

test('다음 KST 날짜에서 최신 프로필과 새 날짜만 조회, OCID 기준 닉네임 변경 추적',async() => {
  await query({ocid});
  calls.length=0; nextProfile.character_name='변경된캐릭터'; now+=86400000;
  const payload = await (await query({ocid})).json();
  assert.equal(payload.basic.character_name,'변경된캐릭터');
  assert.deepEqual(payload.history.map(row=>row.date),[...dates.slice(1),'2026-11-25']);
  assert.deepEqual(calls,['character/basic','character/stat','character/basic:2026-11-25']);
  assert.equal((await query({name:'옛닉네임'})).status,404);
});

test('부분 실패는 유효한 정보만 반환하고 빈 값·사냥 전투력·거짓 경험치 0을 만들지 않음',async() => {
  failures.add(dates[3]); nextProfile.character_exp='';nextProfile.character_exp_rate=null;
  nextStat=[{stat_name:'사냥 전투력',stat_value:'99'},{stat_name:'전투력',stat_value:' '}];
  const data=await (await query({ocid})).json();
  assert.equal(data.stat,undefined); assert.equal(data.basic.character_exp,undefined); assert.equal(data.basic.character_exp_rate,undefined);
  assert.equal(data.history.length,5);assert(!data.history.some(row=>row.date===dates[3]));
  assert.match(data.profileWarning,/전투력/); assert.match(data.profileWarning,/경험치/);
  entries.clear(); failures.clear(); nextStat=[{stat_name:'Combat Power',stat_value:0}]; nextProfile.character_exp=0; nextProfile.character_exp_rate=0;
  const zero=await (await query({ocid})).json();
  assert.equal(zero.stat.final_stat[0].stat_value,'0');assert.equal(zero.basic.character_exp,'0');assert.equal(zero.basic.character_exp_rate,'0');
});

test('장비·심볼은 별도 요청에서만 공개 필드를 반환하고 실패 항목을 빈 배열로 대체하지 않음', async() => {
  const res = await query({ocid},{equipment:true});
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{ocid,date:null,equipment:[{item_name:'검',item_equipment_slot:'무기',potential_option_1:'STR'}],symbols:[{symbol_name:'아케인심볼',symbol_level:3}]});
  assert.deepEqual(calls,['character/item-equipment','character/symbol-equipment']); assert.equal(limited,2);
  allowed=false;assert.equal((await query({ocid},{equipment:true})).status,200);assert.equal(limited,2);
  entries.clear(); allowed=true;
  failures.add('character/item-equipment');
  const partial=await (await query({ocid},{equipment:true})).json();
  assert.equal(partial.equipment,undefined);assert.equal(partial.symbols.length,1);assert(partial.warning);
  entries.clear(); failures.add('character/symbol-equipment');
  assert.equal((await query({ocid},{equipment:true})).status,503);
});

test('허용 출처·식별자·장비 쿼리·호출 제한을 넥슨 요청 전에 검증',async() => {
  for (const equipment of [false,true]) {
    assert.equal((await query({ocid},{equipment,origin:'https://other.example'})).status,403);
    assert.equal((await query({ocid},{equipment,method:'POST'})).status,405);
  }
  assert.equal((await query({name:'캐릭터'},{equipment:true})).status,400);
  for (const params of [{},{ocid:'invalid'},{name:''},{name:'x'.repeat(65)},{name:'둘\n셋'},{name:'캐릭터',ocid},
    [['name','가'],['name','나']],{name:'캐릭터',date:'2026-11-25'},{endpoint:'scheduler'}]) assert.equal((await query(params)).status,400);
  allowed=false;
  const limitedRequest=await query({ocid});
  assert.equal(limitedRequest.status,429); assert.equal(limitedRequest.headers.get('Retry-After'),'60');
  delete env.NEXON_API_KEY;
  assert.equal((await query({ocid})).status,503);assert.deepEqual(calls,[]);
});

test('안전하지 않은 외형 주소·불완전한 최신 기본 정보는 캐시하지 않음', async() => {
  for (const bad of [{character_image:'https://other.example/look'},{character_image:'http://open.api.nexon.com/static/maplestory/character/look/a'},
    {character_name:''},{character_level:0},{world_name:' '}]) {
    nextProfile={...basic,...bad};
    assert.equal((await query({ocid})).status,502);assert.equal(entries.size,0);
  }
  nextProfile=basic;assert.equal((await query({ocid})).status,200);
});

test('넥슨 장애·없는 캐릭터·호출 초과·리다이렉트 오류에서 비밀 원문을 비공개 처리',async() => {
  for (const [status,code,expected] of [
    [400,'OPENAPI00003',404],[400,'OPENAPI00004',404],[400,'OPENAPI00009',503],[400,'OPENAPI00005',503],
    [429,'OPENAPI00007',429],[503,'OPENAPI00011',503],[500,'OPENAPI00001',502],[302,'',502]
  ]) {
    globalThis.fetch=async(_,init)=>{
      assert.equal(init.redirect,'manual');
      return Response.json({error:{name:code,message:serviceKey}},{status,headers:{Location:'https://other.example/'}});
    };
    const res=await query({ocid});
    assert.equal(res.status,expected);assert(!(await res.text()).includes(serviceKey));assert.equal(entries.size,0);
  }
});
