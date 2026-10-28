# 메계부 웹 배포 운영 안내

2026-10-06 GitHub Pages 원본 인증서 만료로 발생한 Cloudflare 526 장애를 복구하기 위해, 같은 공개 파일을 별도 `maple-tracker-web` Worker Static Assets에서 제공합니다. 앱 소스, 사용자 장부, 인증 세션을 옮기는 작업이 아닙니다.

**이후 GitHub main에 push하는 것만으로는 운영 웹사이트가 갱신되지 않습니다.** GitHub Pages 배포와 아래 Cloudflare 웹 배포를 각각 수행해야 합니다. 웹 배포는 `maple-tracker-web`만 대상으로 합니다. 기존 `maple-tracker-sync`의 코드, Secrets, KV, Durable Objects는 이 명령에서 변경하지 않습니다.

## 현재 연결 구조

| 항목 | 설정 |
| --- | --- |
| 운영 주소 | `https://maple-trackers.com` |
| 웹 Worker | `maple-tracker-web` |
| 확인용 주소 | `https://maple-tracker-web.xenon201313.workers.dev` |
| Cloudflare Routes | `maple-trackers.com/*`, `www.maple-trackers.com/*` |
| Routes 관리 위치 | Cloudflare → Workers & Pages → maple-tracker-web → Domains |
| DNS | 기존 GitHub Pages A 4개와 www CNAME을 유지하고 Proxied 사용 |
| SSL/TLS | 기존 Full (strict) 유지 |
| 장부·인증 API | 기존 `maple-tracker-sync` 주소 유지 |

두 Routes는 **대시보드에서 관리**합니다. 현재 CLI 인증에는 Routes 변경 권한이 없으므로 `cloudflare-web/wrangler.jsonc`에 `route` 또는 `routes`를 넣지 않습니다. 모든 하위 도메인에 적용되는 `*.maple-trackers.com/*`도 추가하지 않습니다. Custom Domain으로 DNS를 교체한 구조가 아닙니다.

Worker가 `ASSETS` 바인딩에서 파일을 반환하므로 정상 웹 요청에 GitHub Pages 원본 TLS 연결이 필요하지 않습니다. `run_worker_first: true`는 www 및 HTTP 리디렉션, 미리보기 검색 제외 헤더가 정적 파일에도 적용되도록 유지합니다. 이 설정에서는 정적 파일 요청도 Worker 실행 횟수에 포함됩니다.

HTTP apex와 www는 경로·쿼리를 보존해 HTTPS apex로 301 이동합니다. `/?page=character` 같은 기존 탐색과 넥슨 콜백 주소 `https://maple-trackers.com/?page=home`도 그대로 사용합니다. `/api/`는 공개 사용 안내 페이지이며 실제 장부 API가 아닙니다.

## 배포하기

Node.js 20 이상, npm, Git이 필요합니다. 저장소 루트에서 실행합니다. 최초 인증 또는 만료 시 `npx wrangler@4.129.0 login`으로 운영자 Cloudflare 계정에 로그인합니다. 인증값은 파일이나 채팅에 복사하지 않습니다. 웹 Worker에는 넥슨 키 등 별도 Secret을 등록할 필요가 없습니다.

1. 수정 전 기존 파일을 `backups/`에 보관하고, 변경을 검토합니다. 새 공개 파일은 Git에 추가해야 빌드 대상에 포함됩니다. 장부 데이터나 인증 파일을 `assets/` 등 공개 폴더에 두지 않습니다.
2. 대시보드에서 위 두 Routes가 `maple-tracker-web`에 연결되어 있고 DNS 5개가 Proxied인지 확인합니다.
3. 아래 한 명령으로 로컬 검사, 공개 파일 생성, 버전 업로드, 100% 적용, 공개 주소 검증을 실행합니다.

```powershell
npm run deploy:web
```

이 명령은 고정된 Wrangler 4.129.0을 npm으로 실행합니다. `wrangler versions upload`의 구조화된 결과에서 Worker 이름과 신규 버전 ID를 확인한 후 `wrangler versions deploy <버전>@100%`를 실행합니다. `triggers deploy`, DNS, Routes 변경 API는 호출하지 않습니다. 업로드 후 버전 ID를 확정하지 못하면 기존 배포는 유지합니다.

4. **배포 후 대시보드에서 두 Routes가 보존되었는지 확인합니다.** 자동 검증은 운영/확인용 홈의 파일 해시, 404, 확인용 noindex, www 쿼리 보존을 확인하지만 대시보드 설정 자체를 조회하지는 않습니다. 브라우저에서 캐릭터 화면과 안내 페이지도 확인합니다. 로그인 및 사용자 장부 검증은 본인 계정에서만 수행합니다.

