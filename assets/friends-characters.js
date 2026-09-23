/* 넥슨 로그인으로 동의한 캐릭터 목록과 보스 완료 기록만 조회합니다. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), bridge=()=>window.MapleFriendsCharacterBridge;
  let running=null, rows=[], generation=0;
  const auth=()=>window.MapleFriends?.getState()||{};
  const available=()=>auth().connected&&window.MapleAccountSync?.canUseAccount(auth().account);
  function status(text,error=false){$('friends-characters-status').textContent=text;$('friends-characters-status').classList.toggle('err',error);}
  function controls(){
    if(!$('friends-characters-load'))return;
    $('friends-characters-load').disabled=!!running;
    $('friends-scheduler-load').disabled=!!running;
  }
  async function run(work){
    if(running)return;
    if(!available()){status('홈에서 넥슨 로그인과 사용할 장부 선택을 먼저 완료해 주세요.',true);return;}
    const account=auth().account,seq=generation,controller=new AbortController();running=controller;controls();
    const guard=()=>{controller.signal.throwIfAborted();if(seq!==generation||auth().account!==account||!available())throw new Error('계정이 변경되었습니다. 현재 장부에 반영하지 않았습니다.');};
    try{await work(guard,controller.signal);}
    catch(error){status(controller.signal.aborted?'조회가 중단되었습니다. 기존 기록은 유지됩니다.':error.message,true);}
    finally{if(running===controller)running=null;controls();}
  }
  function renderRows(){
    const list=$('friends-characters-list');list.replaceChildren();
    rows.forEach(row=>{
      const line=document.createElement('div');line.className='friends-character-row';
      const label=document.createElement('span');label.textContent=row.character_name+' · '+row.world_name+' · '+row.character_class+' · Lv.'+row.character_level;
      const button=document.createElement('button');button.type='button';button.className='ghost';
      button.textContent=bridge().registered().some(c=>c.ocid===row.ocid)?'등록 정보 갱신':'장부에 추가';
      const account=auth().account;
      button.onclick=()=>{try{if(!available()||account!==auth().account)throw new Error('홈에서 사용할 계정 장부를 확인해 주세요.');bridge().add(row);status(row.character_name+' 캐릭터를 반영했습니다.');renderRows();}catch(error){status(error.message,true);}};
      line.append(label,button);list.append(line);
    });
  }
  async function list(){return run(async(guard,signal)=>{
    status('본인 캐릭터를 확인하는 중…');
    const result=await window.MapleFriends.request('character-list',{},signal);guard();
    if(!Array.isArray(result.account_list))throw new Error('캐릭터 목록 형식이 올바르지 않습니다.');
    rows=[...new Map(result.account_list.flatMap(account=>Array.isArray(account.character_list)?account.character_list:[]).filter(row=>typeof row.ocid==='string'&&row.ocid&&typeof row.character_name==='string'&&row.character_name).map(row=>[row.ocid,row])).values()];
    renderRows();status('캐릭터 '+rows.length+'개 · 사용할 캐릭터만 장부에 추가해 주세요.');
  });}
  async function scheduler(){return run(async(guard,signal)=>{
    const own=await window.MapleFriends.request('character-list',{},signal);guard();
    if(!Array.isArray(own.account_list))throw new Error('본인 캐릭터 정보를 확인하지 못했습니다.');
    const ids=new Set(own.account_list.flatMap(a=>a.character_list||[]).map(c=>c.ocid));
    const chars=bridge().registered().filter(c=>c.ocid&&ids.has(c.ocid));
    if(!chars.length){status('내 캐릭터 조회에서 캐릭터를 먼저 등록해 주세요.');return;}
    const completed=[],failed=[];
    for(const char of chars){
      guard();status(char.name+' 보스 완료 기록 조회 중…');
      try{const data=await window.MapleFriends.request('scheduler',{ocid:char.ocid},signal);guard();completed.push({ocid:char.ocid,data});}
      catch(error){guard();failed.push(char.name+': '+error.message);}
    }
    guard();const result=bridge().scheduler(completed);
    status(completed.length+'개 캐릭터 갱신 · 보스 완료 '+result.added+'건 추가'+(failed.length?' · 조회 실패 '+failed.join(' / '):'')+' · 기존 체크와 드랍 기록은 유지했습니다.',!!failed.length);
  });}
  document.addEventListener('maple:friends-session',()=>{generation++;running?.abort();rows=[];$('friends-characters-list')?.replaceChildren();controls();});
  document.addEventListener('maple:account-ledger-changing',()=>{generation++;running?.abort();});
  document.addEventListener('DOMContentLoaded',()=>{if(!bridge())return;$('friends-characters-load').onclick=list;$('friends-scheduler-load').onclick=scheduler;controls();});
})();
