# 넥슨 로그인·계정 장부 운영 안내

최종 수정: 2026-09-24

## 지원 상태

2026년 9월 24일 사용자가 제공한 넥슨 애플리케이션 화면에서 `프로덕션` 상태를 확인했습니다. 등록 데이터 권한에 `maplestory.soulpotential`도 포함되어 있다는 사용자 확인을 받았습니다. 이 승인은 NEXON Open ID 이용 승인으로, Google AdSense 승인과는 별개입니다.

- Client ID: `94027613-24a9-4bab-9c74-c5d4ae55bf5e` (공개 식별자)
- 서비스 주소 및 Redirect URI: `https://maple-trackers.com/?page=home`
- 등록 Scope: `maplestory.characterlist`, `maplestory.starforce`, `maplestory.potential`, `maplestory.scheduler`, `maplestory.cube`, `maplestory.soulpotential`
- 일반 사용자도 넥슨 로그인과 데이터 제공 동의를 진행할 수 있습니다. 예전 연결에는 소울 권한이 없을 수 있으므로 이 경우 재로그인이 필요합니다.
- 개인 API 키 방식과 기존 API 키 기반 클라우드 보관함은 유지합니다. Client ID나 Secret Key는 개인 API 키 입력란에 넣지 않습니다.

## 계정 장부와 기존 기록 보존

홈에서 넥슨 로그인 후 사용할 장부를 확인합니다. 처음 연결할 때는 이 기기 장부를 계정에 연결할지, 계정 장부를 열지 사용자가 선택합니다. 서로 다른 계정이나 기존 API 키 장부를 자동으로 합치지 않습니다.

- 계정은 서버에서 확인한 넥슨 UID와 애플리케이션 식별자의 해시로 구분합니다. 브라우저가 지정한 계정 ID만으로 다른 장부를 열 수 없습니다.
- 전환 전에 현재 기기의 장부와 복구 기록을 별도 보관합니다. 기존 API 키 보관함은 수정하지 않습니다.
- 계정 장부의 변경은 브라우저에 먼저 기록한 뒤 서버에 동기화합니다. 저장 세대가 다르면 자동 덮어쓰기를 중단하고 사용할 기록을 확인합니다.
- 서버는 최신 장부와 별도로 최근 20세대의 이전본을 최대 45일 보관합니다. 이 기기의 전환 전 원본과 서버 세대 보관본을 JSON으로 확인할 수 있습니다.
- 로그아웃·연결 해제는 로그인 세션을 종료하는 동작이며 저장한 장부를 삭제하지 않습니다. 브라우저 사이트 데이터를 지우면 이 기기의 전환 전 원본도 사라질 수 있으므로 별도 JSON 백업을 권장합니다.
- 계정 장부는 브라우저에서 AES-GCM으로 암호화하여 전송합니다. 계정별 임의 암호화 키는 서버가 보관하고 인증된 브라우저에 전달합니다. **서버도 키를 보관하므로 종단 간 암호화 또는 운영자가 복호화할 수 없는 구조라고 설명하면 안 됩니다.**
- 기존 API 키 보관함은 API 키에서 파생한 암호화 키를 사용하는 별도 방식입니다. 계정 장부로 전환한 동안 기존 보관함에 계정 기록을 자동 업로드하지 않습니다.

## 연결 가능한 게임 데이터

| 기능 | 공식 경로 | 필요한 Scope | 제공 범위 |
| --- | --- | --- | --- |
| 내 캐릭터 목록 | `/maplestory/v1/character/list` | `maplestory.characterlist` | 계정별 OCID, 캐릭터명·월드·직업·레벨 |
| 보스 진행 | `/maplestory/v1/scheduler/character-state` | `maplestory.scheduler` | 본인 캐릭터의 콘텐츠 완료 상태, 최대 14일 전까지 |
| 스타포스 | `/maplestory/v1/history/starforce` | `maplestory.starforce` | 강화 결과·조건, 최대 2년 / 최대 5분 반영 지연 |
| 메소 잠재 재설정 | `/maplestory/v1/history/potential` | `maplestory.potential` | 재설정 전후 옵션, 최대 2년 / 최대 30분 반영 지연 |
| 큐브·특수 재화 | `/maplestory/v1/history/cube` | `maplestory.cube` | 큐브 및 특수 재화 사용 결과, 최대 2년 / 최대 30분 반영 지연 |
| 소울 잠재 재설정 | `/maplestory/v1/history/soul-potential` | `maplestory.soulpotential` | 재설정 전후 옵션·증폭 단계, 최대 2년 / 최대 30분 반영 지연 |

캐릭터 목록에는 캐릭터 이미지·전투력·경험치가 없습니다. 해당 상세 프로필은 기존 개인 API 키 경로를 사용하며, 넥슨 로그인을 했다는 이유만으로 지원한다고 표시하지 않습니다.

소울 증폭 이력과 고급 어빌리티 재설정 이력은 현재 공식 확률 조회 명세에 없습니다. 장비의 현재 증폭 단계나 현재 어빌리티·남은 명성치를 조회하는 API를 소비 이력으로 취급하지 않습니다. 증폭 메소, 에테르 구입비, 고급 어빌리티 메소와 명예의 훈장 구입비는 수기로 기록합니다.

## 강화 지출 반영 기준

