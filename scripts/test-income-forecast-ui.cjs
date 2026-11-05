'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');
const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2', '.ttf':'font/ttf' };
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => error ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' }).end(data));
});
let checks = 0;
const pass = text => { checks++; console.log('PASS ' + text); };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    async function pageAt(time, timezoneId = 'Asia/Seoul') {
      const context = await browser.newContext({ timezoneId, viewport:{ width:1440, height:1000 }, reducedMotion:'reduce' });
      await fixtureDismissPatchNotes(context);
      await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time:new Date(time) });
      await page.clock.pauseAt(new Date(time));
      await page.goto(origin + '/?page=home');
      return { context, page, errors };
    }
    const session = await pageAt('2026-11-05T12:00:00+09:00');
    try {
      const result = await session.page.evaluate(() => {
        db.records = {}; db.profits = []; db.expenses = []; db.chars = [];
        function hunt(date, meso, kind = 'hunt') {
          db.records[date] = { sessions:[normalizeHuntSession({ id:'forecast-' + date, kind, meso, extraIncome:'0', runs:1, erdaMesoIncluded:false, createdAt:1, updatedAt:1 })] };
        }
        for (let date = '2026-10-22'; date <= '2026-11-04'; date = addDays(date, 1)) hunt(date, '100');
        hunt('2026-11-05', '1000');
        hunt('2026-11-06', '900000000000000000000');
        db.profits = [
          normalizeProfitRecord({ id:'forecast-past-sale', type:'wonderberry', date:'2026-11-04', costs:[{ id:'cost', name:'구매', price:'200', count:1 }], outputs:[{ id:'output', name:'판매', price:'500', count:1, sold:true, sellable:true, fee:0 }] }),
          normalizeProfitRecord({ id:'forecast-future-sale', type:'wonderberry', date:'2026-11-06', costs:[{ id:'cost', name:'구매', price:'20', count:1 }], outputs:[{ id:'output', name:'판매', price:'720', count:1, sold:true, sellable:true, fee:0 }] })
        ];
        db.expenses = [
          normalizeExpenseRecord({ id:'forecast-past-expense', date:'2026-11-04', amount:'400', category:'equipment' }),
          normalizeExpenseRecord({ id:'forecast-future-expense', date:'2026-11-06', amount:'600', category:'equipment' })
        ];
        const current = normalizeChar({ name:'예상 현재 합성 캐릭터', server:'main', worldName:'크로아' });
        const future = normalizeChar({ name:'예상 미래 합성 캐릭터', server:'main', worldName:'루나' });
        db.chars = [current, future];
        const weekly = BOSS_MAP.hsu, monthly = BOSS_MAP.hblack, daily = DAILY_BOSS_MAP.dnark;
        const weeklyItem = DROP_ITEMS.hsu.find(item => !item.children?.length);
        const monthlyItem = DROP_ITEMS.hblack.find(item => !item.children?.length);
        if (!weeklyItem || !monthlyItem) throw new Error('드랍 표본이 없습니다.');
        function weeklyEntry(c, week, raw) {
          bossStore(c, week)[weekly[0]] = 1;
          const key = dropKey(weekly, weeklyItem);
          dropStore(c, week)[key] = true; dropPriceStore(c, week)[key] = raw;
          dropShareStore(c, week)[key] = { fee:5, ratio:'1:1', role:'leader' };
        }
        function monthlyEntry(c, week, raw) {
          bossStore(c, '2026-11', 'monthly')[monthly[0]] = 1;
          c.monthBossClearWeeks['2026-11'] = { [monthly[0]]:week };
          const key = dropKey(monthly, monthlyItem);
          dropStore(c, '2026-11', 'monthly')[key] = true; dropPriceStore(c, '2026-11', 'monthly')[key] = raw;
          dropShareStore(c, '2026-11', 'monthly')[key] = { fee:5, ratio:'1:1', role:'leader' };
        }
        function dailyEntry(c, date, raw) {
          dailyBossStore(c, date)[daily[0]] = 1; // 이미 판매한 것으로 저장된 독립 장부 값입니다.
          const key = dailyDropKey(daily, DAILY_DROP_ITEMS.dnark[0]);
          dailyDropStore(c, date)[key] = true; dailyDropPriceStore(c, date)[key] = raw;
        }
        weeklyEntry(current, '2026-11-05', '1010101');
        monthlyEntry(current, '2026-11-05', '2020202');
        weeklyEntry(future, '2026-11-12', '5050505');
        monthlyEntry(future, '2026-11-12', '6060606');
        // 11월과 겹친 11/26 주차가 포함하는 12/1 기록도 미래 합계에서 제외되어야 합니다.
        weeklyEntry(future, '2026-11-26', '7070707');
        dailyEntry(current, '2026-11-04', '1000001');
        dailyEntry(future, '2026-11-06', '3030303');
        dailyEntry(future, '2026-12-01', '4040404');
        // 기존 월 보고서의 10/29 주차 귀속을 보존하는지 확인할 표본입니다.
        dailyEntry(current, '2026-10-31', '8000001');
        const report = monthlyReportData('2026-11');
        const before = JSON.stringify(db);
        const storageBefore = JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
        const forecast = monthlyAutomationForecast(report, '2026-11-05');
        const after = JSON.stringify(db);
        const storageAfter = JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
        const dailyPrice = BigInt(daily[2]);
        const expected = 400n + 1000n + 300n - 400n
          + BigInt(bossCrystalPrice(weekly, '2026-11-05', current)) + 1010101n * 95n / 100n
          + BigInt(bossCrystalPrice(monthly, '2026-11')) + 2020202n * 95n / 100n
          + dailyPrice + 1000001n
          + dailyPrice + 8000001n;
        const sampleTotal = 14n * 100n + dailyPrice * 2n;
        const expectedAddition = sampleTotal * 25n / 14n;
        renderHomeAutomation(report, { empty:true });
        return {
          net:report.net.toString(), actual:forecast.actual.toString(), expected:expected.toString(),
          addition:forecast.addition.toString(), expectedAddition:expectedAddition.toString(),
          projected:forecast.projected.toString(), expectedProjected:(expected + expectedAddition).toString(),
          status:forecast.status, sampleDays:forecast.sampleDays, activeDays:forecast.activeDays,
          unchanged:before===after, storageUnchanged:storageBefore===storageAfter,
          boundaryWeekIncluded:weeksForDashboardMonth('2026-11').includes('2026-11-26'),
          originalFutureStillPresent:db.records['2026-11-06'].sessions[0].meso,
          futureDecemberStillPresent:db.chars[1].dailyBossDays['2026-12-01'].dnark,
          text:document.getElementById('home-automation').textContent,
          shownExpected:signedKorMeso(expected + expectedAddition)
        };
      });
      assert.equal(result.actual, result.expected, JSON.stringify(result));
      assert.notEqual(result.net, result.actual);
      assert.equal(result.boundaryWeekIncluded, true);
      pass('실제 월 보고서 연결: 미래 재획·손익·지출·주간/월간·일간 결정석과 드랍 제외');
      assert.equal(result.addition, result.expectedAddition);
      assert.equal(result.projected, result.expectedProjected);
      assert.equal(result.status, 'ready'); assert.equal(result.sampleDays, 14); assert.equal(result.activeDays, 14);
      pass('현재의 주간·월간·일시 판매는 한 번만 합산하고 반복 수입만 25일 추가');
      assert.equal(result.unchanged, true); assert.equal(result.storageUnchanged, true);
      assert.equal(result.originalFutureStillPresent, '900000000000000000000'); assert.equal(result.futureDecemberStillPresent, 1);
      pass('월말과 겹친 다음달 미래 기록을 합계에서 제외하고 원본·저장소 보존');
      assert(result.text.includes(result.shownExpected));
      assert(result.text.includes('새 지출·주간/월간 보스·일시 판매는 추가 예상에서 제외'));
      assert.deepEqual(session.errors, []);
      pass('실제 홈 예상 금액·제외 조건 표시와 브라우저 오류 없음');
    } finally { await session.context.close(); }
    for (const timezoneId of ['Asia/Seoul', 'America/Los_Angeles']) {
      const session = await pageAt('2026-11-01T00:00:00+09:00', timezoneId);
      try {
        const result = await session.page.evaluate(() => {
          db.records = {}; db.profits = []; db.chars = [];
          db.expenses = [normalizeExpenseRecord({ id:'forecast-kst-october', date:'2026-10-31', amount:'11', category:'equipment' }), normalizeExpenseRecord({ id:'forecast-kst-november', date:'2026-11-01', amount:'22', category:'equipment' })];
          const localMonth = todayStr().slice(0, 7), report = monthlyReportData(localMonth);
          renderHomeAutomation(report, { empty:true });
          return { localMonth, kstMonth:MapleIncomeForecast.kstDate().slice(0, 7), text:document.getElementById('home-automation').textContent, expected:signedKorMeso(-22n), originalExpenseCount:db.expenses.length };
        });
        assert.equal(result.kstMonth, '2026-11');
        assert.equal(result.localMonth, timezoneId==='Asia/Seoul' ? '2026-11' : '2026-10');
        assert(result.text.includes('현재 ' + result.expected), JSON.stringify(result));
        assert.equal(result.originalExpenseCount, 2); assert.deepEqual(session.errors, []);
        pass(timezoneId + ' 한국 시간 월경계에서 11월 보고서 사용·원본 유지');
      } finally { await session.context.close(); }
    }
    console.log('예상 금액 실제 브라우저: ' + checks + '개 검증 통과');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
