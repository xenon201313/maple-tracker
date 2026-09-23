// 로그인 세션과 별개로 보관하여 로그아웃·세션 만료가 장부를 삭제하지 않는다.
export const LEDGER_PAYLOAD_LIMIT = 5_000_000;
export const LEDGER_REQUEST_LIMIT = LEDGER_PAYLOAD_LIMIT + 16_384;
const HISTORY_LIMIT = 20;
const HISTORY_TTL = 45 * 24 * 3600 * 1000;
const HISTORY_RESPONSE_LIMIT = 10_000_000;
const CHUNK_SIZE = 64 * 1024;
const validAccount = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const chunkKey = (revision, index) => 'snapshot:' + revision + ':' + index;
const chunkKeys = row => Array.from({ length: row.chunks }, (_, index) => chunkKey(row.revision, index));
const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');

function validBase64(value, minBytes, maxBytes) {
  if (typeof value !== 'string' || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
  const bytes = value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  if (bytes < minBytes || bytes > maxBytes) return false;
  // 마지막 조각만 재인코딩하여 잘못된 패딩 비트도 거부한다.
  try { return btoa(atob(value.slice(-4))) === value.slice(-4); } catch { return false; }
}

export function validLedgerPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (Object.keys(payload).some(key => !['version', 'updatedAt', 'iv', 'ciphertext'].includes(key))) return false;
  return payload.version === 1 && Number.isSafeInteger(payload.updatedAt) && payload.updatedAt >= 0
    && validBase64(payload.iv, 12, 12) && validBase64(payload.ciphertext, 16, LEDGER_PAYLOAD_LIMIT)
    && JSON.stringify(payload).length <= LEDGER_PAYLOAD_LIMIT;
}

// Content-Length가 없거나 거짓이어도 전체 본문을 메모리에 올리기 전에 제한한다.
export async function boundedRequestText(request, limit) {
  const length = request.headers.get('Content-Length');
  if (length && /^\d+$/.test(length) && Number(length) > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

async function deleteRows(store, rows) {
  const keys = rows.flatMap(chunkKeys);
  for (let index = 0; index < keys.length; index += 128) await store.delete(keys.slice(index, index + 128));
}
async function readPayload(store, row) {
  if (!row) return null;
  const keys = chunkKeys(row), chunks = await store.get(keys);
  if (keys.some(key => typeof chunks.get(key) !== 'string')) throw new Error('INCOMPLETE_SNAPSHOT');
  return JSON.parse(keys.map(key => chunks.get(key)).join(''));
}
async function scheduleHistoryExpiry(store, history) {
  if (history.length) await store.setAlarm(Math.min(...history.map(row => row.savedAt + HISTORY_TTL + 1)));
  else await store.deleteAlarm();
}

// 이 클래스에 연결되는 공개 경로는 없다. FriendsSession이 인증된 account만 전달한다.
export class FriendsLedger {
  constructor(state) { this.state = state; }
  async prune() {
    await this.state.storage.transaction(async store => {
      const meta = await store.get('meta');
      if (!meta) return;
      const history = meta.history.filter(row => row.savedAt > Date.now() - HISTORY_TTL).slice(0, HISTORY_LIMIT);
      const kept = new Set(history.map(row => row.revision));
      if (meta.current) kept.add(meta.current.revision);
      await deleteRows(store, meta.history.filter(row => !kept.has(row.revision)));
      await store.put('meta', { ...meta, history });
      await scheduleHistoryExpiry(store, history);
    });
  }
  async alarm() { return this.state.blockConcurrencyWhile(() => this.prune()); }
  async fetch(request) {
    return this.state.blockConcurrencyWhile(async () => {
      try {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
        const text = await boundedRequestText(request, LEDGER_REQUEST_LIMIT);
        if (text === null) return json({ error: '저장할 장부의 크기가 너무 큽니다.' }, 413);
        let input;
        try { input = JSON.parse(text); } catch { return json({ error: 'Invalid JSON' }, 400); }
        if (!input || !validAccount(input.account) || !['ledger-key', 'ledger-read', 'ledger-save', 'ledger-history'].includes(input.action)) return json({ error: 'Invalid request' }, 400);
        if (input.action === 'ledger-save' && (!Number.isSafeInteger(input.revision) || input.revision < 0 || !validLedgerPayload(input.payload))) return json({ error: '암호화된 장부 형식이 올바르지 않습니다.' }, 400);
        if (input.beforeRevision !== undefined && (!Number.isSafeInteger(input.beforeRevision) || input.beforeRevision < 1)) return json({ error: 'Invalid history cursor' }, 400);
        const store = this.state.storage;
        let meta = await store.get('meta');
        if (meta && meta.account !== input.account) return json({ error: '장부 계정이 일치하지 않습니다.' }, 403);
        if (!meta) {
          meta = { account: input.account, key: randomKey(), revision: 0, current: null, history: [] };
          await store.put('meta', meta);
        }
        const account = meta.account;
        if (input.action === 'ledger-key') return json({ account, key: meta.key });
        if (input.action === 'ledger-read') return json({ account, revision: meta.revision, payload: await readPayload(store, meta.current) });
        if (input.action === 'ledger-history') {
          await this.prune();
          meta = await store.get('meta');
          const rows = meta.history.filter(row => input.beforeRevision === undefined || row.revision < input.beforeRevision);
          const snapshots = [];
          let size = 0;
          for (const row of rows) {
            if (snapshots.length && size + row.size > HISTORY_RESPONSE_LIMIT) break;
            snapshots.push({ savedAt: row.savedAt, revision: row.revision, payload: await readPayload(store, row) });
            size += row.size;
          }
          return json({ account, snapshots, nextBeforeRevision: snapshots.length < rows.length ? snapshots.at(-1).revision : null });
        }
        if (input.revision !== meta.revision) return json({ error: '다른 기기에서 저장한 장부가 있습니다. 두 기록을 확인한 뒤 다시 저장해 주세요.', errorCode: 'LEDGER_CONFLICT', account, revision: meta.revision }, 409);
        const revision = meta.revision + 1, savedAt = Date.now(), serialized = JSON.stringify(input.payload);
        if (!Number.isSafeInteger(revision)) return json({ error: '장부 저장 번호를 갱신할 수 없습니다.' }, 503);
        const row = { revision, savedAt, size: serialized.length, chunks: Math.ceil(serialized.length / CHUNK_SIZE) };
        const history = [row, ...meta.history].filter(item => item.savedAt > savedAt - HISTORY_TTL).slice(0, HISTORY_LIMIT);
        const kept = new Set(history.map(item => item.revision));
        const obsolete = [...new Map([meta.current, ...meta.history].filter(Boolean).map(item => [item.revision, item])).values()].filter(item => !kept.has(item.revision));
        // 암호문 조각, revision, 이력 인덱스를 한 트랜잭션으로 확정한다.
        await store.transaction(async transaction => {
          const entries = Object.fromEntries(chunkKeys(row).map((key, index) => [key, serialized.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)]));
          await transaction.put(entries);
          await transaction.put('meta', { ...meta, revision, current: row, history });
          await deleteRows(transaction, obsolete);
          await scheduleHistoryExpiry(transaction, history);
        });
        return json({ account, revision, savedAt });
      } catch {
        return json({ error: '계정 장부를 처리하지 못했습니다. 기존 기록은 유지됩니다.', errorCode: 'LEDGER_UNAVAILABLE' }, 503);
      }
    });
  }
}
