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
import { setStockConversionModeByTitle, conversionToggleTitle } from "./_helpers/stock-conversion";
import { fillTransferStdPrice } from "./_helpers/stock-conversion";

const ACQ_HALT_TOGGLE_TITLE = conversionToggleTitle("halt_acquisition");

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

    /*
      🔄 **S3 (2026-09-10)** — 토글이 산정 방식 라디오의 선택지가 됐다(Q-2 3안).
      「ON/OFF」가 아니라 «다른 방식 선택»이고, 분자 입력은 그 방식의 전용 섹션에 있다.
    */
    // 선택지 노출
    await expect(page.getByRole("radio", { name: /취득일 거래정지/ })).toBeVisible({ timeout: 10_000 });
    // 기본(일반) 방식: 분자 입력 노출
    await expect(page.getByText("취득시 1주당 기준시가 (취득일 이전 1개월 종가평균)")).toBeVisible();

    await setStockConversionModeByTitle(page, "halt_acquisition");

    // 전환 후: 분자 입력이 보충 평가 폼으로 대체된다 (acquisitionSideOnly — 양도연도 섹션 비노출)
    await expect(page.getByText("취득시 1주당 기준시가 (취득일 이전 1개월 종가평균)")).toHaveCount(0);
    await expect(page.getByText("1주당 순손익가치 (취득시점)")).toBeVisible();
    await expect(page.getByText("1주당 순자산가치 (취득시점)")).toBeVisible();
    await expect(page.getByText("양도일 직전 사업연도 평가 (양도기준시가 산출용)")).toHaveCount(0);
    // 🔑 분모 블록은 **항상 1곳**에 남는다 — S3의 핵심 이득
    await expect(page.getByText(/양도 당시 기준시가 \(환산비율의 분모\)/)).toBeVisible();
  });

  test("E-2: 토글 ON + 입력 + 계산 → acquisitionPrice 5,600,000 (C1-ENGINE-1)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);

    await setStockConversionModeByTitle(page, "halt_acquisition");

    // 취득연도 NI/NA (토글 내 acquisitionSideOnly 블록 — (취득시점) 라벨 고유)
    await fillByLabel(page, "1주당 순손익가치 (취득시점)", "6000");
    await fillByLabel(page, "1주당 순자산가치 (취득시점)", "5000");
    // 분모 (양도시 1개월 종가평균)
    await fillTransferStdPrice(page, "10000");

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
