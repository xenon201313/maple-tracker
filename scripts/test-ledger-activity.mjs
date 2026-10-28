import assert from 'node:assert/strict';
import '../assets/ledger-activity.js';
const A = globalThis.MapleLedgerActivity;

assert.equal(A.money('1,000,000'), '1000000');
assert.equal(A.money('9007199254740993123456789'), '9007199254740993123456789');
assert.equal(A.money(9007199254740992), null, 'Do not pretend unsafe Number money is precise');
for (const invalid of ['', null, '-1', '1.5', '1e9', 'NaN', '<script>']) assert.equal(A.money(invalid), null);
assert.equal(A.money('-100', true), '-100');
assert.equal(A.perHour('9007199254740993123456789', 30), '18014398509481986246913578');
assert.equal(A.perHour('-100', 120), '-50');
assert.equal(A.perHour('100', 0), null);
assert.equal(A.date('2026-02-29'), '');
assert.equal(A.date('2028-02-29'), '2028-02-29');

const hunt = { id: 'h1', charName: '테스트', meso: '100000000', extraIncome: '10000000', erda: 20, erdaUnitPrice: '1000000', erdaFee: 3 };
const condition = { id: 'n1', huntId: 'h1', map: '사냥터', buffs: '재획비', minutes: 120, consumableCost: '1000000', soldFragments: 4, fragmentReceipt: '3880000', expGain: '100000000000' };
const m = A.huntMetrics(hunt, condition);
assert.equal(m.cashNet, '112880000');
assert.equal(m.cashPerHour, '56440000');
assert.equal(m.unsoldEstimate, '15520000');
assert.equal(m.expPerHour, '50000000000');
assert.equal(m.fragmentsPerHour, 10);
assert.equal(A.huntMetrics(hunt, { ...condition, soldFragments: 21 }), null, 'Cannot sell more fragments than the selected session yielded');
assert.equal(A.huntMetrics(hunt, { ...condition, consumableCost: null }), null, 'Invalid costs must not silently turn into zero');
assert.equal(A.huntMetrics(hunt, { ...condition, fragmentReceipt: null }), null);
assert.equal(A.huntMetrics(hunt, { ...condition, expGain: 'not a number' }), null);
assert.equal(A.huntMetrics(hunt, { ...condition, minutes: -1 }), null);
assert.equal(A.huntMetrics({ ...hunt, erdaUnitPrice: '' }, condition).unsoldEstimate, null, 'Unknown prices stay unknown');
assert.equal(A.huntMetrics(hunt, { ...condition, consumableCost: '200000000', fragmentReceipt: '0' }).cashNet, '-90000000');
const h2 = { ...hunt, id: 'h2', extraIncome: '0', erda: 0 };
const comparisons = A.huntComparisons([{ ...hunt, extraIncome: '0', erda: 0 }, h2], [
  { ...condition, minutes: 60, consumableCost: '0', fragmentReceipt: '0', soldFragments: 0, expGain: '' },
  { ...condition, id: 'n2', huntId: 'h2', minutes: 120, consumableCost: '0', fragmentReceipt: '0', soldFragments: 0, expGain: '' }
]);
assert.equal(comparisons.length, 1);
assert.equal(comparisons[0].cashPerHour, '66666666', 'Use total income / total time, not unweighted per-session averages');
assert.equal(comparisons[0].expPerHour, null, 'No fabricated experience gain');
assert.equal(A.huntComparisons([hunt], [{ ...condition, deletedAt: 1 }]).length, 0);

