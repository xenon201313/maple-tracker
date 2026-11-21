const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tools', 'icon-review');
fs.mkdirSync(output, {recursive:true});
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const catalog = vm.runInNewContext(html.slice(html.indexOf('const DOMINATOR_PENDANT_IMG ='), html.indexOf('function bossParts(')) + ';({DROP_ITEMS,DAILY_DROP_ITEMS})');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/drops/SOURCES.json'), 'utf8'));
const octoberManifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/drops/october/sources.json'), 'utf8'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
// Image repairs must not rename stored item keys or change box/result relationships.
// 10월 신규 난이도를 분리하여 기존 69종의 저장 키와 상자 관계 검증을 그대로 유지합니다.
const baselineCatalog=JSON.parse(JSON.stringify(catalog));
delete baselineCatalog.DROP_ITEMS.xlimbo;
delete baselineCatalog.DROP_ITEMS.xbal;
for(const group of Object.values(baselineCatalog)) for(const key of Object.keys(group)) group[key]=group[key].filter(item=>!/^soul_ether_[1-4]$/.test(item.id));
assert.equal(hash(JSON.stringify(baselineCatalog, (key, value) => key === 'img' ? undefined : value)), '54d37e96003d3e15e6fa7dbf460c7859e79593ca6e8e2c1feda4c1de7557ba38');
const existingGroups=Object.entries(catalog.DROP_ITEMS).filter(([id])=>!['xlimbo','xbal'].includes(id));
const newItems=existingGroups.flatMap(([,items])=>items).filter(item=>/^soul_ether_[1-4]$/.test(item.id));
assert.equal(newItems.length,16);
assert.equal(new Set(newItems.map(item=>item.id)).size,4);
for(const item of newItems){ assert.equal(item.availableFrom,'2026-09-17'); assert.equal(item.img,'assets/drops/'+item.id+'.webp','소울 에테르 단계별 원본 아이콘'); }
assert.equal(Object.values(catalog.DROP_ITEMS).flat().filter(item=>/^soul_ether_[1-4]$/.test(item.id)).length,18,'신규 익스트림 2개 그룹의 3단계 에테르도 포함');
for(const [id,base,slot] of [['xlimbo','hlimbo','pocket'],['xbal','hbal','pendant']]){
  const list=catalog.DROP_ITEMS[id];
  assert.equal(list.length,8,id+'의 기존 하드 보상 7개와 신규 해머 1개');
  assert.equal(JSON.stringify(list.slice(0,-1)),JSON.stringify(catalog.DROP_ITEMS[base]),id+'는 기존 하드 보상의 아이콘·저장 키를 보존');
  assert.equal(list.at(-1).id,'exceptional_hammer_'+slot);
  assert.equal(list.at(-1).availableFrom,'2026-10-22');
  assert.equal(list.filter(item=>item.id==='soul_ether_3').length,1);
}
const items = new Map();
function visit(item) {
  assert.match(item.img, /^assets\//, item.id + ' must use a bundled icon');
  if (items.has(item.id)) assert.equal(items.get(item.id).img, item.img, item.id + ' inconsistent icon');
  items.set(item.id, item);
  (item.children || []).forEach(visit);
}
Object.values(catalog).flatMap(group => Object.values(group).flat()).forEach(visit);
assert.equal(items.size, 75,'기존 73종과 10월 신규 해머 2종');
assert.equal(manifest.items.length, 73,'기존 원본 아이콘 출처 73종 유지');
assert.equal(octoberManifest.source,'https://maplestory.nexon.com/Guide/N23GameInformation/Articles/459');
assert.equal(octoberManifest.verifiedOn,'2026-10-22');
assert.deepEqual(octoberManifest.items.map(item=>item.id).sort(),['exceptional_hammer_pendant','exceptional_hammer_pocket']);
for(const source of octoberManifest.items){
  assert.match(source.source,/^https:\/\/dszw1qtcnsa5e\.cloudfront\.net\/quickboard\/20261015\//,'공식 보상표 원본');
  assert.equal(source.crop.length,4);
  assert.deepEqual(source.crop.slice(2),[32,32],'공식 보상표에서 자른 실제 아이콘 크기');
  const bytes=fs.readFileSync(path.join(root,source.file));
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert.equal(bytes.readUInt32BE(16),32);
  assert.equal(bytes.readUInt32BE(20),32);
}
const allSources=[...manifest.items,...octoberManifest.items];
assert.equal(new Set(allSources.map(item=>item.id)).size,items.size);
assert(![...items.values()].some(item=>item.name==='근원의 그림자 모몽'),'드랍 조건 미확정 모몽을 보스 판매 목록에 연결하지 않음');
for (const item of items.values()) {
  const source = allSources.find(entry => entry.id === item.id);
  assert.equal(source?.file, item.img, item.id + ' source manifest');
  const bytes = fs.readFileSync(path.join(root, item.img));
  assert.equal(hash(bytes), source.sha256, item.id + ' original pixels changed');
}

const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json'};
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    res.end(bytes);
  });
});

