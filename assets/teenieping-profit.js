/* 프린세스 하츄핑 콜라보: 공식 판매·확률표 기준 2026-09-18 확인.
 * 출처와 이미지 원본 정보: assets/profit/teenieping/sources.json
 * 종료 후에도 과거 장부 해석에 쓰이므로 품목과 분류는 보존합니다. */
(function(global){
  'use strict';
  const startsAt='2026-09-17T00:00:00+09:00';
  const endsAt='2026-10-22T00:00:00+09:00';
  const products=[
  {
    "id": "goods",
    "title": "캐치! 티니핑 굿즈 컬렉션",
    "costs": [
      {
        "id": "teenieping_goods_collection",
        "name": "캐치! 티니핑 굿즈 컬렉션",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_goods_collection",
        "note": "1개 9,900캐시 · 10개 99,000캐시 (메소 환산가 입력)"
      }
    ],
    "outputs": [
      {
        "id": "teenieping_goods_01",
        "name": "일루전 링 : 깡총핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_kkangchongping",
        "note": "13.5%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_02",
        "name": "일루전 링 : 뽀송핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_pposongping",
        "note": "13.5%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_03",
        "name": "일루전 링 : 슈슈핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_shushuping",
        "note": "13.5%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_04",
        "name": "일루전 링 : 야옹핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_yaongping",
        "note": "13.5%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_05",
        "name": "일루전 링 : 사뿐핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_sappunping",
        "note": "7.5%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_06",
        "name": "일루전 링 : 아름핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_areumping",
        "note": "7.5%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_07",
        "name": "일루전 링 : 뽀니핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_pponiping",
        "note": "7.5%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_08",
        "name": "일루전 링 : 초롱핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_chorongping",
        "note": "7.5%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_09",
        "name": "일루전 링 : 새콤핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_saekomping",
        "note": "2.25%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_10",
        "name": "일루전 링 : 달콤핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_dalkomping",
        "note": "2.25%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_11",
        "name": "일루전 링 : 오로라핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_auroraping",
        "note": "2.25%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_12",
        "name": "일루전 링 : 프린세스 하츄핑 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_illusion_princess_hachuping",
        "note": "2.25%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_13",
        "name": "쁘띠 다이아나핑 명찰 반지 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_name_dianaping",
        "note": "1%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_14",
        "name": "쁘띠 이클립스핑 명찰 반지 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_name_eclipseping",
        "note": "1%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_15",
        "name": "쁘띠 프린세스 하츄핑 명찰 반지 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_name_princess_hachuping",
        "note": "1%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_16",
        "name": "쁘띠 다이아나핑 말풍선 반지 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_chat_dianaping",
        "note": "1%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_17",
        "name": "쁘띠 이클립스핑 말풍선 반지 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_chat_eclipseping",
        "note": "1%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_18",
        "name": "쁘띠 프린세스 하츄핑 말풍선 반지 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_chat_princess_hachuping",
        "note": "1%",
        "sellable": true
      },
      {
        "id": "teenieping_goods_19",
        "name": "솔 헤카테 : 티니핑 스킨 교환권",
        "img": "assets/profit/teenieping/goods-official.png",
        "crop": "teenieping_sol_hecate_teenieping",
        "note": "1%",
        "sellable": true
      }
    ],
    "source": "https://maplestory.nexon.com/Guide/OtherProbability/Game/CatchTeeniepingGoodsCollection",
    "description": "굿즈 컬렉션에서 획득한 교환권 19종의 실제 판매 손익을 기록합니다. 개수는 낱개 기준으로 입력하세요.",
    "tradeNote": "교환권은 사용 전 1회 교환 가능하며, 교환 후에는 월드 내 이동만 가능합니다. 실제 판매한 항목만 판매를 체크하세요. 10회 사용 보너스인 로미 아바타는 판매 수익에서 제외합니다."
  },
  {
    "id": "luna-sweet",
    "title": "스페셜 루나 크리스탈 · 스윗",
    "costs": [
      {
        "id": "teenieping_special_crystal",
        "name": "스페셜 루나 크리스탈",
        "img": "assets/profit/special-luna-crystal.png",
        "note": "캐시 정가 3,900캐시 · 합성 1회당 1개"
      },
      {
        "id": "teenieping_base_black",
        "name": "원더 블랙 펫 (베이스)",
        "img": "assets/profit/pet-grade-wonder-black.png",
        "crop": "pet-grade",
        "note": "합성 1회당 1마리 · 실제 소모한 펫 매입가"
      },
      {
        "id": "teenieping_material_black",
        "name": "원더 블랙 펫 (재료)",
        "img": "assets/profit/pet-grade-wonder-black.png",
        "crop": "pet-grade",
        "note": "합성 1회당 1마리 · 실제 소모한 펫 매입가"
      },
      {
        "id": "teenieping_equipment_0",
        "name": "쁘띠 다이아나핑의 날개",
        "img": "assets/profit/teenieping/luna-official.png",
        "crop": "teenieping_equipment_dianaping",
        "note": "캐시 정가 15,900캐시 · 메소 환산가 입력",
        "optional": true
      },
      {
        "id": "teenieping_equipment_1",
        "name": "쁘띠 이클립스핑의 날개",
        "img": "assets/profit/teenieping/luna-official.png",
        "crop": "teenieping_equipment_eclipseping",
        "note": "캐시 정가 15,900캐시 · 메소 환산가 입력",
        "optional": true
      },
      {
        "id": "teenieping_equipment_2",
        "name": "쁘띠 프린세스 하츄핑의 요술봉",
        "img": "assets/profit/teenieping/luna-official.png",
        "crop": "teenieping_equipment_princess_hachuping",
        "note": "캐시 정가 15,900캐시 · 메소 환산가 입력",
        "optional": true
      }
    ],
    "outputs": [
      {
        "id": "teenieping_luna_sweet_01",
        "name": "쿨쿨 곰돌이 (루나 스윗)",
        "img": "assets/profit/teenieping/sleepy_bear.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_02",
        "name": "쿨쿨 다람쥐 (루나 스윗)",
        "img": "assets/profit/teenieping/sleepy_squirrel.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_03",
        "name": "쿨쿨 너구리 (루나 스윗)",
        "img": "assets/profit/teenieping/sleepy_raccoon.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_04",
        "name": "프링 (루나 스윗)",
        "img": "assets/profit/teenieping/pring.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_05",
        "name": "레옹 (루나 스윗)",
        "img": "assets/profit/teenieping/leon.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_06",
        "name": "주니 (루나 스윗)",
        "img": "assets/profit/teenieping/juni.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_07",
        "name": "토토 사원 (루나 스윗)",
        "img": "assets/profit/teenieping/toto_employee.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_08",
        "name": "곰곰 사원 (루나 스윗)",
        "img": "assets/profit/teenieping/gomgom_employee.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_09",
        "name": "펭펭 사원 (루나 스윗)",
        "img": "assets/profit/teenieping/pengpeng_employee.gif",
        "note": "9.6% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_10",
        "name": "쁘띠 다이아나핑",
        "img": "assets/profit/teenieping/pet_dianaping.gif",
        "note": "3.88%",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_11",
        "name": "쁘띠 이클립스핑",
        "img": "assets/profit/teenieping/pet_eclipseping.gif",
        "note": "3.88%",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_12",
        "name": "쁘띠 프린세스 하츄핑",
        "img": "assets/profit/teenieping/pet_princess_hachuping.gif",
        "note": "3.88%",
        "sellable": true
      },
      {
        "id": "teenieping_luna_sweet_13",
        "name": "루나 크리스탈 키",
        "img": "assets/profit/luna-crystal-key.png",
        "note": "1.96%",
        "sellable": true
      }
    ],
    "source": "https://maplestory.nexon.com/Guide/CashShop/Probability/SpecialLunaCrystalSweet",
    "description": "베이스 원더 블랙 + 재료 원더 블랙 + 스페셜 루나 크리스탈을 소모합니다. 3가지 비용을 모두 입력해 주세요. 표시 확률은 기본값이며, 베이스가 일반 결과 9종 중 하나라면 같은 외형은 제외되고 나머지 8종은 각각 10.8%가 됩니다. 쁘띠·키 확률은 같습니다.",
    "tradeNote": "합성 결과 펫은 베이스 펫의 교환 가능 상태를 따릅니다. 교환 불가이거나 아직 판매하지 않은 결과는 판매를 체크하지 마세요. 이벤트 보상 의자 ‘하나의 마음으로’는 판매 수익에서 제외합니다."
  },
  {
    "id": "luna-dream",
    "title": "스페셜 루나 크리스탈 · 드림",
    "costs": [
      {
        "id": "teenieping_special_crystal",
        "name": "스페셜 루나 크리스탈",
        "img": "assets/profit/special-luna-crystal.png",
        "note": "캐시 정가 3,900캐시 · 합성 1회당 1개"
      },
      {
        "id": "teenieping_base_sweet",
        "name": "루나 스윗 펫 (베이스)",
        "img": "assets/profit/pet-grade-luna-sweet.png",
        "crop": "pet-grade",
        "note": "합성 1회당 1마리 · 실제 소모한 펫 매입가"
      },
      {
        "id": "teenieping_material_black",
        "name": "원더 블랙 펫 (재료)",
        "img": "assets/profit/pet-grade-wonder-black.png",
        "crop": "pet-grade",
        "note": "합성 1회당 1마리 · 실제 소모한 펫 매입가"
      },
      {
        "id": "teenieping_equipment_0",
        "name": "쁘띠 다이아나핑의 날개",
        "img": "assets/profit/teenieping/luna-official.png",
        "crop": "teenieping_equipment_dianaping",
        "note": "캐시 정가 15,900캐시 · 메소 환산가 입력",
        "optional": true
      },
      {
        "id": "teenieping_equipment_1",
        "name": "쁘띠 이클립스핑의 날개",
        "img": "assets/profit/teenieping/luna-official.png",
        "crop": "teenieping_equipment_eclipseping",
        "note": "캐시 정가 15,900캐시 · 메소 환산가 입력",
        "optional": true
      },
      {
        "id": "teenieping_equipment_2",
        "name": "쁘띠 프린세스 하츄핑의 요술봉",
        "img": "assets/profit/teenieping/luna-official.png",
        "crop": "teenieping_equipment_princess_hachuping",
        "note": "캐시 정가 15,900캐시 · 메소 환산가 입력",
        "optional": true
      }
    ],
    "outputs": [
      {
        "id": "teenieping_luna_dream_01",
        "name": "쿨쿨 곰돌이 (루나 드림)",
        "img": "assets/profit/teenieping/sleepy_bear.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_02",
        "name": "쿨쿨 다람쥐 (루나 드림)",
        "img": "assets/profit/teenieping/sleepy_squirrel.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_03",
        "name": "쿨쿨 너구리 (루나 드림)",
        "img": "assets/profit/teenieping/sleepy_raccoon.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_04",
        "name": "프링 (루나 드림)",
        "img": "assets/profit/teenieping/pring.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_05",
        "name": "레옹 (루나 드림)",
        "img": "assets/profit/teenieping/leon.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_06",
        "name": "주니 (루나 드림)",
        "img": "assets/profit/teenieping/juni.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_07",
        "name": "토토 사원 (루나 드림)",
        "img": "assets/profit/teenieping/toto_employee.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_08",
        "name": "곰곰 사원 (루나 드림)",
        "img": "assets/profit/teenieping/gomgom_employee.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_09",
        "name": "펭펭 사원 (루나 드림)",
        "img": "assets/profit/teenieping/pengpeng_employee.gif",
        "note": "8.4% (기본)",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_10",
        "name": "쁘띠 다이아나핑",
        "img": "assets/profit/teenieping/pet_dianaping.gif",
        "note": "6.8%",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_11",
        "name": "쁘띠 이클립스핑",
        "img": "assets/profit/teenieping/pet_eclipseping.gif",
        "note": "6.8%",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_12",
        "name": "쁘띠 프린세스 하츄핑",
        "img": "assets/profit/teenieping/pet_princess_hachuping.gif",
        "note": "6.8%",
        "sellable": true
      },
      {
        "id": "teenieping_luna_dream_13",
        "name": "루나 크리스탈 키",
        "img": "assets/profit/luna-crystal-key.png",
        "note": "4%",
        "sellable": true
      }
    ],
    "source": "https://maplestory.nexon.com/Guide/CashShop/Probability/SpecialLunaCrystalDream",
    "description": "베이스 루나 스윗 + 재료 원더 블랙 + 스페셜 루나 크리스탈을 소모합니다. 3가지 비용을 모두 입력해 주세요. 표시 확률은 기본값이며, 베이스가 일반 결과 9종 중 하나라면 같은 외형은 제외되고 나머지 8종은 각각 9.45%가 됩니다. 쁘띠·키 확률은 같습니다.",
    "tradeNote": "합성 결과 펫은 베이스 펫의 교환 가능 상태를 따릅니다. 교환 불가이거나 아직 판매하지 않은 결과는 판매를 체크하지 마세요. 이벤트 보상 의자 ‘하나의 마음으로’는 판매 수익에서 제외합니다."
  }
];
  const regions={
  "teenieping_goods_collection": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 189,
    "y": 881,
    "w": 88,
    "h": 88
  },
  "teenieping_illusion_saekomping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 1978,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_dalkomping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 1978,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_auroraping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 2140,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_princess_hachuping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 2140,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_sappunping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 2302,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_areumping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 2302,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_pponiping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 2464,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_chorongping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 2464,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_kkangchongping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 2626,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_pposongping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 2626,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_shushuping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 2788,
    "w": 80,
    "h": 80
  },
  "teenieping_illusion_yaongping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 2788,
    "w": 80,
    "h": 80
  },
  "teenieping_name_dianaping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 2950,
    "w": 80,
    "h": 80
  },
  "teenieping_name_eclipseping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 2950,
    "w": 80,
    "h": 80
  },
  "teenieping_name_princess_hachuping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 3112,
    "w": 80,
    "h": 80
  },
  "teenieping_chat_dianaping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 3112,
    "w": 80,
    "h": 80
  },
  "teenieping_chat_eclipseping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 206,
    "y": 3274,
    "w": 80,
    "h": 80
  },
  "teenieping_chat_princess_hachuping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 588,
    "y": 3274,
    "w": 80,
    "h": 80
  },
  "teenieping_sol_hecate_teenieping": {
    "img": "assets/profit/teenieping/goods-official.png",
    "width": 876,
    "height": 8262,
    "x": 382,
    "y": 3422,
    "w": 112,
    "h": 112
  },
  "teenieping_equipment_dianaping": {
    "img": "assets/profit/teenieping/luna-official.png",
    "width": 876,
    "height": 4250,
    "x": 168,
    "y": 2527,
    "w": 88,
    "h": 88
  },
  "teenieping_equipment_eclipseping": {
    "img": "assets/profit/teenieping/luna-official.png",
    "width": 876,
    "height": 4250,
    "x": 394,
    "y": 2527,
    "w": 88,
    "h": 88
  },
  "teenieping_equipment_princess_hachuping": {
    "img": "assets/profit/teenieping/luna-official.png",
    "width": 876,
    "height": 4250,
    "x": 619,
    "y": 2527,
    "w": 88,
    "h": 88
  }
};
  global.MapleTeeniepingProfit=Object.freeze({
    startsAt, endsAt,
    category:{"id":"teenieping","title":"프린세스 하츄핑 콜라보","tag":"10/21까지","img":"assets/profit/teenieping/pet_princess_hachuping.gif","desc":"캐치! 티니핑 굿즈 컬렉션과 스페셜 루나 크리스탈의 손익을 기록합니다."},
    products,
    product(id){return products.find(product=>product.id===id)||products[0];},
    isActive(now=Date.now()){return Number(now)>=Date.parse(startsAt)&&Number(now)<Date.parse(endsAt);},
    today(now=Date.now()){return new Date(Number(now)+9*60*60*1000).toISOString().slice(0,10);},
    iconRegion(item){return regions[item?.crop]||null;}
  });
})(globalThis);
