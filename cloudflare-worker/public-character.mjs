import { equipmentProfile } from './character-equipment.mjs';

const API = 'https://open.api.nexon.com';
const DAY_MS = 86400000;
const validOcid = value => typeof value === 'string' && /^[a-f0-9]{16,128}$/i.test(value);
const validName = value => typeof value === 'string' && /^[\p{L}\p{M}\p{N}_-]{1,24}$/u.test(value);
const errors = {
  400: '조회할 캐릭터 이름 또는 식별자를 확인해 주세요.',
  404: '넥슨에서 해당 캐릭터를 찾을 수 없습니다.',
  405: '지원하지 않는 요청 방식입니다.',
  429: '캐릭터 조회가 많습니다. 잠시 후 다시 시도해 주세요.',
  502: '넥슨에서 공개 정보를 불러오지 못했습니다.',
  503: '지금은 공개 정보를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.'
};
const fail = status => Object.assign(new Error(errors[status]), {publicStatus:status});

function failure(status, headers) {
  return Response.json({error: errors[status]}, {status, headers: {
    ...headers,
    ...(status === 405 ? {Allow:'GET, OPTIONS'} : {}),
    ...(status === 429 ? {'Retry-After':'60'} : {})
  }});
}

async function readNexon(path, params, env, ip, signal) {
  signal.throwIfAborted();
  // Charge each upstream call, including history backfills, against the existing per-IP budget.
  if (!(await env.PUBLIC_CHARACTER_LIMIT.limit({key:ip})).success) throw fail(429);
  const url = new URL('/maplestory/v1/' + path, API);
  url.search = new URLSearchParams(params);
  const response = await fetch(url, {headers:{'x-nxopen-api-key':env.NEXON_API_KEY}, redirect:'manual', signal});
  if (!response.ok) {
    const code = response.status === 400 ? (await response.json().catch(() => null))?.error?.name : '';
    if (response.status === 429) throw fail(429);
    if (response.status === 404 || ['OPENAPI00003','OPENAPI00004'].includes(code)) throw fail(404);
    if (response.status === 503 || ['OPENAPI00005','OPENAPI00009','OPENAPI00010'].includes(code)) throw fail(503);
    throw fail(502);
  }
  // A long EXP counter may exceed Number.MAX_SAFE_INTEGER. Keep the original JSON integer digits.
  if (path === 'character/basic') return JSON.parse(await response.text(), (key, value, context) => {
    if (key === 'character_exp' && typeof value === 'number' && !Number.isSafeInteger(value)) return context?.source;
    return value;
  });
  return response.json();
}

function experience(data) {
  if (!Number.isSafeInteger(data?.character_level) || data.character_level < 1) throw fail(502);
  const fields = {character_level:data.character_level};
  if (/^\d+$/.test(String(data.character_exp))) fields.character_exp = String(data.character_exp);
  const rate = String(data.character_exp_rate);
  if (/^\d+(?:\.\d+)?$/.test(rate) && Number(rate) <= 100) fields.character_exp_rate = rate;
  return fields;
}

function publicBasic(data) {
  if (!validName(data?.character_name) || !data.world_name?.trim() || !data.character_class?.trim()) throw fail(502);
  const image = new URL(data.character_image);
  if (image.origin !== API || !image.pathname.startsWith('/static/maplestory/character/look/') || image.username || image.password) throw fail(502);
  return {character_name:data.character_name, character_image:image.href, character_class:data.character_class, world_name:data.world_name, ...experience(data)};
}

function combatStat(data) {
  const rows = Array.isArray(data?.final_stat) ? data.final_stat : [];
  const name = row => String(row?.stat_name || '').replace(/\s/g,'');
  const valid = rows.filter(row => /^\d+$/.test(String(row?.stat_value)));
  const power = valid.find(row => /보스전투력|bosscombatpower/i.test(name(row))) ||
    valid.find(row => /전투력|combatpower/i.test(name(row)) && !/사냥|hunting/i.test(name(row)));
  if (!power) throw fail(502);
  return {final_stat:[{stat_name:power.stat_name, stat_value:String(power.stat_value)}]};
}

