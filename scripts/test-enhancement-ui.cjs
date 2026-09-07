const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'.tools','ui-review');
fs.mkdirSync(output,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  let name=new URL(req.url,'http://localhost').pathname;
  if(name.endsWith('/')) name+='index.html';
  const file=path.resolve(root,'.'+decodeURIComponent(name));
  if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    let fail=false,historyCalls=0,oauthReady=false,finishCalls=0,repairHistory=false,oauthFailure=false;
    let expectedAuthCode='fixture-code';
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin || url.protocol==='data:') return route.continue();
      const fulfill=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      if(url.pathname==='/v1/friends/config') return fulfill({ready:oauthReady});
      if(url.pathname==='/v1/friends/finish') {
        finishCalls++;
        const data=route.request().postDataJSON();
        assert.equal(data.state,'c'.repeat(64));assert.equal(data.proof,'a'.repeat(64));assert.equal(data.code,expectedAuthCode);
        if(oauthFailure) return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'넥슨 연결에 실패했습니다. 기존 기록은 변경되지 않았습니다.',errorCode:'TOKEN_EXCHANGE / OPENAPI00012'})});
        return fulfill({connected:true,account:'fixture-account'});
      }
      if(url.pathname==='/v1/friends/status') return fulfill({connected:true,account:'fixture-account'});
      if(url.pathname==='/v1/friends/logout') return fulfill({ok:true});
      if(url.hostname==='open.api.nexon.com') {
        if(url.pathname.endsWith('/ouid')) return fulfill({ouid:'isolated-test-account'});
        if(fail) return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{message:'fixture failure'}})});
        const date=url.searchParams.get('date');
        historyCalls++;
        const common={character_name:'테스트 캐릭터',target_item:'아케인셰이드 스태프',date_create:date+'T10:00:00+09:00'};
        if(repairHistory && url.pathname.endsWith('/potential')) return fulfill({potential_history:[{...common,id:date+'-repair',target_item:'아스트라 메달',item_level:200,potential_type:'에디셔널 잠재능력 재설정',before_potential_option:[],after_potential_option:[],before_additional_potential_option:[{grade:'레전드리'}],after_additional_potential_option:[{grade:'레전드리'}]}],next_cursor:''});
        if(url.pathname.endsWith('/starforce')) return fulfill({starforce_history:[{...common,target_item:'가디언 엔젤 링',id:date+'-sf',world_name:'크로아',before_starforce_count:17,after_starforce_count:18,destroy_defence:'적용',superior_item_flag:'미적용',starforce_event_list:[]}],next_cursor:''});
        if(url.pathname.endsWith('/potential')) return fulfill({potential_history:[{...common,id:date+'-p',item_level:200,potential_type:'잠재능력',before_potential_option:[{grade:'레전드리'}],after_potential_option:[{grade:'레전드리'}]}],next_cursor:''});
        if(url.pathname.endsWith('/cube')) return fulfill({cube_history:[],next_cursor:''});
      }
      return route.abort();
    });
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin+'/?page=expense');
    await page.evaluate(()=>{
      db.settings.nexonApiKey='fixture-api-key';
      db.records={'2026-07-17':{sessions:[{id:'keep-hunt',meso:'123456789',erda:22,runs:1}]}};
      db.chars=[];
      db.profits=[normalizeProfitRecord({id:'keep-profit',date:todayStr(),type:'potential',costs:[{id:'manual',price:'1000000',count:1}],outputs:[]})];
      db.expenses=[normalizeExpenseRecord({id:'keep-expense',date:todayStr(),amount:'100000',category:'equipment'})];
      db.records=normalizeRecords(db.records,db.settings);
      save();renderAll();
    });
    const manualBefore=await page.evaluate(()=>JSON.stringify({records:db.records,profits:db.profits,expenses:db.expenses,chars:db.chars}));
    await page.selectOption('#enhancement-source','key');
    const today=await page.evaluate(()=>todayStr());
    await page.fill('#enhancement-from',today);await page.fill('#enhancement-to',today);
    await page.click('#enhancement-refresh');
    await page.waitForFunction(()=>document.querySelector('#enhancement-status').textContent.includes('조회 완료'));
    assert.equal(await page.locator('.enhancement-row').count(),1);
    assert.equal(await page.evaluate(()=>profitTotals(()=>true).cost.toString()),'1000000','Estimates changed existing totals');
    assert.match(await page.locator('.enhancement-row').innerText(),/2억 73만 9,300/);
    assert.match(await page.locator('.enhancement-row').innerText(),/160제/);
    assert.equal(await page.locator('.enhancement-row img').evaluate(img=>img.complete && img.naturalWidth>0),true);
    assert(!await page.locator('.enhancement-row').innerText().then(text=>text.includes('미적용')));
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(300);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert.equal(overflow,false,'Horizontal overflow at '+width);
      assert(await page.locator('[data-enhancement-tab]').evaluateAll(buttons=>buttons.every(b=>{const r=b.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;})),'Enhancement tabs clipped at '+width);
      if([1440,390].includes(width)) await page.locator('#enhancement-panel').screenshot({path:path.join(output,'enhancement-'+width+'.png')});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.click('[data-enhancement-tab="potential"]');
    const potential=page.locator('.enhancement-row').filter({hasText:'잠재능력'});
    assert.match(await potential.innerText(),/4,500만/);
    await potential.locator('[data-confirm]').click();
    assert.match(await page.locator('#enhancement-status').innerText(),/수동 기록/,'Duplicate manual record needs confirmation');
    await potential.locator('[data-distinct]').check();
    await potential.locator('[data-confirm]').click();
    await page.waitForFunction(()=>MapleEnhancements.profits(db.enhancements).length===1);
    assert.equal(await page.evaluate(()=>profitTotals(()=>true).cost.toString()),'46000000');
    assert.match(await page.locator('#expense-summary').innerText(),/4,600만/);
    assert.equal(await page.evaluate(()=>spendingCategoryRows(()=>true).reduce((sum,row)=>sum+row.calculator,0n).toString()),'46000000');
    await page.reload();
    assert.equal(await page.evaluate(()=>profitTotals(()=>true).cost.toString()),'46000000','Confirmed costs survive reload');
    await page.selectOption('#enhancement-source','key');
    await page.fill('#enhancement-from',today);await page.fill('#enhancement-to',today);
    await page.click('#enhancement-refresh');
    await page.waitForFunction(()=>document.querySelector('#enhancement-status').textContent.includes('조회 완료'));
    assert.equal(await page.locator('.enhancement-row').count(),1,'Reimport showed confirmed events again');
    const starforce=page.locator('.enhancement-row');
    await starforce.locator('.enhancement-details > summary').click();
    const scroll=await page.evaluate(()=>scrollY);
    await starforce.locator('[data-unit]').fill('12345678');
    await page.waitForTimeout(350);
    assert(Math.abs(await page.evaluate(()=>scrollY)-scroll)<3,'Editing jumped the page');
    await starforce.locator('[data-calculate]').click();
    assert.equal(await starforce.locator('[data-amount]').inputValue(),'12345678');
    await starforce.locator('[data-confirm]').click();
    assert.equal(await page.evaluate(()=>profitTotals(()=>true).cost.toString()),'58345678');
    assert.equal(await page.evaluate(()=>JSON.stringify({records:db.records,profits:db.profits,expenses:db.expenses,chars:db.chars})),manualBefore,'Manual records were mutated');
    const saved=await page.evaluate(()=>JSON.stringify(db.enhancements));
    fail=true;
    await page.click('#enhancement-refresh');
    await page.waitForFunction(()=>!document.querySelector('#enhancement-refresh').disabled);
    assert.equal(await page.evaluate(()=>JSON.stringify(db.enhancements)),saved,'Failed API replaced imported history');
    const backup=await page.evaluate(()=>backupDataPayload(db));
    assert(backup.enhancements.events.length===2);
    assert(!JSON.stringify(backup).includes('fixture-api-key'),'Backup leaked API key');
    await page.evaluate(backup=>{
      const stale=JSON.parse(JSON.stringify(backup));delete stale.enhancements;
      db=trackerDbFromData(stale,nexonApiKey());
      if(MapleEnhancements.profits(db.enhancements).length!==2) throw new Error('Old backup discarded new ledger');
      applyCloudSnapshot({data:stale,updatedAt:Date.now()});
      if(MapleEnhancements.profits(db.enhancements).length!==2) throw new Error('Old cloud snapshot discarded new ledger');
    },backup);
    await page.locator('.enhancement-confirmed summary').click();
    await page.locator('[data-undo]').first().click();
    assert.equal(await page.evaluate(()=>MapleEnhancements.profits(db.enhancements).length),1);
    assert.equal(await page.evaluate(()=>MapleEnhancements.groups(db.enhancements).length),0,'Cancellation should retain exclusion tombstone');
    await page.evaluate(()=>{
      const raw={character_name:'테스트 캐릭터',target_item:'가디언 엔젤 링',date_create:todayStr()+'T12:00:00+09:00',before_starforce_count:19,after_starforce_count:20,starforce_event_list:[{cost_discount_rate:'30',starforce_event_range:'0~29'}]};
      MapleEnhancementBridge.commit({events:[...Array.from({length:25},(_,i)=>MapleEnhancements.event('starforce',{...raw,id:'grouped-'+i,before_starforce_count:i%2?19:20,after_starforce_count:i%2?20:21},'fixture-grouped')),MapleEnhancements.event('cube',{...raw,id:'cube-usage',cube_type:'수상한 큐브',item_level:160,before_potential_option:[{grade:'레어'}],after_potential_option:[{grade:'에픽'}]},'fixture-grouped')]});
    });
    assert.equal(await page.locator('.enhancement-row').count(),1,'25 attempts should stay in one item row');
    assert.match(await page.locator('.enhancement-result').innerText(),/25회/);
    await page.locator('.enhancement-details > summary').click();
    assert.equal(await page.locator('[data-detail]').count(),2);
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Expanded costs overflow at '+width);
    }
    await page.click('[data-enhancement-tab="cube"]');
    const cube=page.locator('.enhancement-row');
    assert.match(await cube.innerText(),/수상한 큐브/);
    assert.match(await cube.locator('.enhancement-estimate').innerText(),/큐브 환산액/);
    await cube.locator('.enhancement-details > summary').click();
    assert.equal(await cube.locator('[data-amount]').inputValue(),'4250000','Auto-fill the same-level meso-reset equivalent');
    const beforeCube=await page.evaluate(()=>JSON.stringify(MapleEnhancements.profits(db.enhancements)));
    await cube.locator('[data-confirm]').click();
    assert.match(await page.locator('#enhancement-status').innerText(),/실제 메소/);
    assert.equal(await page.evaluate(()=>JSON.stringify(MapleEnhancements.profits(db.enhancements))),beforeCube,'An unconfirmed equivalent changed actual expenses');
    await cube.locator('[data-exclude]').click();
    await page.evaluate(()=>MapleEnhancementBridge.commit({events:Array.from({length:20},(_,i)=>MapleEnhancements.event('cube',{id:'karma-'+i,date_create:todayStr()+'T12:30:00+09:00',character_name:'테스트 캐릭터',target_item:'루즈 컨트롤 머신 마크',item_level:160,cube_type:'카르마 화이트 에디셔널 큐브',before_additional_potential_option:[{grade:'레전드리'}],after_additional_potential_option:[{grade:'레전드리'}]},'fixture-grouped'))}));
    const karma=page.locator('.enhancement-row');
    assert.match(await karma.locator('.enhancement-estimate').innerText(),/16억 6,000만/);
    await karma.locator('.enhancement-details > summary').click();
    assert.equal(await karma.locator('[data-unit]').inputValue(),'83000000');
    assert.equal(await karma.locator('[data-amount]').inputValue(),'1660000000');
    assert.equal(await page.evaluate(()=>JSON.stringify(MapleEnhancements.profits(db.enhancements))),beforeCube);
    await karma.locator('.enhancement-timeline > summary').click();
    assert.equal(await karma.locator('.enhancement-timeline-row').count(),20);
    assert.match(await karma.locator('.enhancement-timeline-row').first().innerText(),/12:30:00/);
    assert.match(await karma.locator('.enhancement-timeline-row').first().innerText(),/큐브 · 카르마 화이트 에디셔널 큐브/);
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Cube price layout overflow at '+width);
      if(width!==320) await page.locator('#enhancement-panel').screenshot({path:path.join(output,'potential-auto-'+width+'.png')});
    }
    await page.evaluate(()=>{
      const raw={character_name:'테스트 캐릭터',target_item:'루즈 컨트롤 머신 마크',item_level:160,date_create:todayStr()+'T13:01:05+09:00',potential_type:'에디셔널 잠재능력 재설정',before_potential_option:[],after_potential_option:[],before_additional_potential_option:[{grade:'레전드리'}],after_additional_potential_option:[{grade:'레전드리'}]};
      MapleEnhancementBridge.commit({events:[
        MapleEnhancements.event('potential',{...raw,id:'meso-reset'},'fixture-method'),
        ...Array.from({length:23},(_,i)=>MapleEnhancements.event('cube',{...raw,id:'adversary-'+i,target_item:'아스트라 매그넘',item_level:200,cube_type:'대적자의 화이트 에디셔널 큐브',date_create:todayStr()+'T13:02:'+String(i).padStart(2,'0')+'+09:00'},'fixture-method')),
        MapleEnhancements.event('cube',{...raw,id:'destiny-cube',target_item:'데스티니 피스톨',item_level:250,cube_type:'대적자의 블랙 큐브',before_potential_option:[{grade:'레전드리'}],after_potential_option:[{grade:'레전드리'}],potential_type:''},'fixture-method')
      ]});
    });
    await page.click('[data-enhancement-tab="potential"]');
    assert.equal(await page.locator('.enhancement-row').count(),1,'Cube usage must not appear in the meso tab');
    const meso=page.locator('.enhancement-row');
    assert.match(await meso.innerText(),/메소 · 에디셔널 잠재능력/);
    assert.match(await page.locator('#enhancement-summary').innerText(),/8,300만/);
    assert(!await page.locator('#enhancement-summary').innerText().then(t=>t.includes('환산')));
    await meso.locator('.enhancement-details > summary').click();
    assert.equal(await meso.locator('[data-unit]').inputValue(),'83000000');
    await page.click('[data-enhancement-tab="cube"]');
    assert.equal(await page.locator('.enhancement-row').count(),3);
    const astra=page.locator('.enhancement-row').filter({hasText:'아스트라 매그넘'});
    await astra.locator('.enhancement-details > summary').click();
    await astra.locator('.enhancement-timeline > summary').click();
    assert.equal(await astra.locator('.enhancement-timeline-row').count(),20);
    await astra.locator('[data-timeline-next]').click();
    assert.equal(await astra.locator('.enhancement-timeline-row').count(),3);
    assert.match(await astra.locator('.enhancement-timeline-row').first().innerText(),/큐브 · 대적자의 화이트 에디셔널 큐브/);
    assert.equal(await astra.locator('[data-unit]').inputValue(),'88000000');
    for(const item of ['아스트라 매그넘','데스티니 피스톨']) {
      const img=page.locator('.enhancement-row').filter({hasText:item}).locator('.enhancement-item img');
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(img=>img.decode());
      assert(!await img.getAttribute('src').then(src=>src.includes('unavailable')));
    }
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Separated method history overflow at '+width);
      if([1440,390].includes(width)) await page.locator('#enhancement-panel').screenshot({path:path.join(output,'enhancement-methods-'+width+'.png')});
    }
    assert.equal(await page.evaluate(()=>JSON.stringify(MapleEnhancements.profits(db.enhancements))),beforeCube,'Importing separate methods must not change confirmed spending');
    await page.evaluate(()=>{
      const account=db.enhancements.events.find(e=>e.id===todayStr()+'-p').account;
      const legacy=MapleEnhancements.event('potential',{id:todayStr()+'-repair',date_create:todayStr()+'T10:00:00+09:00',character_name:'테스트 캐릭터',target_item:'아스트라 메달',item_level:200,potential_type:'에디셔널 잠재능력 재설정'},account);
      delete legacy.schemaVersion;
      MapleEnhancementBridge.commit({events:[legacy]});
    });
    await page.click('[data-enhancement-tab="potential"]');
    const repair=page.locator('.enhancement-row').filter({hasText:'아스트라 메달'});
    assert.match(await repair.innerText(),/등급 재조회 필요/);
    await repair.locator('.enhancement-details > summary').click();
    const countBeforeRepair=await page.evaluate(()=>db.enhancements.events.length);
    fail=false;repairHistory=true;
    await repair.locator('[data-reload-day]').click();
    await page.waitForFunction(()=>document.querySelector('#enhancement-status').textContent.includes('조회 완료'));
    assert.equal(await page.locator('#enhancement-from').inputValue(),today);
    assert.equal(await page.locator('#enhancement-to').inputValue(),today);
    assert.equal(await page.evaluate(()=>db.enhancements.events.length),countBeforeRepair,'Grade repair duplicated history');
    assert.match(await repair.innerText(),/8,800만/);
    assert.equal(await repair.locator('[data-reload-day]').count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(MapleEnhancements.profits(db.enhancements))),beforeCube,'Grade repair changed confirmed spending');
    assert.equal(await page.evaluate(()=>JSON.stringify({records:db.records,profits:db.profits,expenses:db.expenses,chars:db.chars})),manualBefore,'Grade repair mutated manual records');
    assert(historyCalls>=4);
    oauthReady=true;
    await page.evaluate(()=>sessionStorage.setItem('maple:friends:flow',JSON.stringify({state:'c'.repeat(64),proof:'a'.repeat(64),createdAt:Date.now()})));
    await page.goto(origin+'/?page=home&state='+'c'.repeat(64)+'&code=fixture-code');
    await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('maple:friends:session')||'null')?.account==='fixture-account');
    assert.equal(finishCalls,1);
    assert(!page.url().includes('code='),'Authorization code leaked in the application URL');
    assert(!page.url().includes('state='));
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('maple:friends:flow')),null);
    assert(await page.locator('#enhancement-disconnect').isVisible());
    await page.click('#enhancement-disconnect');
    await page.waitForFunction(()=>!sessionStorage.getItem('maple:friends:session'));
    await page.goto(origin+'/?page=home&code=unbound-code');
    assert(!page.url().includes('code='),'Unbound codes must also be stripped before third-party scripts');
    assert.equal(finishCalls,1,'Unbound callback must not exchange a code');
    for(const search of [
      '?page=home?code=fixture-code&state='+'c'.repeat(64),
      '?page='+encodeURIComponent('home?code=fixture-code&state='+'c'.repeat(64)),
    ]) {
      await page.evaluate(()=>sessionStorage.setItem('maple:friends:flow',JSON.stringify({state:'c'.repeat(64),proof:'a'.repeat(64),createdAt:Date.now()})));
      const calls=finishCalls;
      await page.goto(origin+'/'+search);
      await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('maple:friends:session')||'null')?.account==='fixture-account');
      assert.equal(finishCalls,calls+1,'Nested callback did not complete the bound login');
      assert(!decodeURIComponent(page.url()).includes('fixture-code'),'Nested code remained in URL');
      assert(!page.url().includes('state'));
      await page.click('#enhancement-disconnect');
      await page.waitForFunction(()=>!sessionStorage.getItem('maple:friends:session'));
    }
    for(const search of [
      '?page=home?code=fixture-code',
      '?page=home?code=fixture-code&state='+'b'.repeat(64),
      '?page='+encodeURIComponent('home?code=fixture-code&state='+'c'.repeat(64))+'&state='+'b'.repeat(64),
      '?page=home?code=fixture-code&code=other-code&state='+'c'.repeat(64),
    ]) {
      await page.evaluate(()=>sessionStorage.setItem('maple:friends:flow',JSON.stringify({state:'c'.repeat(64),proof:'a'.repeat(64),createdAt:Date.now()})));
      const calls=finishCalls;
      await page.goto(origin+'/'+search);
      await page.waitForFunction(()=>!sessionStorage.getItem('maple:friends:flow'));
      assert.equal(finishCalls,calls,'An invalid nested callback exchanged credentials');
      assert(!decodeURIComponent(page.url()).includes('code'),'Invalid callback code remained in URL');
      await page.waitForFunction(()=>!document.querySelector('#enhancement-connect').disabled);
      assert(await page.locator('#enhancement-status').evaluate(el=>el.classList.contains('err')),'Configuration hid the callback error');
    }
    oauthFailure=true;
    await page.evaluate(()=>sessionStorage.setItem('maple:friends:flow',JSON.stringify({state:'c'.repeat(64),proof:'a'.repeat(64),createdAt:Date.now()})));
    await page.goto(origin+'/?page=home?code=fixture-code&state='+'c'.repeat(64));
    await page.waitForFunction(()=>!document.querySelector('#enhancement-connect').disabled);
    assert.match(await page.locator('#enhancement-status').innerText(),/TOKEN_EXCHANGE \/ OPENAPI00012/,'Configuration hid the server error');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('maple:friends:session')),null);
    assert.equal(await page.evaluate(()=>JSON.stringify({records:db.records,profits:db.profits,expenses:db.expenses,chars:db.chars})),manualBefore,'Failed login mutated manual records');
    oauthFailure=false;
    expectedAuthCode='fixture+a/b=c%25&d';
    for(const search of [
      '?page=home?code='+encodeURIComponent(expectedAuthCode)+'&state='+'c'.repeat(64),
      '?page='+encodeURIComponent('home?code='+encodeURIComponent(expectedAuthCode)+'&state='+'c'.repeat(64)),
    ]) {
      await page.evaluate(()=>sessionStorage.setItem('maple:friends:flow',JSON.stringify({state:'c'.repeat(64),proof:'a'.repeat(64),createdAt:Date.now()})));
      await page.goto(origin+'/'+search);
      await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('maple:friends:session')||'null')?.account==='fixture-account');
      assert(!decodeURIComponent(page.url()).includes('fixture'),'Encoded credentials remained in URL');
      await page.click('#enhancement-disconnect');
      await page.waitForFunction(()=>!sessionStorage.getItem('maple:friends:session'));
    }
    expectedAuthCode='fixture-code';
    assert.deepEqual(errors,[]);
    const catalog=await page.evaluate(()=>MapleEnhancements.equipment.filter(([name])=>/^(데스티니|아스트라) /.test(name)).map(([name])=>({name,icon:MapleEnhancements.itemInfo(name).icon})));
    assert.equal(catalog.length,83);
    const gallery=await context.newPage();
    await gallery.goto(origin+'/about/');
    await gallery.setViewportSize({width:1100,height:1200});
    for(const family of ['데스티니','아스트라']) {
      await gallery.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><link rel="stylesheet" href="'+origin+'/assets/typography.css"><style>body{margin:24px;background:#2d3239;color:#f5f6f8;font-family:"Nanum Gothic",sans-serif}main{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}figure{margin:0;padding:12px 6px;text-align:center;background:#22272e;border-radius:6px}img{width:58px;height:58px;object-fit:contain;image-rendering:pixelated}figcaption{font-size:12px;margin-top:8px;line-height:1.4;word-break:keep-all}</style><h1>'+family+' 장비 아이콘</h1><main>'+catalog.filter(i=>i.name.startsWith(family)).map(i=>'<figure><img alt="'+i.name+'" src="'+origin+'/'+i.icon+'"><figcaption>'+i.name+'</figcaption></figure>').join('')+'</main></html>');
      await gallery.locator('img').evaluateAll(async images=>{
        for(const img of images) {
          await img.decode();
          if(img.naturalWidth<10 || img.naturalHeight<10) throw new Error('Invalid icon dimensions: '+img.alt);
          const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
          const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
          if(!ctx.getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3 && v>0)) throw new Error('Blank icon: '+img.alt);
        }
      });
      await gallery.evaluate(()=>document.fonts.ready);
      await gallery.screenshot({path:path.join(output,family==='데스티니'?'destiny-icons.png':'astra-icons.png'),fullPage:true});
    }
    await context.close();
    console.log('Enhancement UI, aggregate, reload, backup, cloud merge and mobile checks passed.');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
