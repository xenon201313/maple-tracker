// 설치된 브라우저를 명시해서 독립 테스트를 실행할 때만 사용하는 선택적 preloader입니다.
const fs=require('node:fs');
const executable=process.env.MAPLE_TEST_CHROMIUM;
if(executable){
  if(!fs.existsSync(executable))throw new Error('MAPLE_TEST_CHROMIUM 실행 파일을 찾을 수 없습니다.');
  const {chromium}=require('playwright');
  const launch=chromium.launch.bind(chromium);
  chromium.launch=options=>launch({...options,executablePath:options?.executablePath || executable});
}
