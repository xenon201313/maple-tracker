# Friends enhancement expenses

## 현재 남은 작업

기능 코드와 가상 데이터 테스트를 완료했습니다. 2026-09-07 서버를 배포했고, 비밀 변수와 세션 저장소 연결, 상태 응답, 로그인 요청 생성 및 잘못된 요청 차단을 운영 서버에서 확인했습니다. 실제 넥슨 계정 로그인과 이력 조회는 별도 확인이 필요합니다.

1. Cloudflare Worker의 새 코드와 세션 저장소 배포를 완료했습니다. 기존 장부 저장소는 유지했습니다.
2. 넥슨 프렌즈 애플리케이션의 Secret Key가 Worker의 `NEXON_CLIENT_SECRET` **비밀 변수**로 등록된 것을 확인했습니다. 비밀키 값은 열람하지 않았습니다. 키를 채팅에 보내거나 사이트의 개인 API 키 입력란에 넣으면 안 됩니다.
3. 웹 코드를 배포하고 제작자 계정으로 로그인·이력 조회·연결 해제를 확인합니다.
4. 일반 사용자에게 공개하려면 현재 '대기' 상태인 넥슨 애플리케이션 검수를 진행해야 합니다.

기존 등록 API 키 방식은 프렌즈 서버 설정 없이도 사용할 수 있습니다. 추정 금액은 '지출 확정' 전까지 통계에 포함되지 않습니다.

## Verified application settings

- Client ID: `94027613-24a9-4bab-9c74-c5d4ae55bf5e` (public identifier).
- Existing redirect URI: `https://maple-trackers.com/?page=home`.
- Authorization scopes match the existing application registration: `maplestory.characterlist,maplestory.starforce,maplestory.potential,maplestory.scheduler,maplestory.cube`.
- Live verification found that Nexon rejects a subset of the registered scopes with an invalid-request dialog. The registered set opens the normal login screen with the same Client ID, redirect and state. Application permissions were not changed.
- Star Force, potential and cube histories are fetched. Character-list and scheduler paths remain blocked on the history route. The consent scope is disclosed in the expense page and privacy notice.
- On 2026-09-07 the review screen showed `대기`. Test with the creator/registered testers before requesting production review.

## Server setup

The GitHub Pages site cannot securely exchange OAuth codes by itself. The existing
Cloudflare Worker now delegates `/v1/friends/*` to a separate Durable Object session
store. This does not replace the existing encrypted ledger sync KV namespace.

1. Deploy the updated Worker with its Durable Object binding and migration:

   ```powershell
   npx wrangler@4.129.0 deploy --config cloudflare-worker/wrangler.toml
   ```

2. Set the application's Secret Key as a **Worker secret**, using the interactive
   prompt or Cloudflare dashboard. Never paste it into chat, source code, a URL,
   GitHub, or the site's API-key field:

   ```powershell
   npx wrangler@4.129.0 secret put NEXON_CLIENT_SECRET --config cloudflare-worker/wrangler.toml
   ```

3. Publish the web changes, including both JavaScript files, CSS, and the official
   login image under `assets/`. Until server configuration is ready, the login
   control remains disabled and the existing personal API-key collector remains
   available. The Client ID is not a personal API key.
4. On `https://maple-trackers.com/?page=expense`, select Friends and log in as the
   creator. Verify consent, redirect, history import, token refresh and disconnect.
   Localhost and Android are intentionally not authorized for Friends OAuth in
   this version; they can use the existing personal-key path.
5. Submit the functioning integration and screenshots for Nexon production review.
   This change does not submit the review or change application permissions.

## Accounting behavior

- Import is opt-in; automatic refresh runs only on the visible expense page and
  only after its checkbox is selected. It refreshes the last two KST dates at most
  once every five minutes. Manual imports are limited to seven days per request.
- The API supplies **history, not actual spent mesos**. No estimate enters
  statistics until the user explicitly confirms a final amount.
