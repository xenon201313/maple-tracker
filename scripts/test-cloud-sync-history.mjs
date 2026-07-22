import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/maple-tracker-sync.mjs';

class MemoryKv {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix = '', limit = 1000 } = {}) {
    const keys = [...this.values.keys()]
      .filter(key => key.startsWith(prefix))
      .sort()
      .slice(0, limit)
      .map(name => ({ name }));
    return { keys, list_complete: true };
  }
}

const id = 'a'.repeat(64);
const env = { DATA: new MemoryKv() };
const origin = 'https://maple-trackers.com';

for (let index = 1; index <= 22; index++) {
  const body = JSON.stringify({ version: 1, updatedAt: index, iv: 'iv-' + index, ciphertext: 'cipher-' + index });
  const request = new Request('https://worker.test/v1/sync/' + id, {
    method: 'PUT',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  await new Promise(resolve => setTimeout(resolve, 1));
}

const currentResponse = await worker.fetch(new Request('https://worker.test/v1/sync/' + id, {
  headers: { Origin: origin }
}), env);
assert.equal(currentResponse.status, 200);
assert.equal((await currentResponse.json()).updatedAt, 22);

const historyResponse = await worker.fetch(new Request('https://worker.test/v1/sync/' + id + '/history?limit=20', {
  headers: { Origin: origin }
}), env);
assert.equal(historyResponse.status, 200);
const history = await historyResponse.json();
assert.equal(history.snapshots.length, 20);
assert.equal(history.snapshots[0].payload.updatedAt, 22);
assert.equal(history.snapshots.at(-1).payload.updatedAt, 3);
assert.equal(historyResponse.headers.get('Cache-Control'), 'no-store');

console.log('cloud sync history: OK');
