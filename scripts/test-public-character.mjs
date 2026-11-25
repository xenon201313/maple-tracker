import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import worker from '../cloudflare-worker/maple-tracker-sync.mjs';

const origin = 'https://maple-trackers.com';
const ocid = 'a'.repeat(32);
const image = 'https://open.api.nexon.com/static/maplestory/character/look/TEST';
const serviceKey = 'test-service-key';
const basic = {character_name:'테스트캐릭터', character_image:image, character_class:'비숍', character_level:280, world_name:'크로아'};
const originalFetch = globalThis.fetch;
const originalCache = globalThis.caches;
let env, calls, entries, nextProfile, allowed;

function query(params, options = {}) {
  const url = new URL('/v1/public-character', 'https://worker.example');
  url.search = new URLSearchParams(params);
  return worker.fetch(new Request(url, {
    method: options.method || 'GET',
    headers: {Origin:options.origin || origin, 'CF-Connecting-IP':'192.0.2.7'}
  }), env);
}

beforeEach(() => {
  calls = [];
  allowed = true;
  nextProfile = {...basic, character_guild_name:'omitted', character_exp:'omitted', private_token:serviceKey};
  env = {NEXON_API_KEY:serviceKey, PUBLIC_CHARACTER_LIMIT:{limit: async ({key}) => {
    assert.equal(key, '192.0.2.7');
    return {success:allowed};
  }}};
  entries = new Map();
  globalThis.caches = {default:{
    match: async key => entries.get(key)?.clone(),
    put: async (key, response) => entries.set(key, response.clone())
  }};
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    calls.push(url.pathname);
    assert.equal(url.origin,'https://open.api.nexon.com');
    assert.deepEqual(init.headers, {'x-nxopen-api-key':serviceKey});
    assert.equal(init.redirect,'manual');
    assert(init.signal instanceof AbortSignal);
    if (url.pathname === '/maplestory/v1/id') {
      assert.deepEqual([...url.searchParams.keys()],['character_name']);
      return Response.json({ocid});
    }
    assert.equal(url.pathname,'/maplestory/v1/character/basic');
    assert.deepEqual([...url.searchParams],[['ocid',ocid]]);
    return Response.json(nextProfile);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalCache === undefined) delete globalThis.caches;
  else globalThis.caches = originalCache;
});

test('닉네임으로 공개 기본 정보만 반환하고 CORS·기기 캐시를 각 요청에 적용', async () => {
  const result = await query({name:basic.character_name});
  assert.equal(result.status,200);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(result.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await result.json(),{ocid,basic});
  assert.deepEqual(calls,['/maplestory/v1/id','/maplestory/v1/character/basic']);
  allowed = false;
  for (const params of [{name:basic.character_name},{ocid}]) {
    const cached = await query(params,{origin:'https://www.maple-trackers.com'});
    assert.equal(cached.status,200);
    assert.equal(cached.headers.get('Access-Control-Allow-Origin'),'https://www.maple-trackers.com');
    assert.deepEqual(await cached.json(),{ocid,basic});
  }
  assert.equal(calls.length,2);
  assert.equal(entries.size,2);
  for (const response of entries.values()) {
    assert.equal(response.headers.get('Cache-Control'),'public, max-age=60');
    assert(!response.headers.has('Access-Control-Allow-Origin'));
  }
});

test('저장된 OCID는 이름 변경 후에도 기본 정보만 조회', async () => {
  nextProfile.character_name='변경된캐릭터';
  const result=await query({ocid});
  assert.equal((await result.json()).basic.character_name,'변경된캐릭터');
  assert.deepEqual(calls,['/maplestory/v1/character/basic']);
  const mismatched=await query({name:'옛닉네임'});
  assert.equal(mismatched.status,404);
});

test('허용 출처·조회 조건·서버 설정·호출 제한을 넥슨 요청 전에 확인', async () => {
  assert.equal((await query({name:'캐릭터'},{origin:'https://other.example'})).status,403);
  assert.equal((await query({name:'캐릭터'},{method:'POST'})).status,405);
  for (const params of [
    {}, {ocid:'invalid'}, {name:''}, {name:'x'.repeat(65)}, {name:'둘\n셋'}, {name:'캐릭터',ocid},
    [['name','가'],['name','나']], {name:'캐릭터',date:'2026-11-25'}, {endpoint:'scheduler'}
  ]) assert.equal((await query(params)).status,400);
  allowed=false;
  const limited=await query({ocid});
  assert.equal(limited.status,429);
  assert.equal(limited.headers.get('Retry-After'),'60');
  delete env.NEXON_API_KEY;
  assert.equal((await query({ocid})).status,503);
  assert.deepEqual(calls,[]);
});

test('안전하지 않은 외형 주소나 불완전한 프로필을 캐시하지 않고 복구 뒤 재조회', async () => {
  for (const bad of [
    {character_image:'https://other.example/look'},{character_image:'http://open.api.nexon.com/static/maplestory/character/look/abc'},
    {character_name:''},{character_level:0},{world_name:' '}
  ]) {
    nextProfile={...basic,...bad};
    assert.equal((await query({ocid})).status,502);
    assert.equal(entries.size,0);
  }
  nextProfile=basic;
  assert.equal((await query({ocid})).status,200);
});

test('잠시 이용 불가·없는 캐릭터·호출 초과·예상 밖 응답을 구별하고 민감한 원문을 전달하지 않음', async () => {
  for (const [upstream, code, expected] of [
    [400,'OPENAPI00003',404],[400,'OPENAPI00004',404],[400,'OPENAPI00009',503],[400,'OPENAPI00005',503],
    [429,'OPENAPI00007',429],[503,'OPENAPI00011',503],[500,'OPENAPI00001',502],[302,'',502]
  ]) {
    globalThis.fetch=async (_,init)=>{
      assert.equal(init.redirect,'manual');
      return Response.json({error:{name:code,message:serviceKey}},{status:upstream,headers:{Location:'https://other.example/'}});
    };
    const result=await query({ocid});
    assert.equal(result.status,expected);
    assert(!(await result.text()).includes(serviceKey));
    assert.equal(entries.size,0);
  }
});