const options = [
  { id: 'a-easy', charId: 'a', bossId: 'same', bossName: '보스1', meso: '100', period: 'weekly' },
  { id: 'a-hard', charId: 'a', bossId: 'same', bossName: '보스1', meso: '180', period: 'weekly' },
  { id: 'a-other', charId: 'a', bossId: 'other', bossName: '보스2', meso: '120', period: 'weekly' },
  { id: 'b-one', charId: 'b', bossId: 'one', bossName: '보스3', meso: '110', period: 'weekly' },
  { id: 'a-done', charId: 'a', bossId: 'done', bossName: '완료보스', meso: '999999', period: 'weekly', completed: true },
  { id: 'a-month', charId: 'a', bossId: 'month', bossName: '월간보스', meso: '999999', period: 'monthly' }
];
const configs = options.map(o => ({ id: 'p-' + o.id, optionId: o.id, minutes: o.id === 'a-hard' ? 25 : 15, priority: 3, enabled: true, dropEstimate: '1' }));
const plan = A.optimizeBosses(options, configs, 30);
assert.equal(plan.meso, '230');
assert.equal(plan.minutes, 30);
assert.deepEqual(plan.selected.map(p => p.optionId).sort(), ['a-other', 'b-one']);
assert.equal(plan.dropEstimate, '2', 'Drop estimates are separate from optimization income');
assert.equal(A.optimizeBosses(options, configs, 60).selected.filter(p => p.option.bossId === 'same').length, 1, 'Do not choose two difficulties of one boss');
const completedVariant = [...options, { ...options[0], id: 'a-variant-done', completed: true }];
assert.equal(A.optimizeBosses(completedVariant, configs, 60).selected.some(p => p.option.bossId === 'same'), false, 'A completed difficulty excludes the whole boss group');
assert.equal(A.optimizeBosses(options, configs, 60, { a: 1, b: 0 }).meso, '180', 'Enforce each character remaining quota');
const withFree = options.map(o => o.id === 'a-other' ? { ...o, limitFree: true } : o);
assert.equal(A.optimizeBosses(withFree, configs, 60, { a: 1, b: 0 }).meso, '300', 'Limit-free bosses must not consume quota');
assert.equal(A.optimizeBosses(options, configs, 60, { a: 0, b: 0 }).meso, '0');
assert.throws(() => A.optimizeBosses(options, configs, 0));
assert.throws(() => A.optimizeBosses(options, configs, 1.5));
const tieOptions = [{ id: 'x', charId: 'a', bossId: 'x', meso: '100' }, { id: 'y', charId: 'a', bossId: 'y', meso: '100' }];
assert.equal(A.optimizeBosses(tieOptions, [{ id: 'x', optionId: 'x', minutes: 10, enabled: true, priority: 1 }, { id: 'y', optionId: 'y', minutes: 10, enabled: true, priority: 5 }], 10).selected[0].optionId, 'y');

assert.deepEqual(A.symbolCost({ currentLevel: 1, targetLevel: 3, costMode: 'steps', stepCosts: ['1000000', '2000000'] }), { valid: true, total: '3000000', steps: ['1000000', '2000000'] });
assert.equal(A.symbolCost({ currentLevel: 1, targetLevel: 3, costMode: 'steps', stepCosts: ['1000000'] }).valid, false, 'A missing step must not be zero');
assert.equal(A.symbolCost({ currentLevel: 1, targetLevel: 3, costMode: 'total', plannedCost: '' }).valid, false);
assert.equal(A.symbolCost({ currentLevel: 1, targetLevel: 3, costMode: 'total', plannedCost: '0' }).total, '0', 'Explicit free cost is valid');
assert.equal(A.symbolCost({ currentLevel: 3, targetLevel: 3, costMode: 'total', plannedCost: '1' }).valid, false);
const symbol = { id: 's1', currentLevel: 1, targetLevel: 2, plannedCost: '9007199254740993123456789', status: 'planned' };
const summary = A.symbolSummary([symbol, { ...symbol, id: 's2', status: 'done' }, { ...symbol, id: 's3', deletedAt: 1 }]);
assert.equal(summary.planned, '9007199254740993123456789');
assert.equal(summary.pendingCount, 1);
assert.equal(summary.count, 2);
assert.equal(A.symbolSummary([{ ...symbol, plannedCost: '' }]).missingCount, 1);
console.log('활동 계획: 재획 정밀 계산·미확인값·시간/처치한도 최적화·심볼 예정 비용 검증 통과');

