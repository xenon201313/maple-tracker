const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { initializePublicDemoAudit } = require('./helpers/public-demo-audit.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'https://public-guide.test';
const url = origin + '/guide/hunt-income/';

async function useLocalFiles(context) {
  await context.route('**/*', async route => {
    const request = new URL(route.request().url());
    assert.equal(request.origin, origin, '외부 요청');
    const file = path.resolve(root, '.' + request.pathname, request.pathname.endsWith('/') ? 'index.html' : '');
    assert.ok(file.startsWith(root + path.sep));
    await route.fulfill({ path: file });
  });
}

async function run() {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await useLocalFiles(context);
    await initializePublicDemoAudit(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const form = page.locator('#hunt-comparison-form');
    const rates = form.locator('[data-hunt-rates]');
    const conclusion = form.locator('[data-hunt-conclusion]');
    assert.equal(await rates.innerText(), 'A 시간당 70,000,000 메소 · B 시간당 72,000,000 메소');
    assert.match(await conclusion.innerText(), /B의 시간당 순수익이 2,000,000/);
    assert.ok(await form.evaluate(node => node.scrollWidth <= node.clientWidth));

    await form.getByRole('checkbox').uncheck();
    assert.match(await rates.innerText(), /A 시간당 90,000,000/);
    await form.locator('[name="a1-minutes"]').fill('0.5');
    await form.locator('[name="a1-income"]').fill('9007199254740993');
    await form.locator('[name="a1-cost"]').fill('0');
    assert.match(await rates.innerText(), /1,080,863,910,568,919,160/);
    await form.locator('[name="a1-minutes"]').fill('0');
    assert.equal(await rates.innerText(), '');
    assert.match(await conclusion.innerText(), /사냥 시간/);
    await form.locator('[name="a1-minutes"]').fill('60');
    await form.locator('[name="a1-income"]').fill('1,2');
    assert.match(await conclusion.innerText(), /획득 메소/);
    await form.locator('[name="a1-income"]').fill('1.5억');
    assert.equal(await rates.innerText(), '');
    await form.locator('[name="a1-income"]').fill('0');
    await form.locator('[name="a1-cost"]').fill('4000000');
    await form.locator('[name="b1-income"]').fill('0');
    assert.equal(await rates.innerText(), 'A 시간당 -4,000,000 메소 · B 시간당 -4,000,000 메소');
    assert.match(await conclusion.innerText(), /같습니다/);
    await form.getByRole('button', { name: '가상 예제로 되돌리기' }).click();
    await page.waitForFunction(() => document.querySelector('[data-hunt-rates]').textContent.includes('70,000,000'));
    assert.equal(await rates.innerText(), 'A 시간당 70,000,000 메소 · B 시간당 72,000,000 메소');
    const audit = await page.evaluate(() => window.__publicDemoAudit());
    assert.deepEqual(audit.calls, []);
    assert.deepEqual(audit.before, audit.after);
    assert.deepEqual(errors, []);

    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    await useLocalFiles(staticContext);
    const staticPage = await staticContext.newPage();
    await staticPage.goto(url);
    const section = staticPage.locator('#compare-hunts');
    assert.equal(await section.locator('form').isVisible(), false);
    assert.equal(await section.locator('tbody tr').count(), 3);
    assert.match(await section.innerText(), /A 8,164만, B 7,976만/);
    console.log('공개 재획 비교 검증 통과 · 시간 가중·단일 회차·0.5분·큰 금액·음수·동률·입력 오류·초기화·모바일·JS 없는 본문·장부 접근 없음');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
