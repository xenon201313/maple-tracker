(() => {
  'use strict';

  // 공개 계산은 이 문서의 입력값만 사용합니다. 개인 장부와 저장소에 접근하지 않습니다.
  const root = document.querySelector('[data-boss-demo]');
  if (!root) return;
  const form = root.querySelector('form');
  const fields = form.elements;
  const results = [...root.querySelectorAll('[data-boss-result]')];
  const error = root.querySelector('[data-boss-error]');
  const detail = root.querySelector('[data-boss-detail]');
  const ratioFields = root.querySelector('[data-boss-ratio]');
  const amount = value => value.toLocaleString('ko-KR') + ' 메소';

  function integer(name, label, max) {
    const field = fields.namedItem(name);
    const text = field.value.trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text) || text.length > 40) {
      field.setAttribute('aria-invalid', 'true');
      throw new Error(label + '에는 0 이상의 정수를 입력하세요. 쉼표는 세 자리마다 넣을 수 있습니다.');
    }
    const value = BigInt(text.replaceAll(',', ''));
    if (max !== undefined && value > max) {
      field.setAttribute('aria-invalid', 'true');
      throw new Error(label + '은 ' + max.toLocaleString('ko-KR') + ' 이하로 입력하세요.');
    }
    return value;
  }

  function render() {
    for (const field of form.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
    const party = BigInt(fields.namedItem('party').value);
    const solo = party === 1n;
    const weighted = fields.namedItem('mode').value === 'weighted';
    fields.namedItem('transferFee').disabled = solo;
    fields.namedItem('mode').disabled = solo;
    ratioFields.hidden = solo || !weighted;
    for (const name of ['leader', 'member']) fields.namedItem(name).disabled = solo || !weighted;
    error.textContent = '';
    try {
      const sale = integer('sale', '판매가');
      const saleFee = BigInt(fields.namedItem('saleFee').value);
      const transferFee = solo ? 0n : BigInt(fields.namedItem('transferFee').value);
      let leader = 1n, member = 1n;
      if (!solo && weighted) {
        leader = integer('leader', '파티장 비율', 9999n);
        member = integer('member', '파티원 한 명의 비율', 9999n);
        if (leader === 0n && member === 0n) {
          fields.namedItem('leader').setAttribute('aria-invalid', 'true');
          fields.namedItem('member').setAttribute('aria-invalid', 'true');
          throw new Error('파티장과 파티원 한 명의 비율을 모두 0으로 정할 수는 없습니다.');
        }
      }
      const saleNet = sale * (100n - saleFee) / 100n;
      const members = party - 1n;
      const keep = 100n - transferFee;
      let target = 0n, grossBeforeRounding = 0n, transfer = 0n, memberNet = 0n;
      if (!solo) {
        // 장부의 dropSplitInfo와 같은 순서: 목표 실수령 정수화 → 역산 → 100메소 내림.
        target = saleNet * member * keep / (leader * keep + members * member * 100n);
        grossBeforeRounding = target * 100n / keep;
        transfer = grossBeforeRounding - grossBeforeRounding % 100n;
        memberNet = transfer * keep / 100n;
      }
      const leaderNet = saleNet - transfer * members;
      const values = {
        saleNet,
        leaderNet,
        transfer,
        memberNet,
        saleCost: sale - saleNet,
        transferCost: (transfer - memberNet) * members,
        rounding: (grossBeforeRounding - transfer) * members,
        received: leaderNet + memberNet * members
      };
      for (const node of results) node.textContent = amount(values[node.dataset.bossResult]);
      detail.textContent = solo
        ? '혼자 판매한 경우 송금은 없고, 판매 수수료를 뺀 ' + amount(saleNet) + '가 전부 내 몫입니다.'
        : '파티장 ' + leader + ' : 파티원 한 명 ' + member + ' 비율입니다. 파티원 ' + members + '명에게 각각 ' + amount(transfer) + '를 보내면, 한 명이 ' + amount(memberNet) + '를 받습니다. 파티장은 ' + amount(saleNet) + ' − ' + amount(transfer) + ' × ' + members + ' = ' + amount(leaderNet) + '를 보유합니다.';
    } catch (failure) {
      for (const node of results) node.textContent = '—';
      detail.textContent = '입력값을 고치면 정산 금액을 다시 계산합니다.';
      error.textContent = failure.message;
    }
  }

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('reset', () => setTimeout(render, 0));
  form.querySelector('fieldset').disabled = false;
  render();
})();
