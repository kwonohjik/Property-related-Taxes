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
   * 🔴 **법제처 Open API 의존 spec 격리 스위치** (2026-08-05).
   *
   * `law-*.spec.ts` 16파일 29건은 법제처 Open API를 실제로 호출한다. 이 중 5건
   * (POPUP-1·HTML-1·TBL-1·CITE-1·IMP-1)은 **조문 본문**이 도착해야 통과하는데,
   * CI에서 특정 시점 이후 본문이 오지 않아 30초~1.5분 타임아웃으로 깨진다.
   * 같은 시각 로컬에서는 API가 정상(0.9초)이라 **근본 원인은 미확정**이다.
   *
   * ⇒ CI는 이들을 **샤딩 job에서 빼고(`E2E_SKIP_LAW=1`) 전용 job**(`continue-on-error`)에서
   *   돌린다. 우리 코드의 신호(나머지 865건)를 외부 API 가용성이 오염시키지 않게 하는 격리다.
   *   로컬에서는 변수가 없으므로 종전대로 전부 돈다.
   *
   * ⚠️ 처음엔 "4샤드 동시 호출이 원인"이라 진단했으나 **오진**이었다 —
   *    단독 `--workers=1`로도 같은 5건이 실패한다(run 30967618223).
   */
  testIgnore: process.env.E2E_SKIP_LAW ? "**/*law-*.spec.ts" : undefined,
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
  },
});
