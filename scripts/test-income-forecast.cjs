'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { module:{ exports:{} }, Date };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/income-forecast.js'), 'utf8'), context);
const { forecast, kstDate } = context.module.exports;
let checks = 0;
function check(label, run) { run(); checks++; console.log('PASS ' + label); }
function dates(start, count, amount = '100') {
  return Array.from({ length:count }, (_, i) => ({ date:new Date(Date.parse(start + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10), amount, active:true }));
}
check('스크린샷 재현: 5일째 주간·월간 수입 323억을 2,004억으로 늘리지 않음', () => {
  const result = forecast({ today:'2026-10-05', actual:'32329755368', days:[] });
  assert.equal(result.status, 'waiting');
  assert.equal(result.projected, 32329755368n);
  assert.equal(result.addition, 0n);
});
check('완료된 7일의 반복수입만 내일부터 월말까지 추가', () => {
  const result = forecast({ today:'2026-11-08', actual:'10000', days:dates('2026-11-01', 7) });
  assert.equal(result.status, 'ready'); assert.equal(result.sampleDays, 7);
  assert.equal(result.remainingDays, 22); assert.equal(result.projected, 12200n);
});
check('쉬는 날은 분모에 포함하고 한 번의 기록은 예측을 보류', () => {
  const days = [{ date:'2026-11-01', amount:'700', active:true }, { date:'2026-11-03', amount:'700', active:true }, { date:'2026-11-07', amount:'700', active:true }];
  const result = forecast({ today:'2026-11-08', actual:'5000', days });
  assert.equal(result.average, 300n); assert.equal(result.projected, 11600n);
  assert.equal(forecast({ today:'2026-11-08', actual:'5000', days:days.slice(0, 1) }).status, 'waiting');
});
check('14일 상한·오늘의 일부 기록·미래 기록 제외', () => {
  const days = [...dates('2026-10-01', 30, '100'), { date:'2026-10-31', amount:'9999999' }, { date:'2026-11-01', amount:'9999999' }];
  const result = forecast({ today:'2026-10-30', actual:'100', days });
  assert.equal(result.sampleDays, 14); assert.equal(result.sampleStart, '2026-10-16');
  assert.equal(result.sampleEnd, '2026-10-29'); assert.equal(result.projected, 200n);
});
check('월초는 전월 표본을 사용하고 현재 합계는 한 번만 더함', () => {
  const result = forecast({ today:'2026-11-01', actual:'200000', days:dates('2026-10-18', 14, '1000') });
  assert.equal(result.remainingDays, 29); assert.equal(result.projected, 229000n);
});
check('안전 정수 범위를 넘는 금액과 음수 합계·음수 반복수지의 정밀도', () => {
  const huge = '9007199254740993123456';
  const result = forecast({ today:'2026-11-08', actual:huge, days:dates('2026-11-01', 7, huge) });
  assert.equal(result.projected, BigInt(huge) * 23n);
  const negative = forecast({ today:'2026-11-08', actual:'-1000', days:dates('2026-11-01', 7, '-100') });
  assert.equal(negative.projected, -3200n);
  assert.throws(() => forecast({ today:'2026-11-08', actual:9007199254740992 }), /정수/);
});
check('윤년·월말·과거월·미래월·유효하지 않은 날짜', () => {
  const leap = forecast({ today:'2028-02-08', actual:'5', days:dates('2028-02-01', 7, '1') });
  assert.equal(leap.totalDays, 29); assert.equal(leap.projected, 26n);
  assert.equal(forecast({ today:'2026-11-30', actual:'77', days:dates('2026-11-01', 14) }).status, 'closed');
  assert.equal(forecast({ today:'2026-11-05', month:'2026-10', actual:'77' }).projected, 77n);
  assert.equal(forecast({ today:'2026-11-05', month:'2026-12', actual:'77' }).status, 'future');
  assert.throws(() => forecast({ today:'2026-02-30', actual:'0' }), /날짜/);
});
check('한국 시간 자정·월경계 및 입력 원본 불변', () => {
  assert.equal(kstDate('2026-10-31T14:59:59.999Z'), '2026-10-31');
  assert.equal(kstDate('2026-10-31T15:00:00.000Z'), '2026-11-01');
  const input = { today:'2026-11-08', actual:'0', days:dates('2026-11-01', 7) }, before = JSON.stringify(input);
  forecast(input); assert.equal(JSON.stringify(input), before);
});
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const adapter = html.match(/function monthlyAutomationForecast\([^]*?\n}/)?.[0];
const actualAdapter = html.match(/function monthlyForecastActual\([^]*?\n}/)?.[0];
assert(adapter, '실제 홈 화면의 예상 계산 함수가 있어야 합니다.');
assert(actualAdapter, '예상 금액은 오늘까지의 기록값을 사용해야 합니다.');
assert.match(html, /<script src="assets\/income-forecast\.js\?[^"\n]+"><\/script>/);
function adapterContext(records = {}, dailyDates = []) {
  const value = {
    MapleIncomeForecast:{ ...context.module.exports, kstDate:() => '2026-11-15' },
    db:{ records, chars:[{ dailyBossDays:Object.fromEntries(dailyDates.map(date => [date, { sold:1 }])) }] },
    todayStr:() => '2026-11-15',
    ensureObj:value => value && typeof value === 'object' ? value : {},
    normalizeDateInput:value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null,
    addDays:(date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10),
    normalizeRecord:value => value,
    recordMesoTotal:value => value.sessions.reduce((total, row) => total + BigInt(row.meso || 0), 0n),
    profitTotals:() => ({ net:0n }),
    expenseTotals:() => ({ total:0n }),
    weeksForDashboardMonth:() => [],
    bossTotals:() => ({ week:0n, month:0n }),
    toMesoBig:value => BigInt(value || 0),
    dailyBossSumForDate:date => ({ crystalMeso:dailyDates.includes(date) ? 20 : 0, crystals:dailyDates.includes(date) ? 1 : 0, dropMeso:999999999n }),
    lootEntryCount:() => 0
  };
  vm.createContext(value); vm.runInContext(actualAdapter + '\n' + adapter, value); return value;
}
function report(net) { return { month:'2026-11', net, hunt:{ days:0 }, bossCrystals:1, profit:{ count:0 }, expenses:{ count:0 }, loot:[] }; }
check('실제 홈 함수 연결: 주간·월간·일시 판매 수익은 현재 합계에 한 번만 반영', () => {
  const ctx = adapterContext();
  const result = ctx.monthlyAutomationForecast(report(32329755368n), '2026-11-05');
  assert.equal(result.status, 'waiting'); assert.equal(result.actual, 32329755368n);
  assert.equal(result.projected, 32329755368n);
});
check('실제 홈 함수 연결: 조각 정산·기타 수입·일간 드랍 가격·복구 보정은 반복 표본 제외', () => {
  const days = dates('2026-11-01', 14).map(row => row.date);
  const records = Object.fromEntries(days.map(date => [date, { sessions:[
    { kind:'hunt', meso:'100', extraIncome:'999999999', erda:999999, erdaUnitPrice:'9999999' },
    { kind:'erda-settlement', meso:'999999999' }, { kind:'recovery-adjustment', meso:'999999999' }
  ] }]));
  const ctx = adapterContext(records, days), before = JSON.stringify(ctx.db);
  const result = ctx.monthlyAutomationForecast(report(1000n));
  assert.equal(result.status, 'ready'); assert.equal(result.average, 120n);
  assert.equal(result.projected, 2800n); assert.equal(JSON.stringify(ctx.db), before);
});
check('실제 홈 함수 연결: 오늘·미래의 큰 재획 기록은 반복 표본에서 제외', () => {
  const records = Object.fromEntries(dates('2026-11-01', 14).map(row => [row.date, { sessions:[{ kind:'hunt', meso:'100' }] }]));
  records['2026-11-15'] = { sessions:[{ kind:'hunt', meso:'999999999999' }] };
  records['2026-11-16'] = { sessions:[{ kind:'hunt', meso:'999999999999' }] };
  const result = adapterContext(records).monthlyAutomationForecast(report(5000n + 999999999999n));
  assert.equal(result.average, 100n); assert.equal(result.projected, 6500n);
});
check('실제 홈 함수 연결: 미래 재획·손익·지출·보스 기록은 현재 합계에서도 제외', () => {
  const ctx = adapterContext({ '2026-11-16':{ sessions:[{ kind:'hunt', meso:'900' }] } });
  ctx.profitTotals = predicate => ({ net:predicate('2026-11-16') ? 500n : 0n });
  ctx.expenseTotals = predicate => ({ total:predicate('2026-11-16') ? 200n : 0n });
  ctx.weeksForDashboardMonth = () => ['2026-11-12', '2026-11-19'];
  ctx.bossTotals = () => ({ week:700n, month:300n });
  ctx.dailyBossSumForDate = date => ({ meso:date==='2026-11-16' ? 100n : 0n, crystalMeso:0, crystals:0 });
  const result = ctx.monthlyAutomationForecast(report(3300n));
  assert.equal(result.actual, 1000n); assert.equal(result.projected, 1000n);
});
check('실제 홈 함수 연결: 지난달 기록은 확대하지 않고 미래월 합계는 예측에 사용하지 않음', () => {
  const ctx = adapterContext();
  const past = ctx.monthlyAutomationForecast({ ...report(-50n), month:'2026-10' });
  assert.equal(past.actual, -50n); assert.equal(past.projected, -50n); assert.equal(past.status, 'closed');
  const future = ctx.monthlyAutomationForecast({ ...report(9000n), month:'2026-12' });
  assert.equal(future.actual, 0n); assert.equal(future.projected, 0n); assert.equal(future.status, 'future');
});
check('홈 표시 연결: 기기 보고서 월과 한국 시간 월이 다르면 한국 시간 보고서 선택', () => {
  const ctx = adapterContext(), element = { innerHTML:'' };
  let selectedMonth = '';
  Object.assign(ctx, {
    document:{ getElementById:() => element },
    recentAutomationPace:() => ({ previous:0n, current:0n, average:0n, change:0n, activeDays:0 }),
    monthlyReportData:month => { selectedMonth = month; return { ...report(777n), month }; },
    goalAutomationForecast:() => ({ state:'waiting', value:'예측 대기', note:'' }),
    automationAttentionItems:() => [], fmt:String, signedKorMeso:String, esc:String
  });
  const render = html.match(/function renderHomeAutomation\([^]*?\n}/)?.[0];
  assert(render); vm.runInContext(render, ctx);
  ctx.renderHomeAutomation({ ...report(999n), month:'2026-10' }, {});
  assert.equal(selectedMonth, '2026-11');
  assert.match(element.innerHTML, /월말 예상 기록 순수익/);
  assert.match(element.innerHTML, /현재 777/);
});
console.log('월말 예상: ' + checks + '개 계산·날짜·정밀도·보존 검사 통과');
