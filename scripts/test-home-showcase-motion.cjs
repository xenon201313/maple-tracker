// 격리된 합성 장부로 캐릭터 표시와 실제 슬라이드·초점·기록 보존을 확인합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),{fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.tools/home-showcase-20261111');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data));});
async function samples(locator){return locator.evaluate(async el=>{const heights=[];const start=performance.now();do{heights.push(el.getBoundingClientRect().height);await new Promise(requestAnimationFrame);}while(performance.now()-start<340);return heights;});}
function grew(values,label){assert(values.at(-1)>values[0]+2,label+' grows '+JSON.stringify(values));assert(values.some(value=>value>values[0]+1&&value<values.at(-1)-1),label+' has intermediate height '+JSON.stringify(values));}
function shrank(values,label){assert(values[0]>values.at(-1)+2,label+' shrinks '+JSON.stringify(values));assert(values.some(value=>value<values[0]-1&&value>values.at(-1)+1),label+' has intermediate height '+JSON.stringify(values));}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul',reducedMotion:'no-preference'});await fixtureDismissPatchNotes(context);
  await context.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('data:')?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.home-characters-empty').count(),1);
  await page.locator('.home-characters-manage').click();assert.equal(await page.locator('#page-character').evaluate(el=>el.classList.contains('active')),true);
  await page.evaluate(()=>{
   db.chars=[normalizeChar({name:'캐릭터 표시 검증',server:'main',worldName:'크로아',characterClass:'메카닉',characterLevel:296,characterImage:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Cpath fill="%23a54b16" d="M24 16h48v64H24z"/%3E%3C/svg%3E'})];
   openPage('home');renderAll();
  });
  const before=await page.evaluate(()=>JSON.stringify(db));
  assert.equal(await page.locator('.home-character-card').count(),1);assert.match(await page.locator('.home-character-card').innerText(),/Lv.296.*메카닉/);
  await page.waitForFunction(()=>document.querySelector('.home-character-stage')?.dataset.portraitFit==='trimmed');
  assert(await page.locator('.home-character-stage>img').evaluate(img=>img.getBoundingClientRect().width>176),'portrait pixels are enlarged after removing transparent margins');
  // 계정 안내가 길어져도 왼쪽 배너와 빠른 기록 버튼은 늘어나지 않습니다.
  const heroHeight=await page.locator('.home-launchpad-main').evaluate(el=>el.getBoundingClientRect().height);
  await page.evaluate(()=>{const choice=document.getElementById('account-choice');choice.hidden=false;document.getElementById('account-choice-current').textContent='계정 장부 선택 안내 '.repeat(45);});
  assert.equal(await page.locator('.home-launchpad-main').evaluate(el=>el.getBoundingClientRect().height),heroHeight);
  assert(await page.locator('.workspace-quick-actions').evaluate(el=>el.getBoundingClientRect().height)<110);
  await page.evaluate(()=>{document.getElementById('account-choice').hidden=true;});
  const fold=page.locator('[data-clarity-section="monthly"]'),summary=fold.locator(':scope>summary');
  await summary.click();assert.equal(await fold.evaluate(el=>el.open),true);grew(await samples(fold),'native opening');
  await summary.click();assert.equal(await fold.evaluate(el=>el.open),false);shrank(await samples(fold),'native closing');
  await summary.click();await summary.click();await summary.click();await page.waitForFunction(()=>!document.querySelector('[data-clarity-section="monthly"]').classList.contains('maple-disclosure-slide'));assert.equal(await fold.evaluate(el=>el.open),true);
  await summary.focus();await page.keyboard.press('Enter');assert.equal(await fold.evaluate(el=>el.open),false);
  await page.evaluate(()=>{const target=document.getElementById('home-monthly-report');MapleWorkspaceReveal(target);target.focus();});
  assert.equal(await fold.evaluate(el=>el.open&&!el.classList.contains('maple-disclosure-slide')),true,'programmatic reveal stays immediate');
  await page.evaluate(()=>openPage('boss'));
  const disclosure=page.locator('.page.active .character-disclosure').first(),panel=page.locator('.page.active .bosslist').first();
  if(await panel.evaluate(el=>el.classList.contains('open'))){await disclosure.click();await page.waitForFunction(()=>!document.querySelector('.page.active .bosslist').getAnimations().length);}
  await disclosure.click();assert.equal(await disclosure.getAttribute('aria-expanded'),'true');grew(await samples(panel),'boss opening');
  await disclosure.click();assert.equal(await disclosure.getAttribute('aria-expanded'),'false');shrank(await samples(panel),'boss closing');assert.equal(await panel.evaluate(el=>el.inert),false);
  await disclosure.click();await disclosure.click();await disclosure.click();await page.waitForFunction(()=>!document.querySelector('.page.active .bosslist').getAnimations().length);assert.equal(await panel.evaluate(el=>el.classList.contains('open')),true);
  await disclosure.click();await page.evaluate(()=>renderAll());await page.waitForFunction(()=>!document.querySelector('.page.active .bosslist').getAnimations().length);
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>openPage('home'));
  await fold.evaluate(el=>el.open=false);await summary.click();assert.equal(await fold.evaluate(el=>el.open&&!el.classList.contains('maple-disclosure-slide')),true,'reduced motion opens immediately');
  await page.evaluate(()=>openPage('boss'));await page.locator('.page.active .character-disclosure').first().click();assert.equal(await page.locator('.page.active .bosslist').first().evaluate(el=>el.getAnimations().length),0);
  await page.evaluate(()=>openPage('home'));
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before,'display and movement never change the synthetic ledger');
  await page.evaluate(()=>{db.chars=Array.from({length:12},(_,i)=>normalizeChar({name:'검증 캐릭터 '+(i+1),server:'main',worldName:'크로아'}));renderAll();});
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:width<700?844:1000});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow '+width);
   assert.equal(await page.locator('.home-character-card').count(),12);
   assert(await page.locator('.home-character-list').evaluate(el=>el.scrollWidth>el.clientWidth),'many characters stay horizontally scrollable '+width);
   const imageSize=await page.locator('.home-character-stage').first().evaluate(el=>el.getBoundingClientRect().height);assert(imageSize>=148);
   if([390,1440].includes(width)){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'home-'+width+'.png')});}
  }
  await page.evaluate(()=>{db.chars=[normalizeChar({name:'이미지 오류 검증',server:'main',characterImage:location.origin+'/missing.png'})];renderAll();});
  await page.waitForFunction(()=>!document.querySelector('.home-character-stage img'));assert.equal(await page.locator('.home-character-fallback').isVisible(),true);
  assert.deepEqual(errors,[]);await context.close();console.log('홈 캐릭터·프로필·이미지 오류·긴 계정 안내·4개 화면폭·실제 열기/닫기 슬라이드·연타·키보드·리렌더·모션 줄이기·장부 보존 통과');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
