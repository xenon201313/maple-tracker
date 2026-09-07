const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
  let name=new URL(req.url,'http://localhost').pathname;
  if(name.endsWith('/')) name+='index.html';
  const file=path.resolve(root,'.'+decodeURIComponent(name));
  if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{
    if(error) return res.writeHead(404).end();
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);
  });
});

async function seed(page){
  return page.evaluate(()=>{
    const week=currentWeekKey(),previous=addDays(week,-7),month=currentMonthKey(),day=todayStr();
    const c=normalizeChar({name:'리프검증',ocid:'old-ocid',server:'challenger',worldName:'챌린저스3',characterLevel:280,
      bossWeeks:{[week]:{nmeirin:1},[previous]:{nmeirin:1}},
      dropWeeks:{[week]:{'saved-drop':2},[previous]:{'saved-drop':1}},
      dropPriceWeeks:{[week]:{'saved-drop':'123456789'}},dropShareWeeks:{[week]:{'saved-drop':2}},
      monthBossMonths:{[month]:{fixture:1}},monthDropMonths:{[month]:{'saved-monthly-drop':1}},
      monthDropPriceMonths:{[month]:{'saved-monthly-drop':'432100'}},monthDropShareMonths:{[month]:{'saved-monthly-drop':3}},
      dailyBossDays:{[day]:{fixture:1}},dailyDropDays:{[day]:{fixture:1}},dailyDropPriceDays:{[day]:{fixture:'500'}},
      expHistory:[{at:Date.now()-86400000,level:279,exp:'12345',rate:'10'}]});
    db.chars=[c];db.settings.nexonApiKey='fixture-key';
    db.records=normalizeRecords({[day]:{sessions:[{id:'keep-hunt',charName:c.name,runs:1,meso:'123456789',erda:22}]}},db.settings);
    db.profits=[normalizeProfitRecord({id:'keep-profit',date:day,type:'potential',costs:[],outputs:[]})];
    db.expenses=[normalizeExpenseRecord({id:'keep-expense',date:day,amount:'1234',category:'equipment'})];
    window.transferChar=c;
    updateNexonApiStatus('검증 대기');
    window.transferSnapshot=()=>JSON.stringify({
      records:db.records,profits:db.profits,expenses:db.expenses,
      stores:Object.fromEntries(['bossWeeks','dropWeeks','dropPriceWeeks','dropShareWeeks','monthBossMonths','monthDropMonths','monthDropPriceMonths','monthDropShareMonths','dailyBossDays','dailyDropDays','dailyDropPriceDays'].map(key=>[key,Object.fromEntries(Object.entries(db.chars[0][key]).filter(([,v])=>Object.keys(v).length))]))
    });
    renderAll();
    return {snapshot:transferSnapshot(),income:charSum(c,previous).w,exp:c.expHistory[0]};
  });
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    let mode='stale',calls=[];
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin || url.protocol==='data:') return route.continue();
      if(url.hostname!=='open.api.nexon.com') return route.abort();
      calls.push({path:url.pathname,ocid:url.searchParams.get('ocid'),date:url.searchParams.get('date'),name:url.searchParams.get('character_name')});
      const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      const failed=()=>respond({error:{name:'OPENAPI00009',message:'fixture data unavailable'}},400);
      if(url.pathname.endsWith('/id')){
        if(mode==='id-fail') return failed();
        if(mode==='rename') assert.equal(url.searchParams.get('character_name'),'새이름','Resolve the official renamed character, not its former nickname');
        return respond({ocid:['stable','latest-unavailable'].includes(mode)?'old-ocid':'new-ocid'});
      }
      if(url.pathname.endsWith('/character/basic')){
        const old=url.searchParams.get('ocid')==='old-ocid';
        if((old && mode==='old-gone') || (!old && mode==='unavailable')) return failed();
        if(mode==='latest-unavailable' && !url.searchParams.has('date')) return failed();
        if(!old && mode==='blank-world') return respond({character_name:'리프검증',world_name:''});
        return respond({character_name:mode==='rename'?'새이름':'리프검증',world_name:old && mode!=='stable'?'챌린저스3':'크로아',character_class:'제논',character_level:280,character_exp:'987654',character_exp_rate:'20',character_image:''});
      }
      if(url.pathname.endsWith('/character/stat')) return respond({final_stat:[]});
      if(url.pathname.endsWith('/scheduler/character-state')) return respond({boss_contents:[]});
      return failed();
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin+'/?page=character');
    for(const scenario of ['stale','old-gone','stable','rename','no-ocid']){
      mode=scenario;calls=[];
      const before=await seed(page);
      if(scenario==='no-ocid') await page.evaluate(()=>{db.chars[0].ocid='';});
      await page.locator('.char-refresh-btn').click();
      await page.waitForFunction(()=>document.querySelector('#nexon-api-status').textContent==='캐릭터 정보 갱신 완료');
      await page.waitForFunction(()=>db.chars[0].server==='main');
      const result=await page.evaluate(()=>({
        ocid:db.chars[0].ocid,world:db.chars[0].worldName,name:db.chars[0].name,
        same:db.chars[0]===transferChar,count:db.chars.length,snapshot:transferSnapshot(),
        oldIncome:charSum(db.chars[0],addDays(currentWeekKey(),-7)).w,
        newClearAllowed:canUseBoss(db.chars[0],BOSS_MAP.nmeirin),exp:db.chars[0].expHistory
      }));
      const expectedOcid=scenario==='stable'?'old-ocid':'new-ocid';
      assert.equal(result.ocid,expectedOcid);assert.equal(result.world,'크로아');
      assert.equal(result.name,scenario==='rename'?'새이름':'리프검증');
      assert(result.same,'A refresh must update the existing character object');assert.equal(result.count,1);
      assert.equal(result.snapshot,before.snapshot,'World transfer changed existing ledger entries');
      assert.equal(result.oldIncome,before.income,'Past challenger boss income disappeared');
      assert.equal(result.newClearAllowed,false,'New challenger-only clears must remain locked');
      assert(result.exp.some(e=>JSON.stringify(e)===JSON.stringify(before.exp)),'Existing experience history disappeared');
      assert(calls.some(c=>c.path.endsWith('/id')),'Refresh reused the stored identity without resolving it');
      for(const suffix of ['/character/stat','/scheduler/character-state']) assert(calls.some(c=>c.path.endsWith(suffix)&&c.ocid===expectedOcid));
      assert.match(await page.locator('#registered-char-list').innerText(),/본서버/);
      assert(!await page.locator('#registered-char-list').innerText().then(t=>t.includes('챌린저스')));
    }
    for(const scenario of ['unavailable','id-fail','latest-unavailable','blank-world']){
      mode=scenario;calls=[];
      const before=await seed(page);
      const profile=await page.evaluate(()=>JSON.stringify(db.chars[0]));
      await page.locator('.char-refresh-btn').click();
      await page.waitForFunction(()=>document.querySelector('#nexon-api-status').textContent==='캐릭터 정보 갱신 실패');
      assert.equal(await page.evaluate(()=>JSON.stringify(db.chars[0])),profile,'An incomplete refresh changed the stored profile');
      assert.equal(await page.evaluate(()=>transferSnapshot()),before.snapshot);
      assert(!calls.some(c=>c.date),'An incomplete refresh must not use yesterday as the current world');
    }
    mode='stale';
    const before=await seed(page);
    await page.locator('#btn-refresh-all-chars').click();
    await page.waitForFunction(()=>document.querySelector('#nexon-api-status').textContent==='캐릭터 정보 갱신 완료');
    assert.equal(await page.evaluate(()=>transferSnapshot()),before.snapshot);
    const output=path.join(root,'.tools','ui-review');
    fs.mkdirSync(output,{recursive:true});
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Transferred character overflows at '+width);
      assert.match(await page.locator('#registered-char-list').innerText(),/크로아/);
      await page.locator('#registered-char-list').screenshot({path:path.join(output,'world-transfer-'+width+'.png'),animations:'disabled'});
    }
    await page.reload();
    assert.equal(await page.evaluate(()=>db.chars[0].worldName),'크로아');
    assert.equal(await page.evaluate(()=>db.chars[0].server),'main');
    assert.equal(await page.evaluate(()=>db.chars[0].ocid),'new-ocid');
    await seed(page);
    await page.evaluate(()=>runNexonAutoRefresh());
    assert.equal(await page.evaluate(()=>db.chars[0].server),'main','Automatic refresh must also re-resolve the identity');
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('World transfer: stale/invalid/same OCID, rename, API failure, manual/bulk/automatic refresh and record preservation passed.');
  }finally{
    if(browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
