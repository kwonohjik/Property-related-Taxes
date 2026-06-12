/**
 * E2E: 거래정지·관리종목 §165③ 활성화 UI 통합 검증
 *
 * 설계: docs/02-design/features/stock-transfer-trading-halt-165-3.ui.design.md §5
 * 엔진: lib/tax-engine/stock-transfer/stock-transfer-tax.ts (거래정지우회 분기)
 * UI:   Step2 거래정지 토글(이동·활성) + EstimatedUnlistedBlock simpleOnly
 *
 * E-1: kosdaq·환산모드 → 거래정지 토글 노출(§163⑨ 블록 앞)
 * E-2: 토글 ON → §163⑨ 블록 숨김 + 비상장 평가 폼 노출 + 모드 라디오 비노출(simpleOnly)
 * E-3: 토글 ON + 평가 입력 + 계산 → 결과 환산취득가 25,000,000 (A-TH-1 동일 입력)
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-trading-halt.spec.ts
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 */

import { test, expect, type Page } from "@playwright/test";

const HALT_TOGGLE_TITLE = "양도일 거래정지·관리종목 지정 (소령 §165③)";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** Step1 — kosdaq (취득 2024-03-15 / 양도 2025-02-26) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제거래정지주식");
  await page.getByRole("radio", { name: "코스닥" }).first().click();

  const yearInputs = page.locator('input[type="text"][aria-label="연도"]');
  const monthInputs = page.locator('input[type="text"][aria-label="월"]');
  const dayInputs = page.locator('input[type="text"][aria-label="일"]');
  await yearInputs.nth(0).fill("2024");
  await monthInputs.nth(0).fill("03");
  await dayInputs.nth(0).fill("15");
  await yearInputs.nth(1).fill("2025");
  await monthInputs.nth(1).fill("02");
  await dayInputs.nth(1).fill("26");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("10000000");
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** Step1 → Step2 → 환산취득가 모드 선택 */
async function gotoStep2Estimated(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "50000000");
  await page.getByRole("radio", { name: "환산취득가" }).first().click();
}

test.describe("거래정지 §165③ UI", () => {
  test("E-1: kosdaq·환산모드 → 거래정지 토글 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);
    await expect(page.getByText(HALT_TOGGLE_TITLE)).toBeVisible({ timeout: 10_000 });
  });

  test("E-2: 토글 ON → 비상장 평가 폼 노출 + 모드 라디오 비노출(simpleOnly)", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);

    // 토글 제목 텍스트 클릭 (switch role 이중토글 회피)
    await page.getByText(HALT_TOGGLE_TITLE).click();

    // 비상장 보충 평가 폼 노출
    await expect(page.getByText("비상장 보충적 평가 — 시행령 §165④1")).toBeVisible({ timeout: 10_000 });
    // simpleOnly — full(V2) 모드 라디오 비노출
    await expect(page.getByText("평가액 계산")).toHaveCount(0);
    // §163⑨ 블록(취득시 1주당 기준시가) 숨김
    await expect(page.getByText("환산취득가 (시행령 §163⑨)")).toHaveCount(0);
  });

  test("E-3: 토글 ON + 평가 입력 + 계산 → 환산취득가 25,000,000", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await gotoStep2Estimated(page);
    await page.getByText(HALT_TOGGLE_TITLE).click();

    // 비상장 평가 입력 (A-TH-1 동일 — 양도 30,000/10,000 · 취득 15,000/5,000)
    // 라벨 "1주당 순손익가치/순자산가치"가 양도·취득 2섹션 공통 → nth(0)=양도, nth(1)=취득
    // (거래정지 ON이라 §163⑨·PostListing 숨김 → 해당 라벨은 비상장 평가 4필드만)
    const ni = page.locator(`div:has(> label:has-text('1주당 순손익가치')) input[type="text"]`);
    const na = page.locator(`div:has(> label:has-text('1주당 순자산가치')) input[type="text"]`);
    await ni.nth(0).fill("30000"); // 양도일 직전
    await na.nth(0).fill("10000");
    await ni.nth(1).fill("15000"); // 취득일 직전
    await na.nth(1).fill("5000");

    // Step2 → Step3
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });

    // 신고일 (Step3 유일 DateInput)
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("08");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("31");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();
    const json = await resp.json();
    expect(json.result.acquisitionPrice).toBe(25_000_000);
    expect(json.result.appliedRules).toContain("거래정지우회");
  });
});
