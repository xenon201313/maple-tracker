const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'https://hunt-settlement.test';
const legacyHuntDate = '2026-07-06';
const legacySaleDate = '2026-07-07';

async function openFixture(page) {
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: '' });
    }
    return route.fulfill({ path: file });
  });
  await fixtureDismissPatchNotes(page);
  await page.addInitScript(({ huntDate, saleDate }) => {
    if (localStorage.getItem('mapleTracker.v2')) return;
    const records = {
      [huntDate]: { sessions: [
        { id: 'partly-sold', kind: 'hunt', erda: 5, erdaSettled: 2 },
        { id: 'already-in-income', kind: 'hunt', erda: 3, erdaMesoIncluded: true, erdaUnitPrice: '100', erdaFee: 0 }
      ] },
      [saleDate]: { sessions: [{
        id: 'old-sale', kind: 'erda-settlement', extraIncome: '320', erdaUnitPrice: '160', erdaFee: 0,
        settlementFrom: huntDate, settlementTo: huntDate,
        settlementSources: [{ id: 'partly-sold', date: huntDate, count: 2 }]
      }] }
    };
    localStorage.setItem('mapleTracker.v2', JSON.stringify({ records, settings: {} }));
  }, { huntDate: legacyHuntDate, saleDate: legacySaleDate });
  await page.goto(origin + '/?page=daily');
}

async function balance(page) {
  return page.evaluate(() => {
    const entries = Object.values(db.records);
    const sessions = entries.flatMap(entry => entry.sessions);
    const sales = sessions.filter(session => session.kind === 'erda-settlement');
    return {
      available: availableErdaSources().reduce((sum, source) => sum + source.count, 0),
      total: entries.reduce((sum, entry) => sum + recordMesoTotal(entry), 0n).toString(),
      sales: sales.length,
      hunts: sessions.filter(session => session.kind === 'hunt').length
    };
  });
}

