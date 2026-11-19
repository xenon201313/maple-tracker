const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');

async function main() {
  const root = path.resolve(__dirname, '..');
  const origin = 'https://ledger.test';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Seoul' });
    await fixtureDismissPatchNotes(context);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { await route.fulfill({ path: file }); } catch { await route.abort(); }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-19T00:30:00+09:00'));
    await page.goto(origin + '/?page=character');
    const result = await page.evaluate(() => {
      const now = '2026-11-19', last = '2026-11-12';
      const dailyId = DAILY_BOSSES[0][0];
      const targets = BOSS_GROUPS.w.filter(g => !isLimitFreeBoss(g.bosses[0])).slice(0,10).map(g => [g.bosses[0][0],1]);
      db.chars = Array.from({ length: 9 }, (_, i) => normalizeChar({
        name: '테스트' + i, worldName: i % 2 ? '크로아' : '스카니아',
        bossWeeks: { [now]: Object.fromEntries(targets), [last]: Object.fromEntries(targets) }
      }));
      function counts(week) {
        return bossTotals(week).worldCrystals.map(row => [row.label,row.crystals,row.overLimit]);
      }
      const historical = counts(last), exact = counts(now);
      const first = db.chars[0];
      first.dailyBossDays[now] = { [dailyId]: 1 };
      first.dailyBossClearDays[now] = { [dailyId]: true, [DAILY_BOSSES[1][0]]: true };
      first.monthBossMonths['2026-11'] = { hblack: 1 };
      first.monthBossClearWeeks['2026-11'] = { hblack: now };
      const over = counts(now);
      db.chars.push(normalizeChar({name:'이벤트',server:'challenger',worldName:'챌린저스',bossWeeks:{[now]:{czak:1}}}));
      db.chars.push(normalizeChar({name:'스페셜',worldName:'스페셜',bossWeeks:{[now]:{czak:1}}}));
      const separated = counts(now);
      renderAll();
      return { historical, exact, over, separated };
    });
    assert.deepEqual(result.historical.map(row => row[1]), [50,40]);
    assert.deepEqual(result.exact, [['기본 계정 · 일반 월드 합산',90,false]]);
    assert.deepEqual(result.over, [['기본 계정 · 일반 월드 합산',92,true]]);
    assert.deepEqual(result.separated.slice(1), [['기본 계정 · 챌린저스 월드',1,false],['기본 계정 · 스페셜 월드',1,false]]);
    const card = page.locator('.registered-card').first();
    await card.getByText('결정석 판매 한도 설정', { exact: true }).click();
    await card.getByLabel('장부용 계정 별명').fill('둘째');
    await card.getByRole('button', { name:'적용', exact:true }).click();
    await page.reload();
    const after = await page.evaluate(() => bossTotals('2026-11-19').worldCrystals.map(row => [row.label,row.crystals]));
    assert.deepEqual(after.slice(0,2), [['둘째 · 일반 월드 합산',12],['기본 계정 · 일반 월드 합산',80]]);
    await page.clock.setFixedTime(new Date('2026-12-03T12:00:00+09:00'));
    const monthly = await page.evaluate(() => {
      const c=normalizeChar({name:'월간 집계 확인',worldName:'스카니아'});
      db.chars=[c];
      const sync=date=>applySchedulerData(c,{date,boss_contents:[{
        content_name:'검은 마법사',difficulty:'하드',cycle:'월간',complete_flag:true
      }]});
      const first=sync('2026-11-19');
      const repeat=sync('2026-11-26');
      const novemberWeeks=['2026-11-19','2026-11-26'].map(week=>bossTotals(week).monthlyCrystals);
      const december=sync('2026-12-01');
      sync('2026-12-03');
      const decemberWeek=monthBossClearWeek(c,'2026-12','hblack');
      // 과거 장부가 보스 완료만 보존한 경우, 누락 주차를 한 번 채우고 저장을 요청합니다.
      delete c.monthBossClearWeeks['2026-12'].hblack;
      const recovered=sync('2026-12-03'), unchanged=sync('2026-12-03');
      return {added:[first.added,repeat.added,december.added],novemberWeeks,decemberWeek,
        recovered:[recovered.added,recovered.changed],unchanged:unchanged.changed};
    });
    assert.deepEqual(monthly,{added:[1,0,1],novemberWeeks:[1,0],decemberWeek:'2026-11-26',recovered:[0,true],unchanged:false});
    const manual=await page.evaluate(()=>{
      const week='2026-11-19',month='2026-11';
      const c=normalizeChar({name:'과거 수동 기록',worldName:'크로아',crystalAccountAlias:'둘째',
        monthBossMonths:{[month]:{hblack:2}},monthBossClearWeeks:{[month]:{hblack:week}}});
      db.chars=[c];
      const before=bossTotals(week).monthCrystal;
      applySchedulerData(c,{date:'2026-11-26',boss_contents:[{content_name:'검은 마법사',difficulty:'하드',cycle:'월간',complete_flag:true}]});
      const restored=trackerDbFromData(exportBackupBundle(),'',db.backupSnapshots).chars[0];
      return {before,after:bossTotals(week).monthCrystal,week:restored.monthBossClearWeeks[month].hblack,
        party:restored.monthBossMonths[month].hblack,account:restored.crystalAccountAlias};
    });
    assert.ok(manual.before>0);
    assert.equal(manual.before,manual.after);
    assert.equal(manual.week,'2026-11-19');
    assert.equal(manual.party,2);
    assert.equal(manual.account,'둘째');
    assert.deepEqual(errors, []);
    console.log('11/19 이전 월드별 집계, 점검 전 메이플ID 한도, 90·92개, 일간 판매와 월간 귀속, 예외 월드와 복수 계정 저장 검증 완료');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
