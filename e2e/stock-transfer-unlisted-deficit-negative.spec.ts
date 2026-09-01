/**
 * E2E: 비상장 보충적 평가 — 결손·자본잠식(음수) 직접 입력
 *
 * 계획서: docs/00-pm/post-listing-deficit-negative-input.plan.md §9
 *
 * 시나리오:
 *   E-1: 완전재현 순손익 계산서 행 1 「각 사업연도 소득금액」에 결손(음수) 입력
 *        → 프리뷰 「17. 순손익액」이 음수로 표시된다
 *   E-2: 간이 direct 모드 1주당 순손익가치·순자산가치에 음수 입력 → 부호 보존
 *
 * 🔴 수정 전에는 `CurrencyInput`이 선행 `-`를 **차단이 아니라 조용히 제거**해
 *    결손이 같은 크기의 이익으로 뒤집혔다(1주당 기준시가 2.4배 과대).
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — 수동 확인 대체
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

async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** 카드 라벨로 입력칸 특정 (FieldCard) */
function cardInput(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label }).locator("input").first();
}

/** Step1 — 코스닥 비상장→상장 (취득 2024-03-15 / 양도 2025-02-26) */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("결손법인테스트");
  await page.getByRole("radio", { name: "코스닥" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2024");
  await m.nth(0).fill("03");
  await d.nth(0).fill("15");
  await y.nth(1).fill("2025");
  await m.nth(1).fill("02");
  await d.nth(1).fill("26");

  await cardInput(page, "양도 주식수").fill("5000");
  await cardInput(page, "발행주식 총수").fill("100000");
}

/** Step2 진입 + 환산취득가 + 취득 후 상장 토글 ON */
async function openPostListingCard(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await fillByLabel(page, "양도가액 합계", "44750000");
  await page.getByRole("radio", { name: "환산취득가" }).first().click();
  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 후 상장" })
    .getByRole("switch")
    .first()
    .click();
}

test.describe("비상장 보충적 평가 — 결손·자본잠식 음수 입력", () => {
  test("E-1: 완전재현 행 1에 결손 입력 → 프리뷰 「17. 순손익액」이 음수", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await openPostListingCard(page);

    // 완전 재현 모드 진입
    await page.getByText("완전 재현 (PDF 3개 화면)", { exact: false }).click();

    // 상장연도 열 — 행 1 각 사업연도 소득금액 = 결손 5억
    const row1 = cardInput(page, "1. 각 사업연도 소득금액");
    await expect(row1).toBeVisible({ timeout: 10_000 });
    await row1.fill("-500000000");
    // 20. 환산주식수
    await cardInput(page, "20. 환산주식수").fill("100000");

    // 프리뷰 17행이 음수로 표시된다 (수정 전에는 "500,000,000" — 부호 반전)
    await expect(page.getByText(/17\. 순손익액/).first()).toContainText("-500,000,000");
    // 🔑 행 21·24는 «0»이다 — 상증령 §56① 후단 준용(「음수인 경우에는 영으로 한다」).
    //    체인: 소법 §99①4 전단 → 상증법 §63①1나목 → 상증령 §54 → §56①.
    //    행 17(사실)은 음수 그대로, 「평가액」 단계에서만 0으로 본다.
    await expect(page.getByText(/24\. 1주당 가액/).first()).toContainText("0");
    // 하한이 발동했음을 사용자에게 알린다
    await expect(page.getByText(/1주당 순손익액이 음수이므로/)).toBeVisible();
  });

  test("E-2: 간이 direct 모드 — 순손익가치·순자산가치 음수 보존", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await openPostListingCard(page);

    // 간이(simple)가 기본 모드 — 결과값 직접 입력
    const ni = page
      .locator('div:has(> label:has-text("상장일 직전 사업연도 1주당 순손익가치"))')
      .locator("input")
      .first();
    const na = page
      .locator('div:has(> label:has-text("상장일 직전 사업연도 1주당 순자산가치"))')
      .locator("input")
      .first();

    await expect(ni).toBeVisible({ timeout: 10_000 });
    await ni.fill("-50000");
    await na.fill("-20000");

    // 블러 후 콤마 포맷 + 부호 유지 (수정 전에는 "50,000" / "20,000")
    await page.getByText("환산 산식", { exact: false }).first().click();
    await expect(ni).toHaveValue("-50,000");
    await expect(na).toHaveValue("-20,000");
  });
});
