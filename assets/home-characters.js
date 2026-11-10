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
  const portraitCache=new Map(),portraits=new Map();
  const snap=value=>Math.round(value*(devicePixelRatio||1))/(devicePixelRatio||1);
  function layoutPortrait(stage){
    const entry=portraits.get(stage);if(!entry||!entry.image.isConnected)return;
    const {image,bounds}=entry,style=getComputedStyle(stage),ratio=devicePixelRatio||1;
    const base=parseFloat(style.getPropertyValue('--portrait-base-size'))||176;
    const minimum=parseFloat(style.getPropertyValue('--portrait-min-height'))||212;
    const preferred=Math.ceil(base/Math.max(bounds.sourceWidth,bounds.sourceHeight)*3*ratio)/ratio;
    const maximum=Math.max(1,stage.clientWidth-16)/bounds.width;
    const scale=Math.min(preferred,Math.max(1/ratio,Math.floor(maximum*ratio)/ratio),maximum);
    const height=Math.max(minimum,Math.ceil(bounds.height*scale)+36);
    const left=snap((stage.clientWidth-bounds.width*scale)/2-bounds.x*scale);
    const top=snap(height-24-bounds.height*scale-bounds.y*scale);
    const signature=[scale,height,left,top].join(':');if(entry.signature===signature)return;entry.signature=signature;
    stage.style.height=height+'px';stage.dataset.portraitFit=bounds.trimmed?'trimmed':'full';
    Object.assign(image.style,{position:'absolute',width:bounds.sourceWidth*scale+'px',height:bounds.sourceHeight*scale+'px',left:left+'px',top:top+'px'});
  }
  const portraitResize=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{for(const {target}of entries)layoutPortrait(target);}):null;
  function alphaBounds(image){
    const width=image.naturalWidth,height=image.naturalHeight;
    if(!width||!height||width*height>4194304)throw new Error('이미지 크기 측정 범위 초과');
    // 원본은 다시 그려 저장하지 않고, 투명 여백의 경계만 읽습니다.
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,width,height).data;
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    canvas.width=canvas.height=0;
    if(right<left)return {x:0,y:0,width,height,sourceWidth:width,sourceHeight:height,trimmed:false};
    left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(width-1,right+2);bottom=Math.min(height-1,bottom+2);
    return {x:left,y:top,width:right-left+1,height:bottom-top+1,sourceWidth:width,sourceHeight:height,trimmed:true};
  }
  function measurePortrait(image){
    const url=image.currentSrc||image.src;if(portraitCache.has(url))return portraitCache.get(url);
    const task=(async()=>{
      try{
        if(url.startsWith('data:')||new URL(url).origin===location.origin)return alphaBounds(image);
        // 별도 CORS 확인용 이미지를 써서 기존에 정상 표시되던 이미지를 보호합니다.
        const probe=new Image();probe.crossOrigin='anonymous';probe.referrerPolicy='no-referrer';
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{probe.src='';reject(new Error('이미지 측정 시간 초과'));},4500);probe.onload=()=>{clearTimeout(timer);resolve();};probe.onerror=()=>{clearTimeout(timer);reject(new Error('이미지 측정 불가'));};probe.src=url;});
        return alphaBounds(probe);
      }catch{
        return {x:0,y:0,width:image.naturalWidth,height:image.naturalHeight,sourceWidth:image.naturalWidth,sourceHeight:image.naturalHeight,trimmed:false};
      }
    })();
    if(portraitCache.size>=64)portraitCache.delete(portraitCache.keys().next().value);
    portraitCache.set(url,task);return task;
  }
  function resetPortraits(){portraitResize?.disconnect();portraits.clear();}
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
      stage.classList.add('home-character-stage--portrait');
      const image=document.createElement('img');image.alt='';image.width=176;image.height=176;image.decoding='async';image.referrerPolicy='no-referrer';
      image.addEventListener('load',async()=>{const bounds=await measurePortrait(image);if(!image.isConnected||!bounds.sourceWidth||!bounds.sourceHeight)return;portraits.set(stage,{image,bounds});layoutPortrait(stage);portraitResize?.observe(stage);},{once:true});
      image.addEventListener('error',()=>{image.remove();fallback.hidden=false;unavailable.textContent='이미지를 불러오지 못했어요';},{once:true});
      fallback.hidden=true;stage.append(image);image.src=row.image;
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
    resetPortraits();
    const focused=list.contains(document.activeElement)?document.activeElement?.dataset.characterIndex:null,scroll=list.scrollLeft;
    count.textContent=chars.length?chars.length+'명':'';host.dataset.count=String(chars.length);masthead.classList.toggle('has-registered-characters',chars.length>0);
    if(chars.length)list.replaceChildren(...chars.map(card));else empty();
    list.scrollLeft=scroll;
    if(focused!=null)list.querySelector('[data-character-index="'+focused+'"]')?.focus({preventScroll:true});
  }
  document.addEventListener('workspace:render',render);
  document.addEventListener('workspace:page',event=>{if(event.detail?.page==='home')render();});
  document.addEventListener('maple:account-ledger-changing',()=>{lastSignature='';resetPortraits();portraitCache.clear();host.dataset.count='0';count.textContent='';masthead.classList.remove('has-registered-characters');empty('장부를 전환하고 있습니다.');});
  window.MapleHomeCharacters=Object.freeze({render});render();
})();
