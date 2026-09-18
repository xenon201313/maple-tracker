const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { chromium } = require('playwright');

// 실제 사용자 브라우저·장부 대신 격리한 브라우저와 검증용 기록만 사용합니다.
const root = path.resolve(__dirname, '..');
const output = process.env.PATCH_NOTES_OUTPUT_DIR || path.join(root, '.tools', 'patch-notes-review');
const storageKey = 'maple_ui_patch_notes_hidden_v1';
const seenKey = 'maple_ui_patch_notes_seen_v1';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server = http.createServer((req,res)=>{
  let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root,'.'+name);
  if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{
    if (error) return res.writeHead(404).end();
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);
  });
});

function catalogSource() { return fs.readFileSync(path.join(root,'assets/patch-notes-data.js'),'utf8'); }
const dialog = page => page.locator('#patch-notes-dialog');
const isOpen = page => dialog(page).evaluate(el=>el.open);
async function waitOpen(page) { await page.waitForFunction(()=>document.getElementById('patch-notes-dialog')?.open); }
async function waitClosed(page) { await page.waitForFunction(()=>!document.getElementById('patch-notes-dialog')?.open); }
const hiddenIds = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),storageKey);
const stateSnapshot = page => page.evaluate(keys=>JSON.stringify({
  ledger:db,
  cloud:{ready:cloudSync.ready,initializing:cloudSync.initializing,syncing:cloudSync.syncing,pendingUpload:cloudSync.pendingUpload,runId:cloudSync.runId,syncId:cloudSync.syncId},
  recovery:cloudHuntRecoverySources,
  local:Object.fromEntries(Object.keys(localStorage).filter(k=>!keys.includes(k)).sort().map(k=>[k,localStorage.getItem(k)])),
  session:Object.fromEntries(Object.keys(sessionStorage).sort().map(k=>[k,sessionStorage.getItem(k)]))
},(_,value)=>typeof value==='bigint'?value.toString():value),[storageKey,seenKey]);

