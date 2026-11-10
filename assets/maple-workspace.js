/* 화면 안내와 초점 이동만 담당합니다. 장부·로그인·UI 저장소에 쓰지 않습니다. */
(() => {
  'use strict';
  const pages={
    home:{context:'내 모험의 기록과 정산'},
    character:{context:'캐릭터와 연결 방식 관리',note:'넥슨 로그인과 개인 API 키 중 한 가지 방식으로 연결할 수 있습니다. 연결 없이도 이름과 서버를 직접 등록할 수 있습니다.',href:'api/',link:'API 제공 범위'},
    daily:{context:'재획 회차와 메소·조각 수입',note:'획득한 조각과 판매한 조각은 구분합니다. 같은 판매 수익을 재획과 정산에 두 번 더하지 마세요.',href:'guide/hunt-income/',link:'조각 수익 계산 사례'},
    boss:{context:'주간 처치·결정석·드랍 정산',note:'결정석은 난이도와 파티 인원으로 계산합니다. 드랍 가격·수수료·분배는 확인한 조건을 직접 입력하세요.',href:'guide/boss-settlement/',link:'분배·주차 계산 기준'},
    monthlyboss:{context:'매월 1일 시작하는 보스 장부',note:'월간 보스 수익은 주간 합계와 구분합니다. 선택한 월의 완료 기록과 분배 조건을 확인하세요.',href:'guide/boss-settlement/',link:'기간별 합산 기준'},
    dailyboss:{context:'처치 완료와 결정석 판매를 따로 기록',note:'보스를 잡아도 판매 수입은 자동으로 늘지 않습니다. 실제로 판 결정석에만 판매 체크를 해 주세요.',href:'guide/boss-settlement/',link:'기록과 계산 사례'},
    profit:{context:'구입 비용과 판매 후 실수령 비교'},
    expense:{context:'구매 비용·확정한 강화 지출'},
    stats:{context:'저장한 기록으로 확인하는 결산',note:'손익 계산기의 미판매 결과물과 미확정 강화 환산액은 합계에서 제외합니다. 보스 드랍은 직접 입력한 정산 가격을 반영하며, 계획 예산은 별도로 관리합니다.',href:'guide/record-principles/',link:'합계에 포함되는 기록'},
    planner:{context:'기록에서 이어지는 자산·성장 계획'},
    intro:{context:'사용 방법과 계산 기준'}
  };
  for(const [name,page]of Object.entries(pages)){
    if(!page.note)continue;
    const host=document.getElementById('page-'+name);if(!host)continue;
    const note=document.createElement('div');note.className='page-context-note';
    const copy=document.createElement('span');copy.textContent=page.note;
    const link=document.createElement('a');link.href=page.href;link.textContent=page.link;
    note.append(copy,link);host.prepend(note);
  }
  // 자주 하는 기록과 확정 합계를 먼저 보이고, 추가 분석은 필요할 때 엽니다.
  // 기존 노드를 옮겨 이벤트·입력·계정 선택과 장부를 그대로 보존합니다.
  function foldSection(node,key,title,description){
    if(!node||node.closest('[data-clarity-section]'))return;
    const details=document.createElement('details');details.className='clarity-fold';details.dataset.claritySection=key;
    const summary=document.createElement('summary');
    const copy=document.createElement('span'),heading=document.createElement('strong'),hint=document.createElement('small');
    heading.textContent=title;hint.textContent=description;copy.append(heading,hint);summary.append(copy);
    const body=document.createElement('div');body.className='clarity-fold-body';
    node.before(details);details.append(summary,body);body.append(node);
    return details;
  }
  const home=document.getElementById('page-home');
  const folds=[
    ['#home-monthly-report','monthly','월간 결산','수입·지출 내역, 보고서 복사와 이미지 저장'],
    ['#home-automation','forecast','수익 흐름·예상 금액','최근 수입을 바탕으로 계산한 참고용 예측'],
    ['#home-price-history','prices','개인 시세 기록','내가 기록한 판매가와 드랍 가격'],
    ['#home-personal-records','records','누적·최고 기록','지금까지 쌓은 재획 기록 확인'],
    ['#home-backup','backup','백업·복원','장부 내려받기와 이전 보관본 확인']
  ];
  for(const [selector,key,title,description]of folds){
    const card=home?.querySelector(selector)?.closest('.card');
    const details=foldSection(card,key,title,description);
    if(details&&card.classList.contains('home-wide'))details.classList.add('home-wide');
  }
  foldSection(home?.querySelector('.journey-links'),'tools','정산·계획 도구','미정산, 장비 투자, 자금과 플레이 계획');
  foldSection(home?.querySelector('.home-source-note'),'example','계산 예제로 확인','수수료와 파티 분배를 직접 검산');
  foldSection(home?.querySelector('.home-support'),'guides','처음 사용·계산 가이드','시작 방법, 기록 기준, 패치 반영 안내');
  const title=document.getElementById('desk-title');if(title)title.textContent='오늘의 메소 기록장';
  const heroCopy=home?.querySelector('.desk-hero-copy>p:last-child');if(heroCopy)heroCopy.textContent='재획·보스 수입과 쓴 메소를 기록하세요.';
  const overview=home?.querySelector('.home-head h2');if(overview)overview.textContent='기록한 수익';
  const account=home?.querySelector('.home-account-panel'),primary=home?.querySelector('.home-primary-grid');
  if(account&&primary){
    const origin=document.createComment('계정 패널의 PC 위치');account.before(origin);
    const narrow=matchMedia('(max-width:700px)');
    const placeAccount=()=>{
      if(narrow.matches){if(primary.nextElementSibling!==account)primary.after(account);}
      else if(origin.nextSibling!==account)origin.after(account);
    };
    narrow.addEventListener('change',placeAccount);document.addEventListener('workspace:page',placeAccount);placeAccount();
  }
  const bossAction=home?.querySelector('.workspace-quick-actions [data-open-page="boss"]');
  if(bossAction){bossAction.querySelector('strong').textContent='보스 기록';bossAction.querySelector('small').textContent='처치·판매·드랍 확인';}
  for(const name of ['boss','monthlyboss','dailyboss']){
    const host=document.getElementById('page-'+name);if(!host)continue;
    const nav=document.createElement('nav');nav.className='clarity-period-nav';nav.setAttribute('aria-label','보스 기록 주기');
    for(const [page,label]of [['boss','주간 보스'],['monthlyboss','월간 보스'],['dailyboss','일간 보스']]){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      if(page===name)button.setAttribute('aria-current','page');button.addEventListener('click',()=>openPage(page));nav.append(button);
    }
    host.prepend(nav);
  }
  const navLabels=document.querySelectorAll('.tabs>.nav-group-label');
  for(const [i,label]of ['내 기록','보스 기록','판매·결산·계획','도움말'].entries())if(navLabels[i])navLabels[i].textContent=label;
  // 긴 재획 화면에서도 입력·조각 판매·내역을 곧바로 찾습니다.
  const hunt=document.getElementById('page-daily');
  if(hunt){
    const links=document.createElement('nav');links.className='clarity-section-nav';links.setAttribute('aria-label','재획 기록 영역');
    for(const [selector,label]of [['#in-date','재획 입력'],['#erda-settlement-preview','조각 판매 정산'],['#daily-record-list','저장한 내역']]){
      const target=hunt.querySelector(selector)?.closest('.card');if(!target)continue;
      const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent=label;
      button.addEventListener('click',()=>{target.tabIndex=-1;target.scrollIntoView({block:'start'});target.focus({preventScroll:true});});links.append(button);
    }
    hunt.prepend(links);
  }
  // 회복·도구 등 접힌 내용으로 이동할 때 초점이 숨지 않게 합니다.
  window.MapleWorkspaceReveal=function(target){
    const folds=[];for(let parent=target?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')folds.push(parent);
    for(const fold of folds.reverse()){window.MapleDisclosureMotion?.finishDetails(fold);fold.open=true;}
  };
  function updateContext(){
    const name=document.querySelector('.page.active')?.id.replace('page-','')||'home';
    const target=document.getElementById('workspace-context');if(target)target.textContent=pages[name]?.context||'내 모험의 기록과 정산';
  }
  for(const button of document.querySelectorAll('[data-renewal-jump]'))button.addEventListener('click',()=>{
    const target=document.getElementById(button.dataset.renewalJump);if(!target)return;
    window.MapleWorkspaceReveal(target);target.setAttribute('tabindex','-1');target.scrollIntoView({block:'start',behavior:'auto'});target.focus({preventScroll:true});
  });
  // 기존 이미지·텍스트의 의미는 유지하고 제목의 장식용 이모지만 걷어 냅니다.
  const decorative=/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u;
  for(const heading of document.querySelectorAll('.page> .card>h2,.stats-section-head h2')){
    const text=heading.firstChild;if(text?.nodeType===Node.TEXT_NODE)text.textContent=text.textContent.replace(decorative,'');
  }
  document.addEventListener('workspace:page',updateContext);updateContext();
})();
