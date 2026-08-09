import { defineConfig, devices } from "@playwright/test";
import { knownFailurePattern } from "./e2e/known-failures";

/**
 * Playwright E2E 설정 — 세금 마법사 UI 런타임 검증
 *
 * - testDir: e2e/ , spec 파일은 *.spec.ts
 * - webServer: 로컬 dev 서버를 재사용(이미 떠 있으면), 없으면 자동 기동
 *   포트는 E2E_PORT 환경변수로 오버라이드(멀티 워크트리 격리용, 기본 3000)
 * - 실패 시 스크린샷·trace 자동 수집
 *
 * 실행: npm run test:e2e  (또는 npx playwright test)
 *   다른 워크트리와 분리: E2E_PORT=3100 npx playwright test
 */
const IS_CI = !!process.env.CI;

/**
 * 🔴 **CI는 반드시 개발자 dev 서버와 다른 포트를 쓴다.**
 *
 * 원래 근거는 "CI가 self-hosted(= 개발자 Mac)에서 돈다"였는데, 2026-08-04에 GitHub 호스팅
 * 러너로 환원해 그 근거는 사라졌다(러너가 매번 깨끗한 Linux 컨테이너다).
 * **그래도 3199를 유지한다** — 로컬에서 `CI=1`로 CI를 재현할 때 3000에 떠 있는 dev 서버를
 * `reuseExistingServer`가 재사용해 **PR 코드가 아니라 로컬 작업 트리**를 테스트하는 일을
 * 막아주기 때문이다. 통과해도 아무 의미가 없는 신호다.
 */
const PORT = process.env.E2E_PORT ?? (IS_CI ? "3199" : "3000");
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  /**
   * 📌 종전 `testIgnore: E2E_SKIP_LAW`(법제처 spec 격리 스위치, 2026-08-05)는 **제거**했다
   *    — 2026-08-06에 본문 단언 5건을 fixture mock으로 돌려 격리할 이유가 없어졌다.
   *    경위는 `e2e/_helpers/law-api-mock.ts`, 실호출 감시는 `law-api-health.yml`.
   */
  fullyParallel: true,
  forbidOnly: IS_CI,
  /**
   * CI 게이트에서만 **알려진 사전존재 실패**를 제외한다(`e2e/known-failures.ts`).
   * 로컬은 제외 없이 전부 돌려 그 목록이 줄었는지 확인할 수 있게 둔다.
   * 목록에 없는 실패는 CI를 빨갛게 만든다 — 그것이 이 게이트의 목적이다.
   */
  grepInvert: IS_CI ? knownFailurePattern() : undefined,
  // 로컬·CI 모두 retries 1 — 타이밍 flaky(병렬 토스트/애니메이션 레이스) 1회 흡수.
  // 실제 실패는 재시도해도 실패(결정적) → flaky와 구분됨. (2026-06-08)
  retries: 1,
  /**
   * 🔴 **CI는 테스트 타임아웃을 60초로 올린다** (기본 30초 — 2026-08-05 실측).
   *
   * GitHub 호스팅 러너는 **2 worker**(Mac은 5)라 IndexedDB 시드처럼 브라우저 안에서
   * 도는 작업이 로컬보다 몇 배 느리다. `transfer-multi-*` 계열의 `beforeEach`
   * (`page.evaluate` → `indexedDB.open` → Dexie 스토어 생성)가 여기 걸린다.
   *
   * 실측(run 30968955696 샤드 4): 실패·flaky **10건이 전부 30.1~30.4초** —
   * 즉 "느려서 못 끝낸 것"이지 단언이 틀린 게 아니다. 8~9건은 재시도로 통과했다.
   *
   * ⚠️ 타임아웃 상향은 **단언을 약화시키지 않는다** — 틀린 결과는 60초를 줘도 틀리다.
   *    다만 진짜 성능 회귀를 늦게 알아채게 되므로, 로컬은 30초를 유지해 개발 중에
   *    느려짐이 먼저 드러나게 둔다.
   */
  timeout: IS_CI ? 60_000 : 30_000,
  reporter: [["list"], ["html", { outputFolder: "e2e/_artifacts/report", open: "never" }]],
  outputDir: "e2e/_artifacts/test-results",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // 병렬 E2E는 클라이언트 IP 헤더가 없어 전 요청이 단일 "unknown" 버킷(30회/분)을
    // 공유 → 429 flaky. 이 헤더로 calc API rate limit을 우회한다.
    // shouldBypassRateLimit()는 프로덕션에서 헤더가 있어도 항상 무시(보안 불변식).
    extraHTTPHeaders: { "x-e2e-rate-limit-bypass": "1" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    // CI는 **절대 재사용하지 않는다** — 위 PORT 주석 참조(로컬 트리 코드 테스트 방지).
    reuseExistingServer: !IS_CI,
    timeout: 120_000,
    env: {
      /**
       * 🔴 **워크트리에는 `.env.local`이 없다** — `.gitignore`가 `.env*`를 제외하므로
       * `git worktree add`로 만든 트리는 키를 물려받지 못한다. 그러면
       * `app/law/page.tsx:10`의 `Boolean(process.env.KOREAN_LAW_OC)` 게이트가 **서버 렌더
       * 단계에서** 검색창 대신 「API 키가 설정되지 않았습니다」 안내를 그린다
       * ⇒ `law-*` **12건이 「통합 검색창을 찾을 수 없음」으로 타임아웃**한다(2026-08-09 실측).
       *
       * ⚠️ **`page.route` mock으로는 못 막는다.** mock은 브라우저 요청을 가로채는데,
       *    이 게이트는 서버에서 화면을 갈라버려 검색창이 애초에 DOM에 없다.
       *
       * ⚠️ **「메인 트리에서 통과 = 코드 정상」이 아니다.** 워크트리끼리 대조하면 양쪽 다
       *    키가 없어 **둘 다 실패**한다 — 「기존 실패」로 오판하기 쉽다(실제로 오판했다).
       *
       * CI는 저장소 secret으로 실제 키를 넣는다(`ci.yml:178`). 로컬 워크트리는 실호출이
       * 목적이 아니므로 **게이트만 통과시키는 더미**로 충분하다 — 본문을 단언하는 5건은
       * 이미 fixture mock이다(`e2e/_helpers/law-api-mock.ts`).
       * 실제 키가 있으면(메인 트리·CI) **그 값을 그대로 쓴다** — 덮어쓰지 않는다.
       *
       * ⚠️ `reuseExistingServer`가 이미 뜬 서버를 재사용하면 이 env는 적용되지 않는다.
       *    그 경우 서버를 띄운 쪽 환경이 그대로 쓰인다.
       */
      KOREAN_LAW_OC: process.env.KOREAN_LAW_OC ?? "e2e-dummy-oc",
    },
  },
});
