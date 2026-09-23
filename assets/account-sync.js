/* 넥슨 계정 장부. 기존 API 키 보관함을 수정하지 않고, 전환 전 로컬 원본을 별도 보관합니다. */
(() => {
  'use strict';
  const META='maple:account-ledger:active:v1', VAULT='maple:account-ledger:vault:v1:', ARCHIVE='maple:account-ledger:archive:v1:', TX='maple:account-ledger:transaction:v1';
  const isLedgerKey=key=>/^mapleTracker/i.test(key);
  const validOwner=value=>value==='legacy'||/^friends:[a-f0-9]{64}$/.test(value||'');
  const fresh=()=>({owner:'legacy',revision:0,dirty:false});
  const read=key=>{const text=localStorage.getItem(key);return text?JSON.parse(text):null;};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const capture=()=>Object.fromEntries(Object.keys(localStorage).filter(isLedgerKey).map(key=>[key,localStorage.getItem(key)]));
  function replaceStore(values) {
    for(const [key,value] of Object.entries(values)) if(isLedgerKey(key)&&typeof value==='string') localStorage.setItem(key,value);
    for(const key of Object.keys(localStorage)) if(isLedgerKey(key)&&!(key in values)) localStorage.removeItem(key);
  }
  let fatal='',meta,loadedOwner;
  try {
    const interrupted=read(TX);
    if(interrupted){
      if(Date.now()-Number(interrupted.createdAt||0)<15000)throw new Error('장부 전환 진행 중');
      replaceStore(interrupted.before.values);write(META,interrupted.before.meta);localStorage.removeItem(TX);
    }
    meta=read(META)||fresh();
    if(!validOwner(meta.owner)) throw new Error('장부 연결 정보가 올바르지 않습니다.');
    loadedOwner=meta.owner;
  } catch {fatal='장부 전환 중이거나 보관함을 읽지 못했습니다. 잠시 뒤 새로 열어 주세요. 계속되면 브라우저 저장 공간과 권한을 확인해 주세요.';meta=fresh();loadedOwner='blocked';}
  let context=null, pending=null, busy=false, timer=0, generation=0, statusText='', isError=false, started=false, stale=false;
  let storedMain=localStorage.getItem('mapleTracker.v2');
  const $=id=>document.getElementById(id);
  const bridge=()=>window.MapleAccountBridge;
  const auth=()=>window.MapleFriends?.getState()||{};
  // 변경 감지용 지문입니다. 암호화에는 별도의 AES-GCM 키를 사용합니다.
  function mark(value){
    const text=JSON.stringify(value);let a=0x811c9dc5,b=0x9e3779b9,c=0x85ebca6b,d=0xc2b2ae35;
    for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);a=Math.imul(a^n,16777619);b=Math.imul(b^n,2246822519);c=Math.imul(c^n,3266489917);d=Math.imul(d^n,668265263);}
    return [a,b,c,d].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
  }
  const fingerprint=()=>mark(bridge().snapshot().data);
  function persist(){write(META,meta);}
  function announce(text,error=false){statusText=text;isError=error;render();}
  function checkOwner(){
    if(fatal||stale||((read(META)||fresh()).owner!==loadedOwner)) throw new Error(fatal||'다른 탭에서 장부가 전환되었습니다. 이 탭을 새로 열어 주세요.');
    if(loadedOwner!=='legacy'&&localStorage.getItem('mapleTracker.v2')!==storedMain){staleTab();throw new Error('다른 탭에서 장부가 변경되었습니다. 최신 기록을 새로 열어 주세요.');}
  }
  function beforeSave(){checkOwner();if(loadedOwner!=='legacy'){meta.dirty=true;persist();}}
  function stop(){generation++;clearTimeout(timer);timer=0;context=null;pending=null;busy=false;bridge()?.stopLegacy();}
  function valid(ctx){return context===ctx&&ctx.generation===generation&&auth().connected&&auth().account===ctx.account&&!stale;}
  function summary(data){return '캐릭터 '+(data.chars?.length||0)+'개 · 재획 '+Object.keys(data.records||{}).length+'일 · 손익 '+(data.profits?.length||0)+'건 · 직접 지출 '+(data.expenses?.length||0)+'건';}
  function archive(label,values=capture(),owner=loadedOwner){
    const id=ARCHIVE+owner+':'+Date.now()+':'+crypto.randomUUID();
    write(id,{owner,label,createdAt:Date.now(),values});
    return id;
  }
  function bank(){checkOwner();write(VAULT+loadedOwner,{meta:{...meta},values:capture()});}
  async function activate(values,nextMeta,label){
    document.dispatchEvent(new CustomEvent('maple:account-ledger-changing'));
    const perform=()=>{
    checkOwner();
    const before={meta:{...meta},values:capture()};
    archive(label,before.values);
    write(VAULT+loadedOwner,before);
    write(TX,{before,createdAt:Date.now()});
    try {
      bridge().stopLegacy();
      replaceStore(values);
      write(META,nextMeta);
      localStorage.removeItem(TX);
    } catch(error){
      try{replaceStore(before.values);write(META,before.meta);localStorage.removeItem(TX);}catch{fatal='장부 전환을 복구 중입니다. 브라우저 저장 공간을 확보한 뒤 새로 열어 주세요.';}
      throw error;
    }
    stop();location.reload();
    };
    if(navigator.locks)await navigator.locks.request('maple-account-ledger-switch',perform);
    else perform();
  }
  function bytes64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
  function unbase64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
  async function decrypt(payload,ctx){
    if(!payload||payload.version!==1||typeof payload.iv!=='string'||typeof payload.ciphertext!=='string')throw new Error('저장된 장부 형식이 올바르지 않습니다.');
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(payload.iv)},ctx.key,unbase64(payload.ciphertext));
    const result=JSON.parse(new TextDecoder().decode(plain));
    if(result?.version!==1||!result.data?.records)throw new Error('장부를 해석하지 못했습니다. 현재 기록은 유지됩니다.');
    return result;
  }
  async function remote(ctx){
    const result=await window.MapleFriends.request('ledger-read');
    if(!valid(ctx))return null;
    if(result.account!==ctx.account||!Number.isSafeInteger(result.revision)||result.revision<0)throw new Error('계정 장부 응답이 일치하지 않습니다.');
    const snapshot=result.payload?await decrypt(result.payload,ctx):null;
    return valid(ctx)?{revision:result.revision,snapshot}:null;
  }
  function offer(ctx,value,kind){
    pending={ctx,...value,kind};busy=false;
    announce(kind==='connect'?'기존 기록을 보관한 뒤 사용할 장부를 선택해 주세요.':'다른 기기의 변경을 확인했습니다. 자동 덮어쓰기를 멈췄습니다.',kind!=='connect');
  }
  async function initialize(){
    if(!started||!bridge()||fatal||stale)return;
    const state=auth();
    if(!state.connected){
      if(context)stop();
      if(meta.owner!=='legacy')announce('이 기기의 계정 장부는 유지됩니다. 넥슨 로그인 후 동기화를 이어갑니다.');
      else {announce('현재 브라우저에 기록합니다. 넥슨 로그인으로 다른 기기에서도 이어서 사용할 수 있습니다.');if(!window.MapleAccountSync.blocksLegacy())bridge().resumeLegacy?.();}
      return;
    }
    if(context?.account===state.account)return;
    stop();busy=true;
    const seq=generation, ctx={account:state.account,generation:seq,key:null};context=ctx;
    announce('넥슨 계정 보관함을 확인하는 중…');
    try {
      checkOwner();
      const key=await window.MapleFriends.request('ledger-key');
      if(!valid(ctx))return;
      if(key.account!==ctx.account||!/^[a-f0-9]{64}$/.test(key.key))throw new Error('계정 암호화 정보가 올바르지 않습니다.');
      ctx.key=await crypto.subtle.importKey('raw',Uint8Array.from(key.key.match(/../g),s=>parseInt(s,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
      const before=fingerprint(), value=await remote(ctx);
      if(!value||!valid(ctx))return;
      if(loadedOwner!=='friends:'+ctx.account){offer(ctx,value,'connect');return;}
      if(before!==fingerprint()){offer(ctx,value,'conflict');return;}
      if(value.revision===meta.revision){
        busy=false;announce('넥슨 계정 장부 연결됨','');
        if(meta.dirty)await upload();
      } else if(!meta.dirty&&value.snapshot){
        await useRemote(false,value);
      } else {offer(ctx,value,'conflict');}
    } catch(error){if(valid(ctx)){context=null;announce(error.message||'계정 저장 연결을 확인하지 못했습니다.',true);}}
    finally{if(seq===generation){busy=false;render();}}
  }
  async function upload(){
    const ctx=context;
    if(!ctx||!valid(ctx)||!ctx.key||busy||pending||loadedOwner!=='friends:'+ctx.account)return false;
    busy=true;clearTimeout(timer);timer=0;announce('넥슨 계정에 저장하는 중…');
    try {
      checkOwner();
      const snapshot=bridge().snapshot(), at=mark(snapshot.data), iv=crypto.getRandomValues(new Uint8Array(12));
      const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},ctx.key,new TextEncoder().encode(JSON.stringify(snapshot,(key,value)=>key==='nexonApiKey'?undefined:value)));
      if(!valid(ctx))return false;
      checkOwner();
      const result=await window.MapleFriends.request('ledger-save',{revision:meta.revision,payload:{version:1,updatedAt:snapshot.updatedAt,iv:bytes64(iv),ciphertext:bytes64(new Uint8Array(ciphertext))}});
      if(!valid(ctx))return false;
      checkOwner();
      if(result.account!==ctx.account||!Number.isSafeInteger(result.revision))throw new Error('저장 결과의 계정이 일치하지 않습니다.');
      meta.revision=result.revision;meta.fingerprint=at;meta.dirty=at!==fingerprint();persist();
      announce('넥슨 계정에 저장됨 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));
      return true;
    } catch(error){
      if(!valid(ctx))return false;
      if(error.status===409){const value=await remote(ctx);if(value)offer(ctx,value,'conflict');}
      else announce('계정 저장 실패 · '+error.message+' 현재 기기 기록은 유지됩니다.',true);
      return false;
    } finally {if(valid(ctx)){busy=false;render();if(meta.dirty&&!pending&&!isError)timer=setTimeout(upload,900);}}
  }
  function changed(){
    storedMain=localStorage.getItem('mapleTracker.v2');
    if(loadedOwner==='legacy')return;
    try{checkOwner();meta.dirty=true;persist();if(context&&!pending){clearTimeout(timer);timer=setTimeout(upload,900);}}
    catch(error){announce(error.message,true);}
  }
  async function pull(){
    if(!context){await initialize();return;}
    const ctx=context;if(busy||!valid(ctx))return;
    busy=true;announce('계정의 최신 기록을 확인하는 중…');
    try{checkOwner();const value=await remote(ctx);if(value){checkOwner();if(value.revision===meta.revision&&!meta.dirty)announce('이미 최신 계정 장부입니다.');else offer(ctx,value,loadedOwner==='friends:'+ctx.account?'conflict':'connect');}}
    catch(error){if(valid(ctx))announce(error.message,true);}
    finally{if(valid(ctx)){busy=false;render();}}
  }
  async function useRemote(ask=true,given=pending){
    const ctx=context,value=given;if(!value||!ctx||!valid(ctx))return;
    try{
      checkOwner();
      if(ask&&!confirm('현재 장부와 복구 기록을 이 기기에 별도로 보관한 뒤 넥슨 계정 장부를 열까요?'))return;
      const owner='friends:'+ctx.account, saved=read(VAULT+owner);
      // 다른 계정으로 돌아올 때 서버보다 먼저 그 계정의 미전송 로컬 기록을 복원합니다.
      if(loadedOwner!==owner&&saved){await activate(saved.values,saved.meta,'계정 전환 전 원본');return;}
      const snapshot=value.snapshot||bridge().emptySnapshot();
      const values=bridge().storeFromSnapshot(snapshot);
      await activate(values,{owner,revision:value.revision,dirty:!value.snapshot,fingerprint:mark(snapshot.data)},'클라우드 장부 열기 전 원본');
    }catch(error){announce('원본 보관 또는 장부 전환 실패 · '+error.message+' 기존 기록은 유지됩니다.',true);}
  }
  async function useLocal(){
    const ctx=context,value=pending;if(!ctx||!value||!valid(ctx))return;
    if(loadedOwner!=='legacy'&&loadedOwner!=='friends:'+ctx.account)return;
    if(!confirm(value.snapshot?'서버의 현재 장부는 세대 보관본으로 남기고, 이 기기의 장부를 계정의 최신본으로 사용할까요? 자동으로 합치지 않습니다.':'이 기기의 장부와 복구 기록을 넥슨 계정에 연결할까요? 기존 API 키 보관함은 그대로 남습니다.'))return;
    try {
      const owner='friends:'+ctx.account;
      if(loadedOwner!==owner){
        // 다음 로드부터 계정 소유권이 고정됩니다. 기존 저장 원본은 legacy 보관함에 유지됩니다.
        const next={owner,revision:value.revision,dirty:true,fingerprint:''};
        await activate(capture(),next,'기존 기록을 계정으로 복사하기 전');return;
      }
      archive('계정 장부 연결 전 원본');bank();
      meta.revision=value.revision;meta.dirty=true;persist();pending=null;await upload();
    }catch(error){announce('연결 준비 실패 · '+error.message,true);}
  }
  async function legacy(){
    if(!confirm('현재 계정 장부를 이 기기에 보관하고, 이전 API 키·브라우저 장부로 돌아갈까요? 넥슨 연결은 해제합니다.'))return;
    try{bank();const saved=read(VAULT+'legacy');if(!saved)throw new Error('이 기기에 보관된 이전 장부가 없습니다.');await window.MapleFriends.disconnect();await activate(saved.values,saved.meta,'이전 장부로 전환 전 원본');}
    catch(error){announce(error.message,true);}
  }
  function download(snapshot,name){const bundle={...snapshot.data,weeklyDropRecovery:snapshot.weeklyDropRecovery||[],huntRecovery:snapshot.huntRecovery||[],huntJournal:snapshot.huntJournal||[]};const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,(key,value)=>key==='nexonApiKey'?undefined:value,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function renderArchives(){
    const select=$('account-local-history');if(!select)return;
    const selected=select.value;select.replaceChildren(new Option('전환 전 보관본 선택',''));
    try{Object.keys(localStorage).filter(key=>key.startsWith(ARCHIVE+loadedOwner+':')).sort().reverse().forEach(key=>{const row=read(key);select.add(new Option(new Date(row.createdAt).toLocaleString('ko-KR')+' · '+row.label,key));});}catch{}
    if([...select.options].some(o=>o.value===selected))select.value=selected;
  }
  async function history(beforeRevision){
    const ctx=context;if(!ctx||!valid(ctx)||busy)return;busy=true;render();
    try{
      const result=await window.MapleFriends.request('ledger-history',Number.isSafeInteger(beforeRevision)?{beforeRevision}:{});if(!valid(ctx))return;
      if(result.account!==ctx.account)throw new Error('보관본 계정이 일치하지 않습니다.');
      const list=$('account-server-history');if(!Number.isSafeInteger(beforeRevision))list.replaceChildren();list.querySelector('[data-more-history]')?.remove();
      for(const row of result.snapshots||[]){
        const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent=new Date(row.savedAt).toLocaleString('ko-KR')+' · 세대 '+row.revision+' JSON 백업';
        button.onclick=async()=>{try{if(!valid(ctx))return;const snapshot=await decrypt(row.payload,ctx);if(valid(ctx))download(snapshot,'mesobook-account-revision-'+row.revision+'.json');}catch(error){announce(error.message,true);}};
        list.append(button);
      }
      if(!list.children.length)list.textContent='아직 서버 세대 보관본이 없습니다.';
      if(result.nextBeforeRevision){const more=document.createElement('button');more.type='button';more.className='ghost';more.dataset.moreHistory='true';more.textContent='이전 세대 더 보기';more.onclick=()=>history(result.nextBeforeRevision);list.append(more);}
    }catch(error){if(valid(ctx))announce(error.message,true);}
    finally{if(valid(ctx)){busy=false;render();}}
  }
  function render(){
    if(!$('account-status'))return;
    const state=auth(),connected=!!state.connected,mine=connected&&loadedOwner==='friends:'+state.account;
    $('account-status').textContent=fatal||statusText||'로그인 상태를 확인하는 중…';$('account-status').classList.toggle('err',isError||!!fatal);
    $('account-login').hidden=connected;$('account-login').disabled=busy||!!state.finishing||!state.ready;
    $('account-logout').hidden=!connected;$('account-logout').disabled=busy;
    $('account-save').hidden=!mine;$('account-save').disabled=busy||!!pending||!context;
    $('account-pull').hidden=!connected;$('account-pull').disabled=busy;
    $('account-legacy').hidden=loadedOwner==='legacy';$('account-legacy').disabled=busy;
    $('account-history').hidden=!mine;$('account-history').disabled=busy;
    $('account-choice').hidden=!pending;
    if(pending){
      $('account-choice-current').textContent='이 기기: '+summary(bridge().snapshot().data);
      $('account-choice-remote').textContent=pending.snapshot?'넥슨 계정: '+summary(pending.snapshot.data):'넥슨 계정: 저장된 장부 없음';
      $('account-use-local').hidden=loadedOwner!=='legacy'&&!mine;
      $('account-use-local').disabled=busy;$('account-use-remote').disabled=busy;
      $('account-use-remote').textContent=localStorage.getItem(VAULT+'friends:'+state.account)?'이 계정의 기기 보관함 열기':'넥슨 계정 장부 열기';
    }
    document.querySelectorAll('.storage-badge').forEach(el=>{el.textContent=mine?'넥슨 계정 저장':loadedOwner==='legacy'?'브라우저 저장':'계정 장부 · 오프라인';el.title='기록은 이 기기에 먼저 저장되며, 연결한 계정에 암호화하여 동기화합니다.';});
    renderArchives();
  }
  function staleTab(){
    if(stale)return;stale=true;stop();
    const modal=document.createElement('dialog');modal.className='account-stale';
    const text=document.createElement('p');text.textContent='다른 탭에서 장부를 변경했습니다. 기록이 섞이지 않도록 이 탭의 저장을 중단했습니다. 새로 열어 현재 장부를 확인해 주세요.';
    const button=document.createElement('button');button.textContent='현재 장부로 새로 열기';button.onclick=()=>location.reload();
    modal.append(text,button);document.body.append(modal);modal.addEventListener('cancel',event=>event.preventDefault());modal.showModal();
  }
  window.MapleAccountSync=Object.freeze({
    beforeSave,changed,guard:checkOwner,
    blocksLegacy(){
      try{return !!fatal||meta.owner!=='legacy'||!!auth().connected||!!auth().finishing||!!sessionStorage.getItem('maple:friends:session');}catch{return true;}
    },
    canUseAccount(account){return !stale&&loadedOwner==='friends:'+account&&auth().account===account&&auth().connected&&!pending;},
    getState:()=>({owner:loadedOwner,connected:!!context,dirty:!!meta.dirty,pending:!!pending,busy,revision:meta.revision}),
    upload,pull,initialize
  });
  document.addEventListener('maple:friends-session',()=>{if(started){initialize();render();}});
  window.addEventListener('storage',event=>{if(event.key===null||(event.key==='mapleTracker.v2'&&loadedOwner!=='legacy')){staleTab();return;}if(event.key===META){try{if((read(META)||fresh()).owner!==loadedOwner)staleTab();}catch{staleTab();}}});
  document.addEventListener('DOMContentLoaded',()=>{
    started=true;if(!bridge()||!$('account-status'))return;
    $('account-login').onclick=()=>window.MapleFriends.connect('home').catch(error=>announce(error.message,true));
    $('account-logout').onclick=async()=>{try{bank();await window.MapleFriends.disconnect();}catch(error){announce(error.message,true);}};
    $('account-save').onclick=upload;$('account-pull').onclick=pull;$('account-legacy').onclick=legacy;
    $('account-use-local').onclick=useLocal;$('account-use-remote').onclick=()=>useRemote();$('account-history').onclick=history;
    $('account-local-download').onclick=()=>{try{const row=read($('account-local-history').value);if(!row||row.owner!==loadedOwner)return;download(bridge().snapshotFromStore(row.values),'mesobook-local-preserved-'+row.createdAt+'.json');}catch(error){announce('보관본을 읽지 못했습니다. '+error.message,true);}};
    initialize();render();
  });
})();
