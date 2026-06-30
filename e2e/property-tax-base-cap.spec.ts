/**
 * 재산세 주택 과세표준상한제 (§110③) E2E
 *
 * 대상:
 * 1. 주택 당해 7억 + 직전 5억 → "과세표준상한 적용" 카드 + 과세표준 321,000,000
 * 2. 주택 당해 7억 + 직전 미입력 → 상한 카드 미표시
 * 3. 건축물 선택 → 직전연도 공시가격 입력란 미노출
 *
 * 실행: E2E_PORT=3100 npx playwright test e2e/property-tax-base-cap.spec.ts
 * (비-worktree 기본 포트 3000: npx playwright test e2e/property-tax-base-cap.spec.ts)
 */

import { test, expect, type Page } from "@playwright/test";

// 공시가격 입력 textbox 접근성 이름(probe: error-context page snapshot 확인):
//   - 당해 공시가격(StandardPriceInput, housing): name "금액 입력"
//   - 직전연도 공시가격(CurrencyInput): name "금액 입력 (원)" — DOM 첫 번째
//   - 주택 건축물 부분 시가표준액(CurrencyInput): name "금액 입력 (원)" — DOM 두 번째
// (이전 div.filter(hasText).last() 헬퍼는 조상 div까지 매칭돼 직전연도값이 건축물 필드로 잘못 들어감)

async function calcAndWait(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/property") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /재산세 계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `재산세 계산 API 비정상 ${resp.status()}`).toBe(true);
  await expect(page.getByText("총 납부세액").first()).toBeVisible({ timeout: 30_000 });
}

test.describe("재산세 주택 과세표준상한제 §110③", () => {
  test("1: 당해 7억 + 직전 5억 → 과세표준상한 적용 (3.21억)", async ({ page }) => {
    await page.goto("/calc/property-tax");

    // objectType 기본 housing. 당해 공시가격 7억 (StandardPriceInput, name "금액 입력")
    await page.getByRole("textbox", { name: "금액 입력", exact: true }).fill("700000000");
    // 직전연도 공시가격 5억 (CurrencyInput, name "금액 입력 (원)" — DOM 첫 번째)
    await page.getByRole("textbox", { name: "금액 입력 (원)" }).first().fill("500000000");

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    await expect(page.getByText(/과세표준상한 적용/)).toBeVisible();
    await expect(page.getByText("321,000,000").first()).toBeVisible();
  });

  test("2: 당해 7억 + 직전 미입력 → 상한 카드 미표시", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await page.getByRole("textbox", { name: "금액 입력", exact: true }).fill("700000000");

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    await expect(page.getByText(/과세표준상한 적용/)).toHaveCount(0);
  });

  test("3: 건축물 선택 → 직전연도 공시가격 입력란 미노출", async ({ page }) => {
    await page.goto("/calc/property-tax");
    await page.getByText("건축물 (비주거용)").click();

    await expect(page.getByText(/직전연도 공시가격/)).toHaveCount(0);
  });
});
