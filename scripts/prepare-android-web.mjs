import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(root, 'www');

await rm(webDir, { force: true, recursive: true });
await mkdir(webDir, { recursive: true });
await cp(join(root, 'index.html'), join(webDir, 'index.html'));
await cp(join(root, 'thumbnail.png'), join(webDir, 'thumbnail.png'));
await cp(join(root, 'assets'), join(webDir, 'assets'), { recursive: true });

console.log('Prepared Android web assets in www/.');
