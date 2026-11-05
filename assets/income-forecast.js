/* 기록은 변경하지 않습니다. 월말 예상의 추가분에는 반복 수입만 사용합니다. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  function date(value) {
    const text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
    const stamp = Date.parse(text + 'T00:00:00Z');
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === text ? text : '';
  }
  function amount(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new TypeError('메소는 정확한 정수로 입력하세요.');
    const text = String(value ?? '0');
    if (!/^-?\d+$/.test(text)) throw new TypeError('메소는 정확한 정수로 입력하세요.');
    return BigInt(text);
  }
  function kstDate(now = Date.now()) {
    const stamp = new Date(now).getTime();
    if (!Number.isFinite(stamp)) return '';
    return new Date(stamp + 9 * 3600000).toISOString().slice(0, 10);
  }
  function addDays(value, days) {
    return new Date(Date.parse(value + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
  }
  function forecast(input = {}) {
    const today = date(input.today || kstDate());
    const month = String(input.month || today.slice(0, 7));
    if (!today || !/^\d{4}-\d{2}$/.test(month) || !date(month + '-01')) throw new TypeError('기준 날짜와 월을 확인하세요.');
    const currentMonth = today.slice(0, 7);
    const totalDays = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const actual = amount(input.actual);
    const elapsed = month < currentMonth ? totalDays : month > currentMonth ? 0 : Number(today.slice(8, 10));
    const remainingDays = totalDays - elapsed;
    const result = { status:'waiting', actual, projected:actual, addition:0n, average:0n, elapsed, totalDays, remainingDays, sampleDays:0, activeDays:0, sampleStart:'', sampleEnd:'' };
    if (month > currentMonth) return { ...result, status:'future' };
    // 월말 당일은 추가 예측을 하지 않고 현재 기록값을 표시합니다.
    if (remainingDays === 0) return { ...result, status:'closed' };
    const rows = new Map();
    for (const row of Array.isArray(input.days) ? input.days : []) {
      const day = date(row?.date);
      if (!day || day >= today) continue; // 오늘의 일부 기록과 미래 기록은 표본에 넣지 않습니다.
      const value = amount(row.amount);
      const previous = rows.get(day);
      rows.set(day, { amount:(previous?.amount || 0n) + value, active:!!(previous?.active || row.active || value !== 0n) });
    }
    const first = [...rows].filter(([, row]) => row.active).map(([day]) => day).sort()[0];
    if (!first) return result;
    const windowStart = addDays(today, -14);
    const sampleStart = first > windowStart ? first : windowStart;
    const sampleEnd = addDays(today, -1);
    let total = 0n, sampleDays = 0, activeDays = 0;
    for (let day = sampleStart; day <= sampleEnd; day = addDays(day, 1)) {
      const row = rows.get(day);
      total += row?.amount || 0n;
      if (row?.active) activeDays++;
      sampleDays++;
    }
    Object.assign(result, { sampleStart, sampleEnd, sampleDays, activeDays });
    // 적은 횟수의 큰 기록을 반복 수입으로 단정하지 않습니다. 쉰 날도 분모에 포함합니다.
    if (sampleDays < 7 || activeDays < 3) return result;
    const addition = total * BigInt(remainingDays) / BigInt(sampleDays);
    return { ...result, status:'ready', average:total / BigInt(sampleDays), addition, projected:actual + addition };
  }
  const api = Object.freeze({ forecast, kstDate });
  root.MapleIncomeForecast = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
