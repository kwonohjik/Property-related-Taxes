/**
 * E2E: 주식 이월과세 §97의2① — **lot 판 ①2호·①3호**가 브라우저에서 엔진까지 닿는가
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md §10.1
 * UI:     AcquisitionLotsMatrix (취득가액 「일자별 다건」 모드의 lot별 이월과세 입력구)
 * 엔진:   lot-allocation.ts(안분 누적) → stock-transfer-tax.ts STEP 4(필요경비 산입)
 *
 * ⚠️ **왜 브라우저까지 확인하는가** — 배선 anchor가 전부 통과했는데도 route의 명시 매핑에서
 *   조용히 필드가 사라진 적이 있다(P-8). lot 배열은 route가 통째로 넘기지만, 그 사실을
 *   **화면에서** 한 번 확인해 둔다.
 *
 * 실행: E2E_PORT=3211 npx playwright test e2e/stock-transfer-carryover-97-2-lot.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_worktree_e2e_port_isolation]]
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

/** FieldCard 라벨로 금액/숫자 입력 (자매 spec과 같은 셀렉터 규약) */
async function fillByLabel(page: Page, label: string, value: string, nth = 0) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .nth(nth)
    .fill(value);
}

test.describe("주식 이월과세 §97의2① — lot 판 필요경비", () => {
  test("L-E1: lot 증여자 자본적지출·증여세가 body → 세액까지 도달한다", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);

    // ── Step 1 — 종목·시장·대주주·일자 ──
    await page.getByPlaceholder("종목명을 입력하세요").fill("이월과세로트주식");
    // 비상장 — 소액주주도 과세된다(상장 비대주주 장내거래는 §94①3가목1) 비과세라 세액이 0이 된다)
    await page.getByRole("radio", { name: "비상장" }).first().click();

    const year = page.locator('input[type="text"][aria-label="연도"]');
    const month = page.locator('input[type="text"][aria-label="월"]');
    const day = page.locator('input[type="text"][aria-label="일"]');
    // [0] 취득일(수증일) 2025-06-01 · [1] 양도일 2025-12-01
    await year.nth(0).fill("2025");
    await month.nth(0).fill("06");
    await day.nth(0).fill("01");
    await year.nth(1).fill("2025");
    await month.nth(1).fill("12");
    await day.nth(1).fill("01");

    await fillByLabel(page, "양도 주식수", "10000");
    await fillByLabel(page, "발행주식 총수", "100000");

    // ── Step 2 — 양도·취득가액 ──
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "1000000000");

    // 취득가액 입력방식 → 일자별 다건 (AcquisitionLotsMatrix 활성)
    await page.getByText("일자별 다건", { exact: true }).click();

    // lot #1 취득원인 → 이월과세(증여)
    await page.locator('[data-slot="field-card"]').filter({ hasText: "취득원인" }).first()
      .locator('[role="combobox"], button').first().click();
    await page.getByRole("option", { name: "이월과세(증여)" }).click();

    // lot 수량·단가 (증여 당시 평가액 80,000)
    await fillByLabel(page, "주식수", "10000");
    await fillByLabel(page, "1주당 단가", "80000"); // 수증일 §60~66 평가가액

    // 이월과세 lot 전용 입력 — 신규 3필드가 화면에 있어야 한다
    await expect(page.getByText("증여자 자본적지출").first()).toBeVisible();
    await fillByLabel(page, "증여자 취득가액 (1주당)", "30000");
    await fillByLabel(page, "증여자 자본적지출", "7000000");
    await fillByLabel(page, "증여세 산출세액", "100000000");
    await fillByLabel(page, "증여세 과세가액", "800000000");
    await page.getByRole("radio", { name: "배우자" }).first().click();

    // lot 매트릭스 날짜 — [0] lot 취득일(수증일) · [1] 증여자 취득일
    const y2 = page.locator('input[type="text"][aria-label="연도"]');
    const m2 = page.locator('input[type="text"][aria-label="월"]');
    const d2 = page.locator('input[type="text"][aria-label="일"]');
    await y2.nth(0).fill("2025");
    await m2.nth(0).fill("06");
    await d2.nth(0).fill("01");
    await y2.nth(1).fill("2015");
    await m2.nth(1).fill("03");
    await d2.nth(1).fill("01");

    // ── Step 3 — 필요경비·신고 ──
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2026");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("02");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("28");

    // ── 계산 ──
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.ok()).toBeTruthy();

    // ⑬ request body — lot 신규 3필드가 실제로 실렸는가
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    const lot = reqBody.acquisitionLots[0];
    expect(lot.acquisitionCause).toBe("carryover_gift");
    expect(lot.donorAcquisitionPrice).toBe(30_000);
    expect(lot.donorCapitalExpenditure).toBe(7_000_000);
    expect(lot.donorGiftTaxAmount).toBe(100_000_000);
    expect(lot.donorGiftTaxableValue).toBe(800_000_000);

    // ⑭ 엔진까지 — 안분·산입이 실제로 일어났는가
    const json = await resp.json();
    expect(json.result.lotMatchingDetail.carryoverDonorCapex).toBe(7_000_000);
    // 전량 매도 · 증여 주식가액 8억 = 과세가액 → 비율 1 → 산출세액 전액
    expect(json.result.lotMatchingDetail.carryoverGiftTaxApportioned).toBe(100_000_000);
    expect(json.result.expenses).toBe(107_000_000);
    expect(json.result.acquisitionPrice).toBe(300_000_000);
    expect(json.result.transferIncome).toBe(593_000_000);

    // ⑦ A/B 비교 카드가 화면에 뜬다
    await expect(
      page.getByText("§97의2① 이월과세 — 적용 / 미적용 비교"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("증여자 자본적지출 산입 (①2호)")).toBeVisible();
    await expect(page.getByText("증여세 상당액 산입 (①3호)")).toBeVisible();
  });
});
