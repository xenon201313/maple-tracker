(() => {
  'use strict';

  const instances = new WeakMap();
  const number = value => value.toLocaleString('ko-KR');
  const amount = value => number(value) + ' 메소';
  const role = i => i === 0 ? '파티장' : '파티원 ' + i;
  const total = values => values.reduce((sum, value) => sum + value, 0n);
  let nextId = 0;

  function divide(saleNet, fee, weights) {
    const keep = 100n - fee;
    const memberWeights = weights.slice(1);
    const divisor = weights[0] * keep + total(memberWeights) * 100n;
    const members = memberWeights.map(weight => {
      // 장부와 같은 순서로 목표 실수령을 정수화하고, 역산한 송금액을 100메소 단위로 내린다.
      const target = saleNet * weight * keep / divisor;
      const gross = target * 100n / keep;
      const transfer = gross - gross % 100n;
      return {transfer, received:transfer * keep / 100n, rounding:gross - transfer};
    });
    const sent = total(members.map(row => row.transfer));
    const receivedByMembers = total(members.map(row => row.received));
    const leaderNet = saleNet - sent;
    return {members, leaderNet, received:leaderNet + receivedByMembers,
      transferCost:sent - receivedByMembers, rounding:total(members.map(row => row.rounding))};
  }

  const moneyField = (name, value) => `<input name="${name}" value="${value}" type="text" inputmode="numeric" autocomplete="off" spellcheck="false">`;
  const fees = selected => [0,3,5].map(fee => `<option value="${fee}"${fee === selected ? ' selected' : ''}>${fee}%</option>`).join('');
  const people = [1,2,3,4,5,6];
  function createForm(guide, id) {
    const form = document.createElement('form');
    form.className = 'boss-split-form';
    form.innerHTML = `<fieldset><legend>거래 금액</legend>
      <div class="boss-demo-fields boss-split-prices">
        <label><span>경매장 판매가</span>${moneyField('sale', guide ? '1,000,000,000' : '')}</label>
        <label><span>경매장 실수령액</span>${moneyField('saleNet', '')}</label>
      </div>
      <p class="boss-split-help" id="${id}-money">메소 단위로 한쪽 금액을 입력하면 다른 금액을 계산합니다. <span data-fee-label>판매 수수료 3%</span></p>
      ${guide ? `<details class="boss-split-archive"><summary>과거 거래 수수료로 검산</summary><label>당시 판매 수수료<select name="saleFee">${fees(3)}</select></label></details>` : ''}
    </fieldset>
    <fieldset><legend>파티 분배</legend>
      <div class="boss-demo-fields">
        <label>파티장 포함 인원<select name="party">${people.map(n => `<option value="${n}"${n === 2 ? ' selected' : ''}>${n === 1 ? '1명 · 혼자 판매' : n + '명'}</option>`).join('')}</select></label>
        <label>송금 수수료<select name="transferFee">${fees(5)}</select></label>
      </div>
      <label>분배 방식<select name="mode"><option value="equal">균등 분배</option><option value="weighted">파티장과 파티원 비율 지정</option><option value="individual">한 사람씩 비율 지정</option></select></label>
      <div class="boss-demo-fields" data-boss-ratio hidden>
        <label>파티장 비율${moneyField('leader','7')}</label><label>파티원 한 명의 비율${moneyField('member','3')}</label>
      </div>
      <div class="boss-split-weights" data-person-weights hidden>${people.map((_,i) => `<label>${role(i)} 비율${moneyField('weight'+i,'1')}</label>`).join('')}</div>
    </fieldset>
    <p data-boss-error id="${id}-error" role="status"></p>
    <section class="boss-demo-results" aria-label="파티 정산 결과">
      <dl class="boss-split-headline">
        <div><dt>나눌 금액</dt><dd data-boss-result="saleNet">—</dd></div>
        <div><dt>파티장이 보유할 금액</dt><dd data-boss-result="leaderNet">—</dd></div>
      </dl>
      <div data-boss-members></div>
      <p class="boss-split-help" data-boss-detail></p>
      <details class="boss-split-breakdown"><summary>수수료와 내림 잔액</summary>
        <dl><div><dt>경매장 판매 수수료</dt><dd data-boss-result="saleCost">—</dd></div>
          <div><dt>전체 송금 수수료</dt><dd data-boss-result="transferCost">—</dd></div>
          <div><dt>100메소 내림 잔액 · 파티장 몫에 포함</dt><dd data-boss-result="rounding">—</dd></div>
          <div><dt>파티 전체 최종 실수령</dt><dd data-boss-result="received">—</dd></div></dl>
      </details>
    </section>
    <div class="boss-split-actions"><button type="button" data-boss-copy>정산 결과 복사</button><button type="reset">${guide ? '10억 예제 복원' : '입력 초기화'}</button></div>
    <span class="boss-split-help" role="status" data-copy-status></span>
    <label data-copy-fallback hidden>공유할 정산 결과<textarea readonly rows="5"></textarea></label>`;
    for (const input of form.querySelectorAll('input')) {
      input.setAttribute('aria-describedby', (['sale','saleNet'].includes(input.name) ? id+'-money ' : '') + id + '-error');
    }
    return form;
  }

  function mount(root) {
    if (instances.has(root)) return instances.get(root);
    const fallback = root.querySelector('form');
    const guide = !root.hasAttribute('data-boss-calculator');
    const form = createForm(guide, 'boss-split-' + ++nextId);
    if (fallback) fallback.replaceWith(form);
    else root.append(form);
    const field = name => form.elements.namedItem(name);
    const find = selector => form.querySelector(selector);
    const error = find('[data-boss-error]');
    const detail = find('[data-boss-detail]');
    const card = find('[data-boss-members]');
    const copy = find('[data-boss-copy]');
    const copyStatus = find('[data-copy-status]');
    const copyFallback = find('[data-copy-fallback]');
    let source = 'sale';
    let recordedFee = null;
    let share = '';

    function whole(name, label, max) {
      const input = field(name);
      const text = input.value.trim();
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text) || text.replaceAll(',', '').length > 40) {
        input.setAttribute('aria-invalid', 'true');
        throw new Error(label + '에 0 이상의 정수를 입력하세요. 쉼표는 세 자리마다 넣을 수 있습니다.');
      }
      const value = BigInt(text.replaceAll(',', ''));
      if (max !== undefined && value > max) {
        input.setAttribute('aria-invalid', 'true');
        throw new Error(label + '은 ' + number(max) + ' 이하로 입력하세요.');
      }
      return value;
    }

    function render() {
      const party = Number(field('party').value);
      const mode = party === 1 ? 'equal' : field('mode').value;
      const entry = field(source);
      const other = field(source === 'sale' ? 'saleNet' : 'sale');
      const fee = guide ? BigInt(field('saleFee').value) : recordedFee ?? 3n;
      const feeLabel = recordedFee !== null ? '기존 기록 판매 수수료' : '판매 수수료';
      find('[data-fee-label]').textContent = `${feeLabel} ${fee}%${guide || recordedFee !== null ? '' : ' 고정'}${source === 'saleNet' ? ' · 판매가는 역산한 최소 금액' : ''}`;
      field('mode').disabled = field('transferFee').disabled = party === 1;
      find('[data-boss-ratio]').hidden = mode !== 'weighted';
      find('[data-person-weights]').hidden = mode !== 'individual';
      for (let i=0; i<people.length; i++) field('weight'+i).parentElement.hidden = i >= party;
      for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
      // 결과 목록은 인원 변경 때만 교체하여 입력 중 화면 읽기 위치가 움직이지 않게 한다.
      if (card.dataset.party !== String(party)) {
        card.dataset.party = String(party);
        card.innerHTML = Array.from({length:Math.max(1,party-1)}, (_,i) =>
          `<div class="boss-split-member" data-boss-member="${i+1}"${party===1?' hidden':''}>
          <strong>${role(i+1)}</strong><dl>
            <div><dt>보낼 금액</dt><dd data-transfer${i===0?' data-boss-result="transfer"':''}>—</dd></div>
            <div><dt>실수령</dt><dd data-received${i===0?' data-boss-result="memberNet"':''}>—</dd></div>
          </dl></div>`).join('');
      }
      error.textContent = share = copyStatus.textContent = '';
      copyFallback.hidden = true;
      copy.disabled = true;
      for (const output of form.querySelectorAll('[data-boss-result],[data-transfer],[data-received]')) output.textContent = '—';
      try {
        if (!guide && entry.value.trim() === '') {
          other.value = '';
          detail.textContent = '판매가 또는 실수령액을 입력하면 파티원별 송금액이 표시됩니다.';
          return;
        }
        const input = whole(source,source === 'sale' ? '판매가' : '실수령액');
        const saleKeep = 100n - fee;
        const sale = source === 'sale' ? input : (input * 100n + saleKeep - 1n) / saleKeep;
        const saleNet = source === 'sale' ? sale * saleKeep / 100n : input;
        other.value = number(source === 'sale' ? saleNet : sale);
        const transferFee = party === 1 ? 0n : BigInt(field('transferFee').value);
        let weights = Array(party).fill(1n);
        if (mode === 'weighted') {
          weights.fill(whole('member','파티원 비율',9999n));
          weights[0] = whole('leader','파티장 비율',9999n);
        } else if (mode === 'individual') {
          weights = weights.map((_,i) => whole('weight'+i, role(i)+' 비율',9999n));
        }
        if (total(weights) === 0n) throw new Error('분배 비율이 모두 0입니다. 최소 한 사람의 비율을 1 이상으로 입력하세요.');
        const split = divide(saleNet, transferFee, weights);
        const values = {...split, saleNet, saleCost:sale-saleNet, transfer:split.members[0]?.transfer || 0n, memberNet:split.members[0]?.received || 0n};
        for (const output of form.querySelectorAll('[data-boss-result]')) output.textContent = amount(values[output.dataset.bossResult]);
        split.members.forEach((row,i) => {
          const memberCard = card.children[i];
          memberCard.querySelector('[data-transfer]').textContent = amount(row.transfer);
          memberCard.querySelector('[data-received]').textContent = amount(row.received);
        });
        detail.textContent = party === 1 ? '혼자 판매했으므로 송금 수수료는 0메소입니다.' :
          `파티원 ${party - 1}명 · 분배 비율 ${weights.join(' : ')} · 송금액은 100메소 단위로 내립니다.`;
        share = [`보스 드랍 정산 · ${party}인 (${weights.join(':')})`,
          `${source === 'saleNet' ? '역산 판매가' : '판매가'} ${amount(sale)} · ${feeLabel} ${fee}% · 경매장 실수령 ${amount(saleNet)}`,
          '파티장 보유 ' + amount(split.leaderNet),
          ...split.members.map((row,i) => `${role(i+1)}에게 보낼 금액 ${amount(row.transfer)} · 실수령 ${amount(row.received)}`),
          `송금 수수료 ${transferFee}% · 100메소 내림 잔액 ${amount(split.rounding)} (파티장 몫에 포함)`].join('\n');
        copy.disabled = false;
      } catch (e) {
        if (entry.getAttribute('aria-invalid')) other.value = '';
        error.textContent = e.message;
        detail.textContent = '입력값을 고치면 정산 금액을 다시 계산합니다.';
      }
    }

    form.addEventListener('submit', event => event.preventDefault());
    const onEdit = event => {
      if (['sale','saleNet'].includes(event.target.name)) source = event.target.name;
      render();
    };
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    form.addEventListener('reset', () => { source = 'sale'; recordedFee = null; setTimeout(render, 0); });
    copy.addEventListener('click', async () => {
      const text = share;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        if (share === text) copyStatus.textContent = '정산 결과를 복사했습니다.';
      } catch {
        if (share !== text) return;
        copyFallback.hidden = false;
        const input = copyFallback.querySelector('textarea');
        input.value = text;
        input.focus();
        input.select();
        copyStatus.textContent = '선택한 정산 결과를 복사하세요.';
      }
    });
    const api = {setPreset(options = {}) {
      form.reset();
      if (!guide && ['0','5'].includes(String(options.recordedAuctionFee))) recordedFee = BigInt(options.recordedAuctionFee);
      const set = (key, value) => { if (value != null) field(key).value = String(value); };
      source = options.saleNet != null ? 'saleNet' : 'sale';
      set(source, options[source]);
      for (const key of ['party','mode','transferFee']) {
        if ([...field(key).options].some(option => option.value === String(options[key]))) set(key, options[key]);
      }
      set('leader',options.leader);
      set('member',options.member);
      if (Array.isArray(options.weights)) options.weights.slice(0,6).forEach((value,i) => set('weight'+i,value));
      render();
    }};
    instances.set(root,api);
    render();
    return api;
  }

  window.MapleBossSettlement = {mount, setPreset:(root,options) => mount(root).setPreset(options)};
  document.querySelectorAll('[data-boss-demo]:not([data-boss-calculator])').forEach(mount);
})();
