/**
 * E2E: 매매사례가액 — 취득 당시 기준시가를 「평가액 계산」(결산서 취득 열)으로 산출
 *
 * 계획서 `docs/00-pm/stock-transfer-acq-side-unlisted-full-mode.plan.md` Phase 7
 *   취득일 직전 사업연도 결산서(소득세법 시행령 §165④1호) → 1주당 기준시가 → 개산공제(영 §163⑥4)
 *   순손익 3억÷1만 주÷10% = 300,000 · 순자산 (50억−30억)÷1만 주 = 200,000
 *   → 가중평균 (300,000×3 + 200,000×2)÷5 = 260,000 → × 10,000주 × 1% = 26,000,000
 *
 * 화면(결산서 취득 열만 · 1주당 직접 입력 칸 없음) → ④ body(취득연도 값만, 양도연도 값 없음) → 결과 행까지 한 번에 본다.
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

function cardInput(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label }).locator("input").first();
}

test("매매사례가액 — 「평가액 계산」 결산서 취득 열로 개산공제 기준시가가 선다", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  // Step1 — 비상장
  await page.getByPlaceholder("종목명을 입력하세요").fill("결산서평가테스트");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2015"); await m.nth(0).fill("03"); await d.nth(0).fill("15");
  await y.nth(1).fill("2025"); await m.nth(1).fill("02"); await d.nth(1).fill("26");
  await cardInput(page, "양도 주식수").fill("10000");
  await cardInput(page, "발행주식 총수").fill("100000");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  // Step2 — 실가 양도 5억 · 매매사례 취득 40,000/주
  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("500000000");
  await page.getByRole("radio", { name: "매매사례가액" }).first().click();
  await page.getByRole("textbox", { name: "1주당 취득 매매사례가액" }).fill("40000");

  // 「평가액 계산」 선택 → 결산서 취득 열만, 1주당 직접 입력 칸은 사라진다
  await page.getByRole("radio", { name: /평가액 계산/ }).click();
  await expect(page.getByRole("textbox", { name: "1주당 순손익가치 (취득시점)", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-testid="ni-niAddRow1-EUTransfer"]')).toHaveCount(0);
  await expect(page.getByText(/장부분실 — 액면가 적용/)).toHaveCount(0);

  await page.locator('[data-testid="ni-niAddRow1-EUAcq"]').fill("300000000");
  await page.locator('[data-testid="ni-niShareCount-EUAcq"]').fill("10000");
  await page.locator('[data-testid="na-naAssetTotalRow1-EUAcq"]').fill("5000000000");
  await page.locator('[data-testid="na-naLiabTotalRow8-EUAcq"]').fill("3000000000");
  await page.locator('[data-testid="na-naShareCount-EUAcq"]').fill("10000");
  await expect(page.getByText(/취득기준시가 \(1주당\): 260,000/)).toBeVisible();

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });

  await y.nth(0).fill("2025"); await m.nth(0).fill("02"); await d.nth(0).fill("28");
  const reqPromise = page.waitForRequest(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "결과 보기" }).click();
  const body = JSON.parse((await reqPromise).postData() ?? "{}");
  expect(body.acquisitionYearNetIncomePerShare).toBe(300_000);
  expect(body.acquisitionYearNetAssetPerShare).toBe(200_000);
  expect(body).not.toHaveProperty("transferYearNetIncomePerShare");
  expect(body).not.toHaveProperty("transferYearNetAssetPerShare");

  // 결과 — 개산공제 26,000,000 · 양도소득금액 = 5억 − 4억 − 2,600만
  await expect(
    page.getByRole("row", { name: /17\. 개산공제 §163⑥4 \(취득기준시가 × 1%\).*26,000,000/ }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("row", { name: /19\. 양도소득금액.*74,000,000/ }).first()).toBeVisible();
});
