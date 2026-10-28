const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const {fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.tools','planner-review');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,b)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(b);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await fixtureDismissPatchNotes(page);
  await page.goto(origin+'/?page=planner');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('[data-planner-tool]').count(),6);
  await page.evaluate(()=>{
   const date=MaplePlannerState.dateKst(),week=MaplePlannerState.weekKst(date);
   const c=normalizeChar({name:'기능검증 캐릭터',worldName:'크로아',server:'main'});
   const boss=BOSS_GROUPS.w[0].bosses[0];c.bossWeeks[week][boss[0]]=1;
   db.chars=[c];db.records={[date]:{sessions:[{id:'planner-hunt',kind:'hunt',meso:'900719925474099300',extraIncome:'100',erda:5,erdaSettled:0,erdaUnitPrice:'10000',erdaFee:3,erdaMesoIncluded:false,charName:c.name,runs:1,createdAt:Date.now(),updatedAt:Date.now()}]}};
   db.profits=[{id:'planner-profit',date,type:'wonderberry',costs:[{id:'cost',name:'구입',price:'1000000',count:1}],outputs:[{id:'result',name:'판매 대기 펫',price:'2000000',count:2,sold:false,fee:3}]}];
   db.expenses=[{id:'planner-expense',date,category:'equipment',amount:'5000000',charName:c.name,memo:'원본 보호 검증'}];db.enhancements=MapleEnhancements.normalize();db.planner=MaplePlannerState.normalize();save();renderAll();
  });
  await page.evaluate(()=>{const old=MapleLedgerPlanner.bridge.getContext().characters[0].id;db.chars[0].ocid='1'.repeat(32);db.chars[0].worldName='루나';normalizeChar(db.chars[0]);if(MapleLedgerPlanner.bridge.getContext().characters[0].id!==old)throw new Error('API 연결/월드 변경 후 계획 캐릭터 ID가 바뀜');save();});
  const baseline=await page.evaluate(()=>JSON.stringify({records:db.records,chars:db.chars,profits:db.profits,expenses:db.expenses}));
  const tabs=['investment','settlement','budget','hunting','bossplan','symbol'];
  for(const width of [320,390,768,1440,1920]){
   await page.setViewportSize({width,height:1000});
   for(const tool of tabs){
    await page.evaluate(tool=>MapleLedgerPlanner.open(tool),tool);await page.waitForTimeout(30);
    const status=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,hasForm:!!document.querySelector('#planner-panel form'),error:document.querySelector('#planner-panel')?.textContent.includes('計画画面を')||document.querySelector('#planner-panel')?.textContent.includes('計画')}));
    assert.equal(status.overflow,false,tool+' '+width+'px 가로 넘침');assert(status.hasForm,tool+' 폼 표시');
    assert(!await page.locator('#planner-panel').innerText().then(t=>t.includes('계획 화면을 열지 못했습니다.')),tool+' 데이터 어댑터');
    if([390,1440].includes(width))await page.screenshot({path:path.join(out,tool+'-'+width+'.png'),fullPage:true});
   }
  }
  await page.evaluate(()=>MapleLedgerPlanner.open('investment'));
  const input=page.locator('#planner-panel input[type=text]').first();await input.fill('저장 전 입력 보호');
  await page.evaluate(()=>renderAll());assert.equal(await input.inputValue(),'저장 전 입력 보호','API 배경 새로고침이 입력중 폼을 지우지 않음');
  page.on('dialog',dialog=>dialog.accept());
  await page.evaluate(()=>MapleLedgerPlanner.open('budget'));
  await page.evaluate(()=>MapleLedgerPlanner.bridge.commit('funds',[{id:'planner-goal',name:'장비 목표',target:'900719925474099300',allocated:'1000'}]));
  const result=await page.evaluate(()=>{
   const bundle=exportBackupBundle(),restored=trackerDbFromData(bundle),snapshot=MapleAccountBridge.snapshot(),stored=MapleAccountBridge.storeFromSnapshot(snapshot),round=MapleAccountBridge.snapshotFromStore(stored);
   return {backup:restored.planner.funds.find(x=>x.id==='planner-goal'),account:round.data.planner.funds.find(x=>x.id==='planner-goal'),legacy:JSON.stringify({records:db.records,chars:db.chars,profits:db.profits,expenses:db.expenses})};
  });
  assert.equal(result.backup.target,'900719925474099300');assert.equal(result.account.target,'900719925474099300');assert.equal(result.legacy,baseline);
  await page.reload();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>db.planner.funds.some(x=>x.id==='planner-goal')),true,'새로고침 보존');
  await page.evaluate(()=>MapleLedgerPlanner.open('budget'));
  const stale=await page.evaluate(()=>{const raw=JSON.parse(localStorage.getItem(LS_KEY));raw.planner.funds.push({id:'other-tab',name:'다른창',updatedAt:Date.now()+1});localStorage.setItem(LS_KEY,JSON.stringify(raw));try{MapleLedgerPlanner.bridge.commit('funds',[]);return false;}catch(e){return e.message.includes('다른 창');}});
  assert.equal(stale,true,'기존 탭이 새 계획을 덮어쓰지 않음');
  assert.deepEqual(errors,[]);await context.close();
  console.log('계획 통합 UI: 6개 기능×5폭, 입력보호·정밀 금액·백업/계정 직렬화·재접속·다른탭충돌·기존원본보존 통과');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
