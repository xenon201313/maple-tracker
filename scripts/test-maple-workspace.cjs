// 합성 장부만 사용하는 화면 개편 회귀 검사입니다. 실제 세션과 장부는 읽지 않습니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.tools/ui-renewal-20261031');fs.mkdirSync(output,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json'};
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data));});
async function settle(page){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(35);}
async function overflow(page,label){
 const state=await page.evaluate(()=>{
  const width=document.documentElement.clientWidth,offenders=[];
  for(const el of document.querySelectorAll('.page.active button,.page.active input,.page.active select,.page.active textarea,.workspace-header button')){
   if(!el.getClientRects().length)continue;
   const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
   if(r.left< -2||r.right>width+2)offenders.push({tag:el.tagName,id:el.id,class:el.className,left:r.left,right:r.right});
  }
  return {width,scroll:document.documentElement.scrollWidth,offenders:offenders.slice(0,8)};
 });
 assert(state.scroll<=state.width+2,label+' document overflow '+JSON.stringify(state));
 assert.deepEqual(state.offenders,[],label+' clipped form/control '+JSON.stringify(state.offenders));
}
const snapshot=page=>page.evaluate(()=>JSON.stringify({records:db.records,expenses:db.expenses,profits:db.profits,planner:db.planner,chars:db.chars.map(c=>({id:c.id,name:c.name,server:c.server,worldName:c.worldName,bossWeeks:Object.fromEntries(Object.entries(c.bossWeeks||{}).filter(([,v])=>Object.keys(v).length))}))}));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});await fixtureDismissPatchNotes(context);
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.goto(origin);await settle(page);
  const fonts=await page.evaluate(()=>({body:getComputedStyle(document.body).fontFamily,account:getComputedStyle(document.getElementById('account-title')).fontFamily,hero:getComputedStyle(document.getElementById('desk-title')).fontFamily,loaded:[...document.fonts].some(font=>font.family==='MapleSUIT'&&font.status==='loaded')}));
  assert.match(fonts.body,/MapleSUIT/);assert.match(fonts.account,/MapleSUIT/);assert.match(fonts.hero,/MaplestoryTitle/);assert.equal(fonts.loaded,true,'self-hosted SUIT font loaded');
  await page.evaluate(()=>{
   const now=Date.now(),date=todayStr(),week=currentWeekKey(),c=normalizeChar({name:'개편검증용길고긴캐릭터이름',server:'main',worldName:'크로아'});
   c.bossWeeks[week][BOSS_GROUPS.w[0].bosses[0][0]]=1;db.chars=[c];
   db.records={[date]:{sessions:[{id:'renewal-synthetic-hunt',kind:'hunt',runs:1,meso:'999999999999999999',erda:3,erdaSettled:0,erdaUnitPrice:'1234567',erdaFee:3,charName:c.name,createdAt:now,updatedAt:now}]}};
   db.records=normalizeRecords(db.records,db.settings);
   db.planner=MaplePlannerState.normalize({trades:[{id:'renewal-trade',itemName:'합성검증용아주긴드랍이름',quantity:2,acquiredDate:date,sales:[],updatedAt:now}]});save();renderAll();
  });
  const before=await snapshot(page),pages=['home','character','daily','boss','monthlyboss','dailyboss','profit','expense','stats','intro'];let checks=0;
  for(const width of [320,390,768,1024,1440]){
   const height=width<700?844:1000;await page.setViewportSize({width,height});
   for(const name of pages){
    await page.evaluate(name=>{openPage(name);scrollTo(0,0);},name);await settle(page);
    if(['boss','monthlyboss','dailyboss'].includes(name)&&!await page.locator('.page.active .bosslist.open').count())await page.locator('.page.active .character-disclosure').first().click();
    await overflow(page,width+' '+name);checks++;
    if(name==='home'){
     const bounds=await page.evaluate(()=>({hero:document.querySelector('.home-desk-masthead').getBoundingClientRect().top,actions:document.querySelector('.workspace-quick-actions').getBoundingClientRect().bottom}));
     assert(bounds.hero>=0&&bounds.hero<height,width+' hero in first screen');assert(bounds.actions<height-60,width+' record actions clear fixed bottom bar');
     const login=await page.locator('[data-desk-account]').boundingBox();assert(login.width>=44&&login.height>=44,width+' login touch target');assert.equal(await page.locator('[data-desk-account] span').innerText(),'넥슨 로그인');
     assert.equal(await page.locator('.ledger-evidence a[href="guide/record-principles/"]').count(),1);assert.equal(await page.locator('.ledger-evidence a[href="about/"]').count(),1);
    }
    if([390,1440].includes(width)&&['home','daily','boss','profit','expense'].includes(name))await page.screenshot({path:path.join(output,name+'-'+width+'.png')});
   }
   for(const tool of ['investment','settlement','budget','hunting','bossplan','symbol']){
    await page.evaluate(tool=>MapleLedgerPlanner.open(tool),tool);await settle(page);await overflow(page,width+' planner '+tool);checks++;
   }
  }
  assert.equal(await snapshot(page),before,'navigation and planning view leave source ledger unchanged');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>openPage('expense'));await settle(page);
  assert.equal(await page.evaluate(()=>!!(document.getElementById('expense-entry-card').compareDocumentPosition(document.getElementById('enhancement-panel'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'manual expense precedes API list');
  for(const id of ['expense-date','expense-character','expense-category','expense-amount','expense-memo'])assert.equal(await page.locator('label[for="'+id+'"]').count(),1,id+' accessible label');
  await page.locator('[data-renewal-jump="enhancement-title"]').click();assert.equal(await page.locator('#enhancement-title').evaluate(el=>document.activeElement===el),true,'API jump focuses target');
  await page.locator('[data-renewal-jump="expense-entry-title"]').click();assert.equal(await page.locator('#expense-entry-title').evaluate(el=>document.activeElement===el),true,'manual jump focuses target');
  await page.locator('#expense-amount').fill('123456789');await page.locator('#expense-memo').fill('개편 검증용 합성 지출');await page.locator('#expense-save').click();
  assert.equal(await page.evaluate(()=>db.expenses.length),1);assert.equal(await page.evaluate(()=>String(db.expenses[0].amount)),'123456789');
  const saved=await snapshot(page);await page.reload();await settle(page);assert.equal(await snapshot(page),saved,'record reload preservation');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#workspace-backup').click()]);const bundle=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(String(bundle.expenses[0].amount),'123456789');
  await page.evaluate(()=>openPage('home'));const original=await snapshot(page);await page.locator('.ledger-evidence a[href="guide/record-principles/"]').click();await page.waitForURL('**/guide/record-principles/');await page.goBack();await settle(page);assert.equal(await snapshot(page),original,'public reference return leaves ledger unchanged');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),screenChecks:checks,font:fonts,expenseSavedAndBackedUp:true,navigationLeavesLedgerUnchanged:true,errors},null,2));
  console.log('화면 개편: '+checks+'개 페이지·계획/화면폭, 큰 금액·긴 이름, 첫 화면 동작·44px 로그인, 한국어 글꼴, 입력 라벨·초점, 지출 저장·백업·공개 근거 왕복·장부 불변 통과');await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