- API가 제공하는 것은 결과 이력이며 실제 사용 메소를 제공하지 않습니다. 사용자가 최종 금액을 확인하여 `지출 반영`을 누르기 전에는 지출 통계에 포함하지 않습니다.
- 스타포스는 이력 시점의 강화 조건과 이벤트, 장비 레벨을 이용합니다. 복구·장비 구입비는 별도이며 특수 재화·미확인 장비는 사용자가 확인합니다.
- 잠재능력 탭에는 메소 재설정과 큐브를 함께 표시하지만 메소 지출과 큐브 환산액은 분리합니다. 무료·캐시 큐브 환산액은 실제 메소 지출이 아닙니다.
- 소울 잠재 재설정 기본 비용은 재설정 전 등급에 따라 레어 2천만, 에픽 4천만, 유니크 6천5백만, 레전드리 8천8백만 메소입니다. 증폭 단계와 무관합니다. API 응답의 등급을 전 등급으로 임의 추정하지 않습니다.
- 이력당 횟수나 특수 조건을 API에서 식별할 수 없는 경우 사용자가 확인합니다. 모르는 금액을 0메소로 확정하거나 임의의 세 배로 계산하지 않습니다.
- 동일 날짜의 수기 비용과 중복 여부를 확인합니다. 이력 재조회·클라우드 병합·예전 백업 복원으로 확정 지출을 중복 추가하지 않습니다. 확정 금액과 사용자가 입력한 단가는 새 추정치로 덮어쓰지 않습니다.
- 자동 조회는 사용자가 선택한 경우에만 보이는 지출 화면에서 최근 두 날짜를 최대 5분마다 조회합니다. 한 번의 수동 조회 범위는 최대 7일입니다.
- 소울 권한이나 조회에 문제가 있으면 해당 기능의 상태를 안내합니다. 이미 받은 다른 종류의 이력과 기존 기록을 모두 실패한 것으로 취급하지 않습니다.

## 서버 설정과 배포

GitHub Pages가 인증 코드를 직접 토큰으로 교환하지 않습니다. Cloudflare Worker가 `/v1/friends/*`의 인증·게임 데이터·계정 장부 요청을 처리합니다.

- `NEXON_CLIENT_SECRET`: Worker 비밀 변수에만 등록합니다. 채팅·소스·URL·GitHub·브라우저 입력란에 넣지 않습니다.
- `FRIENDS_SESSIONS`: 로그인 및 넥슨 토큰을 보관하는 Durable Object입니다.
- `FRIENDS_LEDGERS`: 계정별 암호화 키, 장부와 세대 보관본을 관리하는 Durable Object입니다.
- `DATA`: 기존 API 키 기반 장부의 KV 바인딩을 유지합니다.

```powershell
npx wrangler@4.129.0 deploy --config cloudflare-worker/wrangler.toml
```

서버의 새 바인딩·마이그레이션을 먼저 배포하고 상태 확인 후 웹 자산을 배포합니다. 검증에 실제 사용자의 장부 수정이나 개인 세션 열람이 필요하지 않습니다. 프로덕션 확인 시 로그인 성공, 권한별 조회, 다른 기기 기록 충돌·보존은 각각 구분하여 결과를 남깁니다. 격리 테스트 통과는 실계정 API 호출 성공을 대신하지 않습니다.

## 인증과 요청 보호

- 넥슨 액세스 토큰·갱신 토큰과 Client Secret은 서버에만 둡니다. 브라우저 응답·로그·JSON 백업·동기화 장부에 포함하지 않습니다.
- 브라우저는 탭의 임의 서비스 세션 인증값을 보관합니다. 인증 코드의 `state`와 브라우저 증명을 확인하고 일회용으로 소비합니다.
- 인증 콜백 쿼리는 다른 페이지 스크립트가 실행되기 전에 제거합니다. 중첩된 `?page=home?code=...` 형태도 구분자를 정상화한 뒤 처리합니다.
- 승인된 원본 주소와 고정된 경로만 허용하며, 상위 서버 리다이렉트에 인증값을 전달하지 않습니다. 오류는 정해진 단계·상태·넥슨 오류 식별자로 제한합니다.
- 세션의 토큰 갱신은 Durable Object에서 직렬화합니다. 넥슨 액세스 토큰은 30분, 갱신 토큰은 14일이 공식 기준이며 만료 시 재로그인이 필요합니다.
- 프렌즈 OAuth의 등록 Redirect URI는 운영 웹 주소입니다. 로컬 HTML·Android의 기존 개인 API 키 방식은 유지합니다.

## 검증 명령

```powershell
npm run test:enhancements
npm run test:data-safety
npm run test:public-content
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:ui
```

배포 직전에는 새 계정 장부와 프렌즈 서버의 전용 테스트도 실행합니다. 실제 수행한 검사와 결과는 해당 작업 보고서에 기록합니다.

## 공식 근거

- [Open ID 개발 가이드와 Scope 매핑](https://openapi.nexon.com/ko/open-id/development-guide/?tab=table)
- [공식 메이플스토리 API 문서](https://openapi.nexon.com/ko/game/maplestory/)
- [2026년 9월 17일 API 업데이트](https://openapi.nexon.com/ko/support/notice/3545814/)
- [확률 API 명세: 소울 잠재 재설정 포함](https://openapi.nexon.com/static/api/maplestory/17_ko_script20260918020020.yaml)
- [캐릭터 API 명세](https://openapi.nexon.com/static/api/maplestory/14_ko_script20260917040003.yaml)
- [스케줄러 API 명세](https://openapi.nexon.com/static/api/maplestory/62_ko_script20260821005015.yaml)
- [소울 및 고급 어빌리티 게임 패치](https://maplestory.nexon.com/News/Update/813)

2026-09-07 제작자 계정에서 기존 세 종류의 이력 조회를 확인한 기록은 과거 검증입니다. 2026-09-24에 추가한 소울 이력과 계정 장부의 운영 검증 결과로 재사용하지 않습니다.
