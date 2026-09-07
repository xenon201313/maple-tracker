import {writeFile} from 'node:fs/promises';

// Unmodified Google Fonts distributions, with the upstream SIL OFL notice.
const files=[
  ['NanumGothic-Regular.ttf','https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf'],
  ['NanumGothic-Bold.ttf','https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Bold.ttf'],
  ['NanumGothic-OFL.txt','https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/OFL.txt']
];
for(const [name,url] of files) {
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(name+': HTTP '+response.status);
  const data=Buffer.from(await response.arrayBuffer());
  if(name.endsWith('.ttf') && data.subarray(0,4).toString('hex')!=='00010000') throw new Error('Invalid font: '+name);
  await writeFile(new URL('../assets/fonts/'+name,import.meta.url),data);
  console.log(name+': '+data.length+' bytes');
}