async function fillHunt(page, { meso, dropped, purchased, cost }) {
  await page.locator('#in-meso').fill(meso);
  await page.locator('#in-erda').fill(dropped);
  const details = page.locator('#hunt-erda-purchase-fields');
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
  await page.locator('#in-erda-purchased').fill(purchased);
  await page.locator('#in-erda-purchase-cost').fill(cost);
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await openFixture(page);
    const today = await page.locator('#in-date').inputValue();
    const settle = page.locator('#btn-erda-settle');
    const price = page.locator('#in-erda-price');
    const fee = page.locator('#erda-fee');
    const saleDate = page.locator('#in-erda-settlement-date');
    const preview = page.locator('#erda-settlement-preview');
    const submit = page.locator('#btn-save');

    const legacy = { available: 3, total: '620', sales: 1, hunts: 2 };
    assert.deepEqual(await balance(page), legacy, '구버전 일부 정산 및 이미 판매 수익에 포함된 조각');

    await fillHunt(page, { meso: '10000', dropped: '4', purchased: '2', cost: '' });
    await submit.click();
    assert.deepEqual(await balance(page), legacy, '매입 원가 누락 시 기록 전체 보존');
    await page.locator('#in-erda-purchase-cost').fill('2000');
    await submit.click();
    assert.deepEqual(await balance(page), { available: 9, total: '8620', sales: 1, hunts: 3 });
    await price.fill('1000');
    await fee.selectOption('3');
    await saleDate.fill(legacySaleDate);
    await saleDate.blur();
    assert.match(await preview.innerText(), /\b3개/, '판매일 이후 취득분 제외');
    await saleDate.fill(today);
    await saleDate.blur();
    assert.match(await preview.innerText(), /\b9개/);
    const range = page.locator('#erda-settlement-range summary');
    await range.click();
    await page.locator('#in-erda-settlement-end').fill(legacySaleDate);
    assert.match(await preview.innerText(), /\b3개/, '기간을 열면 고른 날짜까지의 재고');
    await range.click();
    await page.waitForFunction(() => /미정산 조각\s*9개/.test(document.getElementById('erda-settlement-preview').innerText));
    assert.equal((await settle.innerText()).trim(), '정산');

    const beforeStorage = () => page.evaluate(() => ({
      data: localStorage.getItem(LS_KEY),
      journal: localStorage.getItem(HUNT_JOURNAL_KEY),
      backups: JSON.stringify(db.backupSnapshots)
    }));
    const beforeSale = await beforeStorage();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key === LS_KEY) {
          Storage.prototype.setItem = original;
          throw new DOMException('Fixture full', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    const [failure] = await Promise.all([
      page.waitForEvent('dialog', { predicate: dialog => dialog.type() === 'alert' }),
      settle.click()
    ]);
    assert.match(failure.message(), /저장 공간/);
    assert.deepEqual(await balance(page), { available: 9, total: '8620', sales: 1, hunts: 3 },
      '저장 실패 직후 미정산 조각·금액 복원');
    assert.deepEqual(await beforeStorage(), beforeSale, '실패한 영수증이 저장소·복구 저널·백업에 남지 않음');
    const otherTab = await context.newPage();
    otherTab.on('dialog', dialog => dialog.accept());
    await otherTab.goto(origin + '/?page=daily');
    const otherSettle = otherTab.locator('#btn-erda-settle');
    assert(await otherSettle.isEnabled(), '두 탭에서 같은 미정산 재고가 열린 상태');
    await settle.evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => !availableErdaSources().length);
    const firstSale = { available: 0, total: '17350', sales: 2, hunts: 3 };
    assert.deepEqual(await balance(page), firstSale, '9 × 1,000 × 97%를 한 번만 반영');
    const firstReceipt = await page.evaluate(() => {
      const sale = db.records[todayStr()].sessions.find(session => session.kind === 'erda-settlement');
      return { id: sale.id, sources: sale.settlementSources.map(source => [source.count, source.purchasedCount || 0]) };
    });
    assert.deepEqual(firstReceipt.sources, [[3, 0], [6, 2]], '드롭과 구매 수량을 매각 시점의 기록에 보존');
    const exports = await page.evaluate(() => {
      const restore = payload => JSON.parse(JSON.stringify(payload));
      const backup = trackerDbFromData(restore(exportBackupBundle()));
      const account = MapleAccountBridge.snapshotFromStore(
        MapleAccountBridge.storeFromSnapshot(restore(MapleAccountBridge.snapshot()))
      ).data;
      return [backup, account].map(store => {
        const sessions = store.records[todayStr()].sessions;
        const hunt = sessions.find(s => s.kind === 'hunt');
        const sale = sessions.find(s => s.kind === 'erda-settlement');
        return {
          counts: [hunt.erda, hunt.erdaSettled, hunt.erdaPurchased, hunt.erdaPurchasedSettled],
          cost: String(hunt.erdaPurchaseCost), proceeds: String(sale.extraIncome),
          purchasedSold: sale.settlementSources.reduce((n, s) => n + (s.purchasedCount || 0), 0)
        };
      });
    });
    const expectedExport = { counts: [4, 4, 2, 2], cost: '2000', proceeds: '8730', purchasedSold: 2 };
    assert.deepEqual(exports, [expectedExport, expectedExport], '백업 복원·계정 스냅샷의 구매 원가 및 판매 수량');
    assert(await settle.isDisabled());
    if (await otherSettle.isEnabled()) {
      const [notice] = await Promise.all([otherTab.waitForEvent('dialog'), otherSettle.click()]);
      assert.match(notice.message(), /다른 탭|새로고침/, '오래된 탭에는 다시 열기 안내');
    }
    await otherTab.close();
    await page.reload();
    assert.deepEqual(await balance(page), firstSale, '다른 탭에서 같은 재고를 다시 정산해도 매각은 한 건만 보존');
    assert(await page.evaluate(id => db.records[todayStr()].sessions.some(s => s.id === id), firstReceipt.id),
      '최초 확정한 영수증을 오래된 탭의 정산으로 덮어쓰지 않음');
    assert.match(await preview.innerText(), /\b0개/);

    await fillHunt(page, { meso: '4000', dropped: '2', purchased: '1', cost: '500' });
    await page.locator('#in-erda-include-meso').check();
    await submit.click();
    assert.deepEqual(await balance(page), { available: 1, total: '22790', sales: 2, hunts: 4 },
      '드롭 2개는 회차 단가 1,000으로 즉시 반영하고 구매한 1개만 정산 대상에 포함');
    await price.fill('1200');
    await fee.selectOption('5');
    await settle.click();
    await page.waitForFunction(() => !availableErdaSources().length);
    assert.deepEqual(await balance(page), { available: 0, total: '23930', sales: 3, hunts: 4 },
      '다음 회차 1 × 1,200 × 95% 반영, 이전 두 판매의 단가 보존');
    const recentSaleId = await page.evaluate(() => {
      const sales = db.records[todayStr()].sessions.filter(session => session.kind === 'erda-settlement');
      return sales.at(-1).id;
    });
    await page.locator('#btn-expand-daily-records').click();
    await page.locator('[data-session-delete="' + recentSaleId + '"]').click();
    assert.deepEqual(await balance(page), { available: 1, total: '22790', sales: 2, hunts: 4 },
      '같은 날 판매 취소 시 구입한 1개만 미정산으로 돌아옴');
    await page.reload();
    assert.deepEqual(await balance(page), { available: 1, total: '22790', sales: 2, hunts: 4 });
    await fillHunt(page, { meso: '1000000', dropped: '0', purchased: '1', cost: '1500000' });
    await submit.click();
    assert.deepEqual(await balance(page), { available: 2, total: '-477210', sales: 2, hunts: 5 },
      '예전 재획에서 모아 둔 메소로 사면 해당 회차 순수입은 음수');
    const report = await page.evaluate(() => {
      const planner = MapleLedgerPlanner.bridge.getContext();
      return {
        drops: planner.hunts.reduce((sum, hunt) => sum + hunt.erda, 0),
        cash: planner.cashEntries.reduce((sum, row) => sum + BigInt(row.signedAmount), 0n).toString(),
        purchaseDebits: planner.cashEntries.filter(row => row.kind === '솔 에르다 조각 매입').map(row => row.signedAmount)
      };
    });
    assert.deepEqual(report, { drops: 14, cash: '-477210', purchaseDebits: ['-2000', '-500', '-1500000'] },
      '사냥 드롭 통계, 개별 매입 지출, 현금 장부 대조');
    await page.goto(origin + '/?page=stats');
    const loss = page.locator('#chart14 .bar.loss');
    assert.equal(await loss.count(), 1);
    assert((await loss.boundingBox()).height > 0, '음수 금액 막대의 실제 높이');
    assert.match(await loss.getAttribute('aria-label'), /-477,830 메소/);
    await page.locator('#chart14 .bar').nth(12).focus();
    await page.keyboard.press('Tab');
    assert(await loss.evaluate(bar => document.activeElement === bar), '키보드로 오늘의 적자 기록 탐색');
    const tooltip = page.locator('#chart-float.show .chart-tip-loss b');
    assert.equal(await tooltip.innerText(), '-477,830 메소');
    await page.keyboard.press('Escape');
    assert.equal(await tooltip.count(), 0);
    assert.deepEqual(errors, []);
    console.log('조각 정산 통과: 구버전·반복 판매·탭 충돌·취소·재접속·매입 지출·적자 그래프와 키보드 툴팁');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
