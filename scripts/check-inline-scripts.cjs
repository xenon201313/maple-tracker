const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const scripts = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;

while ((match = scripts.exec(html))) {
  const attributes = match[1];
  if (/\bsrc\s*=|\btype\s*=\s*['"]module/i.test(attributes)) continue;
  count += 1;
  new vm.Script(match[2], { filename: `inline-${count}.js` });
}

if (html.includes('\uFFFD')) throw new Error('UTF-8 replacement character found');
console.log(`inline scripts: ${count} OK`);
