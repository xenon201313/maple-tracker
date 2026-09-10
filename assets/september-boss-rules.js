(function (root) {
  'use strict';
  // 테스트월드 1.2.206(2)의 본서버 적용 예정값입니다. 기존 가격표와 장부는 변경하지 않습니다.
  const source = 'https://maplestory.nexon.com/testworld/news/all/199';
  const weeklyEffectiveDate = '2026-09-17';
  const monthlyEffectiveDate = '2026-10-01';
  const challengerEndDate = '2026-09-17';
  const weeklyPrices = Object.freeze({
    czak:4040000, cpier:4080000, cban:4070000, cbq:4070000, cvel:4640000,
    hmag:4280000, cpap:6550000, nsu:8350000, ndam:8750000, ngas:12700000,
    eluc:14900000, ewill:16100000, nluc:17800000, nwill:20500000, ndusk:22000000,
    ndun:23700000, hdam:46400000, hsu:48900000, njhil:67600000, hluc:59700000,
    cdusk:66300000, cgas:71300000, hwill:73200000, hdun:89600000, hjhil:100000000,
    nser:167000000, ekal:238000000, eadv:261000000, hser:302000000, ekali:320000000,
    ebellona:396000000, nkal:479000000, nadv:532000000, xsu:545000000, nkali:576000000,
    nstar:593000000, nbellona:824000000, nlimbo:995000000, ckal:1230000000,
    nbal:1320000000, hadv:1390000000, njup:1560000000, hkali:1560000000, xser:1840000000
  });
  const monthlyPrices = Object.freeze({hblack:465000000, xblack:5680000000});
  function periodDate(value) {
    const date = String(value || '');
    if (/^\d{4}-\d{2}$/.test(date)) return date + '-01';
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  }
  function crystalPrice(boss, period) {
    if (!boss) return 0;
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
    weeklyPrices, monthlyPrices, crystalPrice, weeklyLimit, challengerEnded
  });
})(globalThis);
