/**
 * E2E: 소칙 §81④ 1호 월할 가산 UI 통합 검증 (취득 후 상장 환산)
 *
 * 설계: docs/02-design/features/stock-transfer-monthly-accrual-81-4.ui.design.md §5
 * 엔진: lib/tax-engine/stock-transfer/stock-valuation-post-listing.ts (calcAccrualMonths)
 * UI:   PostListingValuationCard (§81④ 토글 + 전전연도 펼침) · PostListingDetailCard (보정 산식)
 *
 * E-1: kosdaq·환산모드·상장 전 취득·simple 평가액 동일 → §81④ 토글 노출
 * E-2: E-1 + 토글 ON → 전전연도 펼침 필드 노출 + 계산 → 결과 카드 "월할 가산 보정" 블록
 * E-3: simple 평가액 상이 → §81④ 토글 미노출
 *
 * 실행: E2E_PORT=3100 npx playwright test e2e/stock-transfer-monthly-accrual.spec.ts
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */

import { test, expect, type Page } from "@playwright/test";

const ACCRUAL_TOGGLE_TITLE = "같은 사업연도에 취득·상장 (소칙 §81④ 1호)";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** Step1 — kosdaq 비상장→상장 종목 (취득 2024-03-15 / 양도 2025-02-26) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제상장주식");
  await page.getByRole("radio", { name: "코스닥" }).first().click();

  const yearInputs = page.locator('input[type="text"][aria-label="연도"]');
  const monthInputs = page.locator('input[type="text"][aria-label="월"]');
  const dayInputs = page.locator('input[type="text"][aria-label="일"]');
  // 취득일 nth(0)
  await yearInputs.nth(0).fill("2024");
  await monthInputs.nth(0).fill("03");
  await dayInputs.nth(0).fill("15");
  // 양도일 nth(1)
  await yearInputs.nth(1).fill("2025");
  await monthInputs.nth(1).fill("02");
  await dayInputs.nth(1).fill("26");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("5000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");
}

/** label 텍스트로 CurrencyInput 채우기 (FieldCard htmlFor 미연결 우회 — ToggleCard 숨은 checkbox 제외) */
async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

/**
 * Step2 진입 → 환산취득가 모드 → 취득 후 상장 ON → simple 평가 입력.
 * acqEqual=true 면 취득연도 평가를 상장연도와 동일하게(50,000/5,000), false면 상이하게.
 */
async function fillStep2PostListing(page: Page, acqEqual: boolean) {
  // Step1 → Step2
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  // 양도가액 — 1주당 입력 (per_share 기본 또는 total). 합계 입력 필드에 8,950×5,000
  await fillByLabel(page, "양도가액 합계", "44750000");

  // 취득가액 산정 방식 → 환산취득가
  await page.getByRole("radio", { name: "환산취득가" }).first().click();

  // 취득 후 상장 토글 ON
  const postListingSwitch = page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 후 상장" })
    .getByRole("switch")
    .first();
  await postListingSwitch.click();

  // 2026-09-02: 「환산 입력 방식」 기본 선택이 «재무제표로 계산»(full)로 바뀌었다.
  // 이 spec은 1주당 가액을 직접 넣는 흐름이므로 «평가액 직접 입력»(simple)을 명시한다.
  await page.getByText("평가액 직접 입력", { exact: true }).click();

  // §163⑨ 분모 — 1개월 종가 평균 (양도일 직전)
  await fillByLabel(page, "1개월 종가 평균", "9000");

  // 상장일 (Step2 내 유일 DateInput — nth(0))
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2024");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("10");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("20");

  // simple 모드 — 상장일 이후 1개월 종가평균 + 4 평가
  await fillByLabel(page, "상장일 이후 1개월 종가평균", "8001");
  await fillByLabel(page, "상장일 직전 사업연도 1주당 순손익가치", "50000");
  await fillByLabel(page, "상장일 직전 사업연도 1주당 순자산가치", "5000");
  await fillByLabel(page, "취득일 직전 사업연도 1주당 순손익가치", acqEqual ? "50000" : "44520");
  await fillByLabel(page, "취득일 직전 사업연도 1주당 순자산가치", acqEqual ? "5000" : "4348");
}

test.describe("§81④ 월할 가산 UI", () => {
  test("E-1: 평가액 동일 → §81④ 토글 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await fillStep2PostListing(page, true);
    await expect(page.getByText(ACCRUAL_TOGGLE_TITLE)).toBeVisible({ timeout: 10_000 });
  });

  test("E-3: 평가액 상이 → §81④ 토글 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await fillStep2PostListing(page, false);
    await expect(page.getByText(ACCRUAL_TOGGLE_TITLE)).toHaveCount(0);
  });

  test("E-2: 토글 ON → 전전연도 펼침 필드 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await fillStep2PostListing(page, true);

    // 토글이 렌더된 뒤 제목 텍스트 클릭 (label 내부 — 스위치 1회 토글)
    const accrualTitle = page.getByText(ACCRUAL_TOGGLE_TITLE);
    await expect(accrualTitle).toBeVisible({ timeout: 10_000 });
    await accrualTitle.click();

    // 펼침 — 직전사업연도 월수 필드 노출 (FieldCard label, 고유 텍스트)
    await expect(page.getByText("직전사업연도의 월수")).toBeVisible({ timeout: 10_000 });
  });
});
