import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'www');

await rm(webDir, { force: true, recursive: true });
await mkdir(webDir, { recursive: true });
const webIndex = join(webDir, 'index.html');
await cp(join(root, 'index.html'), webIndex);

const indexHtml = await readFile(webIndex, 'utf8');
const nativeIndexHtml = indexHtml.replace(
  /\s*<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-\d+"\s+crossorigin="anonymous"><\/script>\s*/,
  '\n',
);
await writeFile(webIndex, nativeIndexHtml, 'utf8');
await cp(join(root, 'thumbnail.png'), join(webDir, 'thumbnail.png'));
await cp(join(root, 'assets'), join(webDir, 'assets'), { recursive: true });

console.log('Prepared Android web assets in www/.');
