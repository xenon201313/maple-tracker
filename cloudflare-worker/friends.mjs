import { boundedRequestText, LEDGER_REQUEST_LIMIT, validLedgerPayload } from './friends-ledger.mjs';

const CLIENT_ID = '94027613-24a9-4bab-9c74-c5d4ae55bf5e';
const APP_ORIGIN = 'https://maple-trackers.com';
const REDIRECT_URI = APP_ORIGIN + '/?page=home';
const SCOPES = ['maplestory.starforce', 'maplestory.potential'];
// Nexon rejects subsets of the application's registered authorization scopes.
const AUTH_SCOPES = ['maplestory.characterlist', 'maplestory.starforce', 'maplestory.potential', 'maplestory.scheduler', 'maplestory.cube', 'maplestory.soulpotential'];
const LEDGER_ACTIONS = ['ledger-key', 'ledger-read', 'ledger-save', 'ledger-history'];
const GAME_ACTIONS = ['history', 'character-list', 'character-profile', 'scheduler'];
const TOKEN_URL = 'https://openid.nexon.com/oauth2/token';
const SESSION_TTL = 14 * 24 * 3600 * 1000;
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const validSecret = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const validDate = date => typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+'T00:00:00Z')) && new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
const pick = (value,fields) => Object.fromEntries(fields.filter(key=>Object.hasOwn(value || {},key)).map(key=>[key,value[key]]));
const PROFILE_CACHE_TTL = 60000;
const BASIC_FIELDS = ['date','character_name','world_name','character_gender','character_class','character_class_level','character_level','character_exp','character_exp_rate','character_guild_name','character_image','character_date_create','access_flag','liberation_quest_clear'];
const validOcid = value => typeof value==='string' && /^[a-f0-9]{16,128}$/i.test(value);
const validCharacterName = value => typeof value==='string' && value.trim().length>0 && value.length<=64 && !/[\u0000-\u001f\u007f]/.test(value);
function profileDates(value) {
  if (value===undefined) return [];
  if (!Array.isArray(value) || value.length>6) return null;
  const today=Date.parse(new Date(Date.now()+9*3600000).toISOString().slice(0,10)+'T00:00:00Z');
  if (!value.every(date=>validDate(date) && today-Date.parse(date+'T00:00:00Z')>=86400000 && today-Date.parse(date+'T00:00:00Z')<=6*86400000)) return null;
  return [...new Set(value)].sort();
}
function validProfileQuery(input) {
  return (validOcid(input.ocid) || validCharacterName(input.characterName)) &&
    (input.ocid===undefined || input.ocid==='' || validOcid(input.ocid)) &&
    (input.characterName===undefined || validCharacterName(input.characterName)) && profileDates(input.dates)!==null;
}
function characterList(data) {
  if (!Array.isArray(data?.account_list)) throw new Error('UPSTREAM');
  return {account_list:data.account_list.map(account=>({account_id:account.account_id,character_list:(Array.isArray(account.character_list)?account.character_list:[]).map(character=>pick(character,['ocid','character_name','world_name','character_class','character_level']))}))};
}
function profileBasic(data) {
  // 빈 월드·이름 응답은 정상 프로필로 저장하지 않는다. 기존 프로필을 지키기 위함이다.
  if (!validCharacterName(data?.character_name) || typeof data?.world_name!=='string' || !data.world_name.trim()) throw Object.assign(new Error('UPSTREAM'),{stage:'PROFILE'});
  return pick(data,BASIC_FIELDS);
}

async function upstream(url, init={}, stage='HISTORY') {
  let response;
  const timeout=AbortSignal.timeout(12000);
  try { response=await fetch(url,{...init,redirect:'manual',signal:init.signal?AbortSignal.any([init.signal,timeout]):timeout}); }
  catch { throw Object.assign(new Error('UPSTREAM'),{stage}); }
  // Workers does not support redirect:error. Reject redirects without forwarding credentials.
  if(response.status>=300 && response.status<400) throw Object.assign(new Error('UPSTREAM'),{stage,status:response.status});
  let data;
  try { data=await response.json(); } catch { throw Object.assign(new Error('UPSTREAM'),{stage,status:response.status}); }
  if (!response.ok || data?.error) {
    const error=new Error('UPSTREAM');
    error.status=response.status;
    error.code=data?.error?.name;
    error.stage=stage;
    throw error;
  }
  return data;
}
function tokenState(data, previous) {
  if (!data || typeof data.access_token!=='string' || typeof data.refresh_token!=='string' || !(data.expires_in>0) || !(data.refresh_token_expires_in>0)) throw Object.assign(new Error('UPSTREAM'),{stage:'TOKEN_RESPONSE'});
  return {...previous,access:data.access_token,refresh:data.refresh_token,
    accessUntil:Date.now()+Math.min(Number(data.expires_in)*1000,SESSION_TTL),
    expires:Date.now()+Math.min(Number(data.refresh_token_expires_in)*1000,SESSION_TTL)};
}

