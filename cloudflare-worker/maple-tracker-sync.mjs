const ALLOWED_ORIGINS = new Set([
  'https://maple-trackers.com',
  'https://www.maple-trackers.com',
  'https://xenon201313.github.io',
  'https://localhost',
  'http://localhost',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'capacitor://localhost'
]);

const COMMUNITY_VERSION = 1;
const COMMUNITY_MIN_PARTICIPANTS = 5;
const COMMUNITY_MAX_ENTRIES = 5000;
const COMMUNITY_MAX_PRODUCTION = 10n ** 30n;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://maple-trackers.com',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function validSyncId(id) {
  return /^[a-f0-9]{64}$/i.test(id);
}

function validCommunityWeek(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T12:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 4;
}

function validMesoString(value) {
  if (!/^\d{1,31}$/.test(String(value || ''))) return null;
  const amount = BigInt(value);
  return amount <= COMMUNITY_MAX_PRODUCTION ? amount : null;
}

function communityKey(week, id) {
  return 'community:v' + COMMUNITY_VERSION + ':week:' + week + ':user:' + id.toLowerCase();
}

function communityPrefix(week) {
  return 'community:v' + COMMUNITY_VERSION + ':week:' + week + ':user:';
}

function validCommunityRecord(raw) {
  if (!raw || raw.version !== COMMUNITY_VERSION || !validSyncId(raw.id) || !validCommunityWeek(raw.week)) return null;
  const production = validMesoString(raw.production);
  const activeDays = Number(raw.activeDays);
  if (production === null || !Number.isInteger(activeDays) || activeDays < 1 || activeDays > 7) return null;
  return { id: raw.id.toLowerCase(), week: raw.week, production, activeDays };
}

async function readCommunityEntries(env, week) {
  const entries = [];
  let cursor;
  do {
    const page = await env.DATA.list({ prefix: communityPrefix(week), cursor, limit: 1000 });
    const values = await Promise.all(page.keys.map(key => env.DATA.get(key.name)));
    values.forEach(value => {
      if (!value) return;
      try {
        const record = validCommunityRecord(JSON.parse(value));
        if (record && record.week === week) entries.push(record);
      } catch {}
    });
    if (entries.length >= COMMUNITY_MAX_ENTRIES || page.list_complete) break;
    cursor = page.cursor;
  } while (cursor);
  return entries.slice(0, COMMUNITY_MAX_ENTRIES);
}

async function communitySummary(env, week, id) {
  const entries = await readCommunityEntries(env, week);
  let totalProduction = 0n;
  let totalActiveDays = 0n;
  let myProduction = null;
  entries.forEach(entry => {
    totalProduction += entry.production;
    totalActiveDays += BigInt(entry.activeDays);
    if (entry.id === id.toLowerCase()) myProduction = entry.production;
  });
  const participantCount = entries.length;
  let topPercent = null;
  if (participantCount >= COMMUNITY_MIN_PARTICIPANTS && myProduction !== null) {
    const rank = entries.reduce((count, entry) => count + (entry.production > myProduction ? 1 : 0), 0) + 1;
    topPercent = Math.ceil((rank * 100) / participantCount);
  }
  return {
    version: COMMUNITY_VERSION,
    week,
    participantCount,
    averageWeekly: participantCount ? (totalProduction / BigInt(participantCount)).toString() : '0',
    averageDaily: totalActiveDays ? (totalProduction / totalActiveDays).toString() : '0',
    topPercent,
    minimumParticipants: COMMUNITY_MIN_PARTICIPANTS,
    truncated: participantCount >= COMMUNITY_MAX_ENTRIES
  };
}

async function parseJsonRequest(request, limit = 4096) {
  const body = await request.text();
  if (!body || body.length > limit) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname === '/health') return json({ ok: true }, 200, headers);
    if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin not allowed' }, 403, headers);

    const syncMatch = url.pathname.match(/^\/v1\/sync\/([a-f0-9]{64})$/i);
    if (syncMatch && validSyncId(syncMatch[1])) {
      const key = 'v1:' + syncMatch[1].toLowerCase();
      if (request.method === 'GET') {
        const value = await env.DATA.get(key);
        return value
          ? new Response(value, { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } })
          : new Response(null, { status: 204, headers });
      }
      if (request.method === 'PUT') {
        const body = await request.text();
        if (!body || body.length > 5_000_000) return json({ error: 'Invalid payload size' }, 413, headers);
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          return json({ error: 'Invalid JSON' }, 400, headers);
        }
        if (!payload || payload.version !== 1 || typeof payload.iv !== 'string' || typeof payload.ciphertext !== 'string') {
          return json({ error: 'Invalid sync payload' }, 400, headers);
        }
        await env.DATA.put(key, body);
        return json({ ok: true, updatedAt: Date.now() }, 200, headers);
      }
      return json({ error: 'Method not allowed' }, 405, { ...headers, Allow: 'GET, PUT, OPTIONS' });
    }

    if (url.pathname === '/v1/community/summary') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { ...headers, Allow: 'GET, OPTIONS' });
      const week = url.searchParams.get('week') || '';
      const id = url.searchParams.get('id') || '';
      if (!validCommunityWeek(week) || !validSyncId(id)) return json({ error: 'Invalid community summary query' }, 400, headers);
      return json(await communitySummary(env, week, id), 200, headers);
    }

    if (url.pathname === '/v1/community/metrics') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { ...headers, Allow: 'POST, OPTIONS' });
      const payload = await parseJsonRequest(request);
      const record = validCommunityRecord(payload);
      if (!record) return json({ error: 'Invalid community metric payload' }, 400, headers);
      await env.DATA.put(communityKey(record.week, record.id), JSON.stringify({
        version: COMMUNITY_VERSION,
        id: record.id,
        week: record.week,
        production: record.production.toString(),
        activeDays: record.activeDays,
        updatedAt: Number(payload.updatedAt) || Date.now()
      }));
      return json(await communitySummary(env, record.week, record.id), 200, headers);
    }

    return json({ error: 'Not found' }, 404, headers);
  }
};
