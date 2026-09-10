(function (root) {
  'use strict';

  // 2026-09-10 테스트월드 1.2.206 기준. 장부 저장과 API 조회는 기존 화면에서만 수행합니다.
  const effectiveDate = '2026-09-17';
  const source = 'https://maplestory.nexon.com/testworld/news/all/199';
  const modes = [
    {id:'advanced_ability',name:'어빌리티 고급 재설정',help:'레전드리 어빌리티의 고급 재설정 비용입니다. 3개 동시 변경 1번은 3회로 입력하세요. 명성치는 메소 지출에 합산하지 않습니다.',items:[
      {id:'lock0',name:'잠금 0개',meso:'2000000',fame:20000},
      {id:'lock1',name:'잠금 1개',meso:'6000000',fame:30000},
      {id:'lock2',name:'잠금 2개',meso:'15000000',fame:40000}
    ]},
    {id:'meso_scroll',name:'메소 주문서 · 리턴',help:'메소 탭에서 실제로 사용한 주문서만 기록하세요. 리턴을 함께 썼다면 주문서와 리턴 비용을 각각 기록합니다. 주문의 흔적 할인은 적용되지 않습니다. 이벤트로 받은 무료 주문서는 제외하세요.',items:[
      {id:'premium_acc_attack',name:'프리미엄 악세서리 공격력 주문서 100%',meso:'60000000'},
      {id:'premium_acc_magic',name:'프리미엄 악세서리 마력 주문서 100%',meso:'60000000'},
      {id:'ear_str',name:'귀 장식 공격력(힘) 주문서 10%',meso:'100000000'},
      {id:'ear_dex',name:'귀 장식 공격력(민첩) 주문서 10%',meso:'100000000'},
      {id:'ear_luk',name:'귀 장식 공격력(운) 주문서 10%',meso:'100000000'},
      {id:'ear_int',name:'귀 장식 지력 주문서 10%',meso:'100000000'},
      {id:'magical_one_attack',name:'매지컬 한손무기 공격력 주문서 100%',meso:'60000000'},
      {id:'magical_one_magic',name:'매지컬 한손무기 마력 주문서 100%',meso:'60000000'},
      {id:'magical_two_attack',name:'매지컬 두손무기 공격력 주문서 100%',meso:'60000000'},
      {id:'pet_attack',name:'펫장비 공격력 주문서 100%',meso:'30000000'},
      {id:'pet_magic',name:'펫장비 마력 주문서 100%',meso:'30000000'},
      {id:'premium_pet_attack',name:'프리미엄 펫장비 공격력 주문서 100%',meso:'60000000'},
      {id:'premium_pet_magic',name:'프리미엄 펫장비 마력 주문서 100%',meso:'60000000'},
      {id:'positive60',name:'놀라운 긍정의 혼돈 주문서 60%',meso:'500000'},
      {id:'positive100',name:'놀라운 긍정의 혼돈 주문서 100%',meso:'300000000'},
      {id:'pet_innocence',name:'펫장비 이노센트 주문서 100%',meso:'1000000000'},
      {id:'pet_clean_slate',name:'펫장비 순백의 주문서 100%',meso:'60000000'},
      {id:'return',name:'리턴 주문서',meso:'400000000'},
      {id:'pet_return',name:'펫장비 리턴 주문서',meso:'500000000'}
    ]},
    {id:'soul_amplification',name:'소울 증폭',help:'성공·실패를 모두 포함한 실제 시도 횟수입니다. 목표 단계별로 나눠 기록하세요. 소울 에테르는 실제로 구매한 경우에만 별도 지출로 기록합니다.',items:[
      {id:'stage1',name:'1단계로 증폭',meso:'500000000'},
      {id:'stage2',name:'2단계로 증폭',meso:'1000000000'},
      {id:'stage3',name:'3단계로 증폭',meso:'1750000000'},
      {id:'stage4',name:'4단계로 증폭',meso:'2750000000'}
    ]},
    {id:'soul_potential',name:'소울 잠재능력 재설정',help:'재설정 전 등급의 비용입니다. 도중에 등급이 올랐다면 등급별 실제 횟수를 나눠 기록하세요. API에서 이미 확정한 동일 지출은 다시 저장하지 마세요.',items:[
      {id:'rare',name:'레어',meso:'20000000'},
      {id:'epic',name:'에픽',meso:'40000000'},
      {id:'unique',name:'유니크',meso:'65000000'},
      {id:'legendary',name:'레전드리',meso:'88000000'}
    ]},
    {id:'soul_ether',name:'소울 에테르 구매',manual:true,help:'시세가 정해져 있지 않습니다. 실제 구매 단가와 수량을 입력하세요. 보스로 획득하거나 선물받은 에테르는 구매 지출로 기록하지 않습니다.',items:[
      {id:'ether1',name:'1단계 소울 에테르'},
      {id:'ether2',name:'2단계 소울 에테르'},
      {id:'ether3',name:'3단계 소울 에테르'},
      {id:'ether4',name:'4단계 소울 에테르'}
    ]},
    {id:'september_meso_shop',name:'아르고 메소샵 구매',manual:true,help:'아르고 호의 방문객 이벤트 메소샵입니다. 예정 운영 기간은 9/17 점검 후~11/18 23:59입니다. 공개 안내에 단가가 없어 실제 구매 단가를 직접 입력합니다. 품목은 아래 지출 메모에 남겨 주세요.',items:[
      {id:'purchase',name:'메소샵에서 실제 구매한 품목'}
    ]},
    {id:'arcane_symbol',name:'아케인심볼 강화',manual:true,legacy:true,help:'9/17 예정 패치에서 모든 지역의 강화 비용이 30% 감소합니다. 실제 강화창에 표시된 비용을 입력하세요. 이미 인하된 금액에서 30%를 다시 빼지 않습니다. 단계별 비용이 다르면 각각 기록하세요.',items:[
      {id:'enhance',name:'실제 아케인심볼 강화 비용'}
    ]}
  ];
  const categories = modes.map(mode => ({id:mode.id,name:mode.name}));
  const format = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const modeById = id => modes.find(mode => mode.id === id);
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
  }
  function validateRecordDate(category, date) {
    const mode = modeById(category);
    if (!mode) return '';
    if (!validDate(date)) return '지출 날짜를 YYYY-MM-DD 형식으로 입력하세요.';
    if (!mode.legacy && date < effectiveDate) return mode.name + ' 지출은 2026-09-17 점검 후 사용분부터 기록할 수 있습니다. 미리 계산한 금액은 저장하지 마세요.';
    if (category === 'september_meso_shop' && date > '2026-11-18') return '아르고 메소샵 구매 날짜는 예정 운영 기간인 2026-09-17~2026-11-18 안에서 선택하세요.';
    return '';
  }
  function quote(category, itemId, rawCount, rawUnit) {
    const mode = modeById(category);
    const item = mode && mode.items.find(candidate => candidate.id === itemId);
    if (!item) return {ok:false,error:'지출 종류와 세부 항목을 선택하세요.'};
    const count = String(rawCount || '').trim();
    if (!/^[1-9]\d{0,6}$/.test(count) || BigInt(count) > 1000000n) return {ok:false,error:'실제 횟수·수량을 1~1,000,000의 정수로 입력하세요.'};
    const unit = mode.manual ? String(rawUnit || '').trim().replace(/,/g,'') : item.meso;
    if (!/^[1-9]\d*$/.test(unit || '')) return {ok:false,error:'실제로 지출한 1회 비용 또는 구매 단가를 입력하세요. 무료로 받은 항목은 제외하세요.'};
    const amount = (BigInt(unit) * BigInt(count)).toString();
    const detail = mode.name + ' · ' + item.name + ' · ' + format(unit) + '메소 × ' + format(count) + (mode.manual ? '개/회' : '회');
    return {ok:true,category,amount,unit,count,detail,fame:item.fame ? (BigInt(item.fame) * BigInt(count)).toString() : ''};
  }
  function mount(options) {
    const host = document.getElementById('september-expense-helper');
    if (!host || host.dataset.initialized) return;
    host.dataset.initialized = 'true';
    host.innerHTML = '<summary>9/17 패치 예정 · 신규 메소 비용 계산</summary>' +
      '<div class="september-expense-body"><p class="muted">9/10 테스트월드 기준이며 본서버 적용 시 달라질 수 있습니다. 실제 사용량을 계산한 뒤 아래 지출 입력칸에 채울 수 있습니다. 저장은 별도로 눌러야 장부에 반영됩니다. <a href="'+source+'" target="_blank" rel="noopener noreferrer">공식 안내</a></p>' +
      '<div class="september-expense-grid"><label>지출 종류<select id="september-expense-mode"></select></label>' +
      '<label>세부 항목<select id="september-expense-item"></select></label>' +
      '<label>실제 횟수 · 수량<input id="september-expense-count" type="text" inputmode="numeric" autocomplete="off" value="1"></label>' +
      '<label id="september-expense-unit-label" hidden>실제 1회 비용 · 구매 단가 (메소)<input id="september-expense-unit" type="text" inputmode="numeric" autocomplete="off" placeholder="실제 지불한 단가"></label></div>' +
      '<p id="september-expense-help" class="muted"></p><p id="september-expense-unit-note" class="muted"></p><div id="september-expense-result" class="september-expense-result" role="status" aria-live="polite"></div>' +
      '<p id="september-expense-date-note" class="muted"></p><button id="september-expense-fill" type="button">계산 금액 채우기</button><p id="september-expense-fill-note" class="muted" role="status" aria-live="polite"></p></div>';
    const get = id => host.querySelector('#september-expense-' + id);
    const modeInput = get('mode'), itemInput = get('item'), countInput = get('count'), unitInput = get('unit');
    const dateInput = document.getElementById('expense-date');
    const categoryInput = document.getElementById('expense-category');
    const amountInput = document.getElementById('expense-amount');
    const memoInput = document.getElementById('expense-memo');
    modeInput.innerHTML = modes.map(mode => '<option value="'+mode.id+'">'+mode.name+'</option>').join('');
    let lastGeneratedMemo = '', lastUserMemo = '';
    function selectedDate() { return options.normalizeDate(dateInput.value); }
    function refreshDateNote() {
      const date = selectedDate();
      // 저장 직전의 기존 폼과 같은 방식으로 날짜를 해석합니다.
      get('date-note').textContent = validateRecordDate(modeInput.value,date) || (date > options.today() ? '선택 날짜가 미래이므로 계산만 할 수 있습니다. 실제 지출일에 저장하세요.' : '기록 날짜: ' + date + (modeInput.value === 'arcane_symbol' ? ' · 실제로 지불한 금액을 기록합니다.' : ' · 9/17 당일은 점검 후 사용분만 기록하세요.'));
    }
    function refreshQuote() {
      const result = quote(modeInput.value,itemInput.value,countInput.value,unitInput.value);
      get('unit-note').textContent = result.ok ? result.detail : '';
      get('result').textContent = result.ok ? '계산 금액 ' + format(result.amount) + ' 메소' + (result.fame ? ' · 명성치 ' + format(result.fame) + ' 별도 소모' : '') : result.error;
      get('fill').disabled = !result.ok;
      get('fill-note').textContent = '';
      refreshDateNote();
    }
    function refreshMode() {
      const mode = modeById(modeInput.value);
      itemInput.innerHTML = mode.items.map(item => '<option value="'+item.id+'">'+item.name+(item.meso ? ' · '+format(item.meso)+' 메소' : '')+'</option>').join('');
      get('unit-label').hidden = !mode.manual;
      unitInput.value = '';
      get('help').textContent = mode.help;
      refreshQuote();
    }
    modeInput.addEventListener('change',refreshMode);
    itemInput.addEventListener('change',refreshQuote);
    countInput.addEventListener('input',refreshQuote);
    unitInput.addEventListener('input',refreshQuote);
    dateInput.addEventListener('input',refreshDateNote);
    dateInput.addEventListener('change',refreshDateNote);
    dateInput.addEventListener('blur',refreshDateNote);
    host.addEventListener('toggle',refreshDateNote);
    get('fill').addEventListener('click',() => {
      const result = quote(modeInput.value,itemInput.value,countInput.value,unitInput.value);
      if (!result.ok) { refreshQuote(); return; }
      categoryInput.value = result.category;
      amountInput.value = format(result.amount);
      const originalMemo = memoInput.value === lastGeneratedMemo ? lastUserMemo : memoInput.value.trim();
      lastUserMemo = originalMemo;
      lastGeneratedMemo = (result.detail + (originalMemo ? ' · ' + originalMemo : '')).slice(0,200);
      memoInput.value = lastGeneratedMemo;
      get('fill-note').textContent = '유형·금액·메모를 채웠습니다. 아래 날짜와 실제 사용량을 확인한 뒤 ‘지출 저장’을 누르세요. 아직 장부에는 반영되지 않았습니다.';
      refreshDateNote();
    });
    refreshMode();
  }
  root.MapleSeptemberExpenses = Object.freeze({effectiveDate,source,categories,modes,quote,validateRecordDate,mount});
})(typeof window === 'undefined' ? globalThis : window);