배포 기록과 파일별 SHA-256은 `cloudflare-web/deployments/<시각>/`에 저장되고 Git과 정적 배포에서 제외됩니다. 운영 주소가 자동 요청에 403을 반환하고 `server: cloudflare` 및 `Attention Required` 본문이 확인되면, 미리보기 검증은 유지하고 `release.json`에 `deployed: true`, `previewVerified: true`, `productionVerified: false`, `needsBrowserVerification: true`를 남깁니다. 이 경우는 **배포 성공·운영 브라우저 확인 필요**로 종료합니다. 다른 오류는 검증 실패로 처리합니다. 배포 후 검증이 실패하면 새 버전이 이미 활성화되었을 수 있습니다. 자동으로 설정을 지우거나 다시 배포하지 말고 `release.json`, 대시보드 Deployments, 보안 이벤트를 먼저 확인합니다. 일반 HTTP 클라이언트의 403만으로 전체 사이트 장애를 단정하지 말고 실제 브라우저도 확인합니다.

외부 변경 없이 실행할 명령:

```powershell
npm run test:web-hosting
npm run prepare:web
npm run deploy:web -- --plan
```

`--plan`은 명령 설명만 출력하며 인증이나 네트워크 요청을 하지 않습니다. 2026-10-06 이 배포 스크립트를 실제 실행하여 웹 버전 `0f07c2e3-69c0-4e84-bfb7-2d414cc5570c`를 100% 적용했습니다. 배포 후 두 Routes 보존, 실제 브라우저의 홈·캐릭터 화면과 HTTP www → HTTPS apex 이동을 확인했습니다. 자동 검사에서 운영 경로는 기존 WAF 403이므로 브라우저 확인이 필요했고, 미리보기의 홈 해시·404·noindex는 통과했습니다. 테스트 7개와 공개 파일 314개의 이전 복구 배포본 대비 해시 일치도 확인했습니다.

## 공개 파일 범위

`prepare:web`은 `git ls-files`에 등록된 파일 중 허용 목록만 `cloudflare-web/public/`에 복사합니다. 파일 내용은 변환하지 않습니다. 다음 빌드 전에 이 생성 폴더만 비우므로 삭제된 자산이 남지 않습니다. 이 폴더를 직접 편집하거나 백업 저장소로 사용하지 않습니다.

| 경로 | 포함 기준 |
| --- | --- |
| 루트 | `index.html`, `privacy.html`, `ads-config.js`, `ads.txt`, `robots.txt`, `site.webmanifest`, `sitemap.xml`, `thumbnail.png` |
| `assets/` | JS, CSS, 이미지, 글꼴; 기존 출처 JSON 및 라이선스 파일은 명시한 경로만 |
| `about/`, `api/`, `guide/`, `updates/` | 각 하위 경로의 `index.html` |
| `downloads/` | `mesobook-android-beta.apk`만 |

초기 복구 기준 공개 파일은 314개, 43,282,538바이트입니다. 이후 정상적인 자산 추가 시 수량은 달라질 수 있습니다. 주석만 있는 `_headers`, `_redirects` 두 파일은 Cloudflare 설정 파일로 생성하며 위 수량에서 제외합니다. 파일별 25 MiB 제한을 검사합니다.

저장소 전체를 assets directory로 지정하면 안 됩니다. `.env`, `.dev.vars`, 숨김 경로, 백업, 세션, 비밀 파일, 소스 맵, `cloudflare-worker/`, `scripts/`, 운영 문서와 Git 메타데이터는 공개하지 않습니다. 심볼릭 링크도 거부합니다. 새 종류의 파일이 필요하면 `scripts/prepare-worker-web.mjs`의 허용 목록을 검토해 추가합니다. 알려지지 않은 JSON을 자동 공개하지 않습니다.

HTML은 `auto-trailing-slash`로 `/guide/` 등 폴더 인덱스를 제공합니다. `/privacy.html`은 `/privacy`로 쿼리를 보존해 이동할 수 있습니다. `not_found_handling: none`으로 없는 경로를 404 처리하며 SPA fallback은 사용하지 않습니다. 확인용 `workers.dev`의 정상·오류·리디렉션 응답에 `X-Robots-Tag: noindex, nofollow`를 붙입니다. 운영 주소의 robots, sitemap, canonical은 기존 공개 파일을 유지합니다.

## 되돌리기 및 GitHub 원본 복구

웹 버전에 문제가 있으면 Cloudflare의 `maple-tracker-web` → Deployments에서 확인된 직전 버전으로 되돌립니다. 이는 웹 코드와 정적 자산 배포만 대상으로 하며 저장된 장부를 복원하거나 지우지 않습니다. DNS와 Routes를 먼저 삭제하지 않습니다.

GitHub Pages 원본 인증서가 유효해진 것을 직접 TLS 검증으로 확인하기 전에는 Routes를 해제하면 안 됩니다. DNS가 GitHub Pages를 계속 가리키므로 만료된 원본으로 돌아가면 526이 재발할 수 있습니다. GitHub Pages의 `bad_authz`는 별도로 해결해야 합니다. Cloudflare 프록시 사용 중 GitHub의 DNS 적합성 결과가 false인 것만으로 인증서 갱신 실패의 단독 원인을 확정하지 않습니다.

근거 문서: [Cloudflare 버전 명령과 트리거 분리](https://developers.cloudflare.com/workers/wrangler/commands/workers/), [구조화된 Wrangler 출력](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/), [정적 파일 라우팅](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/), [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [526 오류](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-526/).
