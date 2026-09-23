import assert from 'node:assert/strict';
import { FriendsLedger, LEDGER_REQUEST_LIMIT, boundedRequestText, validLedgerPayload } from '../cloudflare-worker/friends-ledger.mjs';
import { FriendsSession, friendsRoute } from '../cloudflare-worker/friends.mjs';
import worker from '../cloudflare-worker/maple-tracker-sync.mjs';

// 실제 계정·서버·브라우저 저장소에 접근하지 않는 격리된 서버 회귀 검사.
class MemoryStorage {
  values = new Map();
  alarm = null;
  failTransaction = false;
  async get(key) {
    if (Array.isArray(key)) return new Map(key.filter(item => this.values.has(item)).map(item => [item, structuredClone(this.values.get(item))]));
    return structuredClone(this.values.get(key));
  }
  async put(key, value) {
    for (const [name, item] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) {
      assert(Buffer.byteLength(JSON.stringify(item)) < 128 * 1024, '암호문은 저장소 값 크기보다 작게 나누어야 합니다.');
      this.values.set(name, structuredClone(item));
    }
  }
  async delete(key) { for (const item of Array.isArray(key) ? key : [key]) this.values.delete(item); }
  async deleteAll() { this.values.clear(); }
  async setAlarm(value) { this.alarm = value; }
  async deleteAlarm() { this.alarm = null; }
  async transaction(callback) {
    const previous = structuredClone(this.values), alarm = this.alarm;
    try {
      const result = await callback(this);
      if (this.failTransaction) throw new Error('fixture-transaction-failure private-access');
      return result;
    } catch (error) { this.values = previous; this.alarm = alarm; throw error; }
  }
}
function namespace(Type, env) {
  const objects = new Map();
  return { objects, idFromName: value => value, get(id) {
    if (!objects.has(id)) {
      const storage = new MemoryStorage();
      let chain = Promise.resolve();
      const state = { storage, blockConcurrencyWhile(callback) { const next = chain.then(callback); chain = next.catch(() => {}); return next; } };
      objects.set(id, { storage, instance: new Type(state, env) });
    }
    return objects.get(id).instance;
  } };
}
const kvValues = new Map(), kvWrites = [];
const env = { NEXON_CLIENT_SECRET: 'server-secret-fixture', DATA: {
  async get(key) { return kvValues.get(key) ?? null; },
  async put(key, value) { kvWrites.push(key); kvValues.set(key, value); },
  async delete(key) { kvValues.delete(key); },
  async list({ prefix }) { return { keys: [...kvValues.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), list_complete: true }; }
} };
env.FRIENDS_SESSIONS = namespace(FriendsSession, env);
env.FRIENDS_LEDGERS = namespace(FriendsLedger, env);
const scopes = ['maplestory.characterlist', 'maplestory.starforce', 'maplestory.potential', 'maplestory.scheduler', 'maplestory.cube', 'maplestory.soulpotential'];
const originalFetch = globalThis.fetch, originalNow = Date.now;
let clock = originalNow(), fetches = [];
Date.now = () => clock;
globalThis.fetch = async (input, init) => {
  const url = new URL(input); fetches.push(url.href);
  assert.equal(init.redirect, 'manual');
  if (url.pathname === '/oauth2/token') {
    assert.equal(init.body.get('client_secret'), env.NEXON_CLIENT_SECRET);
    const identity = init.body.get('code') || init.body.get('refresh_token').replace('refresh:', '');
    return Response.json({ access_token: 'access:' + identity, refresh_token: 'refresh:' + identity, expires_in: 1800, refresh_token_expires_in: 1209600 });
  }
  const identity = init.headers.Authorization.replace('Bearer access:', '');
  if (url.pathname === '/oauth2/userinfo') return Response.json({ result: { uid: identity.startsWith('a') ? 'uid-a' : 'uid-b', scope: identity.includes('old') ? scopes.slice(0, 5) : scopes } });
  if (url.pathname.endsWith('/history/soul-potential')) return Response.json({ soul_potential_history: [{ id: 'soul-fixture' }], count: 1, next_cursor: '' });
  if (url.pathname.endsWith('/history/potential')) return Response.json({ potential_history: [], next_cursor: '' });
  if (url.pathname.endsWith('/character/list')) return Response.json({ account_list: [{ account_id: 'account-fixture', character_list: [{ ocid: 'c'.repeat(32), character_name: '검사캐릭터', world_name: '크로아', character_level: 285, private_token: 'must-not-forward' }] }], private_token: 'must-not-forward' });
  if (url.pathname.endsWith('/scheduler/character-state')) return Response.json({ date: '2026-09-24', character_name: '검사캐릭터', daily_contents: [], weekly_contents: [], boss_contents: [{ content_name: '검은 마법사', cycle: 'month', complete_flag: 'true', private_token: 'must-not-forward' }], private_token: 'must-not-forward' });
  throw new Error('예상하지 않은 실제 네트워크 경로');
};
const request = (path, body, extra = {}) => new Request('https://worker.test/v1/friends/' + path, { method: body ? 'POST' : 'GET', headers: { Origin: 'https://maple-trackers.com', 'Content-Type': 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined });
const call = (path, session, data = {}) => friendsRoute(request(path, { ...session, ...data }), env);
const check = async (title, fn) => { await fn(); console.log('통과: ' + title); };
const proof = 'a'.repeat(64);
const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof))).toString('hex');
async function login(code) {
  const start = await (await call('start', {}, { challenge })).json();
  assert.equal(new URL(start.url).searchParams.get('scope'), scopes.join(','));
  const response = await call('finish', { state: start.state, proof }, { code });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert(!JSON.stringify(data).includes('access:'));
  return { state: start.state, proof, account: data.account };
}
const keyFor = async session => (await (await call('ledger-key', session)).json()).key;
const read = async session => (await (await call('ledger-read', session)).json());
const payload = (n = 1, bytes = 16) => ({ version: 1, updatedAt: clock + n, iv: Buffer.alloc(12, n % 256).toString('base64'), ciphertext: Buffer.alloc(bytes, n % 256).toString('base64') });
try {
  const a = await login('a-one'), secondA = await login('a-two'), b = await login('b-one');
  let keyA;
  await check('인증된 계정의 무작위 키가 재로그인 후 유지되고 계정 간 분리됨', async () => {
    keyA = await keyFor(a);
    assert.match(keyA, /^[a-f0-9]{64}$/); assert.notEqual(keyA, a.account);
    assert.equal(await keyFor(secondA), keyA); assert.notEqual(await keyFor(b), keyA);
    assert.deepEqual(await read(a), { account: a.account, revision: 0, payload: null });
  });
  await check('다른 계정 지정으로 장부를 읽거나 쓸 수 없음', async () => {
    const result = await (await call('ledger-save', a, { account: b.account, revision: 0, payload: payload() })).json();
    assert.equal(result.account, a.account); assert.equal(result.revision, 1);
    assert.equal((await read(b)).payload, null);
    assert.equal((await (await call('ledger-read', a, { account: b.account })).json()).account, a.account);
    assert.equal(kvWrites.length, 0, '기존 API 키 장부 저장소를 변경하면 안 됩니다.');
  });
  await check('두 로그인 세션의 동시 저장은 revision 하나만 성공', async () => {
    const responses = await Promise.all([call('ledger-save', a, { revision: 1, payload: payload(2) }), call('ledger-save', secondA, { revision: 1, payload: payload(3) })]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const conflict = await responses.find(response => response.status === 409).json();
    assert.equal(conflict.errorCode, 'LEDGER_CONFLICT'); assert.equal(conflict.revision, 2);
    assert(!JSON.stringify(conflict).includes(keyA));
    assert.equal((await read(a)).revision, 2);
  });
  await check('실제 AES-GCM 암호문의 기기 간 복원', async () => {
    const encryptionKey = await crypto.subtle.importKey('raw', Buffer.from(keyA, 'hex'), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12)), plaintext = JSON.stringify({ records: { '2026-09-24': { meso: '123456789' } } });
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, new TextEncoder().encode(plaintext));
    const envelope = { version: 1, updatedAt: clock, iv: Buffer.from(iv).toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64') };
    assert.equal((await call('ledger-save', a, { revision: 2, payload: envelope })).status, 200);
    const restored = (await read(secondA)).payload;
    assert.equal(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(restored.iv, 'base64') }, encryptionKey, Buffer.from(restored.ciphertext, 'base64'))), plaintext);
  });
  await check('잘못된 proof·미완료 로그인·만료 세션에서 장부 접근 거부', async () => {
    for (const action of ['ledger-key', 'ledger-read', 'ledger-history', 'ledger-save']) {
      assert.equal((await call(action, { ...a, proof: 'b'.repeat(64) }, action === 'ledger-save' ? { revision: 3, payload: payload() } : {})).status, 401);
    }
    const pending = await (await call('start', {}, { challenge })).json();
    assert.equal((await call('ledger-key', { state: pending.state, proof })).status, 401);
    const store = env.FRIENDS_SESSIONS.objects.get(secondA.state).storage, session = await store.get('session');
    await store.put('session', { ...session, expires: clock - 1 });
    assert.equal((await call('ledger-read', secondA)).status, 401);
    assert.equal((await read(a)).revision, 3);
  });
  await check('비암호문·잘못된 base64·추가 민감 필드·과대 본문 거부', async () => {
    const invalid = [null, {}, { ...payload(), data: { plaintext: true } }, { ...payload(), iv: 'bad' }, { ...payload(), ciphertext: '!!!!' }, { ...payload(), iv: 'A'.repeat(15) + '=' }, { ...payload(), updatedAt: -1 }, { ...payload(), version: 2 }];
    for (const item of invalid) assert.equal((await call('ledger-save', a, { revision: 3, payload: item })).status, 400);
    assert.equal((await friendsRoute(request('ledger-read', a, { 'Content-Length': String(LEDGER_REQUEST_LIMIT + 1) }), env)).status, 413);
    assert.equal((await call('ledger-save', a, { revision: 3, payload: payload(1, 4_000_000) })).status, 413);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(100)); controller.enqueue(new Uint8Array(200)); controller.close(); } });
    assert.equal(await boundedRequestText(new Request('https://fixture.test', { method: 'POST', body: stream, duplex: 'half' }), 200), null);
    assert.equal((await read(a)).revision, 3);
  });
  await check('저장 실패 시 revision·이력·암호문 조각이 모두 원상태', async () => {
    const store = env.FRIENDS_LEDGERS.objects.get('account:' + a.account).storage, before = structuredClone(store.values);
    store.failTransaction = true;
    const response = await call('ledger-save', a, { revision: 3, payload: payload(4, 100_000) });
    store.failTransaction = false;
    assert.equal(response.status, 503); assert.deepEqual(store.values, before);
    const error = JSON.stringify(await response.json());
    assert(!error.includes('private-access')); assert(!error.includes(keyA));
  });
  await check('최근 20세대 보존 및 45일 만료 후에도 최신본·암호화키 보존', async () => {
    for (let revision = 3; revision < 24; revision++) {
      clock += 100;
      assert.equal((await call('ledger-save', a, { revision, payload: payload(revision) })).status, 200);
    }
    const history = await (await call('ledger-history', a)).json();
    assert.equal(history.snapshots.length, 20); assert.equal(history.snapshots[0].revision, 24); assert.equal(history.snapshots.at(-1).revision, 5);
    const object = env.FRIENDS_LEDGERS.objects.get('account:' + a.account), before = (await read(a)).payload;
    clock += 46 * 86400000;
    await object.instance.alarm();
    const meta = await object.storage.get('meta');
    assert.equal(meta.key, keyA); assert.equal(meta.history.length, 0);
    assert.deepEqual(await object.instance.fetch(new Request('https://ledger/read', { method: 'POST', body: JSON.stringify({ action: 'ledger-read', account: a.account }) })).then(response => response.json()).then(result => result.payload), before);
    assert.equal(object.storage.values.size, meta.current.chunks + 1);
    clock -= 46 * 86400000;
  });
  await check('큰 암호문 조각 저장과 이력 커서로 10MB 응답 제한', async () => {
    for (let revision = 0; revision < 3; revision++) assert.equal((await call('ledger-save', b, { revision, payload: payload(revision + 1, 2_800_000) })).status, 200);
    const history = await (await call('ledger-history', b)).json();
    assert.equal(history.snapshots.length, 2); assert.equal(history.nextBeforeRevision, 2);
    const older = await (await call('ledger-history', b, { beforeRevision: history.nextBeforeRevision })).json();
    assert.equal(older.snapshots.length, 1); assert.equal(older.snapshots[0].revision, 1); assert.equal(older.nextBeforeRevision, null);
  });
  await check('로그아웃은 서버 세션만 삭제하고 계정 장부는 재로그인으로 복원', async () => {
    assert.equal((await call('logout', a)).status, 200); assert.equal((await call('ledger-key', a)).status, 401);
    const reconnect = await login('a-three');
    assert.equal(await keyFor(reconnect), keyA); assert.equal((await read(reconnect)).revision, 24);
  });
  await check('소울·캐릭터·스케줄러 scope와 고정 응답 필드, 안전한 쿼리', async () => {
    const live = await login('a-game'), old = await login('a-old');
    assert.equal((await call('history', old, { kind: 'soul-potential', date: '2026-09-24' })).status, 403);
    assert.equal((await call('history', old, { kind: 'potential', date: '2026-09-24' })).status, 200);
    assert.equal((await (await call('history', live, { kind: 'soul-potential', date: '2026-09-24' })).json()).soul_potential_history.length, 1);
    const chars = await (await call('character-list', live)).json(); assert.equal(chars.account_list[0].character_list[0].character_name, '검사캐릭터');
    assert(!JSON.stringify(chars).includes('private_token'));
    const scheduler = await (await call('scheduler', live, { ocid: 'c'.repeat(32), date: '2026-09-24' })).json();
    assert.equal(scheduler.boss_contents[0].cycle, 'month'); assert(!JSON.stringify(scheduler).includes('private_token'));
    for (const ocid of ['../../token', 'a', 'c'.repeat(129)]) assert.equal((await call('scheduler', live, { ocid })).status, 400);
    for (const date of ['2026-02-30', '2026-9-24', 'invalid']) assert.equal((await call('scheduler', live, { ocid: 'c'.repeat(32), date })).status, 400);
    for (const kind of ['scheduler', 'characterlist', '../../oauth2/token']) assert.equal((await call('history', live, { kind, date: '2026-09-24' })).status, 400);
    assert.equal((await friendsRoute(request('ledger-read', live, { Origin: 'https://evil.test' }), env)).status, 403);
  });
  await check('기존 API 키 KV 저장·이력 경로와 별도 공개 계정 경로 차단 유지', async () => {
    const id = 'd'.repeat(64), envelope = payload(9);
    const put = new Request('https://worker.test/v1/sync/' + id, { method: 'PUT', headers: { Origin: 'https://maple-trackers.com', 'Content-Type': 'application/json' }, body: JSON.stringify(envelope) });
    assert.equal((await worker.fetch(put, env)).status, 200);
    const get = new Request('https://worker.test/v1/sync/' + id, { headers: { Origin: 'https://maple-trackers.com' } });
    assert.deepEqual(await (await worker.fetch(get, env)).json(), envelope);
    assert(kvValues.has('v1:' + id));
    assert([...kvValues.keys()].some(key => key.startsWith('history:v1:' + id + ':')));
    const direct = new Request('https://worker.test/v1/ledger/' + a.account, { headers: { Origin: 'https://maple-trackers.com' } });
    assert.equal((await worker.fetch(direct, env)).status, 404);
  });
  assert.equal(validLedgerPayload(payload()), true);
  console.log('Friends 계정 장부·인증·충돌·세대 보관·추가 API 검사 완료. 실제 계정 자료는 사용하지 않았습니다.');
} finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
