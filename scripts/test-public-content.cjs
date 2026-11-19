// 공개 문서 원본을 검사합니다. JavaScript 실행, 외부 요청, 개인 장부 접근이 없습니다.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const origin = 'https://maple-trackers.com';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const routeOf = file => '/' + file.replace(/index\.html$/, '');
const articlesWithAds = new Set([
  'guide/hunt-income/index.html', 'guide/boss-settlement/index.html', 'guide/profit-expense/index.html'
]);
const demoPaths = [
  '/guide/hunt-income/#compare-hunts', '/guide/boss-settlement/#try-settlement', '/guide/profit-expense/#try-calculator'
];

// 사이트맵에서 빠진 파일과 실제 문서가 없는 사이트맵 항목을 모두 찾습니다.
const files = ['index.html', 'privacy.html'];
for (const dir of ['about', 'api', 'guide', 'updates']) {
  for (const entry of fs.readdirSync(path.join(root, dir), {recursive:true})) {
    if (path.basename(entry) === 'index.html') files.push(dir + '/' + entry.split(path.sep).join('/'));
  }
}
assert(files.includes('guide/record-principles/index.html'), '계산·기록 기준 문서 누락');
const urls = Array.from(read('sitemap.xml').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g), match => match[1]);
assert.deepEqual(urls.sort(), files.map(file => origin + routeOf(file)).sort(), '사이트맵 URL과 실제 공개 문서 경로');

function staticMarkup(file) {
  return read(file).replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b([^>]*)>[\s\S]*?<\/\1>/gi, '<$1$2></$1>');
}
const documents = new Map(files.map(file => [file, staticMarkup(file)]));

function containsDirectLink(html, base, href) {
  for (const match of html.matchAll(/<a\b[^>]*?\bhref="([^"]+)"[^>]*>/gi)) {
    if (new URL(match[1].replaceAll('&amp;', '&'), base).href === origin + href) return true;
  }
  return false;
}

let links = 0;
for (const [file, html] of documents) {
  const base = new URL(routeOf(file), origin);
  assert.equal((html.match(/<h1\b/gi) || []).length, 1, file + '의 문서 제목');
  const canonical = Array.from(html.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/gi));
  assert.equal(canonical.length, 1, file + ' 대표 URL 개수');
  assert.equal(canonical[0][0].match(/\bhref="([^"]+)"/i)?.[1], base.href, file + '의 대표 URL');
  assert.doesNotMatch(html, /<meta\b[^>]*name="(?:robots|googlebot)"[^>]*content="[^"]*\bnoindex\b/i, file + ' 공개 문서 검색 제외');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  assert(main, file + ' 정적 본문 영역');
  for (const tag of ['h2', 'p']) {
    const elements = main.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'));
    assert(Array.from(elements).some(match => /[가-힣]/.test(match[1].replace(/<[^>]+>/g, ''))), file + ' 정적 한글 본문 ' + tag);
  }
  assert.match(html, /<meta name="google-adsense-account" content="ca-pub-7107280230386162">/, file + ' 소유권 확인');
  assert.doesNotMatch(html, /<script\b[^>]*src="(?:https?:)?\/\/pagead2\.googlesyndication/i, file + ' 무조건 광고 로드 금지');

  for (const match of html.matchAll(/\b(?:href|src)="([^"<>]+)"/g)) {
    if (match[1].startsWith('data:')) continue;
    const url = new URL(match[1].replaceAll('&amp;', '&'), base);
    if (url.origin !== origin) continue;
    let target = decodeURIComponent(url.pathname).slice(1);
    if (!target || target.endsWith('/')) target += 'index.html';
    const full = path.resolve(root, target);
    assert(full.startsWith(root + path.sep), '경로 이탈: ' + target);
    assert(fs.existsSync(full) && fs.statSync(full).isFile(), file + ' → 없는 링크/자산: ' + target);
    if (target.endsWith('.html')) {
      assert(documents.has(target), file + ' → 사이트맵에 없는 문서: ' + target);
      if (url.hash) {
        const id = decodeURIComponent(url.hash.slice(1));
        assert(documents.get(target).includes('id="' + id + '"'), file + ' → 없는 문서 위치: ' + target + url.hash);
      }
    }
    links++;
  }
  if (articlesWithAds.has(file)) {
    assert.match(main, /<article aria-label="계산 사례 본문">[\s\S]*<table\b/, file + ' 정적 계산 사례·표');
    assert.match(main, /가상/, file + ' 예제 표시');
    assert.match(html, /<script defer src="\.\.\/\.\.\/ads-config\.js[^"]*"><\/script>\s*<script defer src="\.\.\/\.\.\/assets\/site-ads\.js/);
    assert.equal((html.match(/\bdata-content-ad\b/g) || []).length, 1, file + ' 광고 영역 한 곳');
    assert.equal((html.match(/<ins\b[^>]*\badsbygoogle\b/g) || []).length, 1, file + ' 광고 단위 한 곳');
    assert(html.indexOf('data-content-ad') > html.lastIndexOf('</article>'), file + ' 광고는 본문 이후');
  } else {
    assert.doesNotMatch(html, /data-content-ad|ads-config\.js|assets\/site-ads\.js|class="adsbygoogle/, file + ' 광고 요청 금지');
  }
}
for (const file of articlesWithAds) assert(documents.has(file), '공개 계산 사례 누락: ' + file);
const home = documents.get('index.html');
const guideBlock = home.match(/<(section|nav)\b[^>]*\bid="home-public-guides"[^>]*>([\s\S]*?)<\/\1>/i)?.[2];
assert(guideBlock, '홈에 로그인 없이 읽는 계산 사례 안내가 있어야 합니다.');
for (const href of demoPaths) {
  assert(containsDirectLink(guideBlock, origin, href), '홈에서 계산 체험으로 바로 가는 링크: ' + href);
}
assert(containsDirectLink(documents.get('guide/index.html'), origin + '/guide/', demoPaths[0]), '가이드 색인의 재획 비교 체험 링크');
console.log(`공개 문서 ${files.length}개, 내부 링크·자산 ${links}개, 사이트맵·대표 URL·정적 본문·체험 진입·광고 분리 검사 통과.`);
