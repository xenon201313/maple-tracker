const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../assets/friends-expenses.js'),'utf8');
const proof='a'.repeat(64), state='b'.repeat(64), nextState='c'.repeat(64);
const scopes=['maplestory.starforce','maplestory.potential','maplestory.soulpotential'];
const session={state,proof,account:'account-one'};
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const spin=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}throw new Error('상태 대기 시간 초과');};
function environment({initial=session,url='https://maple-trackers.com/?page=home',flow=null,fetchHook,panel=false}={}) {
  const storage=new Map(initial?[['maple:friends:session',JSON.stringify(initial)]]:[]);
  if(flow) storage.set('maple:friends:flow',JSON.stringify(flow));
  const events=[], listeners=new Map(), requests=[], navigation=[];
  const elements=new Map();
  if(panel) for(const id of ['enhancement-panel','enhancement-source','enhancement-connect','enhancement-disconnect','enhancement-from','enhancement-to','enhancement-refresh','enhancement-cancel','enhancement-auto','enhancement-status','page-expense']) elements.set(id,{value:id==='enhancement-source'?'friends':'',classList:{toggle:()=>{},contains:()=>false},textContent:''});
  const document={getElementById:id=>elements.get(id)||null,querySelector:selector=>selector.startsWith('.tab')?{click:()=>navigation.push(selector)}:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>{events.push(event);listeners.get(event.type)?.(event);return true;}};
  const context={URL,URLSearchParams,TextEncoder,AbortSignal,AbortController,Date,CustomEvent:class {constructor(type,init){this.type=type;this.detail=init.detail;}},crypto:webcrypto,
    document,setInterval:()=>0,location:{href:url,assign:value=>navigation.push(value)},history:{state:null,replaceState:(_state,_title,value)=>navigation.push(value)},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    fetch:async(url,init)=>{
      const action=String(url).split('/').at(-1), body=init.body?JSON.parse(init.body):null;
      requests.push({action,body});
      const custom=fetchHook?.(action,body,init);
      if(custom!==undefined) return custom;
      if(action==='config') return respond({ready:true});
      if(action==='status' || action==='finish') return respond({connected:true,account:'account-one',scopes});
      if(action==='start') return respond({state:nextState,url:'https://openid.nexon.com/oauth2/authorize?state='+nextState});
      return respond({ok:true});
    }};
  context.window=context;
  let ledger={events:[]}, commits=0, accountAllowed=true;
  if(panel) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/enhancement-ledger.js'),'utf8'),context);
    context.MapleAccountSync={canUseAccount:()=>accountAllowed};
    context.MapleEnhancementBridge={get:()=>ledger,key:()=>'',manual:()=>[],money:String,commit:value=>{commits++;ledger=context.MapleEnhancements.merge(ledger,value);}};
  }
  vm.runInNewContext(source,context,{filename:'friends-expenses.js'});
  listeners.get('DOMContentLoaded')();
  return {context,api:context.MapleFriends,storage,events,requests,navigation,elements,ledger:()=>ledger,commits:()=>commits,allow:value=>accountAllowed=value};
}
(async()=>{
  const env=environment();
  assert.equal(env.api.getState().connected,false,'저장된 세션은 서버 확인 전 연결된 것으로 취급하지 않음');
  await spin(()=>env.api.getState().connected);
  assert(env.requests.some(r=>r.action==='config'),'홈에서도 로그인 설정을 확인함');
  assert.equal(env.api.getState().account,'account-one');
  assert.deepEqual(Array.from(env.api.getState().scopes),scopes);
  assert(!JSON.stringify(env.events).includes(proof),'세션 이벤트는 인증 proof를 노출하지 않음');
  assert(!JSON.stringify(env.api.getState()).includes(state));
  const snapshot=env.api.getState(); snapshot.scopes.length=0;
  assert.equal(env.api.getState().scopes.length,3,'외부 객체 수정으로 실제 동의 scope가 변하지 않음');
  await env.api.request('ledger/get',{state:'attacker',proof:'attacker',account:'attacker'});
  const sent=env.requests.at(-1);
  assert.equal(sent.body.state,state);assert.equal(sent.body.proof,proof);
  const eventCount=env.events.length;await env.api.recheck();
  assert(env.events.slice(eventCount).every(event=>event.detail.sessionChanged===false),'동일 계정 재확인은 연결 전환과 구분해 진행 중 캐릭터 조회를 유지');
  await assert.rejects(env.api.request('../token'),/지원하지/);
  await env.api.connect();
  assert.equal(env.requests.filter(request=>request.action==='start').length,0,'이미 연결된 계정에 새 로그인을 시작하지 않음');
  assert.equal(env.api.getState().connected,true,'중복 로그인 호출로 기존 연결이 끊기지 않음');
  assert.equal(env.storage.has('maple:friends:flow'),false);
  const anonymous=environment({initial:null});
  await Promise.all([anonymous.api.connect(),anonymous.api.connect(),anonymous.api.connect()]);
  assert.equal(anonymous.requests.filter(request=>request.action==='start').length,1,'빠른 중복 호출도 OAuth 요청은 한 번만 전송');
  assert.equal(JSON.parse(anonymous.storage.get('maple:friends:flow')).returnPage,'home');
  assert.equal(anonymous.api.getState().finishing,true);

  let releaseCheck;
  const checking=environment({fetchHook:action=>action==='status'?new Promise(resolve=>{releaseCheck=()=>resolve(respond({connected:true,account:'account-one',scopes}));}):undefined});
  await spin(()=>typeof releaseCheck==='function');
  assert.equal(checking.api.getState().checking,true,'저장 세션 확인 중임을 구분');
  assert.equal(checking.api.getState().hasSession,true,'미검증 저장 세션도 존재 여부만 공개');
  const repeated=Promise.all([checking.api.connect(),checking.api.connect()]);
  releaseCheck();await repeated;
  assert.equal(checking.api.getState().connected,true);
  assert.equal(checking.requests.filter(request=>request.action==='start').length,0,'저장 세션 확인 중 로그인 클릭은 확인 결과를 기다림');
  assert.equal(checking.requests.filter(request=>request.action==='status').length,1,'동시에 세션 검증을 중복하지 않음');

  let unavailable=true;
  const offline=environment({fetchHook:action=>action==='status'&&unavailable?respond({error:'잠시 후 다시 확인해 주세요.'},503):undefined});
  await spin(()=>offline.requests.some(request=>request.action==='status')&&!offline.api.getState().checking);
  assert.equal(offline.api.getState().hasSession,true);
  assert.equal(offline.api.getState().connected,false,'미검증 세션을 인증된 것으로 위장하지 않음');
  assert(offline.api.getState().error,'임시 확인 실패를 별도 상태로 안내');
  await assert.rejects(offline.api.connect(),/연결 상태/);
  assert.equal(offline.requests.filter(request=>request.action==='start').length,0,'서버 확인 실패가 기존 세션의 새 로그인으로 이어지지 않음');
  assert.equal(JSON.parse(offline.storage.get('maple:friends:session')).proof,proof,'임시 오류로 저장된 세션을 지우지 않음');
  unavailable=false;await offline.api.recheck();
  assert.equal(offline.api.getState().connected,true,'다시 확인으로 기존 세션을 복구');
  assert.equal(offline.api.getState().error,'');
  const verifiedCheck=offline.api.recheck();
  await verifiedCheck;
  unavailable=true;
  await offline.api.recheck();
  assert.equal(offline.api.getState().connected,true,'이미 검증된 세션은 일시적인 재확인 실패로 로그아웃하지 않음');
  let recoverVisible=false;
  const visible=environment({fetchHook:action=>action==='status'&&!recoverVisible?respond({error:'일시 중단'},503):undefined});
  await spin(()=>visible.requests.some(request=>request.action==='status')&&!visible.api.getState().checking);
  recoverVisible=true;visible.context.document.dispatchEvent(new visible.context.CustomEvent('visibilitychange',{}));
  await spin(()=>visible.api.getState().connected);
  assert.equal(visible.requests.filter(request=>request.action==='start').length,0,'다시 보이는 탭은 저장 세션을 재확인하여 복구');
  const configUnauthorized=environment({initial:null,fetchHook:action=>action==='config'?respond({error:'설정 조회 불가'},401):undefined});
  await spin(()=>configUnauthorized.requests.some(request=>request.action==='config')&&!configUnauthorized.api.getState().checking);
  assert.equal(configUnauthorized.api.getState().hasSession,false);
  assert(!configUnauthorized.api.getState().error.includes('만료'),'인증하지 않은 설정 요청의 401은 세션 만료로 오인하지 않음');

  const conflict=environment({fetchHook:action=>action==='put'?respond({error:'최신 장부를 다시 확인하세요.',errorCode:'LEDGER_CONFLICT'},409):undefined});
  await spin(()=>conflict.api.getState().connected);
  await assert.rejects(conflict.api.request('ledger/put'),error=>error.status===409 && error.httpStatus===409 && error.errorCode==='LEDGER_CONFLICT');
  assert(conflict.api.getState().connected,'장부 충돌은 로그인을 해제하지 않음');

  const expired=environment({fetchHook:action=>action==='history'?respond({error:'세션 만료',errorCode:'SESSION_EXPIRED'},401):undefined});
  await spin(()=>expired.api.getState().connected);
  await assert.rejects(expired.api.request('history'),error=>error.status===401);
  assert.equal(expired.api.getState().connected,false);
  assert.equal(expired.storage.has('maple:friends:session'),false);
  assert.equal(expired.events.at(-1).detail.account,null);

  let complete;
  const pending=environment({fetchHook:action=>action==='history'?new Promise(resolve=>{complete=resolve;}):undefined});
  await spin(()=>pending.api.getState().connected);
  const result=pending.api.request('history');
  await spin(()=>typeof complete==='function');
  await pending.api.disconnect();
  complete(respond({rows:['old-account']}));
  await assert.rejects(result,error=>error.errorCode==='SESSION_CHANGED','로그아웃 후 완료된 이전 계정 결과를 사용하지 않음');
  assert.equal(pending.api.getState().connected,false);

  const callback=environment({initial:null,url:'https://maple-trackers.com/?page=home&state='+state+'&code=temporary-code',flow:{state,proof,createdAt:Date.now(),returnPage:'home'}});
  await spin(()=>callback.api.getState().connected);
  assert(callback.navigation.some(value=>value==='.tab[data-page="home"]'),'홈에서 시작한 로그인은 홈으로 돌아옴');
  assert(!callback.navigation[0].includes('temporary-code'),'OAuth 인증 코드는 즉시 주소에서 제거');
  assert.equal(callback.storage.has('maple:friends:flow'),false);
  assert(!JSON.stringify(callback.events).includes(proof));
  let finishReply;
  const cancelledCallback=environment({initial:null,url:'https://maple-trackers.com/?page=home&state='+state+'&code=temporary-code',flow:{state,proof,createdAt:Date.now(),returnPage:'home'},fetchHook:action=>action==='finish'?new Promise(resolve=>{finishReply=()=>resolve(respond({connected:true,account:'account-one',scopes}));}):undefined});
  await spin(()=>typeof finishReply==='function');await cancelledCallback.api.disconnect();finishReply();
  await spin(()=>cancelledCallback.api.getState().ready&&!cancelledCallback.api.getState().checking);
  assert.equal(cancelledCallback.api.getState().connected,false,'로그아웃 뒤 늦게 완료된 로그인 콜백을 사용하지 않음');
  assert.equal(cancelledCallback.storage.has('maple:friends:session'),false);
  const historyReply=(kind,date)=>respond({[kind.replace(/-/g,'_')+'_history']:[{id:kind+'-sample',character_name:'계정 테스트',target_item:'제네시스 스태프',date_create:date+'T12:00:00+09:00',before_starforce_count:0,after_starforce_count:1,before_potential_option:[{grade:'레어'}],after_potential_option:[{grade:'에픽'}]}],next_cursor:''});
  const partial=environment({panel:true,fetchHook:(action,body)=>action==='history'?(body.kind==='soul-potential'?respond({error:'소울 제공 동의가 필요합니다.',errorCode:'USER_SCOPE'},403):historyReply(body.kind,body.date)):undefined});
  await spin(()=>partial.api.getState().connected);
  partial.elements.get('enhancement-from').value=partial.elements.get('enhancement-to').value;
  await partial.elements.get('enhancement-refresh').onclick();
  assert.equal(partial.ledger().events.length,3,'신규 소울 권한 실패가 기존 3종류의 정상 이력을 버리지 않음');
  assert.match(partial.elements.get('enhancement-status').textContent,/미조회.*소울 잠재능력/,'조회하지 못한 종류를 명시함');
  partial.allow(false);
  await partial.elements.get('enhancement-refresh').onclick();
  assert.equal(partial.commits(),1,'장부 선택 전에는 이력을 가져오지 않음');

  let release;
  const switching=environment({panel:true,fetchHook:(action,body)=>action==='history' && body.kind==='starforce'?new Promise(resolve=>{release=()=>resolve(historyReply(body.kind,body.date));}):action==='history'?historyReply(body.kind,body.date):undefined});
  await spin(()=>switching.api.getState().connected);
  const fetching=switching.elements.get('enhancement-refresh').onclick();
  await spin(()=>typeof release==='function');
  switching.context.document.dispatchEvent(new switching.context.CustomEvent('maple:account-ledger-changing',{}));
  release();await fetching;
  assert.equal(switching.commits(),0,'장부 선택 변경 도중 완료된 이력은 저장하지 않음');
  console.log('넥슨 세션 계약·중복 로그인 차단·검증 대기·일시 오류 복구·탭 복귀·홈 복귀·인증 정보 비노출·409/401·로그아웃 경합 검사 통과');
})().catch(error=>{console.error(error);process.exitCode=1;});
