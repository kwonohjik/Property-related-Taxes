/**
 * E2E: 주식 매매사례가액 — ① 양도 매매사례가액 입력 제거 · ② 취득 개산공제 기준시가 입력
 *
 * 계획서 `docs/00-pm/stock-sale-case-transfer-priority-and-deduction.plan.md`
 *   ① 양도가액은 실지거래가액(소득세법 §96①) — 「양도 매매사례가액」 카드가 없다
 *   ② 매매사례 취득은 필요경비 = 취득가액 + 취득 당시 기준시가 × 1% (§97②2호 본문 · 영 §163⑥4)
 *      → 취득연도 순손익·순자산(§165④) 입력 칸이 선다 (부정 ① 과 긍정 ② 를 한 spec 에서 짝으로 고정)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_negative_anchor_needs_positive_twin]]
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

test("매매사례가액 — 양도 사례 카드는 없고, 취득 기준시가 입력으로 개산공제가 선다", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  // Step1 — 비상장
  await page.getByPlaceholder("종목명을 입력하세요").fill("매매사례테스트");
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

  // Step2 — 양도가액은 실가 입력 칸 하나
  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("500000000");

  // 매매사례가액 모드
  await page.getByRole("radio", { name: "매매사례가액" }).first().click();

  // 부정 — 양도 매매사례가액 카드·안내가 없다 (§96①)
  await expect(page.getByText("양도 매매사례가액")).toHaveCount(0);
  await expect(page.getByText(/1주당 양도가액 대신 우선 적용/)).toHaveCount(0);

  // 긍정 — 취득 매매사례 카드 + 취득 당시 기준시가 카드(개산공제 기준)
  await expect(page.getByText(/취득 매매사례가액/).first()).toBeVisible();
  await expect(page.getByText(/취득 당시 기준시가 — 개산공제 기준/)).toBeVisible();
  await page.getByRole("textbox", { name: "1주당 취득 매매사례가액" }).fill("40000");
  // 취득측만 선다 — 양도 당시 칸(순손익가치·순자산가치 «양도시점»)은 이 모드에 없다 (probe 2026-10-02)
  await page.getByRole("textbox", { name: "1주당 순손익가치 (취득시점)", exact: true }).fill("10000");
  await page.getByRole("textbox", { name: "1주당 순자산가치 (취득시점)", exact: true }).fill("10000");
  await expect(page.getByRole("textbox", { name: /양도시점/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });
  // Step3 안내 — 기준시가 입력이 있으니 「자동 적용」 문구가 사실이다
  await expect(page.getByText(/개산공제 자동 적용/)).toBeVisible();

  // 결과 — 필요경비에 개산공제(취득기준시가 × 1%)가 «실제로» 반영된다.
  // 취득가액 40,000×10,000주 = 400,000,000 · 기준시가 10,000×10,000주 × 1% = 1,000,000
  // 신고일 — validate가 요구한다 (`_helpers/stock-item-fill.ts`와 같은 칸)
  await y.nth(0).fill("2025"); await m.nth(0).fill("02"); await d.nth(0).fill("28");
  await page.getByRole("button", { name: "결과 보기" }).click();
  // 신고서 행으로 단언한다 — 필요경비(14)·개산공제(17)·양도소득금액(19)
  await expect(page.getByRole("row", { name: /14\. 필요경비 합계.*1,000,000/ }).first()).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("row", { name: /17\. 개산공제 §163⑥4 \(취득기준시가 × 1%\).*1,000,000/ }).first(),
  ).toBeVisible();
  // 양도소득금액 = 500,000,000 − 400,000,000 − 1,000,000 (필요경비 0원이면 100,000,000)
  await expect(page.getByRole("row", { name: /19\. 양도소득금액.*99,000,000/ }).first()).toBeVisible();
});