// OAuth credentials and Nexon tokens live only in this server-side session store.
// Durable Object serialization makes state consumption and token rotation single-use.
export class FriendsSession {
  constructor(state, env) { this.state=state; this.env=env; this.characterCache=null; this.profileCache=new Map(); }
  async ownedCharacters(session, fresh=false, signal) {
    if (!fresh && this.characterCache?.account===session.account && this.characterCache.until>Date.now()) return this.characterCache.data;
    const data=characterList(await upstream('https://open.api.nexon.com/maplestory/v1/character/list',{headers:{Authorization:'Bearer '+session.access},signal},'CHARACTER_LIST'));
    this.characterCache={account:session.account,until:Date.now()+PROFILE_CACHE_TTL,data};
    return data;
  }
  async characterProfile(session,input,deadline=Date.now()+24000) {
    if (!validProfileQuery(input)) return json({error:'Invalid character profile query'},400);
    if (typeof this.env.NEXON_API_KEY!=='string' || !this.env.NEXON_API_KEY.trim()) return json({error:'캐릭터 상세 조회를 위한 서비스 설정이 준비되지 않았습니다. 개인 API 키를 추가할 필요는 없습니다.',errorCode:'PROFILE_UNAVAILABLE'},503);
    // 브라우저의 30초 제한 전에 최신 프로필과 성공한 항목을 반환한다.
    const remainingSignal=()=>{
      const remaining=deadline-Date.now();
      if (remaining<=0) throw Object.assign(new Error('UPSTREAM'),{stage:'PROFILE'});
      return AbortSignal.timeout(remaining);
    };
    const dates=profileDates(input.dates);
    const hadListCache=this.characterCache?.account===session.account && this.characterCache.until>Date.now();
    let data=await this.ownedCharacters(session,false,remainingSignal()), rows=data.account_list.flatMap(account=>account.character_list);
    const choose=()=>{
      // 같은 OCID가 있으면 닉네임 변경을 추적하고, 없을 때만 이름으로 월드 리프 후 OCID를 찾는다.
      const sameId=validOcid(input.ocid)?rows.find(row=>row.ocid===input.ocid):null;
      if (sameId) return sameId;
      const sameName=validCharacterName(input.characterName)?rows.filter(row=>row.character_name===input.characterName.trim() && validOcid(row.ocid)):[];
      return sameName.length===1?sameName[0]:null;
    };
    let character=choose();
    if (!character && hadListCache) {
      data=await this.ownedCharacters(session,true,remainingSignal()); rows=data.account_list.flatMap(account=>account.character_list); character=choose();
    }
    if (!character || !validOcid(character.ocid)) return json({error:'로그인한 넥슨 계정의 캐릭터만 조회할 수 있습니다.',errorCode:'CHARACTER_NOT_OWNED'},403);
    const key=character.ocid+':'+dates.join(',');
    const cached=this.profileCache.get(key);
    if (cached?.account===session.account && cached.until>Date.now()) return json(cached.data);
    const read=async(kind,date)=>{
      const url=new URL('https://open.api.nexon.com/maplestory/v1/character/'+kind);
      url.searchParams.set('ocid',character.ocid);
      if (date) url.searchParams.set('date',date);
      return upstream(url,{headers:{'x-nxopen-api-key':this.env.NEXON_API_KEY},signal:remainingSignal()},'PROFILE');
    };
    // 최신 기본 정보가 성공해야만 부분 결과를 보낸다. 과거 정보로 최신 프로필을 대체하지 않는다.
    const basic=profileBasic(await read('basic'));
    const result={ocid:character.ocid,basic,history:[]};
    const warnings=[];
    try {
      const stat=await read('stat');
      if (!Array.isArray(stat?.final_stat)) throw new Error('UPSTREAM');
      const power=stat.final_stat.find(item=>{
        const name=String(item?.stat_name || '').replace(/\s/g,'');
        return (name.includes('전투력') && !name.includes('사냥')) || /combatpower/i.test(name);
      })?.stat_value;
      if (power===null || power===undefined || String(power).trim()==='' || !Number.isFinite(Number(power)) || Number(power)<0) throw new Error('UPSTREAM');
      result.stat={...pick(stat,['date','character_class']),final_stat:stat.final_stat.map(item=>pick(item,['stat_name','stat_value']))};
    } catch { warnings.push('전투력 정보를 불러오지 못해 기존 값을 유지합니다.'); }
    for (const date of dates) {
      try { result.history.push({date,basic:profileBasic(await read('basic',date))}); }
      catch { warnings.push(date+' 경험치 기록은 다음 갱신 때 다시 확인합니다.'); }
    }
    if (warnings.length) result.profileWarning=warnings.join(' ');
    for (const [cacheKey,entry] of this.profileCache) if (entry.until<=Date.now()) this.profileCache.delete(cacheKey);
    if (this.profileCache.size>=30) this.profileCache.delete(this.profileCache.keys().next().value);
    this.profileCache.set(key,{account:session.account,until:Date.now()+PROFILE_CACHE_TTL,data:result});
    return json(result);
  }
  async alarm() { await this.state.storage.deleteAll(); }
  async fetch(request) {
    const requestStarted=Date.now();
    return this.state.blockConcurrencyWhile(async()=>{
      try {
        const {action,...input}=await request.json();
        const store=this.state.storage;
        if(action==='limit') {
          let rate=await store.get('rate');
          if(!rate || rate.until<=Date.now()) rate={count:0,until:Date.now()+60000};
          if(rate.count>=10) return json({error:'로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.'},429);
          rate.count++; await store.put('rate',rate); await store.setAlarm(rate.until);
          return json({ok:true});
        }
        let session=await store.get('session');
        if (action==='start') {
          if (session || !validSecret(input.challenge)) return json({error:'Invalid state'},400);
          session={challenge:input.challenge,expires:Date.now()+600000,pending:true};
          await store.put('session',session); await store.setAlarm(session.expires);
          return json({ok:true});
        }
        if (!session || session.expires<=Date.now() || !validSecret(input.proof) || await hash(input.proof)!==session.challenge) return json({error:'연결이 만료되었습니다. 다시 로그인해 주세요.'},401);
        if (action==='finish') {
          if (!session.pending || typeof input.code!=='string' || !input.code || input.code.length>4096) return json({error:'Invalid state'},400);
          // Consume first, including on upstream failure. A retry needs a fresh login.
          await store.delete('session');
          const data=await upstream(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:CLIENT_ID,client_secret:this.env.NEXON_CLIENT_SECRET,code:input.code})},'TOKEN_EXCHANGE');
          const tokens=tokenState(data);
          const info=await upstream('https://openid.nexon.com/oauth2/userinfo',{headers:{Authorization:'Bearer '+tokens.access}},'USER_INFO');
          if (typeof info?.result?.uid!=='string' || !info.result.uid) throw Object.assign(new Error('UPSTREAM'),{stage:'USER_RESPONSE'});
          if (!Array.isArray(info.result.scope) || !SCOPES.every(scope=>info.result.scope.includes(scope))) return json({error:'스타포스와 잠재능력 데이터 제공 동의가 필요합니다.',errorCode:'USER_SCOPE'},403);
          session=tokenState(data,{challenge:session.challenge,pending:false,account:await hash(CLIENT_ID+':'+info.result.uid),scopes:AUTH_SCOPES.filter(scope=>info.result.scope.includes(scope)),requests:0,window:Date.now()});
          await store.put('session',session); await store.setAlarm(session.expires);
          return json({connected:true,account:session.account,scopes:session.scopes});
        }
        if (session.pending) return json({error:'로그인을 완료해 주세요.'},401);
        if (action==='logout') { this.characterCache=null; this.profileCache.clear(); await store.deleteAll(); return json({ok:true}); }
        if (action==='status') return json({connected:true,account:session.account,scopes:session.scopes || SCOPES});
        if (!GAME_ACTIONS.includes(action) && !LEDGER_ACTIONS.includes(action)) return json({error:'Not found'},404);
        if (Date.now()-session.window>60000) { session.window=Date.now(); session.requests=0; }
        if (session.requests>=90) return json({error:'잠시 후 다시 조회해 주세요.'},429);
        session.requests++;
        await store.put('session',session);
        if (LEDGER_ACTIONS.includes(action)) {
          if (!this.env.FRIENDS_LEDGERS) return json({error:'계정 장부 서버를 준비 중입니다. 현재 기록은 기기에 보관됩니다.',errorCode:'LEDGER_UNAVAILABLE'},503);
          // 클라이언트가 보낸 account는 사용하지 않는다. 세션에서 검증한 계정만 선택한다.
          const ledger=this.env.FRIENDS_LEDGERS.get(this.env.FRIENDS_LEDGERS.idFromName('account:'+session.account));
          return await ledger.fetch(new Request('https://ledger/'+action,{method:'POST',body:JSON.stringify({action,account:session.account,revision:input.revision,payload:input.payload,beforeRevision:input.beforeRevision})}));
        }
        const additionalScope=['character-list','character-profile'].includes(action)?'maplestory.characterlist':action==='scheduler'?'maplestory.scheduler':input.kind==='soul-potential'?'maplestory.soulpotential':null;
        if (additionalScope && !session.scopes?.includes(additionalScope)) return json({error:'추가 게임 데이터 동의를 갱신하려면 넥슨 계정을 다시 연결해 주세요.',errorCode:'USER_SCOPE'},403);
        if (session.accessUntil<=Date.now()+60000) {
          try {
            const data=await upstream(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:CLIENT_ID,client_secret:this.env.NEXON_CLIENT_SECRET,refresh_token:session.refresh})},'TOKEN_REFRESH');
            session=tokenState(data,session);
            await store.put('session',session); await store.setAlarm(session.expires);
          } catch (error) {
            if ([400,401,403].includes(error.status)) { await store.deleteAll(); return json({error:'연결이 만료되었습니다. 다시 로그인해 주세요.'},401); }
            throw error;
          }
        }
        if (action==='character-list') {
          return json(await this.ownedCharacters(session));
        }
        if (action==='character-profile') return await this.characterProfile(session,input,requestStarted+24000);
        if (action==='scheduler') {
          const url=new URL('https://open.api.nexon.com/maplestory/v1/scheduler/character-state');
          url.searchParams.set('ocid',input.ocid);
          if (input.date) url.searchParams.set('date',input.date);
          const data=await upstream(url,{headers:{Authorization:'Bearer '+session.access}});
          if (!Array.isArray(data.boss_contents) || !Array.isArray(data.daily_contents) || !Array.isArray(data.weekly_contents)) throw new Error('UPSTREAM');
          const result=pick(data,['date','character_name','world_name','character_level','character_class','weekly_boss_clear_count','weekly_boss_clear_limit_count']);
          for (const field of ['daily_contents','weekly_contents','boss_contents']) result[field]=data[field].map(item=>pick(item,['content_name','difficulty','cycle','list_order_no','registration_flag','complete_flag']));
          return json(result);
        }
        const url=new URL('https://open.api.nexon.com/maplestory/v1/history/'+input.kind);
        url.searchParams.set('count','1000');
        if (input.cursor) url.searchParams.set('cursor',input.cursor);
        else url.searchParams.set('date',input.date);
        const history=await upstream(url,{headers:{Authorization:'Bearer '+session.access}});
        // Whitelist the history envelope. Never forward auth responses or upstream errors.
        const field=input.kind==='soul-potential'?'soul_potential_history':input.kind+'_history';
        if (!Array.isArray(history[field])) throw new Error('UPSTREAM');
        return json({[field]:history[field],next_cursor:history.next_cursor || '',count:history.count});
      } catch (error) {
        // Only fixed stage names and official error identifiers can reach the browser.
        const stage=['TOKEN_EXCHANGE','TOKEN_RESPONSE','TOKEN_REFRESH','USER_INFO','USER_RESPONSE','HISTORY','CHARACTER_LIST','PROFILE'].includes(error.stage)?error.stage:'SESSION';
        const code=/^OPENAPI\d{5}$/.test(error.code||'')?error.code:Number.isInteger(error.status)?String(error.status):'UNAVAILABLE';
        return json({error:error.status===429?'넥슨 API 호출 한도를 초과했습니다. 잠시 후 다시 조회해 주세요.':'넥슨 연결에 실패했습니다. 기존 기록은 변경되지 않았습니다.',errorCode:stage+' / '+code},error.status===429?429:502);
      }
    });
  }
}

