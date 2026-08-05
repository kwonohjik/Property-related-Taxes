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
   * 🔴 **법제처 Open API 의존 spec은 샤딩과 공존할 수 없다** (2026-08-05 실측).
   *
   * `law-*.spec.ts` 16파일 29건은 법제처 Open API를 실제로 호출한다. CI를 4샤드로
   * 나누자 이 중 5건이 **30초~1.5분 타임아웃**으로 깨졌다 — 같은 커밋의 샤딩 전 실행
   * (run 30962003893)에서는 **전부 5~9초에 통과**했다. 샤드 4개가 같은 OC 키로 동시에
   * 두드리면서 응답이 느려지거나 막힌 것이다.
   *
   * ⇒ CI는 이 spec들을 **샤딩 job에서 빼고(`E2E_SKIP_LAW=1`) 전용 job에서 단독 실행**한다.
   *   로컬에서는 변수가 없으므로 종전대로 전부 돈다.
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
