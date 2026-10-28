const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.tools','ui-rebuild');fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,b)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(b);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());await fixtureDismissPatchNotes(context);
  page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.evaluate(()=>document.fonts.ready);
  assert.match(await page.locator('#desk-record-status').innerText(),/아직 기록 없음/);
  await page.evaluate(()=>{
   const date=todayStr(),week=currentWeekKey(),c=normalizeChar({name:'데스크 검증 캐릭터',server:'main',worldName:'크로아'});
   c.bossWeeks[week][BOSS_GROUPS.w[0].bosses[0][0]]=1;db.chars=[c];
   db.records={[date]:{sessions:[{id:'desk-hunt',kind:'hunt',runs:1,meso:'100000000',erda:3,erdaSettled:0,erdaUnitPrice:'10000',erdaFee:3,charName:c.name,createdAt:Date.now(),updatedAt:Date.now()}]}};
   db.planner=MaplePlannerState.normalize({trades:[{id:'desk-trade',itemName:'가상 드랍',quantity:2,acquiredDate:date,sales:[],updatedAt:Date.now()}]});
   save();renderAll();
  });
  const snapshot=()=>page.evaluate(()=>JSON.stringify({records:db.records,chars:db.chars,profits:db.profits,expenses:db.expenses,planner:db.planner}));
  const baseline=await snapshot();assert.match(await page.locator('#desk-record-status').innerText(),/1건 기록/);assert.match(await page.locator('#desk-record-status').innerText(),/1건 체크됨/);assert.match(await page.locator('#desk-record-status').innerText(),/1건 확인 필요/);
  for(const [width,height]of [[320,844],[390,844],[768,1000],[1024,768],[1440,1000],[1920,1080]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>openPage('home'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2),false,width+' home overflow');
   for(const selector of ['.workspace-search','.workspace-account','#workspace-backup']){
    const box=await page.locator(selector).boundingBox();assert(box.width>=43&&box.height>=43,selector+' target size '+width);
   }
   assert(await page.locator('.workspace-quick-actions').boundingBox().then(b=>b.y<height),width+' first screen record actions');
   await page.screenshot({path:path.join(output,'home-'+width+'.png')});
   await page.locator('[data-desk-search]').click();await page.locator('#desk-search-input').fill('  심 볼  ');
   const searchBox=await page.locator('#desk-search-dialog').boundingBox();assert(searchBox.x>=10&&searchBox.y>=10&&searchBox.x+searchBox.width<=width-10,'검색창과 화면 경계 사이 여백 '+width);
   assert.equal(await page.locator('.desk-search-result').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2),false,width+' search overflow');
   if([390,1440].includes(width))await page.screenshot({path:path.join(output,'search-'+width+'.png')});
   await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.match(page.url(),/tool=symbol/);assert.equal(await page.locator('#desk-search-dialog').evaluate(el=>el.open),false);
  }
  await page.setViewportSize({width:1440,height:1000});await page.keyboard.press('Control+k');await page.locator('#desk-search-input').fill('소울');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.match(page.url(),/page=expense/);
  await page.locator('[data-desk-search]').click();await page.locator('#desk-search-input').fill('<img src=x onerror=alert(1)>');assert.equal(await page.locator('#desk-search-results img').count(),0);assert.match(await page.locator('#desk-search-count').innerText(),/찾는 도구가 없습니다/);
  await page.keyboard.press('Escape');await page.locator('#desk-search-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('[data-desk-search]').evaluate(el=>document.activeElement===el),true,'Escape restores focus '+JSON.stringify(await page.evaluate(()=>({active:document.activeElement?.outerHTML.slice(0,240),open:document.getElementById('desk-search-dialog').open}))));
  await page.locator('[data-desk-search]').click();await page.locator('#desk-search-input').fill('정산');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.match(page.url(),/tool=settlement/);
  await page.locator('[data-desk-account]').click();assert.equal(await page.locator('#account-title').evaluate(el=>document.activeElement===el),true);assert.match(page.url(),/page=home/);assert.equal(await page.locator('#account-choice').count(),1);
  await page.locator('[data-desk-tool=bossplan]').click();assert.match(page.url(),/tool=bossplan/);
  await page.evaluate(()=>MaplePatchNotes.open());await page.keyboard.press('Control+k');assert.equal(await page.locator('#desk-search-dialog').evaluate(el=>el.open),false,'다른 팝업 위에 도구 찾기를 중첩하지 않음');await page.keyboard.press('Escape');
  await page.evaluate(()=>openPage('home'));assert.equal(await snapshot(),baseline,'Search/status/navigation must not alter source ledger');
  await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('maple:account-ledger-changing'));});assert.equal(await page.locator('#desk-record-status').innerText(),'');
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('workspace:render')));assert.equal(await page.locator('#desk-next-action').isEnabled(),true);
  assert.deepEqual(errors,[]);await context.close();
  console.log('플레이 데스크: 6개 화면 크기·기록 기반 현황·검색/딥링크·키보드/초점 복귀·계정 접근·원본 불변 통과');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
