(function(root){
  'use strict';
  const source='https://maplestory.nexon.com/news/update/815';
  const effectiveDate='2026-10-22';
  const saleTimingEndsAt='2026-10-29T00:00:00+09:00';
  const previousPrices=Object.freeze({xkali:5387000000,hjup:4845000000});
  const prices=Object.freeze({xkali:4845000000,hjup:5387000000});
  const openings=Object.freeze({xlimbo:'2026-10-23T19:00:00+09:00',xbal:'2026-10-23T20:00:00+09:00'});
  function canSelectSaleTiming(boss,period){
    return !!boss && boss[3]==='w' && period===effectiveDate && Object.hasOwn(prices,boss[0]);
  }
  function saleTimingUiActive(period,now=Date.now()){
    return period===effectiveDate && now<Date.parse(saleTimingEndsAt);
  }
  function crystalPrice(boss,period,timing,fallback){
    if(!boss || !/^\d{4}-\d{2}-\d{2}$/.test(String(period)) || period<effectiveDate || !Object.hasOwn(prices,boss[0])) return fallback;
    return timing==='before-patch' && canSelectSaleTiming(boss,period) ? previousPrices[boss[0]] : prices[boss[0]];
  }
  function lockReason(boss,period,now=Date.now(),exactDate=false){
    const opening=OpenTime(boss);
    if(!opening) return '';
    // 주간 장부의 목요일 키가 금요일 개방을 포함하는 경우를 허용합니다.
    const day=String(period || '').slice(0,10);
    const stamp=Date.parse(day+'T00:00:00+09:00');
    const release=Date.parse(opening);
    const end=stamp+(exactDate?1:7)*86400000;
    if(!Number.isFinite(stamp) || end<=release || now<release){
      return '10월 23일 '+(boss[0]==='xlimbo'?'19:00':'20:00')+'(한국 시간)부터 선택 가능';
    }
    return '';
  }
  function OpenTime(boss){return boss && openings[boss[0]] || '';}
  root.MapleOctoberBossRules=Object.freeze({source,effectiveDate,saleTimingEndsAt,previousPrices,prices,openings,canSelectSaleTiming,saleTimingUiActive,crystalPrice,lockReason,opening:OpenTime});
})(globalThis);
