/* 탐색·표시 전용입니다. 장부와 계정 저장소에는 쓰지 않습니다. */
(() => {
  'use strict';
  document.body.classList.add('maple-official-theme');
  const header=document.querySelector('.workspace-header');if(!header)return;
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
  for(const [label,routes]of groups){
    const details=document.createElement('details');details.className='maple-nav-group';
    const summary=document.createElement('summary');summary.textContent=label;
    const menu=document.createElement('div');menu.className='maple-nav-links';
    for(const [page,label]of routes){
      const button=document.createElement('button');button.type='button';button.dataset.mapleRoute=page;button.textContent=label;
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
