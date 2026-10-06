import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { prepareAssets, repository } from './prepare-worker-web.mjs';

const wranglerVersion = '4.129.0';
const config = resolve(repository, 'cloudflare-web/wrangler.jsonc');
const workerName = 'maple-tracker-web';

export function uploadedVersion(output) {
  const uploads = output.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).filter(entry => entry.type === 'version-upload');
  if (uploads.length !== 1 || uploads[0].worker_name !== workerName || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uploads[0].version_id)) {
    throw new Error('새 Worker 버전 ID를 확정하지 못했습니다. 기존 배포는 변경하지 않습니다.');
  }
  return uploads[0].version_id;
}

export function versionCommands(version, message) {
  return [
    ['versions', 'upload', '--config', config, '--strict', '--message', message],
    ['versions', 'deploy', `${version}@100%`, '--config', config, '--yes', '--message', message]
  ];
}

async function verifyPublicSite(manifest) {
  const preview = 'https://maple-tracker-web.xenon201313.workers.dev';
  const production = 'https://maple-trackers.com';
  const home = manifest.find(file => file.path === 'index.html');
  let needsBrowserVerification = false;
  const check = async (url, validate) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'manual' });
    const body = Buffer.from(await response.arrayBuffer());
    const host = new URL(url).hostname;
    const productionHost = host === 'maple-trackers.com' || host === 'www.maple-trackers.com';
    if (productionHost && response.status === 403 && /^cloudflare$/i.test(response.headers.get('server') || '') && /Attention Required/i.test(body.toString('utf8'))) {
      needsBrowserVerification = true;
      console.log(`Cloudflare가 자동 확인 요청을 차단했습니다. 운영 브라우저 확인 필요: ${url}`);
      return;
    }
    validate(response, body);
  };
  for (const origin of [preview, production]) {
    await check(`${origin}/?page=home`, (response, body) => {
      const sha256 = createHash('sha256').update(body).digest('hex');
      if (response.status !== 200 || sha256 !== home.sha256) throw new Error(`배포 후 홈 파일 검증 실패: ${origin}. Routes와 보안 이벤트를 확인하세요.`);
      if (origin === preview && !response.headers.get('x-robots-tag')?.includes('noindex')) throw new Error('미리보기 검색 제외 헤더가 없습니다.');
      if (origin === production && /noindex/i.test(response.headers.get('x-robots-tag') || '')) throw new Error('운영 주소에 검색 제외 헤더가 붙었습니다.');
    });
    await check(`${origin}/__maple_missing_asset_20261006__`, response => {
      if (response.status !== 404) throw new Error(`없는 경로가 404가 아닙니다: ${origin}`);
    });
  }
  for (const origin of ['https://www.maple-trackers.com', 'http://www.maple-trackers.com', 'http://maple-trackers.com']) {
    await check(`${origin}/?page=character&web_check=1`, response => {
      if (response.status !== 301 || response.headers.get('location') !== 'https://maple-trackers.com/?page=character&web_check=1') throw new Error(`HTTPS 이동 또는 쿼리 보존을 확인하세요: ${origin}`);
    });
  }
  return { deployed: true, previewVerified: true, productionVerified: !needsBrowserVerification, needsBrowserVerification };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--plan')) throw new Error('사용법: npm run deploy:web [-- --plan]');
  const settings = JSON.parse(readFileSync(config, 'utf8'));
  if (settings.name !== workerName || 'routes' in settings || 'route' in settings || settings.assets?.run_worker_first !== true) throw new Error('Worker 이름, dashboard 관리 Routes, run_worker_first 설정을 확인하세요.');
  if (args.includes('--plan')) {
    console.log('로컬 검사 → 공개 파일 생성 → 아래 두 명령 → 공개 주소 검증. DNS/Routes 변경 명령은 실행하지 않습니다.');
    console.log(JSON.stringify(versionCommands('<새 버전 ID>', '<Git HEAD>'), null, 2));
    return;
  }
  execFileSync(process.execPath, [resolve(repository, 'scripts/test-worker-web.mjs')], { cwd: repository, stdio: 'inherit' });
  const manifest = prepareAssets();
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).trim() ? '-working-tree' : '';
  const message = `web ${head}${dirty}`;
  const candidates = [process.env.npm_execpath, resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const npm = candidates.find(path => path && basename(path) === 'npm-cli.js' && existsSync(path));
  if (!npm) throw new Error('npm 경로를 찾지 못했습니다. Node.js와 npm을 설치한 뒤 npm run deploy:web으로 실행하세요.');
  const record = resolve(repository, 'cloudflare-web/deployments', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(record, { recursive: true });
  writeFileSync(resolve(record, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const run = (command, output) => execFileSync(process.execPath, [npm, 'exec', '--yes', `--package=wrangler@${wranglerVersion}`, '--', 'wrangler', ...command], {
    cwd: repository,
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output, WRANGLER_LOG_SANITIZE: 'true', WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' }
  });
  const uploadOutput = resolve(record, 'upload.ndjson');
  run(versionCommands('', message)[0], uploadOutput);
  const version = uploadedVersion(readFileSync(uploadOutput, 'utf8'));
  // versions 명령만 사용합니다. triggers deploy 또는 DNS/Routes API는 호출하지 않습니다.
  run(versionCommands(version, message)[1], resolve(record, 'deploy.ndjson'));
  const release = { worker: workerName, version, head, workingTree: Boolean(dirty), deployed: true, previewVerified: false, productionVerified: false, needsBrowserVerification: true };
  const saveRelease = () => writeFileSync(resolve(record, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  saveRelease();
  try {
    Object.assign(release, await verifyPublicSite(manifest));
    saveRelease();
  } catch (error) {
    release.verificationError = error.message;
    saveRelease();
    throw new Error(`새 버전 ${version} 배포는 완료되었으나 검증에 실패했습니다. 반복 배포 전에 확인하세요: ${error.message}\n기록: ${record}`);
  }
  console.log(`${release.needsBrowserVerification ? '배포 성공 · 미리보기 검증 완료 · 운영 브라우저 확인 필요' : '웹 배포와 공개 주소 검증 완료'}: ${version}\n대시보드에서 두 Routes의 보존 상태도 확인하세요. 기록: ${record}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
