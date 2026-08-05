/**
 * E2E: 주식 평가 독립 도구 (/tools/stock-valuation)
 *
 * 시나리오:
 *   SV-1: 홈 메뉴 "주식 평가" 카드 → 도구 진입
 *   SV-2: 평가기준일 + 상장주식(종가평균×주식수) 입력 → 요약·합계·평가조서(갑·을) 표시
 *   SV-3: 평가 전용 — 협의분할·부담부증여 채무 섹션 미노출 (valuationOnly)
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * Plan: docs/00-pm/stock-valuation-tool.plan.md §Phase E
 */
import { test, expect, type Page } from "@playwright/test";

import { clickAndExpectUrl } from "./_helpers/navigation";
import { fillDateAndVerify, closeStockModal } from "./_helpers/tax-flow";

async function addListedStock(page: Page, avg: number, shares: number) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("상장주식", { exact: true }).click();
  const dialog = page.getByTestId("stock-edit-dialog");
  await expect(dialog).toBeVisible();
  const numeric = dialog.locator('input[inputmode="numeric"]');
  await numeric.first().fill(String(avg));
  await numeric.nth(1).fill(String(shares));
}

test.describe("SV: 주식 평가 독립 도구", () => {
  test("SV-1: 홈 카드 → 도구 진입", async ({ page }) => {
    await page.goto("/");
    await clickAndExpectUrl(page, page.getByRole("link", { name: /주식 평가/ }), /\/tools\/stock-valuation/);
    await expect(page.getByRole("heading", { name: "주식 평가" })).toBeVisible();
  });

  test("SV-2: 평가기준일 + 상장주식 입력 → 요약·합계·평가조서 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/tools/stock-valuation");
    // 평가기준일 (최상위 첫 DateInput)
    await fillDateAndVerify(page, { year: "2026", month: "6", day: "1" });
    // 상장주식 추가: 종가평균 10,000 × 100주 = 1,000,000
    await addListedStock(page, 10_000, 100);
    await closeStockModal(page);

    // 요약 결과 + 합계
    const result = page.getByTestId("stock-valuation-result");
    await expect(result).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("stock-valuation-total")).toContainText("1,000,000");

    // 평가조서(갑·을) 섹션 표시
    await expect(page.getByTestId("ls-besshi-result-section")).toBeVisible();
  });

  test("SV-3: 평가 전용 — 협의분할·부담부증여 채무 미노출", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/tools/stock-valuation");
    await fillDateAndVerify(page, { year: "2026", month: "6", day: "1" });
    await addListedStock(page, 10_000, 100);
    const dialog = page.getByTestId("stock-edit-dialog");
    // 부담부증여 채무·협의분할(상속인) 섹션 텍스트가 모달에 없어야 함
    await expect(dialog.getByText(/부담부증여 채무|채무 인수/)).toHaveCount(0);
    await expect(dialog.getByText(/협의분할/)).toHaveCount(0);
  });
});
