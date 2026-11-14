/* 화면 테마만 저장합니다. 장부·계정·인증 저장소는 읽거나 변경하지 않습니다. */
(() => {
 'use strict';
 if(window.MapleThemeMode)return;
 const KEY='maple_ui_theme_v1',root=document.documentElement,system=matchMedia('(prefers-color-scheme:dark)'),small=matchMedia('(max-width:640px)');
 const valid=value=>['light','dark','system'].includes(value),labels={light:'밝게',dark:'어둡게',system:'시스템 설정'};
 let preference='light',control=null,trigger=null,panel=null,status=null;
 try{const saved=localStorage.getItem(KEY);if(valid(saved))preference=saved;}catch{}
 const resolved=()=>preference==='system'?(system.matches?'dark':'light'):preference;
 function apply(){
  root.dataset.mapleTheme=resolved();root.dataset.mapleThemePreference=preference;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved()==='dark'?'#1c202c':'#ffffff');
  if(trigger){trigger.setAttribute('aria-label','화면 테마 설정, 현재 '+labels[preference]);trigger.title='화면 테마: '+labels[preference];trigger.querySelector('.theme-mode-current').textContent=labels[preference];trigger.querySelector('svg').replaceChildren(...iconNodes(resolved()==='dark'?'moon':'sun'));}
  if(panel)for(const radio of panel.querySelectorAll('input'))radio.checked=radio.value===preference;
  document.dispatchEvent(new CustomEvent('maple:theme-change',{detail:{preference,resolved:resolved()}}));
 }
 function setPreference(value){
  if(!valid(value))return false;preference=value;let stored=true;
  try{localStorage.setItem(KEY,value);}catch{stored=false;}
  apply();if(status)status.textContent=stored?'이 기기에 적용합니다.':'현재 화면에 적용했습니다. 이 기기에서 설정을 저장하지 못했습니다.';return true;
 }
 function iconNodes(kind){
  const shapes=kind==='moon'?[['path',{d:'M20.9 13.2A9 9 0 0 1 10.8 3.1 9 9 0 1 0 20.9 13.2Z'}]]:kind==='system'?[['rect',{x:'3',y:'4',width:'18',height:'12',rx:'2'}],['path',{d:'M8 21h8M12 16v5'}]]:[['circle',{cx:'12',cy:'12',r:'4'}],['path',{d:'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5'}]];
  return shapes.map(([tag,attributes])=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,value);return node;});
 }
 function icon(kind){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('ui-icon');svg.append(...iconNodes(kind));return svg;}
 function close(returnFocus=false){if(!panel)return;panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus({preventScroll:true});}
 function place(){
  if(!control)return;close();const actions=document.querySelector('.workspace-header-actions'),brand=document.querySelector('.workspace-sidebar .workspace-brand'),topbar=document.querySelector('.topbar'),privacy=document.querySelector('.privacy-page>main');
  if(small.matches&&brand){if(brand.nextElementSibling!==control)brand.after(control);control.dataset.placement='drawer';}
  else if(actions){if(actions.firstElementChild!==control)actions.prepend(control);control.dataset.placement='header';}
  else if(topbar){if(control.parentElement!==topbar)topbar.append(control);control.dataset.placement='public';control.classList.add('theme-mode-public');}
  else if(privacy){if(control.parentElement!==privacy)privacy.prepend(control);control.dataset.placement='public';control.classList.add('theme-mode-public');}
 }
 function mount(){
  if(control||!document.querySelector('.workspace-header-actions,.topbar,.privacy-page>main'))return;
  control=document.createElement('div');control.className='theme-mode';
  trigger=document.createElement('button');trigger.type='button';trigger.className='ghost theme-mode-trigger';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','theme-mode-panel');trigger.setAttribute('aria-haspopup','dialog');trigger.append(icon('sun'));
  const label=document.createElement('span');label.className='theme-mode-label';label.textContent='화면 테마';
  const current=document.createElement('span');current.className='theme-mode-current';trigger.append(label,current);
  panel=document.createElement('div');panel.id='theme-mode-panel';panel.className='theme-mode-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','theme-mode-title');
  const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.id='theme-mode-title';legend.textContent='화면 테마';fieldset.append(legend);
  for(const value of ['light','dark','system']){
   const option=document.createElement('label'),radio=document.createElement('input'),text=document.createElement('span');radio.type='radio';radio.name='maple-theme-mode';radio.value=value;radio.id='theme-mode-'+value;text.textContent=labels[value];
   radio.addEventListener('change',()=>{if(radio.checked)setPreference(value);});option.append(radio,icon(value==='light'?'sun':value==='dark'?'moon':'system'),text);fieldset.append(option);
  }
  status=document.createElement('p');status.className='theme-mode-status';status.setAttribute('role','status');status.textContent='이 기기에 적용합니다.';
  panel.append(fieldset,status);control.append(trigger,panel);
  trigger.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('input:checked')?.focus();});
  trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();panel.hidden=false;trigger.setAttribute('aria-expanded','true');panel.querySelector('input:checked')?.focus();}});
  control.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();close(true);}});
  control.addEventListener('focusout',event=>{if(event.relatedTarget&&!control.contains(event.relatedTarget))close();});
  document.addEventListener('click',event=>{if(!control.contains(event.target))close();});
  small.addEventListener('change',place);document.addEventListener('workspace:page',place);place();apply();
 }
 system.addEventListener('change',()=>{if(preference==='system')apply();});
 window.addEventListener('storage',event=>{if(event.key!==KEY&&event.key!==null)return;try{const value=localStorage.getItem(KEY);preference=valid(value)?value:'light';}catch{preference='light';}apply();});
 window.MapleThemeMode=Object.freeze({setPreference,getState:()=>({preference,resolved:resolved()})});
 apply();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
