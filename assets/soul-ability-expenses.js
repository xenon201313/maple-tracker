/* 2026-09-17 본서버 공식 가이드 기준. 실제 구입비와 메소만 수기 지출로 기록합니다. */
(() => {
  'use strict';
  const etherCosts = [1,2,3,4].map(stage => ({
    id:'soul_ether_'+stage, name:stage+'단계 소울 에테르',
    img:'assets/drops/soul_ether_'+stage+'.webp', note:'실제 구입한 수량만 입력'
  }));
  const categories = [
    {id:'soul_ether',title:'소울 에테르 · 소울 강화',img:'assets/drops/soul_ether_1.webp',desc:'에테르 구입비와 소울 증폭·잠재 재설정 메소를 기록합니다.'},
    {id:'advanced_ability',title:'고급 어빌리티',img:'assets/profit/large-boss-honor.png',desc:'명예의 훈장 구입비와 고급 재설정에 사용한 메소를 기록합니다.'}
  ];
  const modes = {
    soul_ether: {
      title:'소울 에테르', costs:etherCosts,
      description:'현재 소울웨폰 기록은 직접 입력합니다. 에테르 구입비와 게임에서 직접 소모한 메소를 나눠 적어 주세요. 보스로 획득하거나 무료로 받은 에테르는 구입비에서 제외합니다.',
      costTitle:'에테르 구입 비용',
      moneyFields:[
        {key:'soulAmplificationMeso',id:'soul_amplification_meso',name:'소울 증폭 사용 메소',label:'증폭에 사용한 메소 합계'},
        {key:'soulPotentialMeso',id:'soul_potential_meso',name:'소울 잠재능력 재설정 사용 메소',label:'소울 잠재 재설정 메소 합계'}
      ],
      guide:'소울 증폭은 200레벨 이상 무기에 장착된 위대한 소울에 적용합니다. 성공·실패를 모두 포함한 실제 시도 비용을 적어 주세요. 잠재 재설정은 증폭과 별개로 메소만 소모합니다.',
      guideGroups:[
        {title:'소울 증폭',mode:'soul_amplification',extra:item=>item.name.replace('로 증폭','')+' 소울 에테르 1개'},
        {title:'소울 잠재능력 재설정',mode:'soul_potential',extra:()=> '에테르 소모 없음'}
      ],
      source:'https://maplestory.nexon.com/Guide/N23GameInformation/Articles/416'
    },
    advanced_ability: {
      title:'고급 어빌리티',
      costs:[{id:'advanced_ability_honor_medal',name:'명예의 훈장',img:'assets/profit/large-boss-honor.png',note:'실제 구입 단가와 수량 · 단가가 다르면 나눠 기록'}],
      description:'명예의 훈장 구입비와 고급 어빌리티 재설정에 직접 사용한 메소를 합산합니다. 이미 보유한 명성치나 무료로 받은 훈장은 메소 비용으로 환산하지 않습니다.',
      costTitle:'명예의 훈장 구입 비용',
      moneyFields:[{key:'advancedAbilityMeso',id:'advanced_ability_meso',name:'고급 어빌리티 재설정 사용 메소',label:'고급 재설정에 사용한 메소 합계'}],
      guide:'레전드리 등급에서 명성치와 메소를 함께 소모합니다. 아래는 기본 1회 비용이며, 3회 동시 변경은 3회분입니다. 이벤트나 실제 사용량이 다르면 실제 지불한 메소를 입력하세요. 명성치 자체는 지출에 더하지 않습니다.',
      guideGroups:[{title:'고급 어빌리티 재설정',mode:'advanced_ability',extra:item=>'명성치 '+item.fame.toLocaleString('ko-KR')}],
      source:'https://maplestory.nexon.com/Guide/N23GameInformation/Articles/392'
    }
  };
  window.MapleSoulAbilityExpenses = Object.freeze({
    categories,modes,effectiveDate:'2026-09-17',
    today:()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10)
  });
})();
