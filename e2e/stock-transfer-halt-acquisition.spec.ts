/**
 * E2E: [C-1] 취득일 거래정지·관리종목 — 취득시 기준시가만 §165④ 보충 평가
 *
 * 설계: docs/02-design/features/stock-transfer-halt-acquisition-c1.ui.design.md §6
 * 엔진: lib/tax-engine/stock-transfer/stock-transfer-tax.ts (취득일거래정지우회 분기)
 *
 * E-1: 환산모드 → 취득일 정지 토글 노출 + ON 시 분자 입력(취득시 1주당 기준시가) 숨김
 * E-2: 토글 ON + 분모 10,000 + 취득 NI 6,000/NA 5,000 + 계산
 *      → acquisitionPrice 5,600,000 (C1-ENGINE-1 동일 입력) + body strip 부재(⑫⑬⑭)
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-halt-acquisition.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */

import { test, expect, type Page } from "@playwright/test";

const ACQ_HALT_TOGGLE_TITLE = "취득일 거래정지·관리종목 지정 (소령 §165③)";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** Step1 — kospi 1,000주 (취득 2018-01-01 / 양도 2024-06-01) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제취득정지주식");
  await page.getByRole("radio", { name: "코스피" }).first().click();

  const yearInputs = page.locator('input[type="text"][aria-label="연도"]');
  const monthInputs = page.locator('input[type="text"][aria-label="월"]');
  const dayInputs = page.locator('input[type="text"][aria-label="일"]');
  await yearInputs.nth(0).fill("2018");
  await monthInputs.nth(0).fill("01");
  await dayInputs.nth(0).fill("01");
  await yearInputs.nth(1).fill("2024");
  await monthInputs.nth(1).fill("06");
  await dayInputs.nth(1).fill("01");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("10000000");
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** Step1 → Step2 → 환산취득가 모드 */
async function gotoStep2Estimated(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "10000000");
  await page.getByRole("radio", { name: "환산취득가" }).first().click();
}

test.describe("C-1 취득일 거래정지 §165③ UI", () => {
  test("E-1: 토글 노출 + ON 시 분자 입력 숨김·취득측 보충 평가 폼 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);

    // 토글 노출 (양도일 토글과 별개 — exact 제목)
    await expect(page.getByText(ACQ_HALT_TOGGLE_TITLE, { exact: true })).toBeVisible({ timeout: 10_000 });
    // OFF 상태: 분자 입력 노출
    await expect(page.getByText("취득시 1주당 기준시가 (취득일 직전 1개월 종가평균)")).toBeVisible();

    await page.getByText(ACQ_HALT_TOGGLE_TITLE, { exact: true }).click();

    // ON: 분자 입력 숨김 + 대체 안내 + 취득연도 NI/NA 노출 (acquisitionSideOnly — 양도연도 섹션 비노출)
    await expect(page.getByText("취득시 1주당 기준시가 (취득일 직전 1개월 종가평균)")).toHaveCount(0);
    await expect(page.getByText("취득시 기준시가는 위 토글의 비상장 보충 평가로 산정됩니다", { exact: false })).toBeVisible();
    await expect(page.getByText("1주당 순손익가치 (취득시점)")).toBeVisible();
    await expect(page.getByText("1주당 순자산가치 (취득시점)")).toBeVisible();
    await expect(page.getByText("양도일 직전 사업연도 평가 (양도기준시가 산출용)")).toHaveCount(0);
    // 분모(양도시 종가평균) 입력은 유지
    await expect(page.getByText("양도시 1주당 기준시가 (양도일 직전 1개월 종가평균)")).toBeVisible();
  });

  test("E-2: 토글 ON + 입력 + 계산 → acquisitionPrice 5,600,000 (C1-ENGINE-1)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);

    await page.getByText(ACQ_HALT_TOGGLE_TITLE, { exact: true }).click();

    // 취득연도 NI/NA (토글 내 acquisitionSideOnly 블록 — (취득시점) 라벨 고유)
    await fillByLabel(page, "1주당 순손익가치 (취득시점)", "6000");
    await fillByLabel(page, "1주당 순자산가치 (취득시점)", "5000");
    // 분모 (양도시 1개월 종가평균)
    await fillByLabel(page, "양도시 1주당 기준시가", "10000");

    // Step2 → Step3
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

    // body strip 부재 증명 (⑫⑬⑭)
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(reqBody.tradingHaltAtAcquisition).toBe(true);
    expect(reqBody.acquisitionYearNetIncomePerShare).toBe(6000);

    const json = await resp.json();
    // 분자 floor((6,000×3+5,000×2)÷5)=5,600 → 환산취득가 10,000,000 × 5,600 ÷ 10,000
    expect(json.result.acquisitionPrice).toBe(5_600_000);
    expect(json.result.valuationDetail.method).toBe("halt_acquisition_conversion");
    expect(json.result.appliedRules).toContain("취득일거래정지우회");
  });
});
