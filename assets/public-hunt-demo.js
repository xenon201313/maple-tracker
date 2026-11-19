(() => {
  'use strict';
  const form = document.getElementById('hunt-comparison-form');
  const activity = globalThis.MapleLedgerActivity;
  if (!form || !activity) return;
  const secondSession = form.querySelector('#hunt-second-session');
  const extraFields = form.querySelector('#hunt-extra-fields');
  const rates = form.querySelector('[data-hunt-rates]');
  const conclusion = form.querySelector('[data-hunt-conclusion]');
  const format = new Intl.NumberFormat('ko-KR');

  function readMeso(input) {
    const text = input.value.trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
    return BigInt(text.replace(/,/g, ''));
  }

  function compare() {
    extraFields.hidden = extraFields.disabled = !secondSession.checked;
    const totals = { A: { net: 0n, minutes: 0 }, B: { net: 0n, minutes: 0 } };
    let message = '';
    for (const row of form.querySelectorAll('fieldset:not(:disabled)')) {
      const minutes = row.querySelector('[type="number"]');
      const income = row.querySelector('[name$="-income"]');
      const cost = row.querySelector('[name$="-cost"]');
      const received = readMeso(income);
      const spent = readMeso(cost);
      const invalid = [[minutes, !minutes.validity.valid], [income, received === null], [cost, spent === null]];
      for (const [input, bad] of invalid) {
        input.setAttribute('aria-invalid', String(bad));
        if (bad && !message) {
          const hint = input === minutes ? '0.5~1,440분을 0.5분 단위로 입력하세요.' : '0 이상의 정수 메소를 입력하세요. 쉼표는 세 자리마다 넣을 수 있습니다.';
          message = row.querySelector('legend').textContent + ' · ' + input.labels[0].textContent.trim() + ' 입력값을 확인하세요. ' + hint;
        }
      }
      if (invalid.some(([, bad]) => bad)) continue;
      const total = totals[row.dataset.map];
      total.net += received - spent;
      total.minutes += minutes.valueAsNumber;
    }
    if (message) {
      rates.textContent = '';
      conclusion.textContent = message;
      return;
    }
    const a = BigInt(activity.perHour(totals.A.net.toString(), totals.A.minutes));
    const b = BigInt(activity.perHour(totals.B.net.toString(), totals.B.minutes));
    rates.textContent = 'A 시간당 ' + format.format(a) + ' 메소 · B 시간당 ' + format.format(b) + ' 메소';
    if (a === b) {
      conclusion.textContent = '두 사냥터의 시간당 순수익이 같습니다.';
    } else {
      const difference = a > b ? a - b : b - a;
      conclusion.textContent = (a > b ? 'A' : 'B') + '의 시간당 순수익이 ' + format.format(difference) + ' 메소 더 높습니다.';
    }
  }

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', compare);
  form.addEventListener('reset', () => setTimeout(compare, 0));
  compare();
  form.hidden = false;
})();
