# Friends enhancement expenses

## 현재 남은 작업

기능 코드와 격리된 회귀 테스트를 완료했습니다. 2026-09-07 실제 제작자 계정의 넥슨 프렌즈 로그인과 9월 5~7일 이력 800건 조회를 운영 사이트에서 확인했습니다. 새로고침 후 연결 유지, 세 종류의 이력 구분, 재조회 시 추가 0건, 확정 전 지출 통계 미반영도 확인했습니다. 토큰 만료 후 갱신과 실제 연결 해제는 이번 운영 검증에서 실행하지 않았습니다.

1. Cloudflare Worker의 새 코드와 세션 저장소 배포를 완료했습니다. 기존 장부 저장소는 유지했습니다.
2. 넥슨 프렌즈 애플리케이션의 Secret Key가 Worker의 `NEXON_CLIENT_SECRET` **비밀 변수**로 등록된 것을 확인했습니다. 비밀키 값은 열람하지 않았습니다. 키를 채팅에 보내거나 사이트의 개인 API 키 입력란에 넣으면 안 됩니다.
3. 웹 코드 배포와 제작자 계정 로그인·이력 조회를 확인했습니다. 검수 캡처를 위해 기존 지출을 확정하거나 삭제하지 않았고, 연결은 유지했습니다.
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
- Recognized item cubes are auto-filled with the same-level, before-grade meso
  reset equivalent, explicitly labeled as a comparison value, not their purchase
  price. A separate actual-meso confirmation is required before recording it as
  spending. Cash/free cubes can be excluded; saved manual prices remain intact.
- Meso resets and item cubes have separate tabs, totals, method labels and
  timestamped history (20 events per page). Adversary and Karma cube variants
  retain their full names; their equivalent never becomes actual spending by itself.
- Potential type labels with the reset suffix are normalized before choosing the
  normal/additional before-grade array. Old missing-grade events can be re-fetched
  for their date from the detail panel. The same event IDs are merged in place,
  preserving manual rates and confirmed amounts, including across stale snapshots.
- The local icon catalog includes all 36 Destiny weapons and 47 Astra secondary
  types in KMS as of 2026-09-07, as well as existing accessories. Original image
  provenance is recorded in `assets/enhancements/SOURCES.json`. Run
  `node scripts/fetch-enhancement-icons.mjs` to restore missing files. Missing
  icons use the unavailable-image asset, never a different item's art.
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
- Nexon's nested `?page=home?code=...` callback is normalized before decoding,
  preserving escaped code characters. Missing, conflicting or expired state is
  rejected. Callback errors remain visible after switching to the expense page.
- Worker requests use `redirect: 'manual'` and explicitly reject 3xx responses.
  The deployed compatibility runtime rejects `redirect: 'error'` before making
  a request; this was reproduced with a credential-free workerd probe. Tokens
  and secrets are never forwarded to a redirect target. Diagnostics expose only
  fixed stage names, HTTP status and allowlisted Nexon error identifiers.
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
prove that Nexon approved the app. A separate production check on 2026-09-07
successfully connected the creator account and imported 463 Star Force events,
306 meso resets and 31 cube uses. Reload retained the connection; repeating the
same date range added zero events, and unconfirmed imports did not affect spending.
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
