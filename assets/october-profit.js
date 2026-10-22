/* 2026-10-22 본서버 1.2.420 공식 상품·확률표. 실제 이미지 출처: assets/profit/october2026/sources.json */
(function(global){
  'use strict';
  const base='assets/profit/october2026/';
  const source='https://maplestory.nexon.com/News/Update/815';
  const start='2026-10-22T10:00:00+09:00';
  const boutiqueSaleEnd='2026-11-19T00:00:00+09:00';
  const boutiqueTicketEnd='2026-12-01T00:00:00+09:00';
  const momentumSaleEnd='2026-11-18T23:00:00+09:00';
  const momentumEffectEnd='2026-11-19T00:00:00+09:00';
  const artisanImages={artisan_moru:'artisan-anvil',artisan_medal_moru:'artisan-medal-anvil',artisan_pinkbean_hat:'artisan-pink-bean-hat',artisan_wing_glasses:'artisan-traveler-wing-glasses',artisan_maple_sword:'artisan-maple-sword',artisan_elixir:'artisan-elixir',artisan_power_elixir:'artisan-power-elixir',artisan_buffalo:'artisan-buffalo-mount',artisan_rabbit_cart:'artisan-rabbit-cart-mount',artisan_giant:'artisan-giant-potion',artisan_invincible:'artisan-invincibility-potion',artisan_spell_trace:'artisan-spell-trace'};
  const image=id=>base+(artisanImages[id] || id)+'.png';
  const row=(id,name,extra={})=>({id,name,img:image(id),...extra});
  const boutiqueTrade='부티크 티켓과 교환한 결과물은 각각 실제 판매한 수량만 기록하세요. 같은 티켓을 티켓 판매와 교환 결과에 중복 반영하지 마세요. 교환품은 1회 교환 후 월드 내 캐릭터 간 이동만 가능합니다.';
  const boutiqueExchange=[
    ['boutique_title_90','부티크 액션 칭호 교환권 (90일)',200,'30일'],
    ['boutique_title_30','부티크 액션 칭호 교환권 (30일)',80,'30일'],
    ['boutique_title_select','부티크 칭호 선택권',45,'30일'],
    ['boutique_estelle','솔 헤카테 : 에스텔 스킨 교환권',80,'영구'],
    ['boutique_crimson','크림슨 팩트 세트',180,'영구'],
    ['boutique_hair','부티크 헤어 쿠폰',180,'30일'],
    ['boutique_face','홍조/발그레 냠냠! 얼굴장식 교환권',130,'영구'],
    ['boutique_skin','커스텀 스킨 쿠폰',130,'60일'],
    ['boutique_prism','스킨 프리즘',90,'영구'],
    ['boutique_lavender','뽀송/홍조 라벤더 스킨 교환권',90,'영구'],
    ['boutique_wonder_ring','원더 블랙 21~25기 말풍선/명찰 반지 (영구) 선택권',40,'영구'],
    ['boutique_mix_select','커스텀 믹스염색 & 컬러렌즈 쿠폰 교환권',45,'7일'],
    ['boutique_mix_dye','커스텀 믹스염색 쿠폰',35,'7일'],
    ['boutique_mix_lens','커스텀 믹스 컬러렌즈 쿠폰',18,'7일'],
    ['boutique_love_set','사랑으로 극복중 세트 선택권',30,'영구'],
    ['boutique_cardigan_set','포근복닥 가디건 세트 선택권',30,'영구'],
    ['boutique_puppy_set','뭉게 퍼피 세트 선택권',20,'영구'],
    ['boutique_invisible','투명 의자/라이딩 선택권',15,'영구'],
    ['boutique_face_box','알쏭달쏭 표정 얼굴장식 상자',15,'7일'],
    ['boutique_coordi_box','알쏭달쏭 코디 상자',5,'7일']
  ].map(([id,name,ticketCost,validFor])=>row(id,name,{ticketCost,validFor,sellable:true,tradeNote:'부티크 티켓 '+ticketCost+'개 · '+validFor+' · 1회 교환 가능'}));
  const normalProbabilities=[[1,49.94],[2,25.95],[3,12],[4,5],[5,2],[6,1.5],[7,1],[8,.8],[9,.75],[10,.7],[50,.3],[100,.03],[500,.02],[1000,.01]].map(([quantity,probability])=>({quantity,probability}));
  const feverProbabilities=[[10,94.74],[12,1.5],[14,1],[16,.9],[18,.8],[20,.7],[100,.3],[200,.03],[1000,.02],[2000,.01]].map(([quantity,probability])=>({quantity,probability}));
  const royalRows=[
    ['royal162_wish_hat','위시 셀러 햇','3%','남자', 'hat'],
    ['royal162_dream_ribbon','드림 셀러 리본','3%','여자','hat'],
    ['royal162_mellow_wish','멜로우 위시 (남)','3%','남자','overall'],
    ['royal162_mellow_dream','멜로우 드림 (여)','3%','여자','overall'],
    ['royal162_wish_shoes','위시 셀러 슈즈 (남)','3%','남자','shoes'],
    ['royal162_dream_shoes','드림 셀러 로퍼 (여)','3%','여자','shoes'],
    ['royal162_heart','곰돌 하트 팡','3%','공용','cape'],
    ['royal162_bell','리틀 드림 벨','3%','공용','weapon'],
    ['royal162_autumn_headset','어텀 튜닝 헤드셋','3%','공용','autumn_hat'],
    ['royal162_dream_balloon','곰순 드림 벌룬','2%','공용','balloon'],
    ['royal162_wish_cart','곰돌 위시 카트','2%','공용','cart'],
    ['royal162_autumn_bag','어텀 캠핑 백','3.5%','공용','bag'],
    ['royal162_autumn_wish','어텀 위스퍼 (남)','1.5%','남자','autumn_overall'],
    ['royal162_autumn_breeze','어텀 브리즈 (여)','1.5%','여자','autumn_overall'],
    ['royal162_autumn_shoes','어텀 캠핑 슈즈','5%','공용','autumn_shoes'],
    ['royal162_autumn_weapon','어텀 스위트 멜로우','4%','공용','autumn_weapon'],
    ['royal162_campfire','캠프파이어 무드','5%','공용','chair'],
    ['royal162_name_ring','꿈빛 리본 명찰 반지','0.1%','공용','name_ring'],
    ['royal162_chat_ring','꿈빛 리본 말풍선 반지','0.1%','공용','chat_ring'],
    ['royal162_prisoner_hat','죄수 모자','5%','공용','prisoner_hat'],
    ['royal162_prisoner_clothes','죄수복','4%','공용','prisoner_clothes'],
    ['royal162_cannot_go','못가','5.3%','공용','cannot_go'],
    ['royal162_depressed','우울하다','5%','공용','depressed'],
    ['royal162_spoon','숟가락 탈옥범','5%','공용','spoon'],
    ['royal162_dark_silkhat','암흑 실크햇 (남)','5%','남자','dark_hat'],
    ['royal162_dark_lace','암흑 레이스 (여)','5%','여자','dark_hat'],
    ['royal162_noble_dark','고결한 암흑 (남)','1.5%','남자','dark_overall'],
    ['royal162_elegant_dark','우아한 암흑 (여)','1.5%','여자','dark_overall'],
    ['royal162_dark_steps_male','암흑 사박 (남)','4%','남자','dark_shoes'],
    ['royal162_dark_steps_female','암흑 사뿐 (여)','4%','여자','dark_shoes'],
    ['royal162_dark_crack','암흑의 균열','4%','공용','dark_cape'],
    ['royal162_dark_watcher','암흑 감시자','5%','공용','dark_weapon'],
    ['royal162_reaper_throne','사신의 옥좌','5%','공용','reaper_throne']
  ];
  const royalOutputs=royalRows.map(([id,name,note,gender,probabilityGroup])=>row(id,name,{note,gender,probabilityGroup,sellable:true,tradeNote:gender+' · 162기. 성별 대체 품목의 확률을 합산하지 않습니다.'}));
  royalOutputs.push(
    row('royal162_name_ring_coupon','[30일] 꿈빛 리본 명찰 반지 교환권',{img:image('royal162_name_ring'),note:'5%',sellable:true,tradeNote:'교환권 7일 · 교환 후 반지 30일. 이미지는 교환 후 반지 미리보기입니다.'}),
    row('royal162_chat_ring_coupon','[30일] 꿈빛 리본 말풍선 반지 교환권',{img:image('royal162_chat_ring'),note:'5%',sellable:true,tradeNote:'교환권 7일 · 교환 후 반지 30일. 이미지는 교환 후 반지 미리보기입니다.'})
  );
  const artisanOutputs=[
    ['artisan_pinkbean_hat','핑크빈 모자',1],['artisan_wing_glasses','여행자의 윙글래스',1],['artisan_maple_sword','메이플 소드',1],
    ['artisan_elixir','엘릭서',100],['artisan_power_elixir','파워 엘릭서',50],['artisan_buffalo','버팔로 라이딩 이용쿠폰',1],
    ['artisan_rabbit_cart','토끼수레 라이딩 이용쿠폰',1],['artisan_giant','자이언트 비약',1],['artisan_invincible','무적의 비약',1],['artisan_spell_trace','주문의 흔적',100]
  ].map(([id,name,quantityPerGift])=>row(id,name,{note:'10%',quantityPerGift,sellable:true,tradeNote:'선물 1회 획득 수량 '+quantityPerGift+'개. 판매 입력의 수량은 실제 판매한 개수입니다.'}));
  const catalogs=[
    {id:'boutique',title:'부티크 기프트',costs:[row('boutique_gift','부티크 기프트',{officialPrice:3300,officialCurrency:'캐시 또는 크레딧',tradeNote:'1개 3,300캐시/크레딧 · 10개 33,000캐시 · 메이플포인트·마일리지 사용 불가 · 구입 후 7일 내 사용. 실제 지출한 메소 환산가만 입력.'})],outputs:[row('boutique_ticket','부티크 티켓',{sellable:true,validUntil:'2026-11-30T23:59:59+09:00',tradeNote:'교환 가능 · 11/30 23:59까지 사용. 판매한 티켓만 수익 반영.'}),...boutiqueExchange],startsAt:start,endsAt:boutiqueTicketEnd,purchaseEndsAt:boutiqueSaleEnd,lastPurchaseDate:'2026-11-18',lastRecordDate:'2026-11-30',source:'https://maplestory.nexon.com/News/CashShop/Sale/651',tradeNote:boutiqueTrade,normalProbabilities,feverProbabilities},
    {id:'momentum_plus',title:'모멘텀 패스 PLUS',costs:[row('momentum_premium','프리미엄 모멘텀 패스',{officialPrice:29800,officialCurrency:'넥슨캐시',tradeNote:'29,800 넥슨캐시 · 명의당 1회. 9/17 회차 구매 이력은 초기화되지 않습니다.'}),row('momentum_prime','프라임 모멘텀 패스',{officialPrice:39800,officialCurrency:'넥슨캐시',tradeNote:'39,800 넥슨캐시 · 명의당 1회. 프리미엄 적용 캐릭터에서 사용. 9/17 회차 프리미엄만 활성화했다면 프리미엄 재구매 없이 구매 가능.'}),row('momentum_points','모멘텀 패스 포인트 100점 보충',{officialPrice:1000,officialCurrency:'메이플포인트',unit:'100점 단위',tradeNote:'모멘텀 100점당 1,000메이플포인트. 메소로 환산해 실제 지출한 금액만 입력.'})],outputs:[],startsAt:start,endsAt:momentumEffectEnd,purchaseEndsAt:momentumSaleEnd,lastPurchaseDate:'2026-11-18',lastRecordDate:'2026-11-18',source,tradeNote:'패스 판매는 11/18 23:00까지, 효과·보상 수령은 23:59까지입니다. 넥슨캐시 구입액·무료 보상은 메소 지출이나 판매 수익으로 자동 환산하지 않습니다. 9/17 회차 구매 이력은 유지됩니다.'},
    {id:'artisan_gift',title:'모루 · 장인의 선물',costs:[row('artisan_moru','신비의 모루',{tradeNote:'모루 사용으로 획득한 장인의 선물 결과를 기록합니다. 실제 구입 메소만 입력.'}),row('artisan_medal_moru','훈장 신비의 모루',{tradeNote:'공식 선물 획득 수단. 주간 메소 판매 상품이 아닙니다.'})],outputs:artisanOutputs,startsAt:start,endsAt:null,purchaseEndsAt:null,lastRecordDate:null,source:'https://maplestory.nexon.com/Guide/OtherProbability/game/gameMasterPresent',tradeNote:'10/22 이후 공식 확률표의 결과 10종입니다. 삭제된 100% 무기 주문서 3종은 신규 결과에 포함하지 않습니다. 선물 결과의 실제 획득·판매 수량을 입력하세요.'}
  ];
  const loupeItems=[['yeti_loupe','수상한 돋보기','event-suspicious-loupe'],['yeti_detective_loupe','탐정예티의 수상한 돋보기','event-detective-yeti-loupe']];
  catalogs.push({id:'yeti_magnifier',title:'사냥 이벤트 돋보기',costs:loupeItems.map(([id,name,img])=>row(id+'_buy',name+' 구입',{img:base+img+'.png',tradeNote:'실제 메소 구입비만 입력. 직접 획득했거나 미션 보상으로 받은 수량의 구입비는 0입니다.'})),outputs:loupeItems.map(([id,name,img])=>row(id,name,{img:base+img+'.png',sellable:true,tradeNote:'몬스터 드랍은 1회 교환 후 월드 내 이동만 가능. 일일 미션 보상은 판매 대상이 아닙니다.'})),startsAt:start,endsAt:'2026-11-19T02:00:00+09:00',purchaseEndsAt:'2026-11-19T02:00:00+09:00',lastPurchaseDate:'2026-11-19',lastRecordDate:'2026-11-19',source:'https://maplestory.nexon.com/News/Event/1403',tradeNote:'드랍 획득은 11/18 23:59까지, 사용은 11/19 02:00까지입니다. 몬스터 드랍 중 실제로 판매한 수량만 수익에 반영합니다. 일반 돋보기는 캐릭터당 하루 10회, 탐정예티 돋보기는 메이플ID당 하루 3회 사용합니다. 일일 미션 보상은 월드 내 이동만 가능하므로 판매로 입력하지 마세요.'});
  const categories=catalogs.map(c=>({id:c.id,title:c.title,img:c.costs[0].img,tag:c.id==='boutique'?'11/18 판매 종료':c.id==='momentum_plus'?'11/18까지':c.id==='yeti_magnifier'?'사냥 이벤트':'모루',desc:c.tradeNote}));
  function moment(value){return typeof value==='string'?Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00+09:00':value):Number(value);}
  function catalog(id){return catalogs.find(c=>c.id===id)||null;}
  function isActive(id,now=Date.now()){
    if(id==='royal162') return moment(now)>=Date.parse(start);
    const c=catalog(id),t=moment(now);return !!c&&Number.isFinite(t)&&t>=Date.parse(c.startsAt)&&(!c.endsAt||t<Date.parse(c.endsAt));
  }
  function canPurchase(id,now=Date.now()){
    if(typeof now==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(now)){
      const t=moment(now);if(!Number.isFinite(t)||new Date(t+9*60*60*1000).toISOString().slice(0,10)!==now)return false;
      const firstDate=start.slice(0,10);
      if(id==='royal162')return now>=firstDate&&now<='2026-11-19';
      const c=catalog(id);return !!c&&now>=firstDate&&(!c.lastPurchaseDate||now<=c.lastPurchaseDate);
    }
    if(id==='royal162'){const t=moment(now);return t>=Date.parse(start)&&t<Date.parse('2026-11-20T00:00:00+09:00');}
    const c=catalog(id),t=moment(now);return !!c&&Number.isFinite(t)&&t>=Date.parse(c.startsAt)&&(!c.purchaseEndsAt||t<Date.parse(c.purchaseEndsAt));
  }
  function feverInfo(previousUsed,currentUsed){
    for(const n of [previousUsed,currentUsed])if(!Number.isSafeInteger(n)||n<0)throw new RangeError('사용 횟수는 0 이상의 정수여야 합니다.');
    if(!Number.isSafeInteger(previousUsed+currentUsed))throw new RangeError('사용 횟수가 너무 큽니다.');
    const feverUses=Math.floor((previousUsed+currentUsed)/10)-Math.floor(previousUsed/10);
    return {previousUsed,currentUsed,totalUsed:previousUsed+currentUsed,normalUses:currentUsed-feverUses,feverUses,nextFeverIn:10-(previousUsed+currentUsed)%10};
  }
  function ticketBalance(availableTickets,soldTickets,exchangeCounts={}){
    const check=n=>{if(!Number.isSafeInteger(n)||n<0)throw new RangeError('티켓과 교환 수량은 0 이상의 정수여야 합니다.');};
    check(availableTickets);check(soldTickets);
    let exchangedTickets=0;
    for(const [id,count] of Object.entries(exchangeCounts)){
      const item=boutiqueExchange.find(i=>i.id===id);if(!item)throw new RangeError('확인되지 않은 부티크 교환 품목입니다.');
      check(count);exchangedTickets+=item.ticketCost*count;
      if(!Number.isSafeInteger(exchangedTickets))throw new RangeError('티켓 사용 수량이 너무 큽니다.');
    }
    const remaining=availableTickets-soldTickets-exchangedTickets;
    return {availableTickets,soldTickets,exchangedTickets,remaining,valid:remaining>=0};
  }
  function today(now=Date.now()){return new Date(moment(now)+9*60*60*1000).toISOString().slice(0,10);}
  function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  global.MapleOctoberProfit=freeze({source,startsAt:start,categories,catalogs,catalog,royalOutputs,royal:{id:'royal162',title:'로얄스타일 162기',startsAt:start,endsAt:null,lastPurchaseDate:'2026-11-19',listEndsText:'2026년 11월 19일 점검 전 (정확한 점검 시각은 공식 공지 확인)',source:'https://maplestory.nexon.com/News/CashShop/Sale/650',probabilitySource:'https://maplestory.nexon.com/Guide/CashShop/Probability/RoyalStyle',tradeNote:'쿠폰 목록은 11/19 점검 전까지입니다. 과거 162기 결과의 판매 정산은 이후에도 기록할 수 있습니다.'},isActive,canPurchase,feverInfo,ticketBalance,today});
})(globalThis);