- Potential: official base-cost tables, equipment level, and **before** grade.
  Discounts, alternate currencies and three-at-once resets need review. Unknown
  types/grades/levels or multi-result structures are not treated as free.
- Star Force: resolve level from the known equipment catalog or a date/item-specific
  override. Apply the KMS cost formula at the event timestamp, including the
  2024-01-25 reduction and 2025-03-20 expansion. Event discounts are restricted to
  their recorded star range; safeguard surcharges are not discounted. MVP/PC
  adjustments are optional and only apply below 17 stars. Unknown equipment,
  superior items and special scrolls require review. Restoration and equipment
  purchases are separate. Existing manual rate keys remain stable.
- Pending events are displayed by date, character and item, with stage/grade
  details collapsed. Settings are additive, mergeable profiles. Confirmed or
  excluded event references and amounts are never replaced by new estimates.
- Item cubes show usage counts, not an invented meso price. Only a user-confirmed
  meso purchase cost becomes an expense. Cash and free cubes can be excluded.
- Known accessory icons are unchanged official Nexon PNGs, stored locally. Missing
  icons use the existing unavailable-image asset, never a different item's art.
- Confirmation creates an isolated enhancement batch. Existing manual expenses,
  profits, hunting sessions, drops and settings are not rewritten. Confirmed
  batches are projected into existing profit totals once, in every view.
- Same-date manual enhancement costs trigger a duplicate warning. Re-fetching,
  changing auth method, cloud merge, old backups and simultaneous confirmations
  cannot silently charge the same source events twice. Conflicting confirmations
  remain visible as review-needed, rather than both being counted.
- Cancelled/excluded batches retain event references, preventing resurrection on
  the next import. Raw imported events remain in JSON backups.

## Security

- Nexon tokens and Client Secret are server-only. No tokens are returned to the
  browser, logged, exported or included in encrypted ledger snapshots.
- A browser-generated random proof is hashed into the server's pending login.
  Callback `state` and proof are checked, then consumed once before code exchange.
  A rejected/failed exchange needs a new login.
- The browser holds only a random, tab-scoped service-session proof. Requests are
  HTTPS JSON POSTs to allowlisted routes from the exact production origin.
- The provider URL, callback URI, scopes and allowed history paths are fixed.
  OAuth query parameters are stripped before third-party page scripts execute.
- Token rotation is serialized in a Durable Object. Sessions expire, and
  disconnect deletes the server-side credentials. Upstream errors are sanitized.

## Verification

```powershell
npm run test:enhancements
npm run test:data-safety
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:ui
```

These tests use isolated fixtures and mocked Nexon responses. They do **not**
prove that the configured Secret Key is valid for a real Nexon login or that Nexon approved the app.
Wrangler 4.129.0 deployed the Worker on 2026-09-07, retaining the existing DATA KV
binding and adding the FRIENDS_SESSIONS Durable Object binding. Production checks
passed for health, secret/binding readiness, origin rejection, OAuth session creation,
and invalid-proof rejection. No existing ledger data was accessed by these checks.

## Official references

- [Friends history schemas](https://openapi.nexon.com/ko/friends/maplestory/?id=35)
- [OAuth and server-only token guidance](https://openapi.nexon.com/ko/open-id/development-guide/)
- [Login button assets and design rules](https://openapi.nexon.com/ko/open-id/design-guide/)
- [Potential base costs](https://maplestory.nexon.com/news/update/737)
- [Additional potential base costs](https://maplestory.nexon.com/news/update/746)
- [Star Force expansion and safeguard costs](https://maplestory.nexon.com/news/update/767)
- [Star Force 2026 changes](https://maplestory.nexon.com/news/update/799)
- UI reference: [Star Force profile](https://chuchu.gg/starforce/profile?source=nexon), [cube profile](https://chuchu.gg/cube/profile?source=nexon). Private profiles require a separate login; only public pages and the public calculator were inspected.

The official guide's curl example includes an extra `/openid` path segment, but
its request URL and Node example agree on `https://openid.nexon.com/oauth2/token`;
this implementation follows those two matching definitions.
