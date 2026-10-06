import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const rootFiles = ['index.html', 'privacy.html', 'ads-config.js', 'ads.txt', 'robots.txt', 'site.webmanifest', 'sitemap.xml', 'thumbnail.png'];
const assetExtensions = new Set(['.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.ttf', '.woff', '.woff2']);
const assetMetadata = new Set(['assets/background-source.json', 'assets/boss/normalized/manifest.json', 'assets/drops/SOURCES.json', 'assets/enhancements/SOURCES.json', 'assets/profit/SOURCES.json', 'assets/profit/teenieping/sources.json', 'assets/fonts/NanumGothic-OFL.txt', 'assets/ui-icons-LICENSE.txt']);

export function isPublicPath(path) {
  if (typeof path !== 'string' || path.includes('\\') || path.split('/').some(part => !part || part.startsWith('.'))) return false;
  if (/(^|\/)(backups?|outputs?|secrets?|credentials?|sessions?|node_modules)(\/|\.)/i.test(path)) return false;
  if (/\.(bak|old|log|map|zip|pem|key|p12|pfx)$/i.test(path)) return false;
  if (rootFiles.includes(path) || assetMetadata.has(path)) return true;
  if (path.startsWith('assets/')) return assetExtensions.has(extname(path));
  if (/^(about|api|guide|updates)\/(?:[^/]+\/)*index\.html$/.test(path)) return true;
  return path === 'downloads/mesobook-android-beta.apk';
}

function assertInside(base, path) {
  const within = relative(base, path);
  if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new Error(`허용한 경로 밖입니다: ${path}`);
}

export function prepareAssets(source = repository) {
  source = realpathSync(source);
  const web = resolve(source, 'cloudflare-web');
  const target = resolve(web, 'public');
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: source, encoding: 'utf8' }).split('\0').filter(Boolean);
  const paths = tracked.filter(isPublicPath).sort();
  for (const required of rootFiles) {
    if (!paths.includes(required)) throw new Error(`필수 공개 파일이 Git에 등록되어 있지 않습니다: ${required}`);
  }
  // 전체 파일을 검증한 다음 생성물만 교체합니다. 원본과 백업은 수정하지 않습니다.
  const manifest = paths.map(path => {
    const from = resolve(source, path);
    assertInside(source, from);
    let component = source;
    for (const part of path.split('/')) {
      component = resolve(component, part);
      if (lstatSync(component).isSymbolicLink()) throw new Error(`심볼릭 링크는 공개하지 않습니다: ${path}`);
    }
    assertInside(source, realpathSync(from));
    const stat = lstatSync(from);
    if (!stat.isFile() || stat.size > 25 * 1024 * 1024) throw new Error(`파일 형식 또는 25 MiB 제한을 확인하세요: ${path}`);
    return { path, size: stat.size, sha256: createHash('sha256').update(readFileSync(from)).digest('hex') };
  });
  assertInside(source, web);
  assertInside(web, target);
  for (const directory of [web, target]) {
    if (existsSync(directory) && (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory())) throw new Error(`생성 경로가 일반 폴더가 아닙니다: ${directory}`);
  }
  // 삭제 대상은 검증된 저장소의 cloudflare-web/public 한 곳으로 고정합니다.
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const { path } of manifest) {
    const to = resolve(target, path);
    assertInside(target, to);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(resolve(source, path), to);
  }
  writeFileSync(resolve(target, '_redirects'), '# www 리디렉션은 Worker에서 호스트별로 처리합니다.\n');
  writeFileSync(resolve(target, '_headers'), '# 미리보기 검색 제외 헤더는 Worker에서 처리합니다.\n');
  writeFileSync(resolve(web, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = prepareAssets();
  console.log(`공개 파일 ${manifest.length}개, ${manifest.reduce((total, file) => total + file.size, 0)}바이트를 준비했습니다.`);
}
