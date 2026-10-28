// 합성 계정 상태만 사용해 첫 화면의 로그인 접근성을 확인합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.tools','account-login');fs.mkdirSync(output,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data));});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await fixtureDismissPatchNotes(context);
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.evaluate(()=>document.fonts.ready);
  const baseline=await page.evaluate(()=>localStorage.getItem('mapleTracker.v2'));
  for(const [width,height]of [[320,844],[390,844],[768,1000],[1440,1000]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>{openPage('home');window.scrollTo(0,0);});
   assert.equal(await page.locator('#account-title').count(),1,'계정 영역은 한 곳만 유지');
   const layout=await page.evaluate(()=>{const mast=document.querySelector('.home-desk-masthead').getBoundingClientRect(),panel=document.querySelector('.home-account-panel').getBoundingClientRect(),actions=document.querySelector('.workspace-quick-actions').getBoundingClientRect(),header=document.querySelector('[data-desk-account]').getBoundingClientRect();return {mastBottom:mast.bottom,panelTop:panel.top,panelWidth:panel.width,actionsTop:actions.top,panelBottom:panel.bottom,headerTop:header.top,headerBottom:header.bottom,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};});
   assert.equal(layout.overflow,false,width+' 가로 넘침 없음');assert(layout.panelTop>=layout.mastBottom&&layout.panelBottom<=layout.actionsTop,width+' 첫 카드에 계정 연결 배치');
   assert(layout.headerTop>=0&&layout.headerBottom<=height,width+' 첫 화면 헤더 로그인 노출');
   assert.equal(await page.locator('[data-desk-account] span').isVisible(),true,width+' 모바일에서도 로그인 글자 노출');
   assert.equal(await page.locator('[data-desk-account]').innerText(),'넥슨 로그인');
   const target=await page.locator('[data-desk-account]').boundingBox();assert(target.width>=44&&target.height>=44,'로그인 터치 영역');
   await page.evaluate(()=>openPage('stats'));await page.locator('[data-desk-account]').click();
   assert.equal(await page.locator('#account-title').evaluate(el=>document.activeElement===el),true,'계정 제목에 키보드 초점 이동');
   assert.match(page.url(),/page=home/);
   await page.screenshot({path:path.join(output,'login-'+width+'.png')});
  }
  // 실제 인증 없이 표기만 확인합니다. 계정 API 응답은 합성 오류로 중단합니다.
  await page.evaluate(()=>{window.MapleFriends={getState:()=>({connected:true,account:'a'.repeat(64),ready:true,finishing:false}),request:async()=>{throw new Error('합성 계정 상태 검증');}};document.dispatchEvent(new CustomEvent('maple:friends-session'));});
  await page.waitForFunction(()=>document.querySelector('[data-desk-account] span').textContent==='계정·저장');
  assert.equal(await page.locator('[data-desk-account]').getAttribute('data-account-entry'),'account');
  assert.equal(await page.locator('#account-login').isVisible(),false);
  await page.evaluate(()=>{window.MapleFriends={getState:()=>({connected:false,ready:true,finishing:false})};document.dispatchEvent(new CustomEvent('maple:friends-session'));});
  await page.waitForFunction(()=>document.querySelector('[data-desk-account] span').textContent==='넥슨 로그인');
  assert.equal(await page.locator('[data-desk-account]').getAttribute('data-account-entry'),'login');
  assert.equal(await page.evaluate(()=>localStorage.getItem('mapleTracker.v2')),baseline,'로그인 접근과 상태 표시로 장부 변경 없음');assert.deepEqual(errors,[]);
  await context.close();console.log('로그인 접근성: 4개 화면 크기·홈 상단 배치·모바일 텍스트·상태별 표기·초점 이동·장부 불변 통과');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
