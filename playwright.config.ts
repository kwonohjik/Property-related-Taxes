import { defineConfig, devices } from "@playwright/test";

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
const PORT = process.env.E2E_PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 로컬·CI 모두 retries 1 — 타이밍 flaky(병렬 토스트/애니메이션 레이스) 1회 흡수.
  // 실제 실패는 재시도해도 실패(결정적) → flaky와 구분됨. (2026-06-08)
  retries: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e/_artifacts/report", open: "never" }]],
  outputDir: "e2e/_artifacts/test-results",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
