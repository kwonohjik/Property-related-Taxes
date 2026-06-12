/**
 * E2E: [B-3] 진정 이동평균법 — lots-only(취득 다건·양도 단건) 통합 + 라벨 드리프트 정정
 *
 * 설계: docs/02-design/features/stock-transfer-true-moving-avg-b3.ui.design.md §5
 * 엔진: lib/tax-engine/stock-transfer/lot-allocation.ts (matchMovingAvg)
 *
 * 스코프: 교차 매도(매수-매도-매수-매도)는 분할 양도 모드(매도 다건) 필요 — 비용 과다.
 *   교차 이동평균은 anchor(MA-ENGINE-2/3)가 검증. E2E는 lots-only(MA-1형) 통합·라벨만.
 *
 * E-1: 취득 다건(a 100@10,000·b 100@20,000) + 양도 단건 200 + 이동평균법 →
 *      이동평균 = 총평균 15,000 (MA-1 불변) · method moving_avg · 라벨 정정 확인
 *
 * 실행: E2E_PORT=3200 npx playwright test e2e/stock-transfer-moving-avg.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
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

/** Step1 — kosdaq (취득 2020 / 양도 2025 / 양도 200주) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("예제이동평균주식");
  await page.getByRole("radio", { name: "코스닥" }).first().click();

  const year = page.locator('input[type="text"][aria-label="연도"]');
  const month = page.locator('input[type="text"][aria-label="월"]');
  const day = page.locator('input[type="text"][aria-label="일"]');
  await year.nth(0).fill("2020");
  await month.nth(0).fill("01");
  await day.nth(0).fill("01");
  await year.nth(1).fill("2025");
  await month.nth(1).fill("07");
  await day.nth(1).fill("01");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("200");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("10000000");
}

test.describe("B-3 진정 이동평균법", () => {
  test("E-1: lots-only·이동평균 → 총평균 15,000 (MA-1) + 라벨 정정", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    // 양도가액 합계 = 200 × 25,000 = 5,000,000
    await page.locator(`div:has(> label:has-text('양도가액 합계')) input[type="text"]`).first().fill("5000000");

    // 취득 입력방식 → 일자별 다건
    await page.getByText("일자별 다건", { exact: true }).click();
    // 산정방법 → 이동평균법 (inline 라디오 — description은 단위 레벨 검증, E2E는 통합·json)
    await page.getByText("이동평균법", { exact: true }).click();

    // 매수 #2 행 추가
    await page.getByRole("button", { name: /매수 행 추가/ }).click();

    const year = page.locator('input[type="text"][aria-label="연도"]');
    const month = page.locator('input[type="text"][aria-label="월"]');
    const day = page.locator('input[type="text"][aria-label="일"]');
    await year.nth(0).fill("2020");
    await month.nth(0).fill("01");
    await day.nth(0).fill("01");
    await year.nth(1).fill("2023");
    await month.nth(1).fill("01");
    await day.nth(1).fill("01");

    const shareInputs = page.locator(`div:has(> label:has-text('주식수')) input[type="text"]`);
    await shareInputs.nth(0).fill("100");
    await shareInputs.nth(1).fill("100");

    const priceInputs = page.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`);
    await priceInputs.nth(0).fill("10000");
    await priceInputs.nth(1).fill("20000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });

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
    // 양도 단건 200주 → 이동평균 = 총평균 (100×10K + 100×20K)/200 = 15,000
    expect(json.result.lotMatchingDetail.method).toBe("moving_avg");
    expect(json.result.lotMatchingDetail.weightedAvgPerShare).toBe(15_000);
    expect(json.result.acquisitionPrice).toBe(3_000_000);
  });
});
