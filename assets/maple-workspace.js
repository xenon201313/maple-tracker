/* 화면 안내와 초점 이동만 담당합니다. 장부·로그인·UI 저장소에 쓰지 않습니다. */
(() => {
  'use strict';
  const pages={
    home:{context:'내 모험의 기록과 정산'},
    character:{context:'캐릭터와 연결 방식 관리',note:'넥슨 로그인과 개인 API 키 중 한 가지 방식으로 연결할 수 있습니다. 연결 없이도 이름과 서버를 직접 등록할 수 있습니다.',href:'api/',link:'API 제공 범위'},
    daily:{context:'재획 회차와 메소·조각 수입',note:'획득한 조각과 판매한 조각은 구분합니다. 같은 판매 수익을 재획과 정산에 두 번 더하지 마세요.',href:'guide/hunt-income/',link:'조각 수익 계산 사례'},
    boss:{context:'주간 처치·결정석·드랍 정산',note:'결정석은 난이도와 파티 인원으로 계산합니다. 드랍 가격·수수료·분배는 확인한 조건을 직접 입력하세요.',href:'guide/boss-settlement/',link:'분배·주차 계산 기준'},
    monthlyboss:{context:'매월 1일 시작하는 보스 장부',note:'월간 보스 수익은 주간 합계와 구분합니다. 선택한 월의 완료 기록과 분배 조건을 확인하세요.',href:'guide/boss-settlement/',link:'기간별 합산 기준'},
    dailyboss:{context:'매일의 처치와 결정석 수입',note:'선택한 날짜의 처치와 결정석 수입을 기록합니다. 과거 날짜는 해당 날짜로 이동해 확인할 수 있습니다.',href:'guide/boss-settlement/',link:'기록과 계산 사례'},
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
  function updateContext(){
    const name=document.querySelector('.page.active')?.id.replace('page-','')||'home';
    const target=document.getElementById('workspace-context');if(target)target.textContent=pages[name]?.context||'내 모험의 기록과 정산';
  }
  for(const button of document.querySelectorAll('[data-renewal-jump]'))button.addEventListener('click',()=>{
    const target=document.getElementById(button.dataset.renewalJump);if(!target)return;
    target.setAttribute('tabindex','-1');target.scrollIntoView({block:'start',behavior:'auto'});target.focus({preventScroll:true});
  });
  // 기존 이미지·텍스트의 의미는 유지하고 제목의 장식용 이모지만 걷어 냅니다.
  const decorative=/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u;
  for(const heading of document.querySelectorAll('.page> .card>h2,.stats-section-head h2')){
    const text=heading.firstChild;if(text?.nodeType===Node.TEXT_NODE)text.textContent=text.textContent.replace(decorative,'');
  }
  document.addEventListener('workspace:page',updateContext);updateContext();
})();
