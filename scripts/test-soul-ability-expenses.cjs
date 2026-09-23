const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

// 실제 이용자의 저장소·인증·네트워크를 사용하지 않는 독립 브라우저 검증입니다.
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tools', 'ui-review');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.gif':'image/gif','.ttf':'font/ttf'};
const server = http.createServer((req,res) => {
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name.endsWith('/')) name+='index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{
    if(error) return res.writeHead(404).end();
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    res.end(data);
  });
});
const input=(form,key)=>form.locator('[data-profit-input="'+key+'"]');
const costPrice=(form,key)=>form.locator('[data-profit-cost-price="'+key+'"]');
const costCount=(form,key)=>form.locator('[data-profit-cost-count="'+key+'"]');
const tab=(page,type)=>page.locator('[data-enhancement-tab="'+type+'"]');
async function navigate(page,name) {
  await page.evaluate(name=>openPage(name),name);
  await page.evaluate(()=>document.fonts.ready);
}
const preserved=page=>page.evaluate(()=>JSON.stringify({
  profits:db.profits.filter(r=>r.id.startsWith('keep-')),
  records:db.records,expenses:db.expenses,enhancements:db.enhancements,
  backups:db.backupSnapshots,huntTombstones:db.huntTombstones,
  dropRecovery:localStorage.getItem(DROP_RECOVERY_KEY),
  huntRecovery:localStorage.getItem(HUNT_RECOVERY_KEY),
  huntJournal:localStorage.getItem(HUNT_JOURNAL_KEY),
  friendsSession:sessionStorage.getItem('maple:friends:session'),
  friendsFlow:sessionStorage.getItem('maple:friends:flow')
}));
const ledger=page=>page.evaluate(()=>JSON.stringify({
  profits:db.profits,expenses:db.expenses,enhancements:db.enhancements,
  totals:profitTotals(()=>true),categories:spendingCategoryRows(()=>true)
},(_,value)=>typeof value==='bigint'?value.toString():value));
const totals=page=>page.evaluate(()=>{
  const day=profitTotals(d=>d==='2026-09-17');
  const month=monthlyReportData('2026-09');
  const all=profitTotals(()=>true);
  return {dayCost:String(day.cost),dayNet:String(day.net),monthCost:String(month.profit.cost),monthNet:String(month.net),allCost:String(all.cost),allCount:all.count,directCount:db.expenses.length};
});
async function checkLayout(page,label) {
  const failures=await page.evaluate(()=>{
    const box=document.getElementById('manual-enhancement-calculator');
    const bad=[];
    for(const el of box.querySelectorAll('input,select,button,.profit-line,table,th,td,summary')) {
      const r=el.getBoundingClientRect();
      if(r.width && (r.left < -1 || r.right > innerWidth+1)) bad.push({tag:el.tagName,id:el.id,right:r.right});
    }
    return bad;
  });
  assert.deepEqual(failures,[],label+' 필드가 화면을 벗어남');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' 페이지 가로 넘침');
}

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
    await fixtureDismissPatchNotes(context);
    await context.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('data:')?route.continue():route.abort());
    const page=await context.newPage(),errors=[],alerts=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept();});
    await page.clock.setFixedTime(new Date('2026-09-18T12:00:00+09:00'));
    await page.goto(origin+'/?page=expense');
    await page.evaluate(()=>{
      db.chars=[];
      db.profits=normalizeProfitRecords([
        {id:'keep-starforce',date:'2026-09-17',type:'starforce',itemName:'기존 장비',costs:[{id:'used',price:'11000000',count:1}],outputs:[],createdAt:'2026-09-17T01:00:00Z'},
        {id:'keep-wonderberry',date:'2026-09-18',type:'wonderberry',costs:[{id:'wonderberry',price:'1000000',count:2}],outputs:[{id:'wonder_black',name:'기존 판매',price:'30000000',count:1,fee:3,sold:true}],createdAt:'2026-09-18T01:00:00Z'}
      ]);
      db.expenses=normalizeExpenseRecords([{id:'keep-direct',date:'2026-09-18',category:'equipment',amount:'5500000',memo:'기존 구매'}]);
      db.records=normalizeRecords({'2026-09-17':{sessions:[{id:'keep-hunt',meso:'123456789',erda:0,runs:1}]}},db.settings);
      const E=MapleEnhancements;
      const event=E.event('potential',{id:'keep-api',character_name:'가상 캐릭터',target_item:'아스트라 매그넘',date_create:'2026-09-17T10:00:00+09:00',item_level:200,potential_type:'잠재능력',before_potential_option:[{grade:'레전드리'}],after_potential_option:[{grade:'레전드리'}]},'fixture-account');
      const state=E.merge({events:[event]});
      db.enhancements=E.confirm(state,E.groups(state)[0],'45000000','keep-api-confirmation');
      save();renderAll();
      localStorage.setItem(DROP_RECOVERY_KEY,JSON.stringify([{id:'keep-drop-recovery',createdAt:'2026-09-17T01:00:00Z',reason:'검증용 기존 보스 보호본',data:{chars:[]}}]));
      localStorage.setItem(HUNT_RECOVERY_KEY,JSON.stringify([{id:'keep-hunt-recovery',createdAt:'2026-09-17T01:00:00Z',reason:'검증용 기존 재획 보호본',data:compactHuntRecoveryData(db)}]));
      sessionStorage.setItem('maple:friends:session',JSON.stringify({sessionId:'isolated-test-session',expiresAt:Date.now()+86400000}));
      sessionStorage.setItem('maple:friends:flow',JSON.stringify({state:'isolated-flow',proof:'isolated-proof',createdAt:Date.now()}));
    });
    const original=await preserved(page),before=await totals(page);
    const form=page.locator('#manual-enhancement-calculator');
    assert.deepEqual(await page.locator('[data-enhancement-tab]').evaluateAll(elements=>elements.map(el=>el.dataset.enhancementTab)),['starforce','potential','soul_ether','advanced_ability','legacy']);
    assert.equal(await page.locator('[data-manual-expense-tab]').count(),0,'기존 별도 수기 탭이 중복으로 남음');
    assert.equal(await page.locator('#enhancement-panel [role="tablist"]').count(),1,'강화 탭이 한 곳에 통합되지 않음');
    assert.equal(await page.locator('#manual-enhancement-panel').isVisible(),false,'API 탭에서 수기 입력이 함께 표시됨');
    assert.equal(await page.locator('#enhancement-api-panel').isVisible(),true);
    assert.deepEqual(await page.locator('#manual-enhancement-type option').evaluateAll(options=>options.map(o=>o.value)),['starforce','potential','scroll','bonus','ability']);
    await tab(page,'starforce').focus();
    for(const [key,selected] of [['ArrowRight','potential'],['ArrowRight','soul_ether'],['End','legacy'],['ArrowLeft','advanced_ability'],['Home','starforce'],['ArrowLeft','legacy']]) {
      await page.keyboard.press(key);
      assert.equal(await tab(page,selected).getAttribute('aria-selected'),'true','키보드 탭 선택 실패');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.enhancementTab),selected,'키보드 탭 포커스 실패');
    }
    for(const type of ['soul_ether','advanced_ability']) {
      await tab(page,type).click();
      const item=type==='soul_ether'?'soul_ether_1':'advanced_ability_honor_medal';
      for(const [price,count] of [['100',''],['','2'],['0','2'],['100','-1'],['100','1.5']]) {
        await costPrice(form,item).fill(price);await costCount(form,item).fill(count);
        assert.equal(await page.evaluate(()=>buildManualEnhancementRecord()),null,'잘못된 단가/수량이 계산에 포함됨');
        await page.click('#manual-enhancement-save');
        assert.equal(await page.evaluate(()=>db.profits.length),2,'잘못된 단가/수량이 저장됨');
      }
      await costPrice(form,item).fill('');await costCount(form,item).fill('');
    }
    await tab(page,'legacy').click();

    // 탭을 오가거나 새로 렌더링해도 작성 중인 각 지출은 유지해야 합니다.
    await input(form,'used').fill('4321');
    await tab(page,'soul_ether').click();
    assert.equal(await page.locator('#manual-enhancement-panel').isVisible(),true);
    assert.equal(await page.locator('#enhancement-api-panel').isVisible(),true,'소울 탭에서 잠재 API와 증폭·재료비 수기를 함께 표시해야 함');
    assert.equal(await page.locator('#manual-enhancement-type').isVisible(),false);
    await input(form,'date').fill('2026-09-17');
    await input(form,'itemName').fill('테스트 <소울 장비>');
    const soulPrices=['1234567','2000000','3000000','4000000'];
    for(let i=0;i<4;i++) {
      await costPrice(form,'soul_ether_'+(i+1)).fill(soulPrices[i]);
      await costCount(form,'soul_ether_'+(i+1)).fill(String(i+2));
    }
    await input(form,'soulAmplificationMeso').fill('7500000');
    await input(form,'soulPotentialMeso').fill('99999999');
    await tab(page,'potential').click();
    assert.equal(await page.locator('#manual-enhancement-panel').isVisible(),false);
    assert.equal(await page.locator('#enhancement-api-panel').isVisible(),true);
    await tab(page,'soul_ether').click();
    assert.equal(await input(form,'soulPotentialMeso').inputValue(),'99,999,999','API 탭 왕복 중 수기 초안 삭제');
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('workspace:render')));
    assert.equal(await tab(page,'soul_ether').getAttribute('aria-selected'),'true','API 화면 새로고침이 수기 탭 선택을 변경함');
    assert.equal(await page.locator('#manual-enhancement-panel').isVisible(),true);
    assert.equal(await input(form,'soulPotentialMeso').inputValue(),'99,999,999','API 화면 새로고침이 수기 초안을 삭제함');
    await tab(page,'advanced_ability').click();
    assert.equal(await page.locator('#enhancement-api-panel').isVisible(),false,'고급 어빌리티 탭에는 지원하지 않는 API 이력을 표시하지 않음');
    await input(form,'itemName').fill('고급 어빌리티 테스트');
    await costPrice(form,'advanced_ability_honor_medal').fill('5000000');
    await costCount(form,'advanced_ability_honor_medal').fill('3');
    await input(form,'advancedAbilityMeso').fill('900000000');
    await tab(page,'legacy').click();
    assert.equal(await input(form,'used').inputValue(),'4,321');
    await tab(page,'soul_ether').click();
    await page.evaluate(()=>renderAll());
    await navigate(page,'stats');await navigate(page,'expense');
    assert.equal(await input(form,'date').inputValue(),'2026-09-17');
    assert.equal(await input(form,'itemName').inputValue(),'테스트 <소울 장비>');
    assert.equal(await input(form,'soulPotentialMeso').inputValue(),'99,999,999');
    assert.equal(await page.evaluate(()=>String(profitRecordTotals(buildManualEnhancementRecord()).cost)),'147969133');
    assert.equal(await preserved(page),original,'입력·탭 전환이 기존 데이터를 변경함');

    for(const badDate of ['2026-09-16','2026-09-19']) {
      await input(form,'date').fill(badDate);
      await page.click('#manual-enhancement-save');
      assert.equal(await page.evaluate(()=>db.profits.length),2,'적용 전/미래 날짜 저장을 허용함');
    }
    assert(alerts.length>=2,'날짜 오류 안내 누락');
    await input(form,'date').fill('2026-09-17');
    await page.click('#manual-enhancement-save');
    const soul=await page.evaluate(()=>db.profits[0]);
    assert.equal(soul.type,'soul_ether');assert.equal(soul.date,'2026-09-17');
    assert.equal(soul.itemName,'테스트 <소울 장비>');assert.deepEqual(soul.outputs,[]);
    assert.deepEqual(soul.costs.filter(c=>Number(c.price)>0).map(c=>[c.id,String(c.price),c.count]),[
      ['soul_ether_1','1234567',2],['soul_ether_2','2000000',3],['soul_ether_3','3000000',4],['soul_ether_4','4000000',5],
      ['soul_amplification_meso','7500000',1],['soul_potential_meso','99999999',1]
    ]);
    assert.equal(await page.evaluate(()=>String(profitRecordTotals(buildManualEnhancementRecord()).cost)),'0','저장 후 입력값이 남음');
    let current=await totals(page);
    assert.equal(BigInt(current.dayCost)-BigInt(before.dayCost),147969133n);
    assert.equal(BigInt(before.dayNet)-BigInt(current.dayNet),147969133n);
    assert.equal(BigInt(current.monthCost)-BigInt(before.monthCost),147969133n);
    assert.equal(BigInt(before.monthNet)-BigInt(current.monthNet),147969133n);

    await tab(page,'advanced_ability').click();
    assert.equal(await input(form,'advancedAbilityMeso').inputValue(),'900,000,000','다른 탭 저장이 어빌리티 초안을 지움');
    assert.equal(await page.evaluate(()=>String(profitRecordTotals(buildManualEnhancementRecord()).cost)),'915000000');
    await page.click('#manual-enhancement-save');
    const ability=await page.evaluate(()=>db.profits[0]);
    assert.equal(ability.type,'advanced_ability');assert.deepEqual(ability.outputs,[]);
    assert.deepEqual(ability.costs.filter(c=>Number(c.price)>0).map(c=>[c.id,String(c.price),c.count]),[
      ['advanced_ability_honor_medal','5000000',3],['advanced_ability_meso','900000000',1]
    ]);
    // 보유/무료 명성치는 자동 환산하지 않습니다. 메소만 쓴 경우도 저장할 수 있어야 합니다.
    await input(form,'advancedAbilityMeso').fill('1234567');
    await page.click('#manual-enhancement-save');
    const onlyMeso=await page.evaluate(()=>db.profits[0]);
    assert.equal(await page.evaluate(()=>String(profitRecordTotals(db.profits[0]).cost)),'1234567');
    assert.equal(onlyMeso.costs.filter(c=>c.count>0&&Number(c.price)>0).length,1);
    const countAfterSave=await page.evaluate(()=>db.profits.length);
    await page.click('#manual-enhancement-save');
    assert.equal(await page.evaluate(()=>db.profits.length),countAfterSave,'0원 빈 기록이 저장됨');
    current=await totals(page);
    assert.equal(BigInt(current.allCost)-BigInt(before.allCost),1064203700n);
    assert.equal(BigInt(current.monthCost)-BigInt(before.monthCost),1064203700n);
    assert.equal(BigInt(before.monthNet)-BigInt(current.monthNet),1064203700n);
    assert.equal(current.allCount-before.allCount,3);
    assert.equal(current.directCount,before.directCount,'수기 기록이 직접 구매 지출에도 중복 저장됨');
    assert.deepEqual(await page.evaluate(()=>spendingCategoryRows(()=>true).filter(r=>['soul_ether','advanced_ability'].includes(r.id)).map(r=>({id:r.id,total:String(r.total),count:r.count})).sort((a,b)=>a.id.localeCompare(b.id))),[
      {id:'advanced_ability',total:'916234567',count:2},{id:'soul_ether',total:'147969133',count:1}
    ]);
    assert.equal(await preserved(page),original,'신규 저장이 기존 장부/API/복구/인증 데이터를 변경함');
    for(const record of [soul,ability]) {
      const card=page.locator('.profit-record').filter({has:page.locator('[data-profit-delete="'+record.id+'"]')});
      const details=card.locator('details');
      assert.equal(await details.count(),1,'저장한 비용 내역을 다시 볼 수 없음');
      await details.locator('summary').click();
      const text=await details.innerText();
      for(const line of record.costs.filter(line=>line.count>0&&Number(line.price)>0)) assert(text.includes(line.name),'비용 내역에서 품목명 누락: '+line.name);
    }

    await navigate(page,'profit');
    assert.equal(await page.locator('#profit-records .profit-record').count(),1,'강화 지출이 손익 판매 기록에 섞임');
    assert.equal(await page.locator('[data-profit-type="soul_ether"],[data-profit-type="advanced_ability"]').count(),0);
    const after=await ledger(page);
    await page.reload();
    assert.equal(await ledger(page),after,'새로고침 중 새 지출 데이터 변형');
    await page.evaluate(()=>{
      const backup=exportBackupBundle();
      db=trackerDbFromData(backup,'',db.backupSnapshots);
      applyCloudSnapshot({data:exportDb(),updatedAt:Date.now()});
      save();renderAll();
    });
    assert.equal(await ledger(page),after,'JSON/클라우드 왕복 중 지출 변형');
    assert.equal(await preserved(page),original,'JSON/클라우드 왕복이 기존 기록을 변경함');

    await navigate(page,'expense');
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      for(const type of ['soul_ether','advanced_ability']) {
        await tab(page,type).click();
        await costPrice(form,type==='soul_ether'?'soul_ether_1':'advanced_ability_honor_medal').fill('9007199254740993');
        await costCount(form,type==='soul_ether'?'soul_ether_1':'advanced_ability_honor_medal').fill('3');
        assert.equal(await page.evaluate(()=>String(profitRecordTotals(buildManualEnhancementRecord()).cost)),'27021597764222979','2^53 초과 단가와 합계의 정밀도 손실');
        const broken=await form.locator('img').evaluateAll(async images=>{
          await Promise.all(images.map(image=>image.decode().catch(()=>{})));
          return images.filter(image=>!image.naturalWidth).map(image=>image.getAttribute('src'));
        });
        assert.deepEqual(broken,[],type+' 아이콘 로딩 실패');
        await checkLayout(page,width+' '+type);
        assert.equal(await page.locator('#enhancement-panel [role="tablist"]').count(),1);
        assert(await page.locator('[data-enhancement-tab]').evaluateAll(buttons=>buttons.every(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})),width+' 통합 탭이 화면에서 잘림');
        await page.locator('#enhancement-panel').screenshot({path:path.join(output,'unified-'+type+'-'+width+'.png')});
        await form.screenshot({path:path.join(output,type+'-'+width+'.png')});
        await form.locator('.resource-cost-guide summary').click();
        await checkLayout(page,width+' '+type+' 안내 펼침');
        await form.screenshot({path:path.join(output,type+'-guide-'+width+'.png')});
        await form.locator('.resource-cost-guide summary').click();
      }
      await page.locator('#manual-enhancement-records details').evaluateAll(elements=>elements.forEach(element=>element.open=true));
      await page.locator('#manual-enhancement-records').screenshot({path:path.join(output,'soul-ability-records-'+width+'.png')});
    }
    assert.equal(await ledger(page),after,'반응형 화면 변경이 저장된 기록을 변경함');
    await page.click('[data-profit-delete="'+onlyMeso.id+'"]');
    assert.equal(await page.evaluate(id=>db.profits.some(r=>r.id===id),onlyMeso.id),false);
    assert.equal(BigInt((await totals(page)).allCost)-BigInt(before.allCost),1062969133n,'삭제 금액이 집계에서 정확히 한 번 빠지지 않음');
    assert.equal(await preserved(page),original,'새 기록 삭제가 기존 데이터를 변경함');
    assert.deepEqual(errors,[],'브라우저 실행 오류');
    console.log('소울 에테르·고급 어빌리티 지출: 비용 합계, 날짜, 초안, 상세 조회, 일·월 집계, 기존 기록·인증 보존, JSON/클라우드/새로고침, 삭제, 320/390/1440px 통과.');
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
