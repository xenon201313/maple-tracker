/* 표시와 탐색만 담당합니다. 장부·계정·설정 저장소를 쓰지 않습니다. */
(() => {
  'use strict';
  const tools = [
    {name:'장부 요약',group:'장부',page:'home',description:'오늘 기록과 수익 흐름 확인',words:'홈 오늘 데스크 대시보드'},
    {name:'캐릭터 등록',group:'장부',page:'character',description:'캐릭터와 API 연결 관리',words:'넥슨 연동 프로필'},
    {name:'재획 기록',group:'장부',page:'daily',description:'재획 메소와 솔 에르다 조각 기록',words:'사냥 수입 일일'},
    {name:'주간 보스',group:'보스',page:'boss',description:'주간 처치와 결정석·드랍 기록',words:'체크 파티 분배'},
    {name:'월간 보스',group:'보스',page:'monthlyboss',description:'월간 처치와 결정석 기록',words:'검은마법사 체크'},
    {name:'일간 보스',group:'보스',page:'dailyboss',description:'일간 처치와 결정석 기록',words:'체크 매일'},
    {name:'손익 계산기',group:'수익과 자산',page:'profit',description:'구입 비용과 실제 판매 수익 비교',words:'원더베리 로얄스타일 애플 판매'},
    {name:'지출 기록',group:'수익과 자산',page:'expense',description:'구매·강화·소울 에테르·어빌리티 비용',words:'스타포스 잠재 큐브 메소 명성치 훈장'},
    {name:'통계',group:'수익과 자산',page:'stats',description:'기간별 합계와 목표 진행 확인',words:'수익 요약 그래프 결산'},
    {name:'장비 투자 장부',group:'자산·성장 계획',page:'planner',tool:'investment',description:'확정 지출을 장비별로 연결',words:'강화 장비 예산 누적'},
    {name:'미정산함',group:'자산·성장 계획',page:'planner',tool:'settlement',description:'부분 판매와 파티 지급 상태 관리',words:'드랍 미판매 미지급 분배 정산'},
    {name:'자금·목표 계획',group:'자산·성장 계획',page:'planner',tool:'budget',description:'기록 기준 잔액·준비금·복수 목표',words:'자금 예산 이동 조정'},
    {name:'재획 효율 비교',group:'자산·성장 계획',page:'planner',tool:'hunting',description:'사냥터·시간·소모품 조건 비교',words:'경험치 순수익 시간당 버프'},
    {name:'보스 시간 계획',group:'자산·성장 계획',page:'planner',tool:'bossplan',description:'가능한 시간에 맞는 보스 조합',words:'일정 결정석 추천 계획'},
    {name:'심볼 예산',group:'자산·성장 계획',page:'planner',tool:'symbol',description:'장착 심볼 조회와 목표 비용 계획',words:'아케인 어센틱 강화 성장'},
    {name:'계정·저장',group:'보관과 안내',action:'account',description:'넥슨 로그인과 계정 장부 선택',words:'로그인 동기화 클라우드'},
    {name:'백업·복원',group:'보관과 안내',action:'backup',description:'JSON 백업과 기존 보관본 확인',words:'다운로드 복구 저장'},
    {name:'사용 설명',group:'보관과 안내',page:'intro',description:'기록 방식과 계산 기준 안내',words:'도움말 시작 가이드'}
  ];
  const dialog=document.getElementById('desk-search-dialog'),input=document.getElementById('desk-search-input'),results=document.getElementById('desk-search-results');
  const fold=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
  function go(route){
    if(route.action){
      openPage('home');
      const target=document.getElementById(route.action==='account'?'account-title':'home-backup');
      if(target){target.setAttribute('tabindex','-1');target.scrollIntoView({block:'start',behavior:'auto'});target.focus({preventScroll:true});}
    }else if(route.tool)window.MapleLedgerPlanner.open(route.tool);
    else openPage(route.page);
  }
  function renderResults(){
    const query=fold(input.value),matches=tools.filter(tool=>!query||fold([tool.name,tool.description,tool.words,tool.group].join(' ')).includes(query));
    results.replaceChildren();
    for(const tool of matches){
      const button=document.createElement('button');button.type='button';button.className='desk-search-result';
      const title=document.createElement('strong');title.textContent=tool.name;
      const detail=document.createElement('span');detail.textContent=tool.description;
      const group=document.createElement('small');group.textContent=tool.group;
      button.append(title,detail,group);button.addEventListener('click',()=>{dialog.close();go(tool);});results.append(button);
    }
    document.getElementById('desk-search-count').textContent=matches.length?matches.length+'개 도구':'찾는 도구가 없습니다. 재획, 정산, 심볼처럼 짧은 이름으로 검색해 주세요.';
  }
  function showSearch(){if(dialog.open)return;input.value='';renderResults();dialog.showModal();input.focus();}
  document.querySelectorAll('[data-desk-search]').forEach(button=>button.addEventListener('click',showSearch));
  document.querySelector('[data-desk-close]').addEventListener('click',()=>dialog.close());
  document.querySelector('[data-desk-account]').addEventListener('click',()=>go({action:'account'}));
  input.addEventListener('input',renderResults);
  input.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();const buttons=[...results.querySelectorAll('button')];(event.key==='ArrowDown'?buttons[0]:buttons.at(-1))?.focus();});
  results.addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const buttons=[...results.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(index<0)return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();
  });
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  // 검색 입력의 기본 Esc(내용 지우기)보다 대화상자 닫기를 우선합니다.
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.isComposing&&event.key.toLowerCase()==='k'){if(document.querySelector('dialog[open]:not(#desk-search-dialog),.guide-modal.open'))return;event.preventDefault();dialog.open?dialog.close():showSearch();}});
  document.querySelectorAll('[data-desk-page],[data-desk-tool]').forEach(link=>link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();go({page:link.dataset.deskPage,tool:link.dataset.deskTool});}));
  function renderDesk(){
    const host=document.getElementById('desk-record-status');if(!host)return;
    const date=todayStr(),week=currentWeekKey();
    document.getElementById('desk-date').textContent=date+' 기록장';
    document.getElementById('desk-week').textContent=fmtWeekRange(week);
    const saved=db.records[date];
    const sessions=saved!=null&&(!Array.isArray(saved.sessions)||saved.sessions.length)?normalizeRecord(saved).sessions.filter(row=>row.kind==='hunt'):[];
    const checks=db.chars.reduce((sum,c)=>sum+Object.keys(c.bossWeeks?.[week]||{}).filter(key=>Object.hasOwn(BOSS_MAP,key)).length,0);
    const trades=(db.planner?.trades||[]).filter(row=>!row.deletedAt);let pending=0,review=0;
    for(const trade of trades){try{const totals=MapleLedgerFinance.tradeTotals(trade,{allowOversold:true});if(totals.status!=='정산 완료')pending++;if(totals.quantityConflict)review++;}catch{pending++;review++;}}
    const items=[
      {label:'오늘 재획',value:sessions.length?sessions.length+'건 기록':'아직 기록 없음',detail:date+'에 저장한 재획 회차',page:'daily'},
      {label:'이번 주 보스',value:checks?checks+'건 체크됨':'아직 체크 없음',detail:'등록 캐릭터 '+db.chars.length+'명 / 주간 체크 기준',page:'boss'},
      {label:'미정산함',value:pending?pending+'건 확인 필요':'미정산 기록 없음',detail:review?review+'건은 수량·입력 확인 필요':'정산함에 등록한 아이템 기준',tool:'settlement'}
    ];
    const list=document.createElement('div');list.className='desk-record-list';
    for(const item of items){const button=document.createElement('button');button.type='button';button.className='desk-record-link';const label=document.createElement('span');label.textContent=item.label;const value=document.createElement('strong');value.textContent=item.value;const detail=document.createElement('small');detail.textContent=item.detail;button.append(label,value,detail);button.addEventListener('click',()=>go(item));list.append(button);}
    host.replaceChildren(list);
    const route=!db.chars.length?{page:'character'}:!sessions.length?{page:'daily'}:pending?{tool:'settlement'}:{page:'stats'};
    const label=!db.chars.length?'캐릭터 등록':!sessions.length?'재획 기록 열기':pending?'미정산함 열기':'전체 통계 보기';
    document.getElementById('desk-next-copy').textContent=!db.chars.length?'보스 기록을 시작하려면 캐릭터를 등록해 주세요. 재획은 로그인 없이 기록할 수 있습니다.':!sessions.length?'재획을 했다면 오늘의 메소와 조각을 남겨 보세요.':pending?'판매한 아이템이 있다면 남은 수량과 파티 분배를 확인해 주세요.':'오늘 남긴 기록을 통계에서 확인해 보세요.';
    const button=document.getElementById('desk-next-action');button.disabled=false;button.textContent=label;button.onclick=()=>go(route);
  }
  document.addEventListener('workspace:render',renderDesk);
  document.addEventListener('workspace:page',event=>{if(event.detail.page==='home')renderDesk();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderDesk();});
  document.addEventListener('maple:account-ledger-changing',()=>{document.getElementById('desk-record-status').replaceChildren();document.getElementById('desk-next-copy').textContent='장부 전환 중입니다.';document.getElementById('desk-next-action').disabled=true;});
  renderDesk();
})();
