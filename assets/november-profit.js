/* 2026년 11월 19일 본서버 공식 캐시샵 공지와 회차별 확률표. */
(function (root) {
  'use strict';
  const start = '2026-11-19T10:00:00+09:00';
  const end = '2027-01-21T00:00:00+09:00';
  const image = id => 'assets/profit/november2026/' + id + '.png';
  const sale = 'https://maplestory.nexon.com/News/CashShop/Sale/';
  const probability = 'https://maplestory.nexon.com/Guide/OtherProbability/Game/';
  const coordiRows = [
    ["ba_coordi_v1_01", "아로나 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_02", "아루 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_03", "이부키 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_04", "유우카 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_05", "나기사 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_06", "미카 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_07", "세이아 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_08", "키쿄 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_09", "와카모 세트 교환권", "10.7778%"],
    ["ba_coordi_v1_10", "아리스(메이드) 세트 교환권", "3%"]
  ];
  const goodsRows = [
    ["ba_goods_v1_01", "블루 아카이브 학생 이름표 명찰 반지 교환권", "0.5%"],
    ["ba_goods_v1_02", "이로하 컷인 이펙트 획득권", "1%"],
    ["ba_goods_v1_03", "키쿄 컷인 이펙트 획득권", "1%"],
    ["ba_goods_v1_04", "아로나 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_05", "아루 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_06", "이부키 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_07", "유우카 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_08", "나기사 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_09", "미카 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_10", "세이아 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_11", "키쿄 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_12", "와카모 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_13", "아리스(메이드) 액션 헤어 쿠폰", "1%"],
    ["ba_goods_v1_14", "아루 명찰&말풍선 반지 교환권", "1.5%"],
    ["ba_goods_v1_15", "이부키 명찰&말풍선 반지 교환권", "1.5%"],
    ["ba_goods_v1_16", "유우카 명찰&말풍선 반지 교환권", "1.5%"],
    ["ba_goods_v1_17", "나기사 명찰&말풍선 반지 교환권", "1.5%"],
    ["ba_goods_v1_18", "미카 명찰&말풍선 반지 교환권", "1.5%"],
    ["ba_goods_v1_19", "세이아 명찰&말풍선 반지 교환권", "1.5%"],
    ["ba_goods_v1_20", "키쿄 명찰&말풍선 반지 교환권", "1.5%"],
    ["ba_goods_v1_21", "와카모 명찰&말풍선 반지 교환권", "1.5%"],
    ["ba_goods_v1_22", "아로나 소울 스킨", "2%"],
    ["ba_goods_v1_23", "이로하 소울 스킨", "2%"],
    ["ba_goods_v1_24", "키쿄 소울 스킨", "2%"],
    ["ba_goods_v1_25", "블루 아카이브 커스텀 배경 교환권", "2%"],
    ["ba_goods_v1_26", "아로나(기본 표정) 스페셜 일러스트 등록권", "2%"],
    ["ba_goods_v1_27", "아로나(당황 표정) 스페셜 일러스트 등록권", "2%"],
    ["ba_goods_v1_28", "아로나(기쁜 표정) 스페셜 일러스트 등록권", "2%"],
    ["ba_goods_v1_29", "소라 아르바이트 한벌옷 교환권", "2%"],
    ["ba_goods_v1_30", "콩콩 아로나 모자 교환권", "2%"],
    ["ba_goods_v1_31", "페로로지라 얼굴장식 교환권", "2%"],
    ["ba_goods_v1_32", "딸기우유 콤플렉스 선글라스 교환권", "2.5%"],
    ["ba_goods_v1_33", "블루 이터니티 교환권", "2.5%"],
    ["ba_goods_v1_34", "아로나의 고래 교환권", "2.5%"],
    ["ba_goods_v1_35", "블루 스카이 판타지 교환권", "2.5%"],
    ["ba_goods_v1_36", "티파티 타임 교환권", "2.5%"],
    ["ba_goods_v1_37", "블루 아카이브 교실에서 교환권", "2.5%"],
    ["ba_goods_v1_38", "샬레 사무실 회의 시간 교환권", "2.5%"],
    ["ba_goods_v1_39", "아로나로이드 교환권", "3%"],
    ["ba_goods_v1_40", "아리스로이드(메이드) 교환권", "3%"],
    ["ba_goods_v1_41", "아루로이드 교환권", "4%"],
    ["ba_goods_v1_42", "이부키로이드 교환권", "4%"],
    ["ba_goods_v1_43", "유우카로이드 교환권", "4%"],
    ["ba_goods_v1_44", "나기사로이드 교환권", "4%"],
    ["ba_goods_v1_45", "미카로이드 교환권", "4%"],
    ["ba_goods_v1_46", "세이아로이드 교환권", "4%"],
    ["ba_goods_v1_47", "키쿄로이드 교환권", "4%"],
    ["ba_goods_v1_48", "와카모로이드 교환권", "4%"]
  ];
  const royalRows = [
    ["royal163_01_m", "블루 레이지 혼", "3.0%", "남자"],
    ["royal163_01_f", "네온 펄스 안테나", "3.0%", "여자"],
    ["royal163_02_m", "사일런트 스톰 (남)", "3.0%", "남자"],
    ["royal163_02_f", "블리츠 스톰 (여)", "3.0%", "여자"],
    ["royal163_03_m", "스톰 체이서 (남)", "3.0%", "남자"],
    ["royal163_03_f", "스톰 라이더 (여)", "3.0%", "여자"],
    ["royal163_04", "플라즈마 스파크", "3.0%", "공용"],
    ["royal163_05", "라이트닝 퓨리", "3.0%", "공용"],
    ["royal163_06_m", "속내 있는 얼굴장식", "3.0%", "남자"],
    ["royal163_06_f", "홀로그램 바이저", "3.0%", "여자"],
    ["royal163_07_m", "스위트 범블비 고글", "3.0%", "남자"],
    ["royal163_07_f", "스위트 범블비 베레모", "3.0%", "여자"],
    ["royal163_08_m", "스위트 범블비 멜빵 (남)", "2.8%", "남자"],
    ["royal163_08_f", "스위트 범블비 드레스 (여)", "2.8%", "여자"],
    ["royal163_09_m", "허니 브라운 스니커즈 (남)", "5.0%", "남자"],
    ["royal163_09_f", "허니 브라운 메리제인 (여)", "5.0%", "여자"],
    ["royal163_10", "쁘띠 허니 비 백팩", "1.5%", "공용"],
    ["royal163_11", "스위트 허니 디퍼", "3.0%", "공용"],
    ["royal163_12_m", "단잠 리본", "3.5%", "남자"],
    ["royal163_12_f", "낮잠 리본", "3.5%", "여자"],
    ["royal163_13_m", "포근 단잠 (남)", "5.0%", "남자"],
    ["royal163_13_f", "포근 낮잠 (여)", "5.0%", "여자"],
    ["royal163_14", "포근 실내화", "5.0%", "공용"],
    ["royal163_15", "포근냥 쿠션", "2.0%", "공용"],
    ["royal163_16", "포근 졸려", "5.0%", "공용"],
    ["royal163_17_m", "설야의 어둠", "5.0%", "남자"],
    ["royal163_17_f", "설야의 새벽", "5.0%", "여자"],
    ["royal163_18_m", "고독한 설야 (남)", "4.0%", "남자"],
    ["royal163_18_f", "그리운 설야 (여)", "4.0%", "여자"],
    ["royal163_19_m", "설야의 부츠 (남)", "5.0%", "남자"],
    ["royal163_19_f", "설야의 구두 (여)", "5.0%", "여자"],
    ["royal163_20", "설야의 문장", "5.0%", "공용"],
    ["royal163_21", "설야의 흑호", "5.0%", "공용"],
    ["royal163_22", "동공지진", "2.0%", "공용"],
    ["royal163_23", "네온 블루 스톰 명찰 반지", "0.1%", "공용"],
    ["royal163_24", "네온 블루 스톰 말풍선 반지", "0.1%", "공용"],
    ["royal163_25", "[30일] 네온 블루 스톰 명찰 반지 교환권", "5.0%", "공용"],
    ["royal163_26", "[30일] 네온 블루 스톰 말풍선 반지 교환권", "5.0%", "공용"],
    ["royal163_27", "베리 허니 팬케이크", "5.0%", "공용"],
    ["royal163_28", "꿀잠 베개", "5.0%", "공용"]
  ];

  function collection(id, title, officialPrice, page, guide, rows) {
    const boxId = id + '_v1_box';
    return {
      id: id + '_v1', title, startsAt: start, endsAt: end, purchaseEndsAt: end,
      lastRecordDate: '2027-01-20', lastPurchaseDate: '2027-01-20', tag: '1/20까지',
      source: sale + page, probabilitySource: probability + guide,
      tradeNote: '정가로 구매한 캐시는 안내 금액입니다. 사용 전 1회 교환 가능한 상품과 결과물 중 실제로 판매한 수량만 기록하세요. 교환권을 사용한 뒤 받은 캐릭터 전용 보상이나 사용 횟수 보상은 판매 수익에서 제외합니다.',
      costs: [{id: boxId, name: title, img: image(boxId), officialPrice, officialCurrency: '넥슨캐시',
        tradeNote: '낱개 ' + officialPrice.toLocaleString('ko-KR') + '캐시 · 10개 ' + (officialPrice * 10).toLocaleString('ko-KR') + '캐시. 메이플포인트 사용 불가. 구입 후 7일 내 사용. 개당 실제 메소 비용을 입력하세요.'}],
      sealedSale: {id: id + '_v1_sealed_sale', name: title + ' (미개봉)', img: image(boxId), sellable: true},
      outputs: rows.map(([id, name, note]) => ({id, name, note, img: image(id), sellable: true}))
    };
  }
  const catalogs = [
    collection('ba_coordi', '블루 아카이브 코디 컬렉션 Vol.1', 9900, 654, 'BlueArchiveCoordi', coordiRows),
    collection('ba_goods', '블루 아카이브 굿즈 컬렉션 Vol.1', 3300, 655, 'BlueArchiveGoods', goodsRows)
  ];
  const royal = {
    title: '163기 · 네온 블루 스톰', startsAt: start, lastPurchaseDate: '2026-12-17',
    source: sale + '653', probabilitySource: 'https://maplestory.nexon.com/Guide/CashShop/Probability/RoyalStyle',
    tradeNote: '네온 블루 스톰 목록은 12월 17일 점검 전까지입니다. 남녀 대체 품목의 확률은 각 성별 기준입니다. 실제 판매한 품목만 정산하세요.',
    outputs: royalRows.map(([id, name, note, gender]) => ({
      id, name, note, gender, sellable: true,
      img: image(id),
      tradeNote: gender + ' · 로얄스타일 163기'
    }))
  };
  root.MapleNovemberProfit = {catalogs, royal};
})(globalThis);
