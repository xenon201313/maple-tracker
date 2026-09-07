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
  let session=read(sessionKey), ready=false, configured=false, page=0, running=null, lastAuto=0;
  const callback=new URL(location.href);
  const callbackState=callback.searchParams.get('state');
  const callbackCode=callback.searchParams.get('code');
  const callbackError=callback.searchParams.get('error');
  // Strip OAuth parameters before ads, analytics, or other application scripts execute.
  if(callbackCode || callbackError) {
    ['code','state','error','error_description'].forEach(k=>callback.searchParams.delete(k));
    history.replaceState(history.state,'',callback.pathname+callback.search+callback.hash);
  }
  function status(text,error=false) {
    if (!$('enhancement-status')) return;
    $('enhancement-status').textContent=text;
    $('enhancement-status').classList.toggle('err',error);
  }
  async function call(path,body,signal) {
    const timeout=AbortSignal.timeout(30000);
    const response=await fetch(endpoint+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'omit',redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout});
    const data=await response.json();
    if (!response.ok) {
      if (response.status===401 && path!=='finish') { session=null; sessionStorage.removeItem(sessionKey); }
      throw new Error(typeof data.error==='string'?data.error:'프렌즈 서버에 연결할 수 없습니다.');
    }
    return data;
  }
  function controls() {
    const useFriends=$('enhancement-source').value==='friends';
    $('enhancement-connect').hidden=!useFriends || !!session;
    $('enhancement-connect').disabled=!ready || !!running;
    $('enhancement-connect').title=ready?'넥슨 게임 데이터 제공 동의':'프렌즈 서버 설정이 필요합니다.';
    $('enhancement-disconnect').hidden=!useFriends || !session;
    ['enhancement-source','enhancement-from','enhancement-to','enhancement-refresh','enhancement-disconnect'].forEach(id=>$(id).disabled=!!running);
    $('enhancement-cancel').hidden=!running;
  }
  async function configure() {
    if(configured) return;
    configured=true;
    try {
      ready=!!(await call('config')).ready;
      if(session && ready) { const info=await call('status',session); session.account=info.account; }
      status(ready?(session?'넥슨 계정 연결됨':'넥슨 로그인 또는 등록한 개인 API 키로 조회할 수 있습니다.'):'프렌즈 서버 설정 전입니다. 등록한 개인 API 키로 먼저 조회할 수 있습니다.');
    } catch { status('프렌즈 서버에 연결할 수 없습니다. 개인 API 키 방식은 계속 사용할 수 있습니다.',true); }
    controls();
  }
  async function connect() {
    try {
      const proof=hex(crypto.getRandomValues(new Uint8Array(32)));
      const result=await call('start',{challenge:await digest(proof)});
      const url=new URL(result.url);
      if(url.origin!=='https://openid.nexon.com' || url.pathname!=='/oauth2/authorize' || url.searchParams.get('state')!==result.state) throw new Error('로그인 주소 검증에 실패했습니다.');
      sessionStorage.setItem(flowKey,JSON.stringify({state:result.state,proof,createdAt:Date.now()}));
      location.assign(url.href);
    } catch(error) {status(error.message,true);}
  }
  async function finish() {
    if(!callbackCode && !callbackError) return;
    const flow=read(flowKey); sessionStorage.removeItem(flowKey);
    try {
      if(!flow || flow.state!==callbackState || Date.now()-flow.createdAt>600000) throw new Error('로그인 요청이 만료되었거나 일치하지 않습니다. 다시 연결해 주세요.');
      if(callbackError) throw new Error('넥슨 로그인이 완료되지 않았습니다.');
      const info=await call('finish',{state:flow.state,proof:flow.proof,code:callbackCode});
      session={state:flow.state,proof:flow.proof,account:info.account};
      sessionStorage.setItem(sessionKey,JSON.stringify(session));
      $('enhancement-source').value='friends';
      ready=true; status('넥슨 계정이 연결되었습니다. 이력을 가져올 수 있습니다.');
    } catch(error) {status(error.message,true);}
    document.querySelector('.tab[data-page="expense"]')?.click();
    controls();
  }
  async function sync(auto=false) {
    if(running) return;
    const source=$('enhancement-source').value, apiKey=bridge().key();
    if(source==='friends' && !session) {status('먼저 넥슨 계정을 연결해 주세요.',true);return;}
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
        const body=source==='friends'?await call('history',{...session,kind,...params},signal):await bridge().api('/history/'+kind,params,AbortSignal.any([signal,AbortSignal.timeout(20000)]));
        signal.throwIfAborted();
        return body;
      };
      const events=[];
      for(let day=from;day<=to;day=offset(day,1)) {
        for(const kind of ['starforce','potential']) {
          status(day+' '+(kind==='starforce'?'스타포스':'잠재능력')+' 이력을 가져오는 중...');
          events.push(...await E.collect(fetchPage,kind,day,account,controller.signal));
        }
      }
      controller.signal.throwIfAborted();
      if(source==='key' && apiKey!==bridge().key()) throw new Error('API 키가 변경되었습니다. 저장하지 않았습니다.');
      const before=E.normalize(bridge().get()).events.length;
      bridge().commit({events});
      const added=E.normalize(bridge().get()).events.length-before;
      page=0; render();
      status('조회 완료 · 새 이력 '+added.toLocaleString()+'건 · 지출은 아직 추가하지 않았습니다.');
    } catch(error) {status(controller.signal.aborted?'조회가 중단되었습니다. 기존 기록은 유지됩니다.':error.message,true);}
    finally {running=null;lastAuto=Date.now();controls();}
  }
  function hasManual(group) {
    return bridge().manual().some(r=>r.date===group.date && r.type===group.kind && (r.costs||[]).some(c=>BigInt(String(c.price||0).replace(/,/g,''))>0n));
  }
  function starCondition(group) {
    let conditions=[];
    try{conditions=JSON.parse(group.conditions);}catch{}
    const labels=['슈페리얼','파괴방지','찬스타임','이벤트 필드','사용 주문서','보호막','추가옵션 강화'];
    const details=labels.flatMap((label,i)=>conditions[i] && conditions[i]!=='미적용'?[label+' '+conditions[i]]:[]);
    (conditions[7]||[]).forEach(row=>{if(row[0]) details.push('비용 할인 '+row[0]);});
    return (group.stars??'?')+'성에서 강화'+(details.length?' · '+details.join(' · '):'');
  }
  function render() {
    if(!bridge() || !$('enhancement-list')) return;
    const state=E.normalize(bridge().get()), groups=E.groups(state);
    page=Math.min(page,Math.max(0,Math.ceil(groups.length/10)-1));
    const visible=groups.slice(page*10,page*10+10);
    $('enhancement-list').innerHTML=visible.length?visible.map((g,i)=>{
      const condition=g.kind==='starforce'?starCondition(g):g.potentialType+' · '+g.grade+' · Lv.'+(g.level??'?');
      const manual=hasManual(g);
      return '<article class="enhancement-row" data-enhancement-row="'+i+'"><div class="enhancement-row-title"><strong>'+escape(g.item)+'</strong><span>'+escape(g.date+' · '+g.character+(g.world?' ('+g.world+')':''))+'</span><small>'+escape(condition)+' · 이력 '+g.count.toLocaleString()+'건</small></div><div class="enhancement-rate"><label>1회 비용 (메소)<input data-unit inputmode="numeric" value="'+escape(g.unit??'')+'" placeholder="비용 확인 필요"></label>'+(g.kind==='potential'?'<label>이력 1건당<select data-attempts><option value="1" '+(g.attempts===1?'selected':'')+'>1회 기준</option><option value="3" '+(g.attempts===3?'selected':'')+'>3회 기준</option></select></label>':'')+'<button type="button" class="ghost" data-calculate>추정 계산</button></div><div class="enhancement-estimate"><span>추정 지출 · 통계 미반영</span><strong>'+(g.estimate===null?'단가 확인 필요':bridge().money(g.estimate))+'</strong><small>'+(g.basis==='official-table'?'공식 기본 단가 · 3회 재설정 여부 확인':g.basis==='saved-rate'?'확인한 단가 기준':'장비·할인·파괴방지 조건의 실제 1회 비용 입력')+'</small></div><div class="enhancement-confirm"><label>확정할 메소<input data-amount inputmode="numeric" value="'+escape(g.estimate??'')+'" placeholder="최종 금액 확인"></label>'+(manual?'<label class="enhancement-duplicate"><input type="checkbox" data-distinct>같은 날 수동 강화 지출과 별개인 비용입니다.</label>':'')+'<div class="enhancement-actions"><button type="button" data-confirm>지출 확정</button><button type="button" class="ghost" data-exclude>이미 기록 / 제외</button></div></div></article>';
    }).join(''):'<p class="muted enhancement-empty">확인할 강화 이력이 없습니다. 기간을 선택해 이력을 가져오세요.</p>';
    $('enhancement-list').querySelectorAll('[data-enhancement-row]').forEach(row=>{
      const group=visible[Number(row.dataset.enhancementRow)];
      row.querySelector('[data-calculate]').onclick=()=>{
        try {
          const unit=row.querySelector('[data-unit]').value.replace(/,/g,'').trim();
          if(E.amount(unit)===null) throw new Error('1회 비용을 정수로 입력해 주세요.');
          const attempts=Number(row.querySelector('[data-attempts]')?.value||1);
          bridge().commit({rates:[{key:group.key,unit,attempts,updatedAt:Date.now()}]}); render();
        }catch(error){status(error.message,true);}
      };
      row.querySelector('[data-confirm]').onclick=()=>{
        try {
          if(hasManual(group) && !row.querySelector('[data-distinct]')?.checked) throw new Error('같은 날 수동 기록이 있습니다. 별개 비용인지 확인하거나 제외해 주세요.');
          const amount=row.querySelector('[data-amount]').value.replace(/,/g,'').trim();
          if(E.amount(amount)===null || BigInt(amount)<=0n) throw new Error('확정할 메소를 입력해 주세요.');
          if(!window.confirm(group.date+' '+group.item+'\n'+bridge().money(amount)+'를 지출에 반영할까요?')) return;
          bridge().commit(E.confirm(bridge().get(),group,amount,crypto.randomUUID())); render(); status('확인한 금액을 손익·지출 요약·통계에 한 번 반영했습니다.');
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
    $('enhancement-confirmed-list').innerHTML=state.batches.length?state.batches.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30).map(b=>'<div class="enhancement-saved"><span>'+escape(b.date+' · '+b.character+' · '+b.item)+'</span><b>'+(conflicts.has(b.id)?'중복 확인 필요 · 미반영':b.status==='excluded'?'제외됨':bridge().money(b.amount))+'</b>'+(b.status==='confirmed'?'<button type="button" class="ghost" data-undo="'+escape(b.id)+'">반영 취소</button>':'')+'</div>').join(''):'<p class="muted">아직 확정하거나 제외한 이력이 없습니다.</p>';
    $('enhancement-confirmed-list').querySelectorAll('[data-undo]').forEach(button=>button.onclick=()=>{
      if(!window.confirm('이 강화 지출의 반영을 취소할까요? API 원본 이력은 남겨둡니다.')) return;
      const batch=state.batches.find(b=>b.id===button.dataset.undo);
      try {bridge().commit({batches:[{...batch,status:'excluded',updatedAt:Date.now()}]});render();}catch(error){status(error.message,true);}
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(!$('enhancement-panel') || !bridge()) return;
    $('enhancement-to').value=today(); $('enhancement-from').value=offset(today(),-1);
    $('enhancement-to').max=today(); $('enhancement-from').max=today();
    if(!session && bridge().key()) $('enhancement-source').value='key';
    $('enhancement-source').onchange=controls;
    $('enhancement-connect').onclick=connect;
    $('enhancement-refresh').onclick=()=>sync();
    $('enhancement-cancel').onclick=()=>running?.abort();
    $('enhancement-disconnect').onclick=async()=>{
      try {await call('logout',session);session=null;sessionStorage.removeItem(sessionKey);controls();status('연결을 해제했습니다. 저장한 지출 기록은 유지됩니다.');}catch(error){status(error.message,true);}
    };
    document.addEventListener('workspace:page',event=>{if(event.detail.page==='expense'){render();configure();}});
    document.addEventListener('workspace:render',()=>{if(!document.querySelector('#enhancement-list :focus')) render();});
    setInterval(()=>{if($('enhancement-auto').checked && $('page-expense').classList.contains('active') && !document.hidden && !document.querySelector('#enhancement-list :focus') && Date.now()-lastAuto>=300000) sync(true);},30000);
    render(); controls();
    if($('page-expense').classList.contains('active')) configure();
    finish();
  });
})();
