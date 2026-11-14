// 실제 계정·장부를 사용하지 않고 테마와 인증·기록 보존을 확인합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),{fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.tools/theme-mode-20261114'),KEY='maple_ui_theme_v1';fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,bytes)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes));});
const snapshot=page=>page.evaluate(key=>JSON.stringify({local:Object.fromEntries(Object.keys(localStorage).filter(name=>name!==key).sort().map(name=>[name,localStorage.getItem(name)])),session:Object.fromEntries(Object.keys(sessionStorage).sort().map(name=>[name,sessionStorage.getItem(name)]))}),KEY);
async function settle(page){await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function contrast(page,selector){return page.locator(selector).first().evaluate(el=>{const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number),blend=(a,b)=>{const alpha=a.length>3?a[3]:1;return [0,1,2].map(i=>a[i]*alpha+b[i]*(1-alpha));},chain=[];let bg=[255,255,255];for(let n=el;n;n=n.parentElement)chain.push(n);for(const n of chain.reverse())bg=blend(rgb(getComputedStyle(n).backgroundColor),bg);const fg=blend(rgb(getComputedStyle(el).color),bg),lum=value=>value.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);return {ratio:(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05),fg,bg};});}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark',reducedMotion:'reduce'});await fixtureDismissPatchNotes(context);await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await settle(page);
  assert.equal(await page.evaluate(()=>MapleThemeMode.getState().resolved),'light','existing light appearance remains default even with dark OS');
  const before=await snapshot(page);await page.locator('.theme-mode-trigger').click();await page.getByRole('radio',{name:'어둡게',exact:true}).check();assert.equal(await page.locator('html').getAttribute('data-maple-theme'),'dark');assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),'dark');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.theme-mode-panel').isVisible(),false);assert.equal(await page.locator('.theme-mode-trigger').evaluate(el=>el===document.activeElement),true);assert.equal(await snapshot(page),before,'changing appearance preserves all ledger and auth storage');
  await page.reload();await settle(page);assert.equal(await page.evaluate(()=>MapleThemeMode.getState().resolved),'dark','preference restores on reload');
  await page.evaluate(()=>openPage('expense'));await page.locator('#expense-memo').fill('아직 저장하지 않은 지출 메모');const draftBefore=await snapshot(page);
  await page.locator('.theme-mode-trigger').click();await page.getByRole('radio',{name:'밝게',exact:true}).check();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#expense-memo').inputValue(),'아직 저장하지 않은 지출 메모','changing theme preserves unsaved input');assert.equal(await snapshot(page),draftBefore);
  await page.locator('.theme-mode-trigger').click();await page.getByRole('radio',{name:'어둡게',exact:true}).check();await page.keyboard.press('Escape');await page.locator('#expense-memo').fill('');await page.evaluate(()=>openPage('home'));
  const second=await context.newPage();await second.goto(origin);await settle(second);await page.evaluate(()=>MapleThemeMode.setPreference('light'));await second.waitForFunction(()=>document.documentElement.dataset.mapleTheme==='light');await second.close();
  await page.evaluate(()=>MapleThemeMode.setPreference('system'));assert.equal(await page.locator('html').getAttribute('data-maple-theme'),'dark');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.mapleTheme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.mapleTheme==='dark');
  await page.evaluate(()=>MapleThemeMode.setPreference('dark'));await page.evaluate(()=>{db.chars=[normalizeChar({name:'다크 테마 검증',server:'main',worldName:'크로아'})];renderAll();});
  const contrasts={},widths=[320,390,768,1440];let screens=0;
  for(const width of widths){
   await page.setViewportSize({width,height:width<700?844:1000});await page.evaluate(()=>openPage('home'));await settle(page);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no page overflow '+width);
   assert.equal(await page.locator('.theme-mode').getAttribute('data-placement'),width<=640?'drawer':'header');
   if(width<=640){await page.locator('.workspace-header [data-menu-toggle]').click();const scrim=await page.locator('.sidebar-scrim').evaluate(el=>(getComputedStyle(el).backgroundColor.match(/[\d.]+/g)||[]).map(Number));assert(scrim[0]<32&&scrim[1]<32&&scrim[2]<40,'drawer backdrop stays dark instead of using the orange action color');}
   const trigger=page.locator('.theme-mode-trigger'),box=await trigger.boundingBox();assert(box&&box.width>=44&&box.height>=44,'44px theme control '+width);
   await trigger.click();assert.equal(await page.getByRole('radio',{name:'어둡게',exact:true}).isChecked(),true);await page.keyboard.press('Escape');
   if(width<=640)await page.keyboard.press('Escape');
   for(const name of ['home','character','daily','boss','dailyboss','monthlyboss','profit','expense','stats','intro']){
    await page.evaluate(name=>{openPage(name);scrollTo(0,0);},name);await settle(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no dark overflow '+width+' '+name);screens++;
    if(width===1440&&['home','character','profit','expense','stats'].includes(name)){
     const selectors={home:['.home-head h2','.home-summary b','#desk-title','#desk-date','.home-character-name','#account-status','#account-recheck'],character:['.api-copy b','.character-api-card b'],profit:['#profit-type-list .profit-type-btn.active'],expense:['#enhancement-badge','#enhancement-summary strong'],stats:['.goal-title','.stats-period-metric.profit b']};
     for(const selector of selectors[name])if(await page.locator(selector).count()){const result=await contrast(page,selector);contrasts[name+' '+selector]=result;assert(result.ratio>=4.5,'contrast '+name+' '+selector+' '+JSON.stringify(result));}
     await page.evaluate(()=>document.activeElement.blur());await page.mouse.move(0,0);await page.screenshot({path:path.join(out,name+'-'+width+'.png')});
    }
   }
   for(const tool of ['investment','settlement','budget','hunting','bossplan','symbol']){await page.evaluate(tool=>MapleLedgerPlanner.open(tool),tool);await settle(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no planner overflow '+width+' '+tool);screens++;}
   if(width===390){await page.evaluate(()=>{openPage('home');scrollTo(0,0);document.activeElement.blur();});await page.mouse.move(0,0);await page.screenshot({path:path.join(out,'home-390.png')});}
  }
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>openPage('home'));await page.locator('[data-desk-search]').click();const dialogContrast=await contrast(page,'.desk-search-head h2');assert(dialogContrast.ratio>=4.5);await page.keyboard.press('Escape');
  await page.evaluate(()=>MaplePatchNotes.open());const notesContrast=await contrast(page,'.patch-note-section ul');assert(notesContrast.ratio>=4.5);await page.keyboard.press('Escape');
  for(const name of ['about/','guide/record-principles/','guide/boss-settlement/','guide/profit-expense/','privacy.html']){
   await page.goto(origin+'/'+name);await settle(page);assert.equal(await page.locator('html').getAttribute('data-maple-theme'),'dark');assert.equal(await page.locator('.theme-mode-trigger').count(),1);
   for(const width of [320,1440]){await page.setViewportSize({width,height:1000});await settle(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no public overflow '+width+' '+name);const result=await contrast(page,'h1');assert(result.ratio>=4.5);screens++;}
   if(name==='guide/boss-settlement/')for(const selector of ['.formula','[data-boss-demo] [data-boss-detail]'])if(await page.locator(selector).count()){const result=await contrast(page,selector);assert(result.ratio>=4.5,'public contrast '+selector+' '+JSON.stringify(result));}
  }
  await context.close();
  const blocked=await browser.newContext({viewport:{width:1440,height:1000}});await fixtureDismissPatchNotes(blocked);await blocked.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await blocked.addInitScript(key=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Theme storage blocked','QuotaExceededError');return set.call(this,name,value);};},KEY);
  const fallback=await blocked.newPage();await fallback.goto(origin);await settle(fallback);await fallback.locator('.theme-mode-trigger').click();await fallback.getByRole('radio',{name:'어둡게',exact:true}).check();assert.equal(await fallback.locator('html').getAttribute('data-maple-theme'),'dark');assert.match(await fallback.locator('.theme-mode-status').innerText(),/저장하지 못/);await blocked.close();assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),screens,widths,contrasts,defaultLight:true,persistence:true,crossTab:true,systemChanges:true,keyboard:true,storageFailureSafe:true,ledgerAndAuthUnchanged:true,errors},null,2));console.log('다크모드: '+screens+'개 화면·공개 가이드·4개 폭·대비·키보드·저장/새 탭·시스템 변경·저장 실패·장부/인증 보존 통과');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
