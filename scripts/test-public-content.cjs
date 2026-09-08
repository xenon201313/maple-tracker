// 공개 안내 페이지의 링크·정적 본문·광고 분리 회귀 검사. 외부 통신 없음.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pages=['index.html','guide/index.html','about/index.html','api/index.html','privacy.html',
  'guide/hunt-income/index.html','guide/boss-settlement/index.html','guide/profit-expense/index.html'];
const htmls=new Map(pages.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
let links=0;
for(const [file,html] of htmls){
  assert.equal((html.match(/<h1\b/g)||[]).length,1,file+'의 문서 제목');
  assert.match(html,/<meta name="google-adsense-account" content="ca-pub-7107280230386162">/,file+' 소유권 확인');
  assert.doesNotMatch(html,/<script[^>]*src="https:\/\/pagead2\.googlesyndication/,file+' 무조건 광고 로드 금지');
  const base=new URL(file==='index.html'?'/':'/'+file.replace(/index\.html$/,''),'https://maple-trackers.com');
  const markup=html.replace(/<script([^>]*)>[\s\S]*?<\/script>/g,'<script$1></script>');
  for(const match of markup.matchAll(/(?:href|src)="([^"<>]+)"/g)){
    if(!match[1]||match[1].startsWith('data:'))continue;
    const url=new URL(match[1].replaceAll('&amp;','&'),base);
    if(url.origin!==base.origin)continue;
    let target=decodeURIComponent(url.pathname).slice(1);
    if(!target||target.endsWith('/'))target+='index.html';
    const full=path.resolve(root,target);
    assert(full.startsWith(root+path.sep),'경로 이탈: '+target);
    assert(fs.existsSync(full),file+' → 없는 링크/자산: '+target);
    if(url.hash&&target.endsWith('.html')){
      const body=htmls.get(target)||fs.readFileSync(full,'utf8');
      const id=decodeURIComponent(url.hash.slice(1));
      assert(body.includes('id="'+id+'"'),file+' → 없는 문서 위치: '+target+url.hash);
    }
    links++;
  }
  const article=file.startsWith('guide/')&&file!=='guide/index.html';
  if(article){
    assert.match(html,/<article aria-label="계산 사례 본문">[\s\S]*<table\b/,file+' 정적 본문·계산 표');
    assert.match(html,/가상/);
    assert.match(html,/<script defer src="\.\.\/\.\.\/ads-config\.js[^\"]*"><\/script>\s*<script defer src="\.\.\/\.\.\/assets\/site-ads\.js/);
    assert.equal((html.match(/data-content-ad/g)||[]).length,1,'페이지당 광고 한 곳');
    assert(html.indexOf('data-content-ad')>html.indexOf('</article>'),'광고는 본문 이후');
    const route='https://maple-trackers.com/'+file.replace(/index\.html$/,'');
    assert(fs.readFileSync(path.join(root,'sitemap.xml'),'utf8').includes('<loc>'+route+'</loc>'));
  }else{
    assert.doesNotMatch(html,/data-content-ad|assets\/site-ads\.js|class="adsbygoogle/,'장부·안내 페이지의 광고 요청 금지');
  }
}
console.log(`공개 페이지 ${pages.length}개, 내부 링크·자산 ${links}개, 목차·정적 본문·광고 분리 검사 통과.`);