async function assertImages(page, selector) {
  const broken = await page.locator(selector).evaluateAll(async images => {
    images.forEach(img => { img.loading = 'eager'; });
    await Promise.all(images.map(img => img.decode().catch(() => {})));
    await new Promise(resolve => setTimeout(resolve, 100));
    return images.filter(img => !img.naturalWidth || img.dataset.imageUnavailable || img.src.includes('image-unavailable.svg')).map(img => ({name:img.alt, src:img.getAttribute('src')}));
  });
  assert.deepEqual(broken, [], selector + ' missing/placeholder images');
}
async function snapshot(page) {
  return page.evaluate(() => {
    const entries = value => Object.fromEntries(Object.entries(value || {}).filter(([,v]) => Object.keys(v).length).sort(([a],[b]) => a.localeCompare(b)));
    return JSON.stringify({records:db.records,profits:db.profits,expenses:db.expenses,enhancements:db.enhancements,chars:db.chars.map(c => Object.fromEntries([
      'bossWeeks','dropWeeks','dropPriceWeeks','monthBossMonths','monthDropMonths','monthDropPriceMonths','dailyBossDays','dailyDropDays','dailyDropPriceDays'
    ].map(key => [key, entries(c[key])])))});
  });
}

async function checkExpenseImages(page, origin) {
  // The red and pink pendants share one atlas but must decode to different item art.
  const examples = ['에테르넬 나이트헬름', '베어스 그린 펜던트', '아스트라 매그넘', '고통의 근원', '파풀라투스 마크',
    '베어스 레드 펜던트', '베어스 핑크 펜던트'];
  const unknown = '아이콘 테스트 전용 미등록 장비';
  const namedRow = (selector, name) => page.locator(selector).filter({has:page.getByText(name,{exact:true})});
  await page.goto(origin+'/?page=expense');
  const official='https://open.api.nexon.com/static/maplestory/item/icon/KEPCOOGB';
  const snapshotLookup=await page.evaluate(official=>{
    const original=db.planner;
    try {
      db.planner={investments:[
        {equipment:{name:'스냅샷 합성장비',icon:official}},
        {equipment:{name:'삭제한 합성장비',icon:official},deletedAt:Date.now()},
        {equipment:{name:'주소가 다른 합성장비',icon:'https://example.invalid/KEPCOOGB'}},
        {equipment:{name:'경로가 다른 합성장비',icon:'https://open.api.nexon.com/account'}},
        {equipment:{name:'로그인 정보',icon:'https://open.api.nexon.com/static/maplestory/item/icon/KEPCOOGB?token=fixture'}}
      ]};
      return ['스냅샷합성장비','스냅샷 합성장비 장식','삭제한 합성장비','주소가 다른 합성장비','경로가 다른 합성장비','로그인 정보']
        .map(name=>resolveItemImage({name,img:' NULL '}));
    } finally { db.planner=original; }
  },official);
  assert.deepEqual(snapshotLookup,[official,'','','','',''],'Only an exact, active equipment snapshot on the Nexon item CDN can supply missing art');
  await page.evaluate(({examples,unknown}) => {
    const date = todayStr();
    // These are saved history records from the previous schema, with no item image or equipment ID.
    const events = [...examples,unknown].map((item,i) => MapleEnhancements.event('potential',{
      id:'icon-example-'+i, character_name:'예시 캐릭터', target_item:item, item_level:[250,100,200,160,145,110,120][i] || 160,
      date_create:date+'T01:02:03+09:00', potential_type:'잠재능력',
      before_potential_option:[{grade:'에픽'}], after_potential_option:[{grade:'에픽'}]
    },'icon-fixture'));
    db.profits = [normalizeProfitRecord({id:'manual-icon',date,type:'starforce',itemName:examples[1],
      costs:[{id:'manual',price:'100',count:1}]})];
    db.expenses = [normalizeExpenseRecord({id:'receipt-icon',date,category:'equipment',amount:'100',memo:'이름 없는 구매 메모'})];
    MapleEnhancementBridge.commit({events});
  },{examples,unknown});
  await page.reload();
  const saved = await snapshot(page);
  const sources = await page.evaluate(names => names.map(name => resolveItemImage({name})),examples);
  assert.deepEqual(examples.filter((name,i)=>!sources[i]),[],'Missing exact equipment image');
  // Original PNGs from open.api.nexon.com/static/maplestory/item/icon/{code} on 2026-11-22.
  for(const [i,digest] of ['a3af1a2eafc4d60ebd49651b3ff091d4d7ad40830a74e822f548886f0e69d285',
    '68be5fd45ae03f62b87725536f321f98eed09e85c96c56aaabbfb80a7e060a6f'].entries()) {
    assert.equal(hash(fs.readFileSync(path.join(root,sources[i]))),digest,examples[i]+' should use the original Nexon image');
  }
  assert.equal(new Set(sources).size,examples.length,'Different equipment resolved to the same image');
  assert.equal(await page.evaluate(name=>resolveItemImage({name}),unknown),'','An unknown name resolved to another item');
  const referenceDigests = {
    '베어스 레드 펜던트':'a09b709f1146d28fdefac57ab8067a7e5a00cc393996c0b2def4f982b05d0c69',
    '베어스 핑크 펜던트':'7ce52971d14683c87bde6bab2556d5211d8fba31e35a66a2784de4933f2384bd'
  };
  const references = {};
  for(const [name,digest] of Object.entries(referenceDigests)) {
    const url=new URL(sources[examples.indexOf(name)],origin);
    const atlas=fs.readFileSync(path.join(root,url.pathname),'utf8');
    const original=[...atlas.matchAll(/data:image\/png;base64,([a-z\d+/=]+)/gi)].map(match=>match[1])
      .find(png=>hash(Buffer.from(png,'base64'))===digest);
    assert(original,name+' original Nexon PNG must be present in its atlas');
    references[name]=original;
  }
  await page.click('[data-enhancement-tab="potential"]');
  const pixels = [];
  for(const [i,name] of examples.entries()) {
    const row=namedRow('.enhancement-row',name), img=row.locator('.enhancement-item-image img');
    assert.equal(await img.count(),1,name+' grouped record');
    pixels.push(await img.evaluate(async (el,{src,png})=>{
      el.loading='eager'; await el.decode();
      if(el.src!==new URL(src,location.href).href) throw Error('Incorrect item source for '+el.alt+': '+el.src+' expected '+src);
      const canvas=document.createElement('canvas'); canvas.width=el.naturalWidth; canvas.height=el.naturalHeight;
      const ctx=canvas.getContext('2d'); ctx.drawImage(el,0,0);
      if(!ctx.getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>20)) throw Error('Empty item art');
      const actual=canvas.toDataURL();
      if(png){
        // Draw a single, known Nexon PNG with the same SVG fitting rules, without an atlas/fragment.
        // This detects swapped fragments even if Chrome's currentSrc names the first ref to a shared file.
        const single='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><image width="64" height="64" href="data:image/png;base64,'+png+'"/></svg>';
        const reference=new Image(); reference.src='data:image/svg+xml,'+encodeURIComponent(single); await reference.decode();
        ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(reference,0,0);
        if(canvas.toDataURL()!==actual) throw Error('Incorrect item pixels for '+el.alt+': requested '+src+'; src='+el.src+'; currentSrc='+el.currentSrc);
      }
      return actual;
    },{src:sources[i],png:references[name]}));
  }
  assert.equal(new Set(pixels).size,examples.length,'Different equipment displayed identical pixels');
  assert.equal(await namedRow('.enhancement-row',unknown).locator('.expense-item-initials').count(),1,'Unknown name has its own labelled fallback');
  await page.click('[data-enhancement-tab="all"]');
  await page.selectOption('[data-history-kind]','potential');
  for(const [i,name] of examples.entries()) {
    const img=namedRow('.eh-event',name).locator('.eh-art img');
    assert.equal(await img.count(),1,name+' chronological record');
    const url=await img.evaluate(async el=>{el.loading='eager';await el.decode();return el.src;});
    assert.equal(url,new URL(sources[i],origin).href,name+' mismatch between expense views');
  }
  await page.selectOption('[data-history-kind]','manual');
  const manual=namedRow('.eh-event',examples[1]).locator('.eh-art img');
  assert.equal(await manual.count(),1,'Manually saved item name should resolve the same equipment');
  assert.equal(await manual.evaluate(el=>el.src),new URL(sources[1],origin).href);
  assert.equal(await page.locator('.eh-event').filter({hasText:'이름 없는 구매 메모'}).locator('.eh-art img').count(),0,'Free-form purchase memo should not select an equipment icon');

  // A failed image download should not erase the label, mutate saved data or trigger endless retries.
  const failedUrl=new URL(sources[2],origin).href;
  let failures=0;
  await page.route(failedUrl,route=>{failures++;return route.abort();});
  await page.reload();
  await page.selectOption('[data-history-kind]','potential');
  const failedArt=namedRow('.eh-event',examples[2]).locator('.eh-art');
  await failedArt.scrollIntoViewIfNeeded();
  await failedArt.locator('.expense-item-initials').waitFor({state:'visible'});
  assert(failures>0 && failures<=2,'Repeated retries for one broken image: '+failures);
  await page.unroute(failedUrl);
  assert.equal(await snapshot(page),saved,'Looking up art changed recorded amounts or history');

  // Capture the originally reported pair from the grouped expense view using only sample records.
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(names=>{
    db.enhancements={...db.enhancements,events:db.enhancements.events.filter(e=>names.includes(e.item))};
    renderAll();
  },examples.slice(0,2));
  await page.click('[data-enhancement-tab="potential"]');
  assert.equal(await page.locator('.enhancement-row').count(),2);
  await assertImages(page,'.enhancement-item-image img');
  await page.locator('#enhancement-list').screenshot({path:path.join(output,'repaired-equipment.png')});
  return examples.length;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await fixtureDismissPatchNotes(context);
    await context.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    const icons = await page.evaluate(() => [...new Set([
      ...ITEM_ICON_LOOKUP.byId.values(),
      ...MapleEnhancements.equipment.filter(e => e[2]).map(e => 'assets/enhancements/' + e[2] + '.png'),
      'assets/profit/equipment-sprite.png'
    ])]);
    for (const src of icons) {
      assert.match(src, /^(assets\/|data:image\/)/, 'No expiring remote icons: ' + src);
      const pixels = await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 20) visible++;
        return visible;
      }, src);
      assert(pixels > 25, src + ' blank image');
    }
    await page.evaluate(() => {
      const week = currentWeekKey(), month = currentMonthKey(), date = todayStr();
      const c = normalizeChar({name:'아이콘 검증',server:'main',worldName:'크로아'});
      for (const [kind, scope, period] of [['w','weekly',week],['m','monthly',month]]) {
        const bosses = bossStore(c,period,scope), drops = dropStore(c,period,scope), prices = dropPriceStore(c,period,scope);
        for (const group of BOSS_GROUPS[kind]) {
          bosses[group.bosses.at(-1)[0]] = 2;
          for (const boss of group.bosses) for (const item of dropItemsForBoss(boss)) {
            const key = dropKey(boss,item); drops[key] = 1; prices[key] = '123456789';
            if (item.children?.length) { drops[key+'|child|'+item.children[0].id] = 1; prices[key+'|child|'+item.children[0].id] = '987654321'; }
          }
        }
      }
      for (const [id, list] of Object.entries(DAILY_DROP_ITEMS)) {
        dailyBossStore(c,date)[id] = 1;
        for (const item of list) { dailyDropStore(c,date)[id+'|'+item.id] = 1; dailyDropPriceStore(c,date)[id+'|'+item.id] = '77777777'; }
      }
      db.chars = [c];
      db.records = {[date]:{sessions:[{id:'preserve-hunt',kind:'hunt',runs:1,meso:'123456789',erda:30,createdAt:Date.now(),updatedAt:Date.now()}]}};
      save(); renderAll();
    });
    await page.reload();
    assert.equal(await page.evaluate(() => db.records[todayStr()].sessions[0].meso), 123456789);
    const before = await snapshot(page);
    // Render every difficulty, box result, selected chip and settlement, including locked bosses.
    const coverage = await page.evaluate(() => {
      const test = document.createElement('section'); test.id = 'icon-fixture'; test.hidden = true;
      const c = db.chars[0];
      test.innerHTML = [['w','weekly',currentWeekKey()],['m','monthly',currentMonthKey()]].map(([kind,scope,period]) =>
        BOSS_GROUPS[kind].flatMap(group => group.bosses.map(boss => dropChecklistHtml(group,boss,c,period,scope))).join('')
      ).join('') + lootCellHtml([...resolvedDropEntriesForWeek(currentWeekKey()), ...resolvedMonthlyDropEntriesForMonth(), ...resolvedDailyDropEntriesForWeek(currentWeekKey())]);
      document.body.append(test);
      return {icons:test.querySelectorAll('img').length,children:test.querySelectorAll('.drop-child-item img').length,chips:test.querySelectorAll('.drop-chip img').length};
    });
    assert(coverage.icons > 100 && coverage.children > 0 && coverage.chips > 0);
    await assertImages(page, '#icon-fixture img');
    await page.locator('#icon-fixture').evaluate(el => el.remove());
    for (const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      for (const name of ['boss','monthlyboss','dailyboss']) {
        await page.evaluate(name => openPage(name), name);
        if (!await page.locator('.page.active .bosslist.open').count()) await page.locator('.page.active .character-disclosure').first().click();
        await page.locator('.page.active .drop-picker').evaluateAll(list => list.forEach(el => {el.open = true;}));
        await assertImages(page, '.page.active img');
        assert(await page.locator('.page.active .drops img').count() > 0, name + ' must exercise drop UI');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), name + ' overflow at ' + width);
        if ([1440,390].includes(width) && name === 'boss') {
          const card = page.locator('.page.active .bcard').filter({has:page.locator('.bname', {hasText:'찬란한 흉성'})});
          await card.locator('.drop-picker').screenshot({path:path.join(output,'star-drops-'+width+'.png')});
        }
      }
    }
    // Stale/NULL image fields in old records are resolved without mutating the record.
    const repaired = await page.evaluate(() => {
      const old = Object.freeze({id:'kalingroid',name:'카링로이드',img:'https://expired.invalid/old.png',price:'123456789'});
      const nullIcon = Object.freeze({name:'파풀라투스 마크',img:'NULL'});
      const test = document.createElement('section'); test.id = 'icon-repair';
      test.innerHTML = profitIconHtml(old) + profitIconHtml(nullIcon) + '<img id="retry-known" alt="흉성로이드" src="/expired-known.png"><img id="retry-unknown" alt="Unknown item" src="/expired-unknown.png">';
      document.body.append(test);
      return {old:JSON.stringify(old),expected:resolveItemImage(old),nullIcon:resolveItemImage(nullIcon)};
    });
    assert.match(repaired.old, /expired\.invalid/);
    assert.equal(repaired.expected, 'assets/drops/kalingroid.png');
    assert.equal(repaired.nullIcon, 'assets/drops/papulatus_mark.png');
    await page.waitForFunction(() => document.getElementById('retry-known').src.endsWith('assets/drops/starroid.png') && document.getElementById('retry-unknown').dataset.imageUnavailable === 'true');
    await assertImages(page, '#icon-repair img:not(#retry-unknown)');
    await page.locator('#icon-repair').evaluate(el => el.remove());
    assert.equal(await snapshot(page), before, 'Viewing and repairing icons changed ledger records');
    await page.reload();
    assert.equal(await snapshot(page), before, 'Reload changed existing records');
    const expenseSamples=await checkExpenseImages(page,origin);
    assert.deepEqual(errors, [], 'Browser errors');

    const gallery = await context.newPage();
    await gallery.goto(origin + '/assets/drops/SOURCES.json');
    await gallery.setViewportSize({width:1100,height:1000});
    await gallery.setContent('<html lang="ko"><head><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#2e3238;color:#eee;font:14px Arial,sans-serif}main{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px}figure{margin:0;min-height:100px;display:flex;align-items:center;flex-direction:column;gap:12px;text-align:center}img{width:42px;height:42px;object-fit:contain;image-rendering:pixelated}figcaption{word-break:keep-all}</style></head><body><main></main></body></html>');
    await gallery.evaluate(({items,origin}) => {
      document.querySelector('main').replaceChildren(...items.map(item => {
        const figure = document.createElement('figure'), image = new Image(), caption = document.createElement('figcaption');
        image.src = origin + '/' + item.file; image.alt = item.name; caption.textContent = item.name;
        figure.append(image, caption); return figure;
      }));
    }, {items:allSources,origin});
    await assertImages(gallery, 'img');
    await gallery.screenshot({path:path.join(output,'drop-icon-catalog.png'),fullPage:true});
    console.log('Item icons passed:',items.size,'drop IDs,',icons.length,'bundled icons,',coverage.icons,'rendered drop/settlement images,',expenseSamples,'expense items across history and detail views; records unchanged.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