async function cacheGet(key) {
  try { return await (await globalThis.caches?.default?.match(key))?.json(); } catch { return null; }
}

async function cachePut(key, value, seconds) {
  try {
    await globalThis.caches?.default?.put(key, Response.json(value, {headers:{'Cache-Control':'public, max-age='+seconds}}));
  } catch { /* The upstream response is still usable when an edge cache is full. */ }
}

async function recentExperience(ocid, today, ctx) {
  const dates = Array.from({length:6}, (_,i) => new Date(Date.parse(today+'T00:00:00Z')-(6-i)*DAY_MS).toISOString().slice(0,10));
  const results = await Promise.allSettled(dates.map(async date => {
    const cacheKey = ctx.cacheOrigin+'history/'+ocid+'/'+date;
    const cached = await cacheGet(cacheKey);
    if (cached) return {date,basic:cached};
    const data = await ctx.read('character/basic',{ocid,date});
    const basic = experience(data);
    if (!('character_exp' in basic) && !('character_exp_rate' in basic)) throw fail(502);
    await cachePut(cacheKey,basic,21600);
    return {date,basic};
  }));
  return results.filter(row => row.status === 'fulfilled').map(row => row.value);
}

async function profile(ocid, name, today, ctx) {
  const basic = publicBasic(await ctx.read('character/basic',{ocid}));
  if (name && basic.character_name.toLowerCase() !== name.toLowerCase()) throw fail(404);
  const [stat, history] = await Promise.all([
    ctx.read('character/stat',{ocid}).then(combatStat).catch(() => null),
    recentExperience(ocid,today,ctx)
  ]);
  const result = {ocid,basic,history};
  const warnings = [];
  if (stat) result.stat = stat;
  else warnings.push('전투력을 불러오지 못했습니다.');
  if (history.length < 6) warnings.push('최근 7일 중 일부 경험치 기록을 불러오지 못했습니다.');
  if (warnings.length) result.profileWarning = warnings.join(' ');
  return result;
}

async function loadEquipment(ocid, ctx) {
  const [items, symbols] = await Promise.allSettled([
    ctx.read('character/item-equipment',{ocid}),
    ctx.read('character/symbol-equipment',{ocid})
  ]);
  const result = equipmentProfile(ocid,items.value,symbols.value);
  if (!result) throw items.reason || symbols.reason || fail(502);
  return result;
}

export async function publicCharacterRoute(request, url, env, headers) {
  if (request.method !== 'GET') return failure(405,headers);
  const equipment = url.pathname === '/v1/public-character/equipment';
  const entries = [...url.searchParams];
  if (entries.length !== 1) return failure(400,headers);
  const [key, raw] = entries[0];
  const value = key === 'name' ? raw.trim().normalize('NFC') : raw.toLowerCase();
  if (!(key === 'ocid' && validOcid(value)) && !(key === 'name' && !equipment && validName(value))) return failure(400,headers);

  const today = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const cacheOrigin = url.origin+'/__public-character-cache/v2/';
  const cacheKey = (field, id) => cacheOrigin+(equipment?'equipment':'profile/'+today)+'/'+field+'/'+encodeURIComponent(id);
  const lookup = cacheKey(key,value);
  try {
    const hit = await cacheGet(lookup);
    if (hit) return Response.json(hit,{headers});
    if (!env.NEXON_API_KEY?.trim() || !env.PUBLIC_CHARACTER_LIMIT) return failure(503,headers);
    const signal = AbortSignal.timeout(12000);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const ctx = {cacheOrigin, read:(path,params) => readNexon(path,params,env,ip,signal)};
    const ocid = key === 'ocid' ? value : (await ctx.read('id',{character_name:value})).ocid;
    if (!validOcid(ocid)) throw fail(502);
    const result = equipment ? await loadEquipment(ocid,ctx) : await profile(ocid,key === 'name' ? value : null,today,ctx);
    const keys = new Set([lookup,cacheKey('ocid',ocid)]);
    await Promise.all([...keys].map(key => cachePut(key,result,60)));
    return Response.json(result,{headers});
  } catch (error) {
    return failure(error.publicStatus || 502,headers);
  }
}
