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
  await assert.rejects(env.api.request('../token'),/지원하지/);
  await env.api.connect();
  assert.equal(JSON.parse(env.storage.get('maple:friends:flow')).returnPage,'home');
  assert.equal(env.api.getState().finishing,true);
  assert.equal(env.api.getState().connected,false,'로그인 계정 전환 중 자동 장부 요청을 멈춤');

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
  console.log('넥슨 공개 세션 계약·홈 복귀·인증 정보 비노출·409/401·로그아웃 경합 검사 통과');
})().catch(error=>{console.error(error);process.exitCode=1;});
