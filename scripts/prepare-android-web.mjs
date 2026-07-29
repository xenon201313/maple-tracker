import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'www');

await rm(webDir, { force: true, recursive: true });
await mkdir(webDir, { recursive: true });

const stripAdsenseLoader = (html) => html.replace(
  /\s*<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-\d+"\s+crossorigin="anonymous"><\/script>\s*/,
  '\n',
);

for (const relativePath of ['index.html', 'privacy.html', 'api/index.html', 'guide/index.html', 'about/index.html']) {
  const source = join(root, relativePath);
  const target = join(webDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  const html = await readFile(source, 'utf8');
  await writeFile(target, stripAdsenseLoader(html), 'utf8');
}

await cp(join(root, 'ads-config.js'), join(webDir, 'ads-config.js'));
await cp(join(root, 'site.webmanifest'), join(webDir, 'site.webmanifest'));
await cp(join(root, 'thumbnail.png'), join(webDir, 'thumbnail.png'));
await cp(join(root, 'assets'), join(webDir, 'assets'), { recursive: true });

console.log('Prepared Android web assets in www/.');
