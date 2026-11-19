/* 실행: node scripts/test-november-profit.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const start = Date.parse('2026-11-19T10:00:00+09:00');
const end = Date.parse('2027-01-21T00:00:00+09:00');
function loadCatalog(time) {
  class TestDate extends Date {
    static now() { return time; }
  }
  const sandbox = vm.createContext({Date: TestDate});
  for (const name of ['november-profit', 'october-profit', 'october-profit-ui']) {
    const file = path.join(root, 'assets', name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, {filename: file});
  }
  return sandbox;
}
const {MapleOctoberProfit: products, MapleNovemberProfit: november, MapleOctoberProfitUI: ui} = loadCatalog(start);
const fixtures = [
  ['ba_coordi_v1', 10, 9900],
  ['ba_goods_v1', 48, 3300]
];
for (const [id, resultCount, cashPrice] of fixtures) {
  const product = products.catalog(id);
  assert.equal(product.outputs.length, resultCount);
  assert.equal(product.costs[0].officialPrice, cashPrice);
  assert.equal(product.costs[0].officialCurrency, '넥슨캐시');
  assert.equal(products.isActive(id, start - 1), false);
  assert.equal(products.isActive(id, start), true);
  assert.equal(products.isActive(id, end - 1), true);
  assert.equal(products.isActive(id, end), false);
  assert.equal(products.canPurchase(id, '2026-11-18'), false);
  assert.equal(products.canPurchase(id, '2026-11-19'), true);
  assert.equal(products.canPurchase(id, '2027-01-20'), true);
  assert.equal(products.canPurchase(id, '2027-01-21'), false);
  const probability = product.outputs.reduce((sum, item) => sum + parseFloat(item.note), 0);
  assert.ok(Math.abs(probability - 100) < 0.001, id + ' 공식 표기 소수점 반올림');
  const archived = loadCatalog(end).MapleOctoberProfitUI;
  assert.equal(archived.available(id), false);
  assert.equal(archived.normalizeContext(ui.context(id)).catalog, id);
  assert.ok(archived.allItems().some(item => item.id === product.outputs[0].id));
}
assert.equal(products.canPurchase('royal162', start - 6 * 3600000 - 1), true);
assert.equal(products.canPurchase('royal162', Date.parse('2026-11-19T04:00:00+09:00')), false);
assert.equal(loadCatalog(start - 1).MapleOctoberProfitUI.state.royalSeries, '162');
assert.equal(ui.state.royalSeries, '163');
assert.equal(november.royal.outputs.length, 40);
const groups = new Map();
for (const item of november.royal.outputs) {
  const group = item.id.replace(/_[mf]$/, '');
  if (groups.has(group)) assert.equal(groups.get(group), item.note, group + ' 성별 대체 확률');
  groups.set(group, item.note);
}
assert.equal(groups.size, 28);
assert.ok(Math.abs([...groups.values()].reduce((sum, pct) => sum + parseFloat(pct), 0) - 100) < 0.001);
for (const series of ['162', '163', 'legacy']) {
  ui.state.royalSeries = series;
  const stored = JSON.parse(JSON.stringify(ui.context('royal')));
  assert.equal(ui.normalizeContext(stored).royalSeries, series);
  assert.equal(loadCatalog(end).MapleOctoberProfitUI.normalizeContext(stored).royalSeries, series);
}
const items = november.catalogs.flatMap(c => c.costs.concat(c.outputs)).concat(november.royal.outputs);
assert.equal(new Set(items.map(item => item.id)).size, 100);
for (const item of items) {
  const png = fs.readFileSync(path.join(root, item.img));
  assert.ok(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), item.name + ' PNG');
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, item.name + ' 이미지 크기');
}
console.log('11월 손익 판매 경계·회차별 기록 복원·공식 확률·아이콘 100개 검증 통과');
