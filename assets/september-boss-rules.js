(function (root) {
  'use strict';
  // 2026-09-17 본서버 1.2.419 공지로 확인했습니다. 시행일 이전 가격표와 장부는 유지합니다.
  const source = 'https://maplestory.nexon.com/news/update/813';
  const weeklyEffectiveDate = '2026-09-17';
  const monthlyEffectiveDate = '2026-10-01';
  const challengerEndDate = '2026-09-17';
  // 점검 전 판매 선택에만 쓰는 공식 변경 전 가격입니다. 이전 주차의 저장 기준은 유지합니다.
  const previousWeeklyPrices = Object.freeze({
    czak:8080000, cpier:8170000, cban:8150000, cbq:8140000, cvel:9280000,
    hmag:8560000, cpap:13100000, nsu:16700000, ndam:17500000, ngas:25500000,
    eluc:29800000, ewill:32300000, nluc:35600000, nwill:41100000, ndusk:44000000,
    ndun:47500000, hdam:48900000, hsu:51500000, njhil:71200000, hluc:62900000,
    cdusk:69800000, cgas:75100000, hwill:77100000, hdun:94400000, hjhil:106000000,
    nser:239000000, ekal:280000000, eadv:308000000, hser:356000000, ekali:377000000,
    ebellona:440000000, nkal:505000000, nadv:560000000, xsu:574000000, nstar:625000000,
    nkali:678000000, nbellona:850000000, nlimbo:1026000000, ckal:1273000000,
    nbal:1368000000, hadv:1435000000, njup:1615000000, hkali:1739000000, xser:2835000000
  });
  const weeklyPrices = Object.freeze({
    czak:4040000, cpier:4080000, cban:4070000, cbq:4070000, cvel:4640000,
    hmag:4280000, cpap:6550000, nsu:8350000, ndam:8750000, ngas:12700000,
    eluc:14900000, ewill:16100000, nluc:17800000, nwill:20500000, ndusk:22000000,
    ndun:23700000, hdam:46400000, hsu:48900000, njhil:67600000, hluc:59700000,
    cdusk:66300000, cgas:71300000, hwill:73200000, hdun:89600000, hjhil:100000000,
    nser:167000000, ekal:238000000, eadv:261000000, hser:302000000, ekali:320000000,
    ebellona:396000000, nkal:479000000, nadv:532000000, xsu:545000000, nkali:593000000,
    nstar:576000000, nbellona:824000000, nlimbo:995000000, ckal:1230000000,
    nbal:1320000000, hadv:1390000000, njup:1560000000, hkali:1560000000, xser:1840000000
  });
  const monthlyPrices = Object.freeze({hblack:465000000, xblack:5680000000});
  function periodDate(value) {
    const date = String(value || '');
    if (/^\d{4}-\d{2}$/.test(date)) return date + '-01';
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  }
  function canSelectSaleTiming(boss, period) {
    return !!boss && boss[3] === 'w' && period === weeklyEffectiveDate
      && Object.prototype.hasOwnProperty.call(previousWeeklyPrices, boss[0]);
  }
  function crystalPrice(boss, period, timing) {
    if (!boss) return 0;
    if (timing === 'before-patch' && canSelectSaleTiming(boss, period)) return previousWeeklyPrices[boss[0]];
    const date = periodDate(period);
    const table = boss[3] === 'm' ? monthlyPrices : weeklyPrices;
    const effective = boss[3] === 'm' ? monthlyEffectiveDate : weeklyEffectiveDate;
    return date && date >= effective && Object.prototype.hasOwnProperty.call(table, boss[0])
      ? table[boss[0]] : Number(boss[2]) || 0;
  }
  function weeklyLimit(period) {
    const date = periodDate(period);
    return date && date >= weeklyEffectiveDate ? Infinity : 12;
  }
  function challengerEnded(period) {
    const date = periodDate(period);
    return !!date && date >= challengerEndDate;
  }
  root.MapleSeptemberBossRules = Object.freeze({
    source, weeklyEffectiveDate, monthlyEffectiveDate, challengerEndDate,
    weeklyPrices, previousWeeklyPrices, monthlyPrices, canSelectSaleTiming, crystalPrice, weeklyLimit, challengerEnded
  });
})(globalThis);
