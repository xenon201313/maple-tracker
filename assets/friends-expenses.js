(function () {
  'use strict';
  const endpoint='https://maple-tracker-sync.xenon201313.workers.dev/v1/friends/';
  const flowKey='maple:friends:flow', sessionKey='maple:friends:session';
  const E=window.MapleEnhancements;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const digest=async text=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
  const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const offset=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const read=key=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
  const bridge=()=>window.MapleEnhancementBridge;
  let session=read(sessionKey), ready=false, verified=false, configured=false, page=0, running=null, lastAuto=0, tab='starforce';
  let scopes=[], generation=0;
  let renderedState=null, renderedManual=null, renderedTab='', renderedPage=-1;
  const callback=new URL(location.href);
  // Normalize the separator before decoding so escaped +, %, and & in codes stay intact.
  callback.search=callback.search.replace(/([?&]page=home)\?(?=(?:code|state|error|error_description)=)/,'$1&');
  const authParams=['code','state','error','error_description'];
  let invalidCallback=false;
  // Some redirects append ?code= to the existing ?page=home query.
  const callbackPage=callback.searchParams.get('page')||'', separator=callbackPage.indexOf('?');
  if(separator>=0) {
    const nested=new URLSearchParams(callbackPage.slice(separator+1));
    if(authParams.some(k=>nested.has(k))) {
      invalidCallback=callbackPage.slice(0,separator)!=='home';
      callback.searchParams.set('page','home');
      authParams.forEach(k=>{
        const values=[...callback.searchParams.getAll(k),...nested.getAll(k)];
        if(new Set(values).size>1) invalidCallback=true;
        if(!callback.searchParams.has(k) && nested.has(k)) callback.searchParams.set(k,nested.get(k));
      });
    }
  }
  authParams.forEach(k=>{if(new Set(callback.searchParams.getAll(k)).size>1) invalidCallback=true;});
  const callbackState=callback.searchParams.get('state');
  const callbackCode=callback.searchParams.get('code');
  const callbackError=invalidCallback?'invalid_callback':callback.searchParams.get('error');
  let finishing=!!(callbackCode || callbackError);
  // Strip OAuth parameters before ads, analytics, or other application scripts execute.
  if(callbackCode || callbackError || callbackState) {
    authParams.forEach(k=>callback.searchParams.delete(k));
    history.replaceState(history.state,'',callback.pathname+callback.search+callback.hash);
  }
  function status(text,error=false) {
    if (!$('enhancement-status')) return;
    $('enhancement-status').textContent=text;
    $('enhancement-status').classList.toggle('err',error);
  }
  const getState=()=>({connected:!!(session && verified && !finishing),account:verified?session?.account||null:null,ready,finishing,scopes:[...scopes]});
  const announce=()=>document.dispatchEvent(new CustomEvent('maple:friends-session',{detail:getState()}));
  const sameSession=snapshot=>!!(snapshot && session && snapshot.state===session.state && snapshot.proof===session.proof && snapshot.account===session.account);
  function clearSession() {
    running?.abort(); generation++; session=null; verified=false; scopes=[];
    try {sessionStorage.removeItem(sessionKey);} catch {}
    announce(); controls();
  }
  async function call(path,body,signal) {
    const timeout=AbortSignal.timeout(30000);
    const response=await fetch(endpoint+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'omit',redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});
    let data;
    try {data=await response.json();} catch {throw Object.assign(new Error('프렌즈 서버 응답을 확인할 수 없습니다.'),{status:response.status,httpStatus:response.status,errorCode:'INVALID_RESPONSE'});}
    if (!response.ok) {
      // 이전 계정에서 늦게 돌아온 401 응답으로 새 로그인 세션을 지우지 않습니다.
      if (response.status===401 && path!=='finish' && body?.state===session?.state && body?.proof===session?.proof) clearSession();
      const code=typeof data.errorCode==='string' && /^[A-Z_]+(?: \/ (?:OPENAPI\d{5}|\d{3}|UNAVAILABLE))?$/.test(data.errorCode)?' ('+data.errorCode+')':'';
      throw Object.assign(new Error((typeof data.error==='string'?data.error:'프렌즈 서버에 연결할 수 없습니다.')+code),{status:response.status,httpStatus:response.status,errorCode:data.errorCode||'',code:data.errorCode||''});
    }
    return data;
  }
  function controls() {
    if(!$('enhancement-source')) return;
    const useFriends=$('enhancement-source').value==='friends';
    $('enhancement-connect').hidden=!useFriends || !!session;
    $('enhancement-connect').disabled=!ready || !!running || finishing;
    $('enhancement-connect').title=ready?'넥슨 게임 데이터 제공 동의':'프렌즈 서버 설정이 필요합니다.';
    $('enhancement-disconnect').hidden=!useFriends || !session;
    ['enhancement-source','enhancement-from','enhancement-to','enhancement-refresh','enhancement-disconnect'].forEach(id=>$(id).disabled=!!running || finishing);
    $('enhancement-cancel').hidden=!running;
  }
  async function configure(preserveStatus=false) {
    if(configured || finishing) return;
    configured=true;
    try {
      ready=!!(await call('config')).ready;
      if(session && ready) {
        const snapshot=session, info=await call('status',{state:snapshot.state,proof:snapshot.proof});
        if(info.connected!==true || typeof info.account!=='string' || !info.account) throw new Error('넥슨 계정 정보를 확인할 수 없습니다.');
        if(sameSession(snapshot)) {
          session={...snapshot,account:info.account}; verified=info.connected===true && typeof info.account==='string';
          scopes=Array.isArray(info.scopes)?info.scopes.filter(s=>typeof s==='string'):[];
          try {sessionStorage.setItem(sessionKey,JSON.stringify(session));} catch {}
        }
      }
      if(!preserveStatus) status(ready?(session?'넥슨 계정 연결됨':'넥슨 계정을 연결하거나 개인 API 키를 선택하세요.'):'개인 API 키로 조회할 수 있습니다.');
    } catch { configured=false; if(!preserveStatus) status('프렌즈 서버에 연결할 수 없습니다. 개인 API 키 방식은 계속 사용할 수 있습니다.',true); }
    controls(); announce();
  }
  async function connect(returnPage='home') {
    if(finishing) return;
    finishing=true; running?.abort(); generation++; controls(); announce();
    try {
      const proof=hex(crypto.getRandomValues(new Uint8Array(32)));
      const result=await call('start',{challenge:await digest(proof)});
      const url=new URL(result.url);
      if(url.origin!=='https://openid.nexon.com' || url.pathname!=='/oauth2/authorize' || url.searchParams.get('state')!==result.state) throw new Error('로그인 주소 검증에 실패했습니다.');
      sessionStorage.setItem(flowKey,JSON.stringify({state:result.state,proof,createdAt:Date.now(),returnPage:returnPage==='expense'?'expense':'home'}));
      location.assign(url.href);
    } catch(error) {finishing=false;controls();announce();status(error.message,true);throw error;}
  }
  async function disconnect() {
    const previous=session;
    clearSession();
    try {if(previous) await call('logout',{state:previous.state,proof:previous.proof});}
    finally {status('넥슨 연결을 해제했습니다. 저장한 장부와 지출 기록은 유지됩니다.');}
  }
  async function request(path,body={},signal) {
    if(!getState().connected) throw Object.assign(new Error('넥슨 계정을 먼저 연결해 주세요.'),{status:401,httpStatus:401,errorCode:'SESSION_REQUIRED'});
    if(!/^[a-z][a-z0-9/-]*$/.test(path) || ['start','finish','config','logout'].includes(path)) throw new Error('지원하지 않는 요청입니다.');
    const snapshot=session, before=generation;
    const data=await call(path,{...body,state:snapshot.state,proof:snapshot.proof},signal);
    signal?.throwIfAborted();
    if(before!==generation || !sameSession(snapshot) || !verified) throw Object.assign(new Error('넥슨 계정이 변경되어 요청을 중단했습니다.'),{errorCode:'SESSION_CHANGED'});
    return data;
  }
  window.MapleFriends=Object.freeze({connect,disconnect,request,getState});
  document.addEventListener('maple:account-ledger-changing',()=>running?.abort());
  async function finish() {
    if(!callbackCode && !callbackError) return;
    status('넥슨 로그인 확인 중...');
    const flow=read(flowKey); sessionStorage.removeItem(flowKey);
    try {
      if(!flow || flow.state!==callbackState || !Number.isFinite(flow.createdAt) || flow.createdAt>Date.now()+60000 || Date.now()-flow.createdAt>600000) throw new Error('로그인 요청이 만료되었거나 일치하지 않습니다. 다시 연결해 주세요.');
      if(callbackError) throw new Error('넥슨 로그인이 완료되지 않았습니다.');
      const info=await call('finish',{state:flow.state,proof:flow.proof,code:callbackCode});
      if(info.connected!==true || typeof info.account!=='string' || !info.account) throw new Error('넥슨 계정 정보를 확인할 수 없습니다. 다시 연결해 주세요.');
      running?.abort(); generation++;
      session={state:flow.state,proof:flow.proof,account:info.account};
      verified=info.connected===true && typeof info.account==='string';
      scopes=Array.isArray(info.scopes)?info.scopes.filter(s=>typeof s==='string'):[];
      sessionStorage.setItem(sessionKey,JSON.stringify(session));
      if($('enhancement-source')) $('enhancement-source').value='friends';
      ready=true; status('넥슨 계정이 연결되었습니다. 이력을 가져올 수 있습니다.');
    } catch(error) {status(error.message,true);}
    document.querySelector('.tab[data-page="'+(flow?.returnPage==='home'?'home':'expense')+'"]')?.click();
    finishing=false;
    controls(); announce();
    await configure(true);
    controls();
  }
  async function sync(auto=false) {
    if(running) return;
    const source=$('enhancement-source').value, apiKey=bridge().key();
    if(source==='friends' && !getState().connected) {status('먼저 넥슨 계정을 연결해 주세요.',true);return;}
    const originalSession=session, originalGeneration=generation;
    const accountAllowed=()=>source!=='friends' || (sameSession(originalSession) && originalGeneration===generation && getState().connected && (!window.MapleAccountSync || window.MapleAccountSync.canUseAccount(originalSession.account)));
    if(!accountAllowed()) {status('홈에서 넥슨 계정 장부를 먼저 선택해 주세요. 기존 장부는 유지됩니다.',true);return;}
    if(source==='key' && !apiKey) {status('캐릭터 등록에서 본인의 개인 API 키를 등록해 주세요. CLIENT ID는 API 키가 아닙니다.',true);return;}
    const from=auto?offset(today(),-1):$('enhancement-from').value, to=auto?today():$('enhancement-to').value;
    const length=Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000)+1;
    if(!Number.isInteger(length) || length<1 || length>7 || to>today()) {status('미래 날짜를 제외하고 최대 7일씩 조회해 주세요.',true);return;}
    running=new AbortController(); const controller=running;
    controls();
    try {
      let account=session?.account;
      if(source==='key') {
        const identity=await bridge().api('/ouid',{},AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]));
        if(typeof identity?.ouid!=='string' || !identity.ouid) throw new Error('개인 API 키의 계정 정보를 확인할 수 없습니다.');
        account=await digest('nexon-ouid:'+identity.ouid);
      }
      if(source==='key' && apiKey!==bridge().key()) throw new Error('API 키가 변경되어 조회를 중단했습니다.');
      const fetchPage=async(kind,params,signal)=>{
        const body=source==='friends'?await request('history',{kind,...params},signal):await bridge().api('/history/'+kind,params,AbortSignal.any([signal,AbortSignal.timeout(20000)]));
        signal.throwIfAborted();
        return body;
      };
      const events=[], failures=new Set(), labels={starforce:'스타포스',potential:'잠재능력',cube:'큐브','soul-potential':'소울 잠재능력'};
      const collectKinds=['starforce','potential','cube'];
      if(source==='key' || scopes.includes('maplestory.soulpotential')) collectKinds.push('soul-potential');
      else failures.add('소울 잠재능력: 추가 동의를 위해 넥슨 계정을 다시 연결해 주세요.');
      for(let day=from;day<=to;day=offset(day,1)) {
        for(const kind of collectKinds) {
          if(kind==='soul-potential' && day<'2026-09-17') continue;
          status(day+' '+labels[kind]+' 조회 중...');
          try {events.push(...await E.collect(fetchPage,kind,day,account,controller.signal));}
          catch(error) {
            if(controller.signal.aborted || !accountAllowed() || error.status===401) throw error;
            failures.add(day+' '+labels[kind]+': '+error.message);
          }
        }
      }
      controller.signal.throwIfAborted();
      if(source==='key' && apiKey!==bridge().key()) throw new Error('API 키가 변경되었습니다. 저장하지 않았습니다.');
      if(!accountAllowed()) throw new Error('넥슨 계정 또는 선택한 장부가 변경되었습니다. 조회 결과를 저장하지 않았습니다.');
      const before=E.normalize(bridge().get()).events.length;
      if(events.length) bridge().commit({events});
      const added=E.normalize(bridge().get()).events.length-before;
      page=0; render();
      status('조회 완료 · 새 이력 '+added.toLocaleString()+'건'+(failures.size?' · 미조회: '+[...failures].join(' / '):''),failures.size>0);
    } catch(error) {status(controller.signal.aborted?'조회가 중단되었습니다. 기존 기록은 유지됩니다.':error.message,true);}
    finally {running=null;lastAuto=Date.now();controls();}
  }
  function hasManual(group) {
    return bridge().manual().some(r=>r.date===group.date && r.type===(group.kind==='cube'?'potential':group.kind==='soul-potential'?'soul_ether':group.kind) && (r.costs||[]).some(c=>BigInt(String(c.price||0).replace(/,/g,''))>0n));
  }
  function conditionTags(g) {
    if(g.basis==='saved-rate') return '직접 입력한 단가';
    if(g.kind==='soul-potential') return (g.soulStage==null?'증폭 단계 미상':'소울 '+g.soulStage+'단계')+' · 재설정 전 등급';
    if(g.kind!=='starforce') return g.basis==='cube-equivalent'?'동일 레벨·등급 메소 환산':g.kind==='cube'?g.cubeType:g.potentialType;
    const c=E.starConditions(g), tags=[];
    if(E.flag(c[0])) tags.push('슈페리얼');
    if(E.flag(c[1])) tags.push('파괴방지');
    if(E.flag(c[2])) tags.push('찬스타임');
    for(const row of Array.isArray(c[7])?c[7]:[]) {
      const discount=Number(String(row[0]||'').replace('%',''));
      if(discount>0) tags.push(discount+'% 할인');
    }
    return [...new Set(tags)].join(' · ')||'기본';
  }
  const amountText=g=>g.estimate===null?(g.kind==='soul-potential'?'횟수·비용 확인 필요':g.resolvedLevel===null?'장비 레벨 선택':g.details.some(d=>!d.grade && d.kind!=='starforce')?'등급 재조회 필요':'비용 확인 필요'):bridge().money(g.estimate);
  const priceLabel=g=>g.kind==='cube'?'큐브 환산액 · 지출 아님':'메소 사용액 (추정)';
  const labelFor=g=>g.kind==='starforce'?(g.stars??'?')+'성':g.grade||'등급 미상';
  const timeText=at=>new Date(at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const apiTab=value=>value==='starforce' || value==='potential' || value==='soul_ether';
  const matchesTab=(kind,value)=>kind===value || (value==='potential' && kind==='cube') || (value==='soul_ether' && kind==='soul-potential');
  function renderTabs(all) {
    const isApi=apiTab(tab);
    document.querySelectorAll('[data-enhancement-tab]').forEach(button=>{
      const value=button.dataset.enhancementTab, active=value===tab;
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
      button.setAttribute('aria-controls',value==='soul_ether'?'enhancement-api-panel manual-enhancement-panel':apiTab(value)?'enhancement-api-panel':'manual-enhancement-panel');
      const count=button.querySelector('span');
      if(count) count.textContent=all.filter(g=>matchesTab(g.kind,value)).length;
      if(active) $(isApi?'enhancement-api-panel':'manual-enhancement-panel')?.setAttribute('aria-labelledby',button.id);
    });
    if($('enhancement-api-panel')) $('enhancement-api-panel').hidden=!isApi;
    if($('manual-enhancement-panel')) $('manual-enhancement-panel').hidden=isApi && tab!=='soul_ether';
    if(tab==='soul_ether') $('manual-enhancement-panel')?.setAttribute('aria-labelledby','enhancement-tab-soul_ether');
    if($('enhancement-badge')) $('enhancement-badge').hidden=!isApi;
  }
  function selectTab(value) {
    if(!document.querySelector('[data-enhancement-tab="'+value+'"]')) return;
    if(apiTab(value) && value!==renderedTab) page=0;
    tab=value;
    if(!apiTab(tab) || tab==='soul_ether') window.MapleManualEnhancementTabs?.select(tab);
    render();
  }
  function summaryHtml(groups) {
    const total=rows=>rows.reduce((sum,g)=>sum+BigInt(g.subtotal),0n);
    const count=rows=>rows.reduce((sum,g)=>sum+g.count,0).toLocaleString();
    const missing=rows=>{const unknown=rows.filter(g=>g.estimate===null).length;return unknown?' · '+unknown+'개 미확인':'';};
    if(tab==='soul_ether') return '<div><span>소울 잠재 이력</span><strong>'+groups.reduce((sum,g)=>sum+g.events.length,0).toLocaleString()+'건</strong></div><div><span>확인한 조건의 메소 추정'+missing(groups)+'</span><strong>'+bridge().money(String(total(groups)))+'</strong></div><p class="enhancement-summary-note">API는 소울 잠재 재설정 이력만 제공합니다. 이력당 1회·3회 여부와 최종 사용 메소를 확인한 뒤 지출에 반영하세요. 소울 증폭·에테르 구입비는 아래에서 직접 기록하며, 무료 에테르는 구입비에 넣지 않습니다. 조회에는 최대 30분의 지연이 있을 수 있습니다.</p>';
    if(tab==='potential') {
      const meso=groups.filter(g=>g.kind==='potential'), cubes=groups.filter(g=>g.kind==='cube');
      return '<div><span>메소 재설정 횟수</span><strong>'+count(meso)+'회</strong></div>'+
        '<div><span>메소 사용액 (추정)'+missing(meso)+'</span><strong>'+bridge().money(String(total(meso)))+'</strong></div>'+
        '<div><span>사용한 큐브</span><strong>'+count(cubes)+'개</strong></div>'+
        '<div><span>큐브 환산액 · 메소 지출과 별도'+missing(cubes)+'</span><strong>'+bridge().money(String(total(cubes)))+'</strong></div>'+
        '<p class="enhancement-summary-note">큐브 환산액은 메소 사용액과 별도로 표시합니다. 무료·캐시 큐브는 실제 메소 지출 여부를 확인한 뒤 반영하세요.</p>';
    }
    return '<div><span>확인할 장비</span><strong>'+groups.length+'개</strong></div><div><span>강화 시도</span><strong>'+count(groups)+'회</strong></div><div><span>메소 사용액 (추정)'+missing(groups)+'</span><strong>'+bridge().money(String(total(groups)))+'</strong></div>';
  }
  function timelineHtml(g) {
    return '<details class="enhancement-timeline"><summary>사용 시각별 내역 '+g.events.length.toLocaleString()+'건</summary><div data-timeline-list></div><div class="enhancement-pagination"><button type="button" class="ghost" data-timeline-prev>이전</button><span data-timeline-page></span><button type="button" class="ghost" data-timeline-next>다음</button></div></details>';
  }
  function bindTimeline(row,g) {
    let position=0;
    const events=g.events.slice().reverse(), pages=Math.ceil(events.length/20), details=new Map(g.details.flatMap(d=>d.eventKeys.map(k=>[k,d])));
    const draw=()=>{
      row.querySelector('[data-timeline-list]').innerHTML=events.slice(position*20,position*20+20).map(e=>{
        const d=details.get(e.key), stars=e.kind==='starforce', change=stars?(e.stars??'?')+'성 → '+(e.nextStars??'?')+'성':(e.grade||'등급 미상')+' → '+(e.nextGrade||'등급 미상');
        const unit=stars && d.basis!=='saved-rate'?E.starCost({...e,level:d.resolvedLevel},d.profile):d.unit;
        return '<div class="enhancement-timeline-row"><time datetime="'+escape(e.at)+'">'+escape(e.date+' '+timeText(e.at))+'</time><span>'+escape(E.methodLabel(e))+'</span><span>'+escape(change)+'</span><strong>'+(unit==null?'비용 미확인':bridge().money(String(BigInt(unit)*BigInt(d.attempts))))+(e.kind==='cube'?' <small>환산</small>':'')+'</strong></div>';
      }).join('');
      row.querySelector('[data-timeline-page]').textContent=(position+1)+' / '+pages;
      row.querySelector('[data-timeline-prev]').disabled=position===0;
      row.querySelector('[data-timeline-next]').disabled=position+1>=pages;
    };
    row.querySelector('[data-timeline-prev]').onclick=()=>{position--;draw();};
    row.querySelector('[data-timeline-next]').onclick=()=>{position++;draw();};
    draw();
  }
  function detailsHtml(g) {
    const level=g.resolvedLevel??'', manual=hasManual(g), knownLevel=Number.isInteger(g.level), soul=g.kind==='soul-potential';
    return '<details class="enhancement-details"><summary>상세 내역 · 비용 조정</summary><div class="enhancement-detail-body">'+
      (g.details.some(d=>!d.grade && d.kind!=='starforce')?'<div class="enhancement-actions"><button type="button" class="ghost" data-reload-day>이 날짜 등급 다시 조회</button></div>':'')+
      '<div class="enhancement-settings"><label '+(soul?'hidden':'')+'>장비 레벨<input data-level type="number" min="1" max="300" step="1" list="enhancement-levels" value="'+level+'" '+(knownLevel?'disabled':'')+'></label>'+
      (g.kind==='starforce'?'<label>MVP 할인<select data-mvp>'+[[0,'없음'],[3,'실버 3%'],[5,'골드 5%'],[10,'다이아 이상 10%']].map(([value,label])=>'<option value="'+value+'" '+((g.profile.mvp||0)===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label class="enhancement-check"><input type="checkbox" data-pc '+(g.profile.pc?'checked':'')+'>PC방 5%</label>':
      g.kind==='potential' || soul?'<label>이력당 재설정<select data-attempts>'+(soul?'<option value="" '+(!g.profile.attempts?'selected':'')+'>실제 횟수 선택</option>':'')+'<option value="1" '+(g.attempts===1 && (!soul || g.profile.attempts)?'selected':'')+'>1회</option><option value="3" '+(g.attempts===3?'selected':'')+'>3회</option></select></label>':'')+
      '<button type="button" class="ghost" data-settings>계산 적용</button></div>'+
      (soul?'<p class="enhancement-note">API에 사용 메소와 확정 횟수가 없으므로 자동 지출로 처리하지 않습니다. 실제 사용한 1회·3회 조건을 선택하세요. 같은 날 두 방식을 섞었거나 이벤트 비용이 다르면 최종 반영 금액에 실제 합계를 입력하세요. 재료 구입비는 아래 수기 입력에서 별도로 기록합니다.</p>':g.kind==='starforce'?'<p class="enhancement-note">이력 당시 이벤트·파괴방지 적용. MVP·PC방 할인은 16성 이하에만 적용됩니다.</p>':g.kind==='cube'?'<p class="enhancement-note">동일 레벨·등급의 메소 재설정 비용으로 환산했습니다. 무료·캐시 큐브는 실제 메소 지출이 아닙니다.</p>':'<p class="enhancement-note">재설정 전 등급의 메소 비용입니다. 3회 재설정을 사용했다면 횟수를 변경하세요.</p>')+
      '<div class="enhancement-breakdown"><div class="enhancement-breakdown-head"><span>단계 / 조건</span><span>횟수</span><span>1회 메소</span><span>합계</span></div>'+g.details.map((d,i)=>'<div class="enhancement-breakdown-row" data-detail="'+i+'"><div><b>'+escape(labelFor(d))+'</b><small>'+escape(conditionTags(d))+'</small></div><span>'+d.count*d.attempts+'회</span><label><span class="enhancement-sr">'+escape(labelFor(d))+' 1회 비용</span><input data-unit inputmode="numeric" value="'+escape(d.unit??'')+'" placeholder="직접 입력"></label><strong>'+(d.estimate===null?'미확인':bridge().money(d.estimate))+'</strong></div>').join('')+'</div>'+
      '<div class="enhancement-actions"><button type="button" class="ghost" data-calculate>수정한 단가 적용</button>'+(g.details.some(d=>d.basis==='saved-rate')?'<button type="button" class="ghost" data-auto-rate>자동 단가로 복원</button>':'')+'</div>'+
      '<div class="enhancement-final"><label>최종 반영 금액 (메소)<input data-amount inputmode="numeric" value="'+escape(g.estimate??'')+'" placeholder="최종 금액"></label>'+
      (g.kind==='cube' || soul?'<label class="enhancement-duplicate"><input type="checkbox" data-actual-cost>이 금액을 실제 메소 지출로 확인했습니다.</label>':'')+
      (manual?'<label class="enhancement-duplicate"><input type="checkbox" data-distinct>같은 날 수동 지출과 별개인 비용입니다.</label>':'')+'</div>'+timelineHtml(g)+'</div></details>';
  }
  function render() {
    if(!bridge() || !$('enhancement-list')) return;
    const source=bridge().get();
    const state=E.normalize(source), all=E.reports(state);
    renderTabs(all);
    // 수기 입력 중에는 API 카드와 입력 초안을 다시 그리지 않습니다.
    if(!apiTab(tab)) return;
    if(source===renderedState && renderedManual===bridge().manual() && renderedTab===tab && renderedPage===page) return;
    const groups=all.filter(g=>matchesTab(g.kind,tab));
    page=Math.min(page,Math.max(0,Math.ceil(groups.length/10)-1));
    renderedState=source; renderedManual=bridge().manual(); renderedTab=tab; renderedPage=page;
    const visible=groups.slice(page*10,page*10+10);
    const open=new Set([...$('enhancement-list').querySelectorAll('article')].filter(r=>r.querySelector('details')?.open).map(r=>r.dataset.reportKey));
    $('enhancement-summary').classList.toggle('enhancement-summary--potential',tab==='potential');
    $('enhancement-summary').innerHTML=summaryHtml(groups);
    $('enhancement-list').innerHTML=visible.length?visible.map((g,i)=>{
      const icon=window.resolveItemImage?.({name:g.item,img:g.icon}) || g.icon;
      const progress=g.kind==='starforce'?(g.firstStars??'?')+'성 → '+(g.lastStars??'?')+'성':(g.firstGrade||'등급 미상')+(g.lastGrade && g.lastGrade!==g.firstGrade?' → '+g.lastGrade:'');
      return '<article class="enhancement-row" data-kind="'+g.kind+'" data-enhancement-row="'+i+'" data-report-key="'+escape(g.key)+'"><div class="enhancement-row-main"><div class="enhancement-item"><div class="enhancement-item-image"><img src="'+escape(icon||'assets/image-unavailable.svg')+'" alt="'+escape(g.item)+'" width="48" height="48" loading="lazy"></div><div class="enhancement-row-title"><strong>'+escape(g.item)+'</strong><span>'+escape(g.date+' · '+g.character+(g.world?' ('+g.world+')':''))+'</span><small>'+escape((g.kind==='soul-potential'?'소울 잠재':g.resolvedLevel===null?'레벨 미확인':g.resolvedLevel+'제')+' · '+timeText(g.firstAt)+(g.lastAt!==g.firstAt?' ~ '+timeText(g.lastAt):'')+' (KST)')+'</small><span class="enhancement-method">'+escape(E.methodLabel(g))+'</span></div></div><div class="enhancement-result"><strong>'+(g.kind==='soul-potential' && !g.profile.attempts?g.events.length.toLocaleString()+'건':g.count.toLocaleString()+(g.kind==='cube'?'개':'회'))+'</strong><span>'+escape(g.kind==='starforce'?'성공 '+g.success+' · 파괴 '+g.destroyed:progress+' · 등급 상승 '+g.success)+'</span></div><div class="enhancement-estimate"><span>'+priceLabel(g)+'</span><strong>'+amountText(g)+'</strong></div><div class="enhancement-actions"><button type="button" data-confirm>지출 반영</button><button type="button" class="ghost" data-exclude>제외</button></div></div>'+detailsHtml(g)+'</article>';
    }).join(''):'<p class="muted enhancement-empty">확인할 이력이 없습니다.</p>';
    $('enhancement-list').querySelectorAll('[data-enhancement-row]').forEach(row=>{
      const group=visible[Number(row.dataset.enhancementRow)];
      bindTimeline(row,group);
      row.querySelector('details').open=open.has(group.key);
      row.querySelector('[data-reload-day]')?.addEventListener('click',()=>{
        if(running) return;
        $('enhancement-from').value=group.date; $('enhancement-to').value=group.date; sync();
      });
      row.querySelector('[data-settings]').onclick=()=>{
        try {
          const rawLevel=row.querySelector('[data-level]').value, level=rawLevel===''?null:Number(rawLevel);
          if(group.kind==='soul-potential' && !row.querySelector('[data-attempts]')?.value) throw new Error('실제 사용한 1회 또는 3회 재설정을 선택해 주세요.');
          if(level!==null && (!Number.isInteger(level)||level<1||level>300)) throw new Error('장비 레벨은 1~300으로 입력하세요.');
          bridge().commit({profiles:[{key:group.key,level,mvp:Number(row.querySelector('[data-mvp]')?.value||0),pc:!!row.querySelector('[data-pc]')?.checked,attempts:Number(row.querySelector('[data-attempts]')?.value||1),updatedAt:Date.now()}]});
          render();
        }catch(error){status(error.message,true);}
      };
      row.querySelector('[data-calculate]').onclick=()=>{
        try {
          const rates=[];
          row.querySelectorAll('[data-detail]').forEach(detail=>{
            const d=group.details[Number(detail.dataset.detail)],unit=detail.querySelector('[data-unit]').value.replace(/,/g,'').trim();
            if(unit===(d.unit??'')) return;
            if(E.amount(unit)===null) throw new Error('1회 비용을 정수로 입력해 주세요.');
            rates.push({key:d.key,unit,attempts:d.attempts,updatedAt:Date.now()});
          });
          if(rates.length) bridge().commit({rates}); render();
        }catch(error){status(error.message,true);}
      };
      row.querySelector('[data-auto-rate]')?.addEventListener('click',()=>{
        try {bridge().commit({rates:group.details.filter(d=>d.basis==='saved-rate').map(d=>({key:d.key,unit:d.unit,attempts:d.attempts,auto:true,updatedAt:Date.now()}))});render();}catch(error){status(error.message,true);}
      });
      row.querySelector('[data-confirm]').onclick=()=>{
        try {
          if(['cube','soul-potential'].includes(group.kind) && !row.querySelector('[data-actual-cost]')?.checked) {row.querySelector('details').open=true;throw new Error(group.kind==='cube'?'큐브 환산액입니다. 실제 메소로 지출한 금액인지 확인해 주세요.':'소울 재설정에 실제 메소로 지출한 최종 금액인지 확인해 주세요.');}
          if(hasManual(group) && !row.querySelector('[data-distinct]')?.checked) {row.querySelector('details').open=true;throw new Error('같은 날 수동 기록이 있습니다. 별개 비용인지 확인해 주세요.');}
          const amount=row.querySelector('[data-amount]').value.replace(/,/g,'').trim();
          if(E.amount(amount)===null || BigInt(amount)<=0n) {row.querySelector('details').open=true;throw new Error('계산 조건 또는 최종 반영 금액을 확인하세요.');}
          if(!window.confirm(group.date+' '+group.item+'\n'+bridge().money(amount)+'를 지출에 반영할까요?')) return;
          bridge().commit(E.confirm(bridge().get(),group,amount,crypto.randomUUID())); render(); status('지출에 반영했습니다.');
        }catch(error){status(error.message,true);}
      };
      row.querySelector('[data-exclude]').onclick=()=>{
        try {
          if(!window.confirm('이 이력을 지출에서 제외할까요? 다시 조회해도 자동으로 추가되지 않습니다.')) return;
          bridge().commit(E.confirm(bridge().get(),group,'0',crypto.randomUUID(),new Date().toISOString(),'excluded')); render();
        }catch(error){status(error.message,true);}
      };
    });
    $('enhancement-pagination').innerHTML=groups.length>10?'<button type="button" class="ghost" data-prev '+(page===0?'disabled':'')+'>이전</button><span>'+(page+1)+' / '+Math.ceil(groups.length/10)+'</span><button type="button" class="ghost" data-next '+((page+1)*10>=groups.length?'disabled':'')+'>다음</button>':'';
    $('enhancement-pagination').querySelector('[data-prev]')?.addEventListener('click',()=>{page--;render();});
    $('enhancement-pagination').querySelector('[data-next]')?.addEventListener('click',()=>{page++;render();});
    const conflicts=new Set(E.allocated(state).conflicts.map(b=>b.id));
    const eventsByKey=new Map(state.events.map(e=>[e.key,e]));
    $('enhancement-confirmed-list').innerHTML=state.batches.length?state.batches.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30).map(b=>'<div class="enhancement-saved"><span>'+escape(b.date+' · '+b.character+' · '+b.item)+'<small>'+escape(E.methodLabel(eventsByKey.get(b.eventKeys[0])||b))+'</small></span><b>'+(conflicts.has(b.id)?'중복 확인 필요 · 미반영':b.status==='excluded'?'제외됨':bridge().money(b.amount))+'</b>'+(b.status==='confirmed'?'<button type="button" class="ghost" data-undo="'+escape(b.id)+'">반영 취소</button>':'')+'</div>').join(''):'<p class="muted">아직 확정하거나 제외한 이력이 없습니다.</p>';
    $('enhancement-confirmed-list').querySelectorAll('[data-undo]').forEach(button=>button.onclick=()=>{
      if(!window.confirm('이 강화 지출의 반영을 취소할까요? API 원본 이력은 남겨둡니다.')) return;
      const batch=state.batches.find(b=>b.id===button.dataset.undo);
      try {bridge().commit({batches:[{...batch,status:'excluded',updatedAt:Date.now()}]});render();}catch(error){status(error.message,true);}
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(!$('enhancement-panel') || !bridge()) {finish();configure();return;}
    $('enhancement-to').value=today(); $('enhancement-from').value=offset(today(),-1);
    $('enhancement-to').max=today(); $('enhancement-from').max=today();
    if(!session && bridge().key()) $('enhancement-source').value='key';
    $('enhancement-source').onchange=controls;
    const tabs=[...document.querySelectorAll('[data-enhancement-tab]')];
    tabs.forEach((button,index)=>{
      button.onclick=()=>selectTab(button.dataset.enhancementTab);
      button.onkeydown=event=>{
        let next;
        if(event.key==='ArrowRight') next=(index+1)%tabs.length;
        else if(event.key==='ArrowLeft') next=(index+tabs.length-1)%tabs.length;
        else if(event.key==='Home') next=0;
        else if(event.key==='End') next=tabs.length-1;
        else return;
        event.preventDefault();
        selectTab(tabs[next].dataset.enhancementTab);
        tabs[next].focus();
      };
    });
    $('enhancement-connect').onclick=()=>connect('expense').catch(()=>{});
    $('enhancement-refresh').onclick=()=>sync();
    $('enhancement-cancel').onclick=()=>running?.abort();
    $('enhancement-disconnect').onclick=()=>disconnect().catch(error=>status(error.message,true));
    document.addEventListener('workspace:page',event=>{if(event.detail.page==='expense'){render();configure();}});
    document.addEventListener('workspace:render',()=>{if($('page-expense').classList.contains('active') && !document.querySelector('#enhancement-list :focus')) render();});
    setInterval(()=>{if($('enhancement-auto').checked && $('page-expense').classList.contains('active') && !document.hidden && !document.querySelector('#enhancement-list :focus') && Date.now()-lastAuto>=300000) sync(true);},30000);
    render(); controls();
    configure();
    finish();
  });
})();