if (process.argv.includes('--ui')) {
  const { chromium } = await import('playwright');
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../assets/ledger-activity.js', import.meta.url));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><title>활동 계획 격리 검증</title><main id="host"></main></html>');
    await page.addScriptTag({ content: source.toString('utf8') });
    await page.evaluate(() => {
      window.activityFixture = {
        planner: {}, today: '2026-10-28', week: '2026-10-22',
        characters: [{ id: 'c1', name: '가상 캐릭터' }],
        hunts: [{ id: 'h1', date: '2026-10-28', charName: '가상 캐릭터', meso: '100000000', extraIncome: '0', erda: 10, erdaUnitPrice: '1000000', erdaFee: 3, runs: 1 }],
        bossOptions: [{ id: 'b1', charId: 'c1', charName: '가상 캐릭터', bossId: 'g1', bossName: '가상 보스', difficulty: '하드', meso: '10000000', period: 'weekly', completed: false }],
        bossRemainingLimits: { c1: 1 }, expenses: [{ id: 'keep', amount: '123' }]
      };
      window.activityFixtureOriginal = JSON.stringify({ hunts: activityFixture.hunts, expenses: activityFixture.expenses });
      window.activityTab = 'hunting';
      window.activityBridge = {
        getContext: () => activityFixture,
        money: value => BigInt(value).toLocaleString('ko-KR') + ' 메소',
        commit(section, rows) { activityFixture.planner[section] = rows; },
        remove(section, id) { activityFixture.planner[section] = activityFixture.planner[section].map(r => r.id === id ? { ...r, deletedAt: 1 } : r); },
        refresh() { MapleLedgerActivity.render(document.getElementById('host'), activityTab, activityBridge); },
        async fetchEquipment(_id, requested) {
          window.activityLastRequested = requested;
          if (window.activityFailSymbols) throw new Error('심볼 API 조회 실패');
          return { equipment: [], symbols: [{ symbol_name: '가상 심볼', symbol_level: 15, symbol_growth_count: 7 }], date: '', fetchedAt: 1793116800000, warning: '장비 정보는 불러오지 못했습니다.' };
        }
      };
      activityBridge.refresh();
    });
    await page.locator('[name="map"]').fill('<img src=x onerror="window.injected=true">');
    await page.locator('[name="minutes"]').fill('120');
    await page.locator('[name="consumableCost"]').fill('1000000');
    await page.getByRole('button', { name: '비교 기록 저장', exact: true }).click();
    assert.equal(await page.evaluate(() => activityFixture.planner.huntNotes.length), 1);
    assert.equal(await page.evaluate(() => window.injected), undefined, 'User labels must remain text');
    await page.getByRole('button', { name: '수정', exact: true }).click();
    await page.locator('[name="minutes"]').fill('60');
    await page.getByRole('button', { name: '조건 수정 저장', exact: true }).click();
    assert.equal(await page.evaluate(() => activityFixture.planner.huntNotes[0].minutes), 60);

    await page.evaluate(() => { activityTab = 'bossplan'; activityBridge.refresh(); });
    await page.locator('[name="minutes"]').fill('15');
    await page.getByRole('button', { name: '가능 보스 저장', exact: true }).click();
    assert.match(await page.locator('[data-la-result]').innerText(), /10,000,000/);
    await page.evaluate(() => { activityFixture.bossOptions[0].completed = true; activityBridge.refresh(); });
    assert.match(await page.locator('[data-la-result]').innerText(), /미완료 보스가 없습니다/);

    await page.evaluate(() => { activityTab = 'symbol'; activityBridge.refresh(); });
    await page.evaluate(() => { activityFailSymbols = true; });
    await page.getByRole('button', { name: '선택 캐릭터 심볼 불러오기', exact: true }).click();
    assert.match(await page.locator('[data-la-message]').innerText(), /심볼 API 조회 실패/);
    assert.equal(await page.locator('[data-la-imported]').innerText(), '', 'A failed symbol request is not an empty ownership result');
    await page.evaluate(() => { activityFailSymbols = false; });
    await page.getByRole('button', { name: '선택 캐릭터 심볼 불러오기', exact: true }).click();
    assert.equal(await page.evaluate(() => activityLastRequested), 'symbols', 'Request the required API result explicitly');
    assert.match(await page.locator('[data-la-imported]').innerText(), /API 자료 기준일 미제공/);
    assert.match(await page.locator('[data-la-message]').innerText(), /장비 정보는 불러오지 못했습니다/);
    await page.getByRole('button', { name: '이 심볼로 계획 만들기', exact: true }).click();
    assert.equal(await page.locator('[name="currentLevel"]').inputValue(), '15');
    await page.locator('[name="targetLevel"]').fill('17');
    await page.locator('[name="costMode"]').selectOption('steps');
    await page.locator('[name="stepCosts"]').fill('1000000\n2000000');
    await page.getByRole('button', { name: '예정 비용 저장', exact: true }).click();
    assert.equal(await page.evaluate(() => activityFixture.planner.symbolPlans[0].plannedCost), '3000000');
    await page.getByRole('button', { name: '계획 완료 표시', exact: true }).click();
    assert.equal(await page.evaluate(() => activityFixture.planner.symbolPlans[0].status), 'done');
    await page.getByRole('button', { name: '계획 삭제', exact: true }).click();
    assert.equal(await page.evaluate(() => activityFixture.planner.symbolPlans[0].deletedAt), 1);
    assert.equal(await page.evaluate(() => JSON.stringify({ hunts: activityFixture.hunts, expenses: activityFixture.expenses }) === activityFixtureOriginal), true, 'Activity plans must not mutate legacy ledger records');
    assert.deepEqual(errors, []);
    console.log('활동 계획 UI: 회차 조건 수정·XSS 방지·완료 보스 제외·심볼 API 선택/저장/완료/삭제·기존 장부 보존 통과');
  } finally {
    await browser?.close();
  }
}
