// Source pages list a KMS item name next to a numeric item-detail link.
// Read the paginated public HTML without loading the source site's scripts or images.
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

export const currentListUrl = 'https://maple.dwjeong.com/archive/equipitem?cash=normal&pageSize=64&sort=id';
// KMS equipment uses public icon filenames based on a decimal item ID.
// Cross-checked against MapleStory.IO KMS/389 iconRaw pixels for IDs 1001079,
// 1041091, 1190000 and 1191001 (including the often mistranscribed digits 1 and 9).
export function nexonIconUrl(id) {
  const digits = String(id);
  if (!/^1\d{6}$/.test(digits)) return '';
  const positions = ['PONMLKJIHG','CDABGHEFKL','LKJIPONMDC','HGFEDCBAPO','OPMNKLIJGH','BADCFEHGJI'];
  const code = 'KE' + positions.map((alphabet, i) => alphabet[Number(digits[i+1])]).join('');
  return 'https://open.api.nexon.com/static/maplestory/item/icon/' + code;
}

export async function loadCurrentEquipment() {
  const cache = new URL('../.tools/kms-catalog/', import.meta.url);
  await mkdir(cache, {recursive:true});
  const listFile = new URL('verified-current.json', cache);
  const day = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  // Resume a partial crawl on the same KST day. A later rebuild fetches a fresh list.
  try {
    const updated = (await stat(listFile)).mtimeMs;
    if (new Date(updated+9*3600000).toISOString().slice(0,10) === day) return JSON.parse(await readFile(listFile,'utf8'));
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const staging = new URL(day+'/', cache);
  await mkdir(staging, {recursive:true});
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage({javaScriptEnabled:false});
    await page.route('**/*', route => route.abort());
    const rows = [], seen = new Set();
    for (let number=1, pages=1; number<=pages; number++) {
      const cachedPage = new URL('list-' + number + '.json', staging);
      let result;
      try { result = JSON.parse(await readFile(cachedPage, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!result) {
        const response = await fetch(currentListUrl + '&page=' + number, {signal:AbortSignal.timeout(30000)});
        if (!response.ok) throw Error('Equipment list page ' + number + ': HTTP ' + response.status);
        await page.setContent(await response.text(), {waitUntil:'domcontentloaded'});
        result = await page.evaluate(() => {
          const count = document.body.textContent.match(/총\s*([\d,]+)종\s*·\s*\d+\s*\/\s*([\d,]+)페이지/);
          if (!count) throw Error('Missing equipment count on source page');
          const items = Array.from(document.querySelectorAll('a[href^="/archive/equipitem/"]'))
            .filter(a => /^\/archive\/equipitem\/\d+$/.test(a.getAttribute('href')))
            .map(a => {
              const id = Number(a.getAttribute('href').split('/').at(-1));
              const name = a.querySelector('span.truncate')?.textContent.trim();
              if (!name) throw Error('Missing item name for ' + id);
              return [id,name];
            });
          return {total:Number(count[1].replaceAll(',','')),pages:Number(count[2].replaceAll(',','')),items};
        });
        await writeFile(cachedPage, JSON.stringify(result));
        await delay(450);
      }
      pages = result.pages;
      if (result.items.length !== Math.min(64,result.total-(number-1)*64)) throw Error('Incomplete page ' + number);
      for (const [id,name] of result.items) {
        if (seen.has(id)) throw Error('Duplicate ID while paging: ' + id);
        seen.add(id);
        if (/^1\d{6}$/.test(String(id))) rows.push([id,name]);
      }
      if (number%25 === 0 || number === pages) console.log(number+'/'+pages+' pages, '+rows.length+' equipment IDs');
      if (number === pages && seen.size !== result.total) throw Error('Incomplete equipment snapshot');
    }
    const complete = new URL('verified-'+process.pid+'.json', staging);
    await writeFile(complete, JSON.stringify(rows));
    await rename(complete, listFile);
    return rows;
  } finally {
    await browser.close();
  }
}
