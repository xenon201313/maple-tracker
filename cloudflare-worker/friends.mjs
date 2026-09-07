const CLIENT_ID = '94027613-24a9-4bab-9c74-c5d4ae55bf5e';
const APP_ORIGIN = 'https://maple-trackers.com';
const REDIRECT_URI = APP_ORIGIN + '/?page=home';
const SCOPES = ['maplestory.starforce', 'maplestory.potential'];
// Nexon rejects subsets of the application's registered authorization scopes.
const AUTH_SCOPES = ['maplestory.characterlist', 'maplestory.starforce', 'maplestory.potential', 'maplestory.scheduler', 'maplestory.cube'];
const TOKEN_URL = 'https://openid.nexon.com/oauth2/token';
const SESSION_TTL = 14 * 24 * 3600 * 1000;
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const validSecret = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

async function upstream(url, init={}) {
  const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(12000)});
  let data;
  try { data=await response.json(); } catch { throw new Error('UPSTREAM'); }
  if (!response.ok || data?.error) {
    const error=new Error('UPSTREAM');
    error.status=response.status;
    error.code=data?.error?.name;
    throw error;
  }
  return data;
}
function tokenState(data, previous) {
  if (!data || typeof data.access_token!=='string' || typeof data.refresh_token!=='string' || !(data.expires_in>0) || !(data.refresh_token_expires_in>0)) throw new Error('UPSTREAM');
  return {...previous,access:data.access_token,refresh:data.refresh_token,
    accessUntil:Date.now()+Math.min(Number(data.expires_in)*1000,SESSION_TTL),
    expires:Date.now()+Math.min(Number(data.refresh_token_expires_in)*1000,SESSION_TTL)};
}

// OAuth credentials and Nexon tokens live only in this server-side session store.
// Durable Object serialization makes state consumption and token rotation single-use.
export class FriendsSession {
  constructor(state, env) { this.state=state; this.env=env; }
  async alarm() { await this.state.storage.deleteAll(); }
  async fetch(request) {
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
          const data=await upstream(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:CLIENT_ID,client_secret:this.env.NEXON_CLIENT_SECRET,code:input.code})});
          const info=await upstream('https://openid.nexon.com/oauth2/userinfo',{headers:{Authorization:'Bearer '+data.access_token}});
          if (typeof info?.result?.uid!=='string' || !info.result.uid || !SCOPES.every(scope=>info.result.scope?.includes(scope))) return json({error:'스타포스와 잠재능력 데이터 제공 동의가 필요합니다.'},403);
          session=tokenState(data,{challenge:session.challenge,pending:false,account:await hash(CLIENT_ID+':'+info.result.uid),requests:0,window:Date.now()});
          await store.put('session',session); await store.setAlarm(session.expires);
          return json({connected:true,account:session.account});
        }
        if (session.pending) return json({error:'로그인을 완료해 주세요.'},401);
        if (action==='logout') { await store.deleteAll(); return json({ok:true}); }
        if (action==='status') return json({connected:true,account:session.account});
        if (action!=='history') return json({error:'Not found'},404);
        if (Date.now()-session.window>60000) { session.window=Date.now(); session.requests=0; }
        if (session.requests>=90) return json({error:'잠시 후 다시 조회해 주세요.'},429);
        session.requests++;
        await store.put('session',session);
        if (session.accessUntil<=Date.now()+60000) {
          try {
            const data=await upstream(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:CLIENT_ID,client_secret:this.env.NEXON_CLIENT_SECRET,refresh_token:session.refresh})});
            session=tokenState(data,session);
            await store.put('session',session); await store.setAlarm(session.expires);
          } catch (error) {
            if ([400,401,403].includes(error.status)) { await store.deleteAll(); return json({error:'연결이 만료되었습니다. 다시 로그인해 주세요.'},401); }
            throw error;
          }
        }
        const url=new URL('https://open.api.nexon.com/maplestory/v1/history/'+input.kind);
        url.searchParams.set('count','1000');
        if (input.cursor) url.searchParams.set('cursor',input.cursor);
        else url.searchParams.set('date',input.date);
        const history=await upstream(url,{headers:{Authorization:'Bearer '+session.access}});
        // Whitelist the history envelope. Never forward auth responses or upstream errors.
        const field=input.kind+'_history';
        if (!Array.isArray(history[field])) throw new Error('UPSTREAM');
        return json({[field]:history[field],next_cursor:history.next_cursor || '',count:history.count});
      } catch (error) {
        return json({error:error.status===429?'넥슨 API 호출 한도를 초과했습니다. 잠시 후 다시 조회해 주세요.':'넥슨 연결에 실패했습니다. 기존 기록은 변경되지 않았습니다.'},error.status===429?429:502);
      }
    });
  }
}

export async function friendsRoute(request,env) {
  const url=new URL(request.url);
  const path=url.pathname.replace('/v1/friends/','');
  if (request.headers.get('Origin')!==APP_ORIGIN) return json({error:'Origin not allowed'},403);
  const ready=!!env.NEXON_CLIENT_SECRET && !!env.FRIENDS_SESSIONS;
  if (path==='config' && request.method==='GET') return json({ready,clientId:CLIENT_ID,scopes:AUTH_SCOPES});
  if (!ready) return json({error:'프렌즈 서버 설정이 아직 완료되지 않았습니다.'},503);
  if (request.method!=='POST' || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Method not allowed'},405);
  const text=await request.text();
  if (text.length>12000) return json({error:'Request too large'},413);
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
  if (!['finish','status','history','logout'].includes(path)) return json({error:'Not found'},404);
  if (!validSecret(body.state) || !validSecret(body.proof)) return json({error:'로그인이 필요합니다.'},401);
  if (path==='history') {
    if (!['starforce','potential','cube'].includes(body.kind)) return json({error:'Invalid history kind'},400);
    const date=body.date, cursor=body.cursor;
    const parsed=typeof date==='string'?new Date(date+'T00:00:00Z'):new Date(NaN);
    if (cursor ? typeof cursor!=='string' || cursor.length>4096 : typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) return json({error:'Invalid query'},400);
  }
  const stub=env.FRIENDS_SESSIONS.get(env.FRIENDS_SESSIONS.idFromName(body.state));
  return stub.fetch(new Request('https://session/'+path,{method:'POST',body:JSON.stringify({action:path,proof:body.proof,code:body.code,kind:body.kind,date:body.date,cursor:body.cursor})}));
}
