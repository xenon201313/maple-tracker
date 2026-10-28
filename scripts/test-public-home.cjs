const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.tools','public-home-review');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ttf':'font/ttf'};
(async()=>{
 const worker=(await import(pathToFileURL(path.join(root,'cloudflare-web/worker.mjs')))).default;
 const assets={async fetch(request){let file=decodeURIComponent(new URL(request.url).pathname);if(file.endsWith('/'))file+='index.html';file=path.resolve(root,'.'+file);if(!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});try{return new Response(fs.readFileSync(file),{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}};
 const server=http.createServer(async(req,res)=>{try{const result=await worker.fetch(new Request('http://127.0.0.1:'+server.address().port+req.url),{ASSETS:assets});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch(e){res.writeHead(500).end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[],apiRequests=[];
  await ctx.route('**/*',r=>{if(r.request().url().includes('/v1/'))apiRequests.push(r.request().url());return r.request().url().startsWith(origin)?r.continue():r.abort();});
  await fixtureDismissPatchNotes(ctx);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/?page=home');await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{const date=todayStr();db.records=normalizeRecords({[date]:{sessions:[{id:'public-home-fixture',kind:'hunt',meso:'123456789123456789',runs:1,erda:2,erdaSettled:0,erdaUnitPrice:'10000',erdaFee:3,createdAt:Date.now(),updatedAt:Date.now()}]}});db.planner=MaplePlannerState.normalize({funds:[{id:'keep-plan',target:'999999999999999999',updatedAt:1}]});save();renderAll();sessionStorage.setItem('public-home-session-fixture','keep');});
  const baseline=await page.evaluate(()=>({records:JSON.stringify(db.records),planner:JSON.stringify(db.planner),local:JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))),session:JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).sort().map(k=>[k,sessionStorage.getItem(k)])))}));
  apiRequests.length=0;const response=await page.goto(origin+'/');assert.equal(response.status(),200);assert.equal(response.headers()['x-robots-tag'],undefined);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#welcome-title').count(),1);assert.equal(await page.locator('#workspace-sidebar').count(),0,'공개 홈에 빈 장부 UI를 렌더링하지 않음');
  const output=()=>page.locator('[data-welcome-net]').innerText();assert.match(await output(),/16,400,000/);
  await page.locator('[name=sold]').uncheck();assert.match(await page.locator('[data-welcome-revenue]').innerText(),/^0 메소$/);assert.match(await output(),/-100,000,000/);
  await page.locator('[name=sold]').check();await page.locator('[name=cost]').fill('0');await page.locator('[name=sale]').fill('9007199254740993');await page.locator('[name=fee]').fill('0');assert.match(await output(),/9,007,199,254,740,993/);
  await page.locator('[name=sale]').fill('101');await page.locator('[name=fee]').fill('3.25');assert.match(await output(),/^97/,'총 판매금액에서 1메소 미만 내림');
  await page.locator('[name=cost]').fill('1,23');assert.match(await page.locator('[data-welcome-error]').innerText(),/정수|쉼표/);assert.match(await output(),/입력 확인/);assert.equal(await page.locator('[name=cost]').getAttribute('aria-invalid'),'true');
  await page.locator('[type=reset]').click();await page.waitForFunction(()=>document.querySelector('[data-welcome-net]').textContent.includes('16,400,000'));
  for(const [width,height]of [[320,844],[390,844],[768,1000],[1024,768],[1440,1000],[1920,1080]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2),false,width+' 공개 홈 넘침');
   assert(await page.locator('[name=cost]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'입력 가독성');
   if([390,1440].includes(width))await page.screenshot({path:path.join(out,'public-'+width+'.png'),fullPage:false});
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))),baseline.local,'공개 계산이 기존 localStorage를 변경하지 않음');
  assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).sort().map(k=>[k,sessionStorage.getItem(k)])))),baseline.session,'공개 계산이 세션을 변경하지 않음');assert.deepEqual(apiRequests,[],'공개 계산은 장부·인증 API를 호출하지 않음');
  const ledger=await page.goto(origin+'/?page=home');assert.equal(ledger.headers()['x-robots-tag'],'noindex, follow');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>JSON.stringify(db.records)),baseline.records);assert.equal(await page.evaluate(()=>JSON.stringify(db.planner)),baseline.planner);
  await page.screenshot({path:path.join(out,'ledger-1920.png')});
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),staticPage=await noJs.newPage();await staticPage.goto(origin+'/');
  assert.equal(await staticPage.locator('[name=cost]').isDisabled(),true);assert.match(await staticPage.locator('[data-welcome-net]').innerText(),/16,400,000/);assert(await staticPage.locator('table tbody tr').count()>=3);assert(await staticPage.locator('a[href="/?page=home"]').count());await noJs.close();
  assert.deepEqual(errors,[]);await ctx.close();console.log('공개 홈: Worker 분리·6폭·판매/미판매·정밀 금액·검증·무저장/무인증통신·장부 복귀·JS 없는 본문 통과');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
