// 합성 장부만 사용하는 9월 신규 드랍의 기간·정산·복원 회귀 검사입니다.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  let name=new URL(req.url,'http://localhost').pathname;
  if(name.endsWith('/')) name+='index.html';
  const file=path.resolve(root,'.'+decodeURIComponent(name));
  if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    await context.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('data:')?route.continue():route.abort());
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install({time:new Date('2026-09-17T12:00:00+09:00')});
    await page.goto(origin+'/?page=boss');
    const result=await page.evaluate(()=>{
      const c=normalizeChar({name:'신규 드랍 검증',server:'main',worldName:'크로아'});
      const oldWeek='2026-09-10',week='2026-09-17',boss=BOSS_MAP.nadv;
      bossStore(c,oldWeek).nadv=1;
      const original=dropItemsForBoss(boss).find(item=>!item.availableFrom);
      if(!original) throw new Error('기존 드랍 표본 없음');
      const oldKey=dropKey(boss,original);
      dropStore(c,oldWeek)[oldKey]=true;
      dropPriceStore(c,oldWeek)[oldKey]='123456789';
      dropShareStore(c,oldWeek)[oldKey]={party:1,fee:0};
      bossStore(c,week).nadv=1;
      const before=JSON.stringify({drops:c.dropWeeks[oldWeek],prices:c.dropPriceWeeks[oldWeek]});
      const oldIncome=BigInt(charSum(c,oldWeek).w)+dropPriceSumForCharWeek(c,oldWeek);
      const mapped=Object.entries(DROP_ITEMS).flatMap(([id,items])=>items.filter(item=>item.availableFrom).map(item=>[id,item.id]));
      const group=BOSS_GROUPS.w.find(group=>group.name==='최초의 대적자');
      const oldMarkup=dropChecklistHtml(group,boss,c,oldWeek);
      const newMarkup=dropChecklistHtml(group,boss,c,week);
      const oldIncomeAfter=BigInt(charSum(c,oldWeek).w)+dropPriceSumForCharWeek(c,oldWeek);
      db.chars=[c];openChars.add(c.name);weeklyBossViewWeek=week;save();renderAll();
      window.dropTestOldIncome=oldIncome.toString();
      return {mapped,oldMarkup,newMarkup,preserved:before===JSON.stringify({drops:c.dropWeeks[oldWeek],prices:c.dropPriceWeeks[oldWeek]}),oldIncome:oldIncome.toString(),oldIncomeAfter:oldIncomeAfter.toString()};
    });
    assert.equal(result.mapped.length,16);
    const expected={nadv:1,hadv:1,xadv:1,nkali:1,hkali:1,xkali:1,nbellona:2,hbellona:2,nstar:2,hstar:2,nlimbo:3,hlimbo:3,nbal:3,hbal:3,njup:4,hjup:4};
    assert.deepEqual(Object.fromEntries(result.mapped),Object.fromEntries(Object.entries(expected).map(([id,stage])=>[id,'soul_ether_'+stage])));
    assert(!result.oldMarkup.includes('soul_ether_1'));
    assert(result.newMarkup.includes('soul_ether_1'));
    assert(!result.newMarkup.includes('src=""'));
    assert(result.newMarkup.includes('1단계 소울 에테르'));
    assert(result.preserved);assert.equal(result.oldIncome,result.oldIncomeAfter);
    const check=page.locator('input.drop-check[data-key="nadv|soul_ether_1"]');
    await check.evaluate(el=>{el.closest('details').open=true;});
    await check.check();
    const price=page.locator('input.drop-price[data-key="nadv|soul_ether_1"]');
    await price.fill('200000000');
    await price.blur();
    await page.locator('select.drop-fee[data-key="nadv|soul_ether_1"]').selectOption('0');
    const saved=await page.evaluate(()=>{
      const c=db.chars[0],week='2026-09-17';
      const backup=JSON.parse(JSON.stringify(trackerDbFromData(db)));
      const restored=normalizeChar(backup.chars[0]);
      return {selected:!!c.dropWeeks[week]['nadv|soul_ether_1'],sum:dropPriceSumForCharWeek(c,week).toString(),old:(BigInt(charSum(c,'2026-09-10').w)+dropPriceSumForCharWeek(c,'2026-09-10')).toString(),restored:dropPriceSumForCharWeek(restored,week).toString()};
    });
    assert(saved.selected);assert.equal(saved.sum,'200000000');assert.equal(saved.restored,saved.sum);assert.equal(saved.old,result.oldIncome);
    await page.reload();
    assert.equal(await page.evaluate(()=>dropPriceSumForCharWeek(db.chars[0],'2026-09-17').toString()),'200000000');
    assert.equal(await page.locator('input.drop-check[data-key="nadv|soul_ether_1"]').isChecked(),true);
    const output=path.join(root,'.tools','ui-review');fs.mkdirSync(output,{recursive:true});
    for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:900});
      await page.goto(origin+'/updates/2026-09/');
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('h1').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'패치 안내 가로 넘침: '+width);
      await page.screenshot({path:path.join(output,'september-update-'+width+'.png'),fullPage:true});
    }
    assert.deepEqual(errors,[]);
    console.log('신규 소울 에테르 16개 난이도 매핑·시행일·실제 드랍 저장·정산·JSON 복원·새로고침·과거 수입 보존·패치 안내 3개 화면 폭 검사 통과.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
