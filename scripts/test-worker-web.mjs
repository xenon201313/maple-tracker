import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import worker from '../cloudflare-web/worker.mjs';
import { isPublicPath, prepareAssets, repository, rootFiles } from './prepare-worker-web.mjs';
import { uploadedVersion, versionCommands } from './deploy-worker-web.mjs';

test('공개 허용 목록이 운영 파일, 백업, 비밀 파일, 소스 맵을 차단한다', () => {
  for (const path of ['index.html', 'assets/friends-characters.js', 'assets/drops/soul_ether_1.webp', 'guide/profit-expense/index.html', 'downloads/mesobook-android-beta.apk']) assert.equal(isPublicPath(path), true, path);
  for (const path of ['.env', 'assets/.env', 'assets/secrets/key.js', 'assets/../index.html', '/index.html', 'assets\\a.js', 'assets/token.json', 'assets/debug.js.map', 'assets/a.js.bak', 'backups/index.html', 'cloudflare-worker/maple-tracker-sync.mjs', 'cloudflare-web/worker.mjs', 'scripts/test.js', 'WEB_HOSTING.md', 'package.json', 'downloads/private.zip', 'guide/.private/index.html']) assert.equal(isPublicPath(path), false, path);
});

test('빌드는 등록된 공개 파일만 복사하고 이전 생성물을 지운다', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'maple-web-test-'));
  const put = (path, content = path) => { const target = resolve(fixture, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); };
  try {
    execFileSync('git', ['init', '--quiet', fixture]);
    for (const path of rootFiles) put(path);
    for (const path of ['assets/a.js', 'guide/a/index.html', 'backups/private.json', 'assets/.env', 'assets/secret.json', 'cloudflare-worker/private.mjs']) put(path);
    execFileSync('git', ['add', '.'], { cwd: fixture });
    put('assets/untracked.js');
    let manifest = prepareAssets(fixture);
    assert.equal(manifest.length, rootFiles.length + 2);
    const target = resolve(fixture, 'cloudflare-web/public');
    assert.equal(existsSync(resolve(target, 'assets/a.js')), true);
    for (const path of ['assets/untracked.js', 'assets/.env', 'assets/secret.json', 'backups/private.json', 'cloudflare-worker/private.mjs']) assert.equal(existsSync(resolve(target, path)), false, path);
    put('cloudflare-web/public/obsolete.js');
    put('assets/a.js', '새 내용');
    manifest = prepareAssets(fixture);
    assert.equal(existsSync(resolve(target, 'obsolete.js')), false);
    assert.equal(readFileSync(resolve(target, 'assets/a.js'), 'utf8'), '새 내용');
    assert.equal(manifest.find(file => file.path === 'assets/a.js').sha256.length, 64);
    execFileSync('git', ['rm', '--cached', 'index.html'], { cwd: fixture });
    assert.throws(() => prepareAssets(fixture), /필수 공개 파일/);
    assert.equal(readFileSync(resolve(target, 'assets/a.js'), 'utf8'), '새 내용');
  } finally {
    const within = relative(resolve(tmpdir()), fixture);
    if (!within.startsWith(`..${sep}`) && !within.includes(sep) && basename(fixture).startsWith('maple-web-test-')) rmSync(fixture, { recursive: true, force: true });
  }
});

test('HTTP와 www는 경로 및 인코딩된 쿼리를 보존해 한 번에 HTTPS apex로 이동한다', async () => {
  const env = { ASSETS: { fetch() { throw new Error('리디렉션에서 정적 자산을 가져오면 안 됩니다.'); } } };
  for (const origin of ['http://maple-trackers.com', 'http://www.maple-trackers.com', 'https://www.maple-trackers.com']) {
    const response = await worker.fetch(new Request(`${origin}/?page=home&code=a%2Bb&state=x%26y`), env);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), 'https://maple-trackers.com/?page=home&code=a%2Bb&state=x%26y');
  }
});

test('미리보기의 정상·없는 페이지·HTML 리디렉션 모두 검색 제외를 유지한다', async () => {
  for (const status of [200, 404, 307]) {
    const request = new Request('https://maple-tracker-web.xenon201313.workers.dev/privacy.html?page=home');
    const env = { ASSETS: { fetch(input) { assert.equal(input, request); return new Response('asset', { status, headers: status === 307 ? { Location: '/privacy?page=home' } : {} }); } } };
    const response = await worker.fetch(request, env);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    if (status === 307) assert.equal(response.headers.get('location'), '/privacy?page=home');
    assert.equal(await response.text(), 'asset');
  }
});

test('운영 HTTPS는 자산 응답을 그대로 전달하고 전역 noindex를 추가하지 않는다', async () => {
  const asset = new Response('public content');
  const result = await worker.fetch(new Request('https://maple-trackers.com/?page=character'), { ASSETS: { fetch: () => asset } });
  assert.equal(result, asset);
  assert.equal(result.headers.has('x-robots-tag'), false);
});

test('정적 자산은 Worker를 거치고 없는 경로를 앱으로 위장하지 않는다', () => {
  const config = JSON.parse(readFileSync(resolve(repository, 'cloudflare-web/wrangler.jsonc'), 'utf8'));
  assert.equal(config.name, 'maple-tracker-web');
  assert.equal(config.assets.directory, './public');
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.html_handling, 'auto-trailing-slash');
  assert.equal(config.assets.not_found_handling, 'none');
  for (const key of ['route', 'routes', 'kv_namespaces', 'durable_objects', 'd1_databases', 'vars']) assert.equal(key in config, false, key);
});

test('확정된 신규 버전만 배포하고 Routes 변경 명령을 사용하지 않는다', () => {
  const version = '12345678-1234-1234-1234-123456789abc';
  const entry = { type: 'version-upload', worker_name: 'maple-tracker-web', version_id: version };
  assert.equal(uploadedVersion(JSON.stringify(entry) + '\n'), version);
  assert.throws(() => uploadedVersion(JSON.stringify({ ...entry, worker_name: 'maple-tracker-sync' })), /기존 배포/);
  assert.throws(() => uploadedVersion(JSON.stringify(entry) + '\n' + JSON.stringify(entry)), /기존 배포/);
  assert.throws(() => uploadedVersion(JSON.stringify({ ...entry, version_id: 'latest' })), /기존 배포/);
  const [upload, deploy] = versionCommands(version, 'test');
  assert.deepEqual(upload.slice(0, 2), ['versions', 'upload']);
  assert.deepEqual(deploy.slice(0, 3), ['versions', 'deploy', `${version}@100%`]);
  assert.equal([...upload, ...deploy].some(value => /^(triggers|--routes?|--zone|--zone-id)$/.test(value)), false);
});
