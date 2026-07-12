const ALLOWED_ORIGINS = new Set([
  'https://maple-trackers.com',
  'https://www.maple-trackers.com',
  'https://xenon201313.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://maple-trackers.com',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname === '/health') return json({ ok: true }, 200, headers);
    if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin not allowed' }, 403, headers);

    const match = url.pathname.match(/^\/v1\/sync\/([a-f0-9]{64})$/i);
    if (!match || !validSyncId(match[1])) return json({ error: 'Not found' }, 404, headers);

    const key = 'v1:' + match[1].toLowerCase();
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
};
