/* 표시 전용. open/aria 상태와 기존 장부·계정 저장 방식은 바꾸지 않습니다. */
(() => {
 'use strict';
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const nativeSlide=CSS.supports('interpolate-size','allow-keywords')&&CSS.supports('selector(::details-content)')&&CSS.supports('transition-behavior','allow-discrete');
 const detailsTimers=new Map(),panels=new Map();
 function finishDetails(details){
  clearTimeout(detailsTimers.get(details));detailsTimers.delete(details);details.classList.remove('maple-disclosure-slide');
 }
 document.addEventListener('click',event=>{
  if(reduced.matches||!nativeSlide||event.defaultPrevented||event.button!==0)return;
  const summary=event.target.closest?.('summary'),details=summary?.parentElement;
  if(details?.tagName!=='DETAILS'||!details.closest('.page')||details.closest('dialog'))return;
  if(event.target.closest('a,button,input,select,textarea'))return;
  clearTimeout(detailsTimers.get(details));
  details.classList.add('maple-disclosure-slide');
  // 현재 높이를 먼저 확정하고, 기본 클릭 처리로 열림 상태를 즉시 바꿉니다.
  void details.offsetHeight;
  detailsTimers.set(details,setTimeout(()=>finishDetails(details),300));
 },true);
 function clearPanel(panel){
  const state=panels.get(panel);if(!state)return;
  panels.delete(panel);state.animation.onfinish=null;state.animation.oncancel=null;state.animation.cancel();
  panel.style.display=state.display;panel.style.overflow=state.overflow;panel.inert=state.inert;
 }
 function measure(panel){return reduced.matches?0:panel.getBoundingClientRect().height;}
 function slidePanel(panel,previousHeight,expanded){
  clearPanel(panel);
  if(reduced.matches||!panel.animate)return;
  const state={display:panel.style.display,overflow:panel.style.overflow,inert:panel.inert};
  panel.style.display='block';panel.style.overflow='clip';panel.inert=!expanded;
  const target=expanded?panel.getBoundingClientRect().height:0;
  if(Math.abs(previousHeight-target)<1){panel.style.display=state.display;panel.style.overflow=state.overflow;panel.inert=state.inert;return;}
  try{
   state.animation=panel.animate([{height:previousHeight+'px'},{height:target+'px'}],{duration:240,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
   panels.set(panel,state);state.animation.onfinish=()=>clearPanel(panel);state.animation.oncancel=()=>clearPanel(panel);
  }catch{
   panel.style.display=state.display;panel.style.overflow=state.overflow;panel.inert=state.inert;
  }
 }
 reduced.addEventListener('change',()=>{for(const details of [...detailsTimers.keys()])finishDetails(details);for(const panel of [...panels.keys()])clearPanel(panel);});
 window.MapleDisclosureMotion={finishDetails,measure,slidePanel};
})();
