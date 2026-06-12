/**
 * E2E: [B-4] §165⑨ 본체 — 비상장 환산 양도·취득 기준시가 동일 시 §81④ 1호 월할 보정
 *
 * 설계: docs/02-design/features/stock-transfer-165-9-main-b4.ui.design.md §5
 * 엔진: lib/tax-engine/stock-transfer/stock-valuation-unlisted.ts (§165⑨ 본체 분기)
 *
 * E-1: 비상장 환산 + 양도·취득연도 평가 동일 → §165⑨ 토글 노출 → ON + 전전연도 입력 + 계산
 *      → section1659Detail.adjusted 120,833 (B4-ENGINE-2 동일 입력) + body strip 부재(⑫⑬⑭)
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-165-9-main.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */

import { test, expect, type Page } from "@playwright/test";

const ACCRUAL_TOGGLE_TITLE = "같은 사업연도에 취득·양도 (소칙 §81④ 1호)";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** Step1 — 비상장 1,000주 (취득 2024-01-15 / 양도 2024-06-01 = 동일 사업연도) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제동일사업연도주식");
  await page.getByRole("radio", { name: "비상장" }).first().click();

  const yearInputs = page.locator('input[type="text"][aria-label="연도"]');
  const monthInputs = page.locator('input[type="text"][aria-label="월"]');
  const dayInputs = page.locator('input[type="text"][aria-label="일"]');
  await yearInputs.nth(0).fill("2024");
  await monthInputs.nth(0).fill("01");
  await dayInputs.nth(0).fill("15");
  await yearInputs.nth(1).fill("2024");
  await monthInputs.nth(1).fill("06");
  await dayInputs.nth(1).fill("01");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("10000");
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

test.describe("B-4 §165⑨ 본체 — 비상장 동일 기준시가 §81④ 1호", () => {
  test("E-1: 동일 평가 → 토글 노출 → ON + 전전입력 → adjusted 120,833", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    // Step1 → Step2 → 환산취득가 모드
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "200000000");
    await page.getByRole("radio", { name: "환산취득가" }).first().click();

    // 양도연도 = 취득연도 평가 동일 (NI=NA=100,000 → 가중평균 100,000, 80% 하한 미발동)
    await fillByLabel(page, "1주당 순손익가치", "100000"); // .first() = 양도연도
    await fillByLabel(page, "1주당 순자산가치", "100000"); // .first() = 양도연도
    await fillByLabel(page, "1주당 순손익가치 (취득시점)", "100000");
    await fillByLabel(page, "1주당 순자산가치 (취득시점)", "100000");

    // §165⑨ 본체 토글 노출 (활성 우선 — 평가액 동일)
    await expect(page.getByText(ACCRUAL_TOGGLE_TITLE, { exact: true })).toBeVisible({ timeout: 10_000 });

    // 토글 ON → 전전연도 입력 노출
    await page.getByText(ACCRUAL_TOGGLE_TITLE, { exact: true }).click();
    await fillByLabel(page, "전전사업연도 1주당 순손익가치", "50000");
    await fillByLabel(page, "전전사업연도 1주당 순자산가치", "50000");

    // Step2 → Step3 → 신고일
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2024");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("08");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("31");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // body strip 부재 (⑫⑬⑭) — 신규 토글 + 전전연도 도달
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(reqBody.unlistedSameBizYearToggle).toBe(true);
    expect(reqBody.prePriorYearNetIncomePerShare).toBe(50000);

    const json = await resp.json();
    const d = json.result.valuationDetail.section1659Detail;
    expect(d).toBeTruthy();
    // adjusted = floor((100,000×12 + (100,000−50,000)×5)/12) = 120,833 (B4-ENGINE-2)
    expect(d.adjusted).toBe(120833);
    expect(json.result.acquisitionPrice).toBe(165517697);
    expect(json.result.appliedRules).toContain("월할가산");
  });
});
