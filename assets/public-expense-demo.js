/* 공개 예시 계산기. 입력값은 이 페이지 안에서만 계산하고 저장하거나 전송하지 않습니다. */
(() => {
  'use strict';

  const labels = {
    cost: '구입 비용', sale: '판매 금액', fee: '판매 수수료',
    price: '재료 구입 단가', count: '재료 수량',
    direct: '직접 사용한 메소', extra: '잠재능력 재설정 메소',
    attempts: '실제 증폭 시도 횟수', resets: '실제 재설정 횟수', fame: '실제 사용한 명성치'
  };
  const money = value => value.toLocaleString('ko-KR') + ' 메소';
  const number = value => value.toLocaleString('ko-KR');

  function readInteger(form, name) {
    const field = form.elements.namedItem(name);
    const text = field.value.trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) {
      field.setAttribute('aria-invalid', 'true');
      throw new Error(labels[name] + '에 0 이상의 정수를 입력해 주세요. 빈칸·음수·소수·지수 표기는 사용할 수 없습니다.');
    }
    const value = BigInt(text.replaceAll(',', ''));
    if (['count','attempts','resets'].includes(name) && value > 1000000n) {
      field.setAttribute('aria-invalid', 'true');
      throw new Error(labels[name] + '은(는) 0~1,000,000의 정수로 입력해 주세요.');
    }
    return value;
  }

  // 기존 장부의 단가표만 읽습니다. 이 공개 페이지에서 장부 UI의 mount/quote를 호출하지 않습니다.
  function rate(form, name, category) {
    const field = form.elements.namedItem(name);
    const mode = window.MapleSeptemberExpenses?.modes.find(item => item.id === category);
    const item = mode?.items.find(item => item.id === field.value);
    if (!item) {
      field.setAttribute('aria-invalid', 'true');
      throw new Error('공식 단가를 확인할 수 없습니다. 페이지를 새로 열거나 실제 사용액 직접 입력을 선택해 주세요.');
    }
    return { name:item.name, meso:BigInt(item.meso), fame:BigInt(item.fame || 0) };
  }

  function updateMethod(form) {
    const method = form.elements.namedItem('calculation')?.value;
    form.querySelectorAll('[data-cost-input]').forEach(group => {
      group.hidden = group.dataset.costInput !== method;
      group.disabled = group.hidden;
    });
  }

  function calculate(form) {
    const mode = form.dataset.demoForm;
    const put = (name, value) => {
      const output = form.querySelector('[data-demo-' + name + ']');
      if (output) output.textContent = value;
    };
    form.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
    put('error', '');
    try {
      let cost;
      if (mode === 'profit') {
        cost = readInteger(form, 'cost');
        const sale = readInteger(form, 'sale');
        const fee = readInteger(form, 'fee');
        if (fee !== 3n && fee !== 5n) throw new Error('판매 수수료를 3% 또는 5%로 선택해 주세요.');
        const sold = form.elements.namedItem('sold').checked;
        const revenue = sold ? sale * (100n - fee) / 100n : 0n;
        const net = revenue - cost;
        put('revenue', money(revenue));
        put('net', (net > 0n ? '+' : '') + money(net));
        put('formula', sold
          ? '판매 실수령액 = ' + number(sale) + ' × (100 − ' + number(fee) + ') ÷ 100 = ' + money(revenue) + ' (1메소 미만 버림). 순손익 = 실수령액 − 구입 비용 = ' + money(net) + '.'
          : '아직 판매하지 않았으므로 수입은 0 메소입니다. 순손익 = 0 − ' + number(cost) + ' = ' + money(net) + '.');
      } else if (mode === 'soul' || mode === 'ability') {
        const price = readInteger(form, 'price');
        const count = readInteger(form, 'count');
        const materials = price * count;
        const method = form.elements.namedItem('calculation').value;
        if (!['standard','actual'].includes(method)) throw new Error('계산 방식을 선택해 주세요.');
        let direct, extra = 0n, detail;
        if (method === 'actual') {
          direct = readInteger(form, 'direct');
          extra = mode === 'soul' ? readInteger(form, 'extra') : 0n;
          if (mode === 'ability') put('fame', number(readInteger(form, 'fame')) + ' (메소 합산 제외)');
          detail = '직접 확인한 사용 메소 ' + money(direct) + (mode === 'soul' ? ' + 소울 잠재 재설정 ' + money(extra) : '');
        } else if (mode === 'soul') {
          const amplification = rate(form, 'stage', 'soul_amplification');
          const potential = rate(form, 'grade', 'soul_potential');
          const attempts = readInteger(form, 'attempts'), resets = readInteger(form, 'resets');
          direct = amplification.meso * attempts;
          extra = potential.meso * resets;
          detail = amplification.name + ' ' + number(amplification.meso) + ' × ' + number(attempts) + '회 = ' + money(direct)
            + '. ' + potential.name + ' 소울 잠재 ' + number(potential.meso) + ' × ' + number(resets) + '회 = ' + money(extra);
        } else {
          const ability = rate(form, 'locks', 'advanced_ability');
          const resets = readInteger(form, 'resets');
          direct = ability.meso * resets;
          const fame = ability.fame * resets;
          put('fame', number(fame) + ' (메소 합산 제외)');
          detail = ability.name + ' 고급 재설정 ' + number(ability.meso) + ' × ' + number(resets) + '회 = ' + money(direct)
            + '. 명성치 ' + number(ability.fame) + ' × ' + number(resets) + '회 = ' + number(fame) + ' 별도 소모';
        }
        cost = materials + direct + extra;
        put('materials', money(materials));
        put('direct', money(direct));
        if (mode === 'soul') put('extra', money(extra));
        put('formula', detail + '. 재료 구입비 ' + number(price) + ' × ' + number(count) + ' = ' + money(materials)
          + '. 총 메소 지출 = ' + money(cost) + '.');
      } else {
        return;
      }
      put('cost', money(cost));
    } catch (error) {
      for (const name of ['cost', 'revenue', 'net', 'materials', 'direct', 'extra', 'fame', 'formula']) put(name, '—');
      put('error', error.message);
    }
  }

  function init(root) {
    const tabs = [...root.querySelectorAll('[data-demo-mode]')];
    const panels = [...root.querySelectorAll('[data-demo-panel]')];
    const activate = tab => {
      for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
      }
      for (const panel of panels) panel.hidden = panel.dataset.demoPanel !== tab.dataset.demoMode;
    };
    tabs.forEach((tab, index) => {
      tab.disabled = false;
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        activate(tabs[next]);
        tabs[next].focus();
      });
    });
    if (tabs.length) activate(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
    for (const form of root.querySelectorAll('[data-demo-form]')) {
      const refresh = () => { updateMethod(form); calculate(form); };
      form.addEventListener('input', refresh);
      form.addEventListener('change', refresh);
      form.addEventListener('submit', event => { event.preventDefault(); calculate(form); });
      // reset의 기본 동작이 입력값을 되돌린 다음 결과를 다시 계산합니다.
      form.addEventListener('reset', () => setTimeout(refresh, 0));
      refresh();
      form.querySelector('[data-demo-ready]').disabled = false;
    }
  }

  function start() { document.querySelectorAll('[data-expense-demo]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
