const CACHE_SECONDS = 60;
const API = 'https://open.api.nexon.com';
const validOcid = value => typeof value === 'string' && /^[a-f0-9]{16,128}$/i.test(value);
const validName = value => typeof value === 'string' && /^[\p{L}\p{M}\p{N}_-]{1,24}$/u.test(value);

const errors = {
  400: '조회할 캐릭터 이름 또는 식별자를 확인해 주세요.',
  404: '넥슨에서 해당 캐릭터를 찾을 수 없습니다.',
  405: '지원하지 않는 요청 방식입니다.',
  429: '캐릭터 조회가 많습니다. 잠시 후 다시 시도해 주세요.',
  502: '넥슨에서 공개 프로필을 불러오지 못했습니다.',
  503: '지금은 공개 프로필을 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.'
};

function failure(status, headers) {
  return Response.json({error: errors[status]}, {status, headers: {
    ...headers,
    ...(status === 405 ? {Allow: 'GET, OPTIONS'} : {}),
    ...(status === 429 ? {'Retry-After': '60'} : {})
  }});
}

async function readNexon(path, key, value, serviceKey, signal) {
  const url = new URL('/maplestory/v1/' + path, API);
  url.searchParams.set(key, value);
  const response = await fetch(url, {headers: {'x-nxopen-api-key': serviceKey}, redirect: 'manual', signal});
  if (response.status === 429) throw Object.assign(new Error(), {publicStatus: 429});
  if (response.status === 404) throw Object.assign(new Error(), {publicStatus: 404});
  if (!response.ok) {
    const code = response.status === 400 ? (await response.json().catch(() => null))?.error?.name : '';
    let status = 502;
    if (['OPENAPI00003', 'OPENAPI00004'].includes(code)) status = 404;
    if (['OPENAPI00005', 'OPENAPI00009', 'OPENAPI00010'].includes(code) || response.status === 503) status = 503;
    throw Object.assign(new Error(), {publicStatus: status});
  }
  return response.json();
}

function cosmeticProfile(data) {
  if (!validName(data?.character_name) || !data.world_name?.trim() || !data.character_class?.trim() ||
      !Number.isSafeInteger(data.character_level) || data.character_level < 1) throw new Error('Invalid public profile');
  const image = new URL(data.character_image);
  if (image.origin !== API || !image.pathname.startsWith('/static/maplestory/character/look/') ||
      image.username || image.password) throw new Error('Invalid character image');
  return {
    character_name: data.character_name, character_image: image.href,
    character_class: data.character_class, character_level: data.character_level, world_name: data.world_name
  };
}

export async function publicCharacterRoute(request, url, env, headers) {
  if (request.method !== 'GET') return failure(405, headers);
  const entries = [...url.searchParams];
  if (entries.length !== 1) return failure(400, headers);
  const [key, raw] = entries[0];
  const value = key === 'name' ? raw.trim().normalize('NFC') : raw.toLowerCase();
  if (!(key === 'name' && validName(value)) && !(key === 'ocid' && validOcid(value))) return failure(400, headers);

  // Cache only the public projection. CORS and no-store are attached separately for each requesting origin.
  const cache = globalThis.caches?.default;
  const cacheKey = (field, id) => url.origin + '/v1/public-character?' + new URLSearchParams({[field]: id});
  const lookup = cacheKey(key, value);
  try {
    const hit = await cache?.match(lookup).catch(() => null);
    if (hit) return new Response(hit.body, {headers: {...headers, 'Content-Type': 'application/json'}});
    if (!env.NEXON_API_KEY?.trim() || !env.PUBLIC_CHARACTER_LIMIT) return failure(503, headers);
    const limit = await env.PUBLIC_CHARACTER_LIMIT.limit({key: request.headers.get('CF-Connecting-IP') || 'local'});
    if (!limit.success) return failure(429, headers);

    const signal = AbortSignal.timeout(12000);
    const ocid = key === 'ocid' ? value :
      (await readNexon('id', 'character_name', value, env.NEXON_API_KEY, signal)).ocid;
    if (!validOcid(ocid)) throw new Error('Invalid public character ID');
    const basic = cosmeticProfile(await readNexon('character/basic', 'ocid', ocid, env.NEXON_API_KEY, signal));
    if (key === 'name' && basic.character_name.toLowerCase() !== value.toLowerCase()) return failure(404, headers);
    const profile = {ocid, basic};
    if (cache) {
      const keys = new Set([lookup, cacheKey('ocid', ocid)]);
      await Promise.allSettled([...keys].map(cacheUrl => cache.put(cacheUrl, Response.json(profile, {
        headers: {'Cache-Control': 'public, max-age=' + CACHE_SECONDS}
      }))));
    }
    return Response.json(profile, {headers});
  } catch (error) {
    return failure(error.publicStatus || 502, headers);
  }
}