async function openManually(page) {
  if (await page.evaluate(()=>matchMedia('(max-width: 900px)').matches && !document.getElementById('workspace-sidebar').classList.contains('is-open'))) {
    await page.locator('.mobile-nav [data-menu-toggle]').click();
  }
  await page.locator('#patch-notes-open').click();
  await waitOpen(page);
}
async function checkLayout(page,label) {
  const result = await page.evaluate(()=>{
    const modal=document.getElementById('patch-notes-dialog');
    const content=document.getElementById('patch-notes-content');
    const button=document.getElementById('patch-notes-confirm');
    const checkbox=document.getElementById('patch-notes-hide');
    const r=modal.getBoundingClientRect(), c=content.getBoundingClientRect(), b=button.getBoundingClientRect(), k=checkbox.getBoundingClientRect();
    return {
      modalFits:r.left>=-1 && r.right<=innerWidth+1 && r.top>=-1 && r.bottom<=innerHeight+1,
      contentFits:c.left>=r.left-1 && c.right<=r.right+1 && c.top>=r.top-1 && c.bottom<=r.bottom+1,
      buttonFits:b.left>=r.left-1 && b.right<=r.right+1 && b.top>=r.top-1 && b.bottom<=r.bottom+1,
      checkboxFits:k.left>=r.left-1 && k.right<=r.right+1 && k.top>=r.top-1 && k.bottom<=r.bottom+1,
      horizontalOverflow:content.scrollWidth>content.clientWidth+1,
      pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
      canScroll:content.scrollHeight>content.clientHeight+1,
      contentOverflow:getComputedStyle(content).overflowY
    };
  });
  assert(result.modalFits,label+' 팝업이 화면을 벗어났습니다.');
  assert(result.contentFits && result.buttonFits && result.checkboxFits,label+' 내용·확인·체크박스가 팝업을 벗어났습니다.');
  assert(!result.horizontalOverflow && !result.pageOverflow,label+' 가로 넘침이 발생했습니다.');
  if (result.canScroll) {
    assert(['auto','scroll'].includes(result.contentOverflow),label+' 긴 내용을 내부에서 스크롤할 수 없습니다.');
    const before=await page.locator('#patch-notes-confirm').boundingBox();
    await page.locator('#patch-notes-content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const after=await page.locator('#patch-notes-confirm').boundingBox();
    assert(Math.abs(before.y-after.y)<1,label+' 내용 스크롤로 확인 버튼이 움직였습니다.');
    assert(await page.locator('#patch-notes-content').evaluate(el=>el.scrollTop>0),label+' 내부 스크롤이 동작하지 않았습니다.');
  }
  await page.screenshot({path:path.join(output,label+'.png'),fullPage:false});
}

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const sandbox={}; sandbox.window=sandbox;
  vm.runInNewContext(catalogSource(),sandbox);
  const catalog=sandbox.MaplePatchNotesData;
  assert(catalog && Array.isArray(catalog.releases) && catalog.releases.length,'패치노트 데이터가 없습니다.');
  const currentId=catalog.releases[0].id;
  const nextId=currentId+'.next-test';
  const nextDate=new Date(Date.parse(catalog.releases[0].date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  assert.equal(typeof currentId,'string','최신 공지 ID가 문자열이 아닙니다.');
  assert(currentId.trim(),'최신 공지 ID가 비어 있습니다.');
  assert.equal(new Set(catalog.releases.map(release=>release.id)).size,catalog.releases.length,'공지 ID가 중복되었습니다.');
  assert(!catalog.releases.some(release=>release.id===nextId),'검증용 다음 공지 ID가 실제 공지와 충돌합니다.');
  const approvedRelease=catalog.releases.find(release=>release.id==='2026-09-18.1');
  assert(approvedRelease,'승인된 9월 18일 패치 이력이 누락되었습니다.');
  const text=approvedRelease.sections.flatMap(section=>[section.title,...section.items]).join(' ');
  for (const expected of [/하츄핑/,/결정석/,/소울 에테르/,/버섯/,/10월 21일|10\.21/,/9월 24일|9\.24/]) assert.match(text,expected,'승인된 패치 내용 누락');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  const contexts=[];
  const errors=[];
  async function makeContext(options={}) {
    const variant={next:false};
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
    contexts.push(context);
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if (url.origin!==origin && !url.href.startsWith('data:')) return route.abort();
      if (url.pathname==='/assets/patch-notes-data.js' && variant.next) {
        const source=catalogSource()+'\n;MaplePatchNotesData.releases.unshift({...MaplePatchNotesData.releases[0],id:'+JSON.stringify(nextId)+',date:'+JSON.stringify(nextDate)+',title:"새 업데이트 검증"});';
        return route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:source});
      }
      return route.continue();
    });
    if (options.returning) await context.addInitScript(key=>{
      if (!localStorage.getItem(key)) localStorage.setItem(key,'previous-test-release');
    },seenKey);
    if (options.legacyHidden) await context.addInitScript(key=>{
      if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify(['previous-hidden-release']));
    },storageKey);
    if (options.failure) await context.addInitScript(({keys,failure})=>{
      const original=Storage.prototype[failure==='read'?'getItem':'setItem'];
      Storage.prototype[failure==='read'?'getItem':'setItem']=function(k,...args){
        if (keys.includes(k)) throw new DOMException('검증용 저장소 오류','SecurityError');
        return original.call(this,k,...args);
      };
    },{keys:[storageKey,seenKey],failure:options.failure});
    if (options.corrupt) await context.addInitScript(key=>localStorage.setItem(key,'{broken-json'),storageKey);
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',notice=>notice.accept());
    await page.clock.setFixedTime(new Date('2026-09-18T12:00:00+09:00'));
    await page.goto(origin+(options.url||'/?page=home'));
    if (options.expectAuto) await waitOpen(page);
    else await page.waitForFunction(()=>Boolean(window.MaplePatchNotes));
    await page.evaluate(()=>document.fonts.ready);
    return {context,page,variant};
  }
  try {
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const {page,variant}=await makeContext();
    assert.equal(await page.evaluate(()=>MaplePatchNotes.latestId),currentId);
    assert.equal(await page.evaluate(()=>MaplePatchNotes.storageKey),storageKey);
    assert.equal(await page.evaluate(()=>MaplePatchNotes.seenKey),seenKey);
    assert.equal(await isOpen(page),false,'첫 방문에서 팝업이 본문을 가립니다.');
    assert.equal(await page.locator('#patch-notes-notice').isVisible(),true,'첫 방문에 비차단 안내가 없습니다.');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('patch-notes-open') || !!document.getElementById('page-home').closest('[inert]')),false,'첫 방문 본문이 차단되었습니다.');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),seenKey),currentId);
    for (const [width,height] of [[1440,1000],[390,740],[320,568]]) {
      await page.setViewportSize({width,height});
      const fits=await page.locator('#patch-notes-notice').evaluate(el=>{
        const r=el.getBoundingClientRect();
        return r.left>=-1 && r.right<=innerWidth+1 && el.scrollWidth<=el.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth+1;
      });
      assert(fits,'첫 방문 안내가 '+width+'px 화면에서 가로로 넘칩니다.');
      await page.screenshot({path:path.join(output,'first-visit-'+width+'.png'),fullPage:false});
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-patch-notes-details]').focus();
    await page.keyboard.press('Enter');
    await waitOpen(page);
    assert.match(await dialog(page).innerText(),/이 패치노트 다시 보지 않기/);
    assert.equal(await page.locator('#patch-notes-hide').isChecked(),false);
    assert(await page.evaluate(()=>document.getElementById('patch-notes-dialog').contains(document.activeElement)),'공지 내용보기 포커스가 팝업 밖에 있습니다.');

    // 공지 조작이 실제 장부/클라우드/복구/인증 저장을 덮어쓰지 않는지 확인합니다.
    await page.evaluate(()=>{
      db.records=normalizeRecords({'2026-09-18':{sessions:[{id:'patch-note-hunt',meso:'123456789',erda:22,runs:1}]}},db.settings);
      db.profits=normalizeProfitRecords([{id:'patch-note-profit',date:'2026-09-18',type:'teenieping',title:'프린세스 하츄핑 콜라보',costs:[{id:'test-cost',price:'100000000',count:1}],outputs:[{id:'test-output',price:'200000000',count:1,fee:3,sold:true}]}]);
      db.expenses=[normalizeExpenseRecord({id:'patch-note-expense',date:'2026-09-18',category:'equipment',amount:'7654321'})];
      localStorage.setItem(LS_KEY,JSON.stringify(db));
      localStorage.setItem(DROP_RECOVERY_KEY,JSON.stringify([{id:'patch-note-drop-recovery',reason:'검증용 보호본',data:{chars:[]}}]));
      localStorage.setItem(HUNT_RECOVERY_KEY,JSON.stringify([{id:'patch-note-hunt-recovery',reason:'검증용 보호본',data:{records:db.records}}]));
      localStorage.setItem(HUNT_JOURNAL_KEY,JSON.stringify([{id:'patch-note-journal',date:'2026-09-18',meso:'123456789'}]));
      localStorage.setItem('maple:test:cloud-record',JSON.stringify({data:db.records,updatedAt:12345}));
      sessionStorage.setItem('maple:friends:session',JSON.stringify({testOnly:true,session:'isolated-test-session'}));
      sessionStorage.setItem('maple:friends:flow',JSON.stringify({state:'isolated-test-state',proof:'isolated-test-proof'}));
    });
    const before=await stateSnapshot(page);
    await page.locator('[data-patch-notes-close]').click();
    await waitClosed(page);
    assert.deepEqual(await hiddenIds(page),[],'닫기만 했는데 다시 보지 않기가 저장되었습니다.');
    assert.equal(await stateSnapshot(page),before,'팝업 닫기가 기록이나 인증 정보를 변경했습니다.');
    assert.equal(await page.locator('[data-patch-notes-details]').evaluate(el=>el===document.activeElement),true,'안내 내용보기 버튼으로 포커스가 복귀하지 않았습니다.');
    await page.locator('[aria-label="최신 업데이트 안내 닫기"]').click();
    assert.equal(await page.locator('#patch-notes-notice').count(),0,'안내 닫기가 작동하지 않습니다.');
    assert.deepEqual(await hiddenIds(page),[],'안내 닫기가 다시 보지 않기 설정을 덮어썼습니다.');
    await openManually(page);
    await page.locator('#patch-notes-hide').check();
    await page.keyboard.press('Escape');
    await waitClosed(page);
    assert.deepEqual(await hiddenIds(page),[],'Escape가 체크박스 설정을 저장했습니다.');
    assert.equal(await page.locator('#patch-notes-open').evaluate(el=>el===document.activeElement),true,'수동 실행 버튼으로 포커스가 복귀하지 않았습니다.');
    await openManually(page);
    assert.equal(await page.locator('#patch-notes-hide').isChecked(),false,'취소한 체크박스가 유지되었습니다.');
    await page.mouse.click(1,1);
    await waitClosed(page);
    assert.deepEqual(await hiddenIds(page),[],'배경 닫기가 숨김 설정을 저장했습니다.');
    await page.reload();
    await waitClosed(page);
    assert.equal(await page.locator('#patch-notes-notice').count(),0,'이미 안내한 공지가 재방문에서 반복 표시됩니다.');
    await openManually(page);
    await page.locator('#patch-notes-confirm').click();
    await waitClosed(page);
    await page.reload();
    await waitClosed(page);
    await openManually(page);

    // 처음/마지막에서 탭 이동이 팝업 밖으로 빠지면 안 됩니다.
    const focusable='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusIds=await dialog(page).locator(focusable).evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).map(el=>el.id||(el.getAttribute('data-patch-notes-close')!==null?'close':el.tagName)));
    assert(focusIds.length>=3,'팝업 조작 요소가 부족합니다.');
    await dialog(page).locator(focusable).evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).at(-1).focus());
    await page.keyboard.press('Tab');
    assert(await page.evaluate(()=>document.getElementById('patch-notes-dialog').contains(document.activeElement)),'Tab이 팝업 밖으로 이동했습니다.');
    await dialog(page).locator(focusable).evaluateAll(elements=>elements.filter(el=>el.getClientRects().length)[0].focus());
    await page.keyboard.press('Shift+Tab');
    assert(await page.evaluate(()=>document.getElementById('patch-notes-dialog').contains(document.activeElement)),'Shift+Tab이 팝업 밖으로 이동했습니다.');

    for (const [width,height] of [[1440,1000],[390,740],[320,568]]) {
      await page.setViewportSize({width,height});
      await checkLayout(page,'patch-notes-'+width);
    }
    await page.setViewportSize({width:1440,height:1000});
    const beforeHide=await stateSnapshot(page);
    await page.locator('#patch-notes-hide').check();
    await page.locator('#patch-notes-confirm').click();
    await waitClosed(page);
    assert.deepEqual(await hiddenIds(page),[currentId]);
    assert.equal(await stateSnapshot(page),beforeHide,'숨김 저장이 장부/클라우드/복구/인증 정보를 변경했습니다.');
    await page.reload();
    await page.waitForLoadState('load');
    assert.equal(await isOpen(page),false,'다시 보지 않기를 선택한 공지가 자동 표시됩니다.');
    await openManually(page);
    assert.equal(await page.locator('#patch-notes-hide').isChecked(),true,'수동 조회에 숨김 선택이 반영되지 않았습니다.');
    await page.locator('#patch-notes-hide').uncheck();
    await page.locator('#patch-notes-confirm').click();
    assert.deepEqual(await hiddenIds(page),[],'숨김 해제가 해당 공지를 제거하지 않았습니다.');
    await page.reload();
    await waitClosed(page);
    await openManually(page);
    await page.locator('#patch-notes-hide').check();
    await page.locator('#patch-notes-confirm').click();
    await waitClosed(page);

    // 이전 공지만 숨긴 브라우저에 새 공지를 배포한 상황을 재현합니다.
    variant.next=true;
    await page.reload();
    await waitOpen(page);
    assert.equal(await page.evaluate(()=>MaplePatchNotes.latestId),nextId);
    assert.match(await page.locator('#patch-notes-title').innerText(),/새 업데이트 검증/);
    assert.equal(await page.locator('#patch-notes-hide').isChecked(),false);
    assert.equal(await page.locator('#patch-notes-release').isVisible(),true,'공지 이력이 여러 개일 때 선택 메뉴가 없습니다.');
    await page.locator('#patch-notes-hide').check();
    await page.locator('#patch-notes-confirm').click();
    assert.deepEqual(new Set(await hiddenIds(page)),new Set([currentId,nextId]),'새 공지 숨김이 이전 공지 설정을 덮어썼습니다.');
    await openManually(page);
    await page.locator('#patch-notes-release').selectOption(currentId);
    assert.equal(await page.locator('#patch-notes-hide').isChecked(),true);
    await page.locator('#patch-notes-hide').uncheck();
    await page.locator('#patch-notes-confirm').click();
    assert.deepEqual(await hiddenIds(page),[nextId],'과거 공지 숨김 해제가 다른 공지 설정까지 제거했습니다.');
    await page.reload();
    await waitClosed(page);

    const {page:returning}=await makeContext({returning:true,expectAuto:true});
    await returning.locator('[data-patch-notes-close]').click();
    await returning.reload();
    await waitClosed(returning);
    assert.equal(await returning.locator('#patch-notes-notice').count(),0,'기존 이용자에게 같은 새 공지를 반복 안내합니다.');
    const {page:legacy}=await makeContext({legacyHidden:true,expectAuto:true});
    assert.deepEqual(await hiddenIds(legacy),['previous-hidden-release'],'이전 버전 숨김 설정이 유실되었습니다.');
    await legacy.keyboard.press('Escape');

    // 모바일 전체 메뉴를 통해 열고 닫은 뒤 메뉴도 계속 작동해야 합니다.
    await page.setViewportSize({width:390,height:740});
    await openManually(page);
    assert.equal(await page.locator('#workspace-sidebar').evaluate(el=>el.classList.contains('is-open')),false,'공지와 모바일 메뉴가 동시에 열려 있습니다.');
    await page.keyboard.press('Escape');
    await waitClosed(page);
    assert(await page.evaluate(()=>{const el=document.activeElement;return el && !el.closest('[inert]') && !!el.getClientRects().length;}),'모바일 팝업 종료 후 숨겨진 영역으로 포커스가 복귀했습니다.');
    await page.locator('.mobile-nav [data-menu-toggle]').click();
    assert.equal(await page.locator('#workspace-sidebar').evaluate(el=>el.classList.contains('is-open')),true,'공지 종료 후 모바일 메뉴가 열리지 않습니다.');
    await page.keyboard.press('Escape');

    for (const failure of ['read','write']) {
      const {page:failing}=await makeContext({failure,returning:failure==='write'});
      assert.equal(await isOpen(failing),false,'공지 저장소 오류에서 자동 팝업이 본문을 가립니다.');
      assert.equal(await failing.locator('#patch-notes-notice').isVisible(),true,'저장소 오류 때 비차단 안내가 없습니다.');
      await openManually(failing);
      await failing.locator('#patch-notes-hide').check();
      await failing.locator('#patch-notes-confirm').click();
      if (failure==='write') {
        assert.equal(await isOpen(failing),true,'숨김 저장 실패를 알리지 않고 닫혔습니다.');
        assert.match(await failing.locator('#patch-notes-status').innerText(),/저장|설정|브라우저/);
        await failing.keyboard.press('Escape');
      }
      if (await isOpen(failing)) await failing.locator('[data-patch-notes-close]').click();
      await waitClosed(failing);
      await failing.evaluate(()=>openPage('expense'));
      assert.equal(await failing.locator('#page-expense').evaluate(el=>el.classList.contains('active')),true,'공지 저장소 오류가 앱 탐색을 중단했습니다.');
    }
    const {page:corrupt}=await makeContext({corrupt:true});
    assert.equal(await isOpen(corrupt),false,'손상된 UI 설정을 첫 방문 팝업으로 처리했습니다.');
    await openManually(corrupt);
    await corrupt.locator('#patch-notes-confirm').click();
    await waitClosed(corrupt);
    for (const url of ['/?page=home&code=test-callback&state=test-state','/?page=home?code=test-nested&state=test-state','/?page=home%3Fcode%3Dtest-encoded%26state%3Dtest-state','/?page=home&error=access_denied&error_description=test-only']) {
      const {page:callback}=await makeContext({url,returning:true});
      assert.equal(await isOpen(callback),false,'로그인 복귀 URL에서 자동 팝업이 인증 흐름을 가립니다: '+url);
      assert.equal(await callback.locator('#patch-notes-notice').count(),0,'로그인 복귀 URL에서 안내 배너가 표시됩니다.');
      assert.equal(await callback.evaluate(key=>localStorage.getItem(key),seenKey),'previous-test-release','로그인 복귀에서 새 공지를 이미 본 것으로 기록합니다.');
      await openManually(callback);
      await callback.locator('[data-patch-notes-close]').click();
      await waitClosed(callback);
    }
    assert.deepEqual(errors,[],'브라우저 스크립트 오류');
    console.log('패치노트 검증 통과: 첫 방문 비차단 안내·같은 공지 반복 방지·기존 이용자 새 공지·공지별 숨김·이력 조회·키보드/모바일·기록 및 인증 보존·저장소 오류·인증 복귀');
    console.log('검증 화면: '+output);
  } finally {
    for (const context of contexts) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
