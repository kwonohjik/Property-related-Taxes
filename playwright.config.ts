import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 설정 — 세금 마법사 UI 런타임 검증
 *
 * - testDir: e2e/ , spec 파일은 *.spec.ts
 * - webServer: 로컬 dev 서버(3000)를 재사용(이미 떠 있으면), 없으면 자동 기동
 * - 실패 시 스크린샷·trace 자동 수집
 *
 * 실행: npm run test:e2e  (또는 npx playwright test)
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "e2e/_artifacts/report", open: "never" }]],
  outputDir: "e2e/_artifacts/test-results",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
