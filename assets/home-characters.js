/* 저장된 캐릭터 프로필을 홈에 표시합니다. API 호출이나 장부 저장은 하지 않습니다. */
(() => {
  'use strict';
  const masthead=document.querySelector('#page-home .home-desk-masthead');
  if(!masthead||document.getElementById('home-characters'))return;
  const host=document.createElement('section');host.id='home-characters';host.className='home-characters';host.setAttribute('aria-labelledby','home-characters-title');
  const head=document.createElement('div');head.className='home-characters-head';
  const heading=document.createElement('h3');heading.id='home-characters-title';heading.textContent='내 캐릭터';
  const count=document.createElement('span');count.className='home-characters-count';
  const manage=document.createElement('button');manage.type='button';manage.className='ghost home-characters-manage';manage.textContent='등록·관리';manage.addEventListener('click',()=>openPage('character'));
  head.append(heading,count,manage);
  const list=document.createElement('ul');list.className='home-character-list';list.setAttribute('aria-label','등록한 캐릭터');
  host.append(head,list);const reset=masthead.querySelector('.desk-reset');if(reset)reset.before(host);else masthead.append(host);
  let lastSignature='';
  function icon(){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('ui-icon');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','assets/ui-icons.svg#character');svg.append(use);return svg;
  }
  function imageURL(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    if(/^data:image\/(?:png|jpeg|gif|webp|svg\+xml)(?:;|,)/i.test(raw))return raw;
    try{const url=new URL(raw,document.baseURI);return url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))?url.href:'';}catch{return '';}
  }
  function rows(){
    const chars=typeof db!=='undefined'&&Array.isArray(db.chars)?db.chars:[];
    return chars.map(character=>({
      name:String(character?.name||'이름 없는 캐릭터'),
      world:String(character?.worldName||character?.world_name||character?.world||(character?.server==='challenger'?'과거 챌린저스':'본서버')),
      job:String(character?.characterClass||character?.character_class||character?.className||''),
      level:Number(character?.characterLevel||character?.character_level||character?.level||0),
      image:imageURL(character?.characterImage||character?.character_image||character?.image)
    }));
  }
  function card(row,index){
    const item=document.createElement('li');
    const button=document.createElement('button');button.type='button';button.className='home-character-card';button.dataset.characterIndex=String(index);button.setAttribute('aria-label',row.name+' 캐릭터 등록 정보 보기');button.addEventListener('click',()=>openPage('character'));
    const stage=document.createElement('span');stage.className='home-character-stage';
    const fallback=document.createElement('span');fallback.className='home-character-fallback';fallback.append(icon());
    const unavailable=document.createElement('small');unavailable.textContent='이미지 정보 없음';fallback.append(unavailable);stage.append(fallback);
    if(row.image){
      const image=document.createElement('img');image.src=row.image;image.alt='';image.width=176;image.height=176;image.decoding='async';image.referrerPolicy='no-referrer';
      image.addEventListener('error',()=>{image.remove();fallback.hidden=false;unavailable.textContent='이미지를 불러오지 못했어요';},{once:true});
      fallback.hidden=true;stage.append(image);
    }
    const name=document.createElement('strong');name.className='home-character-name';name.textContent=row.name;
    const world=document.createElement('span');world.className='home-character-world';world.textContent=row.world;
    const detail=document.createElement('small');detail.className='home-character-detail';detail.textContent=[Number.isFinite(row.level)&&row.level>0?'Lv.'+Math.floor(row.level):'',row.job].filter(Boolean).join(' · ')||'등록 정보에서 프로필 갱신';
    button.append(stage,name,world,detail);item.append(button);return item;
  }
  function empty(text='캐릭터를 등록하면 이곳에서 크게 볼 수 있어요.'){
    const item=document.createElement('li');item.className='home-characters-empty';item.append(icon());
    const copy=document.createElement('span');copy.textContent=text;item.append(copy);list.replaceChildren(item);
  }
  function render(){
    const chars=rows(),signature=JSON.stringify(chars);if(signature===lastSignature)return;lastSignature=signature;
    const focused=list.contains(document.activeElement)?document.activeElement?.dataset.characterIndex:null,scroll=list.scrollLeft;
    count.textContent=chars.length?chars.length+'명':'';host.dataset.count=String(chars.length);masthead.classList.toggle('has-registered-characters',chars.length>0);
    if(chars.length)list.replaceChildren(...chars.map(card));else empty();
    list.scrollLeft=scroll;
    if(focused!=null)list.querySelector('[data-character-index="'+focused+'"]')?.focus({preventScroll:true});
  }
  document.addEventListener('workspace:render',render);
  document.addEventListener('workspace:page',event=>{if(event.detail?.page==='home')render();});
  document.addEventListener('maple:account-ledger-changing',()=>{lastSignature='';host.dataset.count='0';count.textContent='';masthead.classList.remove('has-registered-characters');empty('장부를 전환하고 있습니다.');});
  window.MapleHomeCharacters=Object.freeze({render});render();
})();
