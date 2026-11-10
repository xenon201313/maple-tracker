/* 탐색·표시 전용입니다. 장부와 계정 저장소에는 쓰지 않습니다. */
(() => {
  'use strict';
  document.body.classList.add('maple-official-theme');
  const header=document.querySelector('.workspace-header');if(!header)return;
  const pageIcons={
    home:{symbol:'home'},character:{symbol:'character'},daily:{symbol:'daily'},
    boss:{item:'crystal-weekly.png'},monthlyboss:{item:'crystal-monthly.png'},dailyboss:{item:'crystal-daily.png'},
    profit:{symbol:'profit'},expense:{symbol:'expense'},stats:{symbol:'stats'},planner:{symbol:'target'},intro:{symbol:'intro'},patch:{symbol:'receipt'}
  };
  const mesoIcon={item:document.getElementById('logo-meso').src};
  function tabIcon(spec={symbol:'receipt'}){
    if(spec.item){
      const img=document.createElement('img');img.src=spec.item.startsWith('data:')?spec.item:'assets/'+spec.item;
      img.className='maple-tab-icon maple-tab-icon--item';img.alt='';img.setAttribute('aria-hidden','true');img.draggable=false;img.width=26;img.height=26;return img;
    }
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('ui-icon','maple-tab-icon');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','assets/ui-icons.svg?v=20261111-icons-2#'+spec.symbol);svg.append(use);return svg;
  }
  const bar=document.createElement('div');bar.className='maple-sitebar';
  const brand=document.createElement('a');brand.className='maple-site-brand';brand.href='?page=home';
  const icon=document.createElement('img');icon.src=document.getElementById('logo-meso').src;icon.alt='';
  const name=document.createElement('span');name.textContent='나만의 메계부';
  const tagline=document.createElement('small');tagline.textContent='모험의 수입과 지출을 한곳에';name.append(tagline);brand.append(icon,name);
  brand.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();openPage('home');});
  const nav=document.createElement('nav');nav.id='maple-top-nav';nav.setAttribute('aria-label','목적별 주요 메뉴');
  const groups=[
    ['내 기록',[['home','홈'],['character','캐릭터 등록'],['daily','재획 기록']]],
    ['보스',[['boss','주간 보스'],['monthlyboss','월간 보스'],['dailyboss','일간 보스']]],
    ['수입·지출',[['profit','손익 계산기'],['expense','지출 기록']]],
    ['통계·계획',[['stats','수익 통계'],['planner','자산·성장 계획']]],
    ['도움말',[['intro','사용 설명'],['patch','패치노트']]]
  ];
  const groupIcons=[{symbol:'daily'},pageIcons.boss,mesoIcon,{symbol:'stats'},{symbol:'intro'}];
  for(const [index,[label,routes]]of groups.entries()){
    const details=document.createElement('details');details.className='maple-nav-group';
    const summary=document.createElement('summary');summary.textContent=label;summary.prepend(tabIcon(groupIcons[index]));
    const menu=document.createElement('div');menu.className='maple-nav-links';
    for(const [page,label]of routes){
      const button=document.createElement('button');button.type='button';button.dataset.mapleRoute=page;button.textContent=label;button.prepend(tabIcon(pageIcons[page]));
      button.addEventListener('click',()=>{details.open=false;if(page==='patch'){summary.focus({preventScroll:true});window.MaplePatchNotes?.open();}else openPage(page);});menu.append(button);
    }
    details.append(summary,menu);nav.append(details);
    details.addEventListener('toggle',()=>{if(details.open)for(const other of nav.querySelectorAll('details'))if(other!==details)other.open=false;});
    details.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();details.open=false;summary.focus();}
      if(event.target===summary&&event.key==='ArrowDown'){event.preventDefault();details.open=true;menu.querySelector('button')?.focus();}
    });
  }
  document.addEventListener('click',event=>{if(!nav.contains(event.target))for(const details of nav.querySelectorAll('details'))details.open=false;});
  // focusout 시점의 activeElement는 일시적으로 body일 수 있습니다.
  // 메뉴 안으로 이동하는 클릭을 닫아 버리지 않고, 명확한 외부 초점 이동만 닫습니다.
  nav.addEventListener('focusout',event=>{if(event.relatedTarget&&!nav.contains(event.relatedTarget))for(const details of nav.querySelectorAll('details'))details.open=false;});
  bar.append(brand,nav);header.prepend(bar);
  const plannerIcons={investment:{symbol:'equipment'},settlement:{symbol:'package'},budget:mesoIcon,hunting:{symbol:'compare'},bossplan:{symbol:'clock'},symbol:{symbol:'symbol'}};
  const enhancementIcons={starforce:{item:'profit/starforce-scroll.png'},potential:{symbol:'cube'},soul_ether:{item:'drops/soul_ether_3.webp'},advanced_ability:{item:'profit/large-boss-honor.png'},legacy:{symbol:'daily'}};
  // img/svg를 바로 넣어 기존 강화 탭의 첫 span(이력 개수)을 그대로 유지합니다.
  for(const button of document.querySelectorAll('[data-planner-tool]'))button.prepend(tabIcon(plannerIcons[button.dataset.plannerTool]));
  for(const button of document.querySelectorAll('[data-enhancement-tab]'))button.prepend(tabIcon(enhancementIcons[button.dataset.enhancementTab]));
  for(const periodNav of document.querySelectorAll('.clarity-period-nav')){
    [...periodNav.querySelectorAll('button')].forEach((button,index)=>button.prepend(tabIcon(pageIcons[['boss','monthlyboss','dailyboss'][index]])));
  }
  const huntIcons=[pageIcons.daily,mesoIcon,{symbol:'receipt'}];
  [...document.querySelectorAll('.clarity-section-nav button')].forEach((button,index)=>button.prepend(tabIcon(huntIcons[index])));
  for(const button of document.querySelectorAll('[data-renewal-jump]'))button.prepend(tabIcon(button.dataset.renewalJump==='enhancement-title'?enhancementIcons.starforce:pageIcons.expense));
  const homeSectionIcons={monthly:{symbol:'receipt'},forecast:pageIcons.stats,prices:{symbol:'price-tag'},records:{symbol:'trophy'},backup:{symbol:'download'},guides:pageIcons.intro,tools:pageIcons.profit,example:{symbol:'compare'}};
  for(const [section,spec]of Object.entries(homeSectionIcons)){
    const heading=document.querySelector('#page-home [data-clarity-section="'+section+'"]>summary>span>strong');
    if(heading){heading.classList.add('maple-home-title');heading.prepend(tabIcon(spec));}
  }
  const bossHeading=document.getElementById('home-weekly-progress')?.closest('.card')?.querySelector('.home-section-head h2');
  if(bossHeading){bossHeading.classList.add('maple-home-title');bossHeading.prepend(tabIcon(pageIcons.boss));}
  const plannerMenu=document.querySelector('.tabs [data-page="planner"] .ui-icon use');if(plannerMenu)plannerMenu.setAttribute('href','assets/ui-icons.svg?v=20261111-icons-2#target');
  const patchMenu=document.querySelector('#patch-notes-open .ui-icon use');if(patchMenu)patchMenu.setAttribute('href','assets/ui-icons.svg?v=20261111-icons-2#receipt');
  function update(){
    const current=document.querySelector('.page.active')?.id.replace('page-','')||'home';
    for(const button of nav.querySelectorAll('button')){
      if(button.dataset.mapleRoute===current)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    for(const group of nav.querySelectorAll('details'))group.classList.toggle('is-current',!!group.querySelector('[aria-current=page]'));
  }
  document.addEventListener('workspace:page',()=>{for(const details of nav.querySelectorAll('details'))details.open=false;update();});update();
  const narrow=matchMedia('(max-width:900px)');narrow.addEventListener('change',()=>{for(const details of nav.querySelectorAll('details'))details.open=false;});
})();