export async function friendsRoute(request,env) {
  const url=new URL(request.url);
  const path=url.pathname.replace('/v1/friends/','');
  if (request.headers.get('Origin')!==APP_ORIGIN) return json({error:'Origin not allowed'},403);
  const ready=!!env.NEXON_CLIENT_SECRET && !!env.FRIENDS_SESSIONS;
  if (path==='config' && request.method==='GET') return json({ready,ledgerReady:ready && !!env.FRIENDS_LEDGERS,characterProfileReady:ready && typeof env.NEXON_API_KEY==='string' && !!env.NEXON_API_KEY.trim(),clientId:CLIENT_ID,scopes:AUTH_SCOPES});
  if (!ready) return json({error:'프렌즈 서버 설정이 아직 완료되지 않았습니다.'},503);
  if (request.method!=='POST' || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Method not allowed'},405);
  let text;
  try { text=await boundedRequestText(request,path==='ledger-save'?LEDGER_REQUEST_LIMIT:12000); }
  catch { return json({error:'Invalid JSON'},400); }
  if (text===null) return json({error:'Request too large'},413);
  let body;
  try { body=JSON.parse(text); } catch { return json({error:'Invalid JSON'},400); }
  if (!body || typeof body!=='object' || Array.isArray(body)) return json({error:'Invalid JSON'},400);
  if (path==='start') {
    if (!validSecret(body.challenge)) return json({error:'Invalid challenge'},400);
    const limiter=env.FRIENDS_SESSIONS.get(env.FRIENDS_SESSIONS.idFromName('limit:'+await hash(request.headers.get('CF-Connecting-IP')||'unknown')));
    const allowed=await limiter.fetch(new Request('https://session/limit',{method:'POST',body:JSON.stringify({action:'limit'})}));
    if(!allowed.ok) return allowed;
    const state=random();
    const stub=env.FRIENDS_SESSIONS.get(env.FRIENDS_SESSIONS.idFromName(state));
    const saved=await stub.fetch(new Request('https://session/start',{method:'POST',body:JSON.stringify({action:'start',challenge:body.challenge})}));
    if (!saved.ok) return saved;
    const authorize=new URL('https://openid.nexon.com/oauth2/authorize');
    Object.entries({response_type:'code',client_id:CLIENT_ID,redirect_uri:REDIRECT_URI,scope:AUTH_SCOPES.join(','),state}).forEach(([k,v])=>authorize.searchParams.set(k,v));
    return json({state,url:authorize.href});
  }
  if (!['finish','status','logout',...GAME_ACTIONS,...LEDGER_ACTIONS].includes(path)) return json({error:'Not found'},404);
  if (!validSecret(body.state) || !validSecret(body.proof)) return json({error:'로그인이 필요합니다.'},401);
  if (path==='ledger-save' && (!Number.isSafeInteger(body.revision) || body.revision<0 || !validLedgerPayload(body.payload))) return json({error:'암호화된 장부 형식이 올바르지 않습니다.'},400);
  if (path==='ledger-history' && body.beforeRevision!==undefined && (!Number.isSafeInteger(body.beforeRevision) || body.beforeRevision<1)) return json({error:'Invalid history cursor'},400);
  if (path==='scheduler' && (typeof body.ocid!=='string' || !/^[a-f0-9]{16,128}$/i.test(body.ocid) || (body.date!==undefined && !validDate(body.date)))) return json({error:'Invalid scheduler query'},400);
  if (path==='character-profile' && !validProfileQuery(body)) return json({error:'Invalid character profile query'},400);
  if (path==='history') {
    if (!['starforce','potential','cube','soul-potential'].includes(body.kind)) return json({error:'Invalid history kind'},400);
    const date=body.date, cursor=body.cursor;
    const parsed=typeof date==='string'?new Date(date+'T00:00:00Z'):new Date(NaN);
    if (cursor ? typeof cursor!=='string' || cursor.length>4096 : typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) return json({error:'Invalid query'},400);
  }
  const stub=env.FRIENDS_SESSIONS.get(env.FRIENDS_SESSIONS.idFromName(body.state));
  return stub.fetch(new Request('https://session/'+path,{method:'POST',body:JSON.stringify({action:path,proof:body.proof,code:body.code,kind:body.kind,date:body.date,cursor:body.cursor,ocid:body.ocid,characterName:body.characterName,dates:body.dates,revision:body.revision,payload:body.payload,beforeRevision:body.beforeRevision})}));
}
