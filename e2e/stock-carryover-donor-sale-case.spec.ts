/**
 * E2E: 주식 이월과세(§97의2①) × 증여자 매매사례가액 + 영 §163⑨ 수증자 평가액
 *
 * 계획서 `docs/00-pm/stock-carryover-sale-case-donor-basis.plan.md`
 *   부정 — Step 2에서 이월과세 수증자 측 「환산취득가」·「매매사례가액」이 비활성(§163⑨ · 국심2007중1761)
 *   긍정 — 1단계 「증여자 취득가액 산정 방식: 매매사례가액」으로 결과 신고서 취득가액·개산공제가
 *          증여자 기준이다 (취득가액 30,000,000 · 개산공제 50,000 — 수증자 평가액 기준이면 150,000,000)
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

function fieldCard(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label });
}

async function fillDate(scope: ReturnType<Page["locator"]>, y: string, m: string, d: string) {
  await scope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
  await scope.locator('input[type="text"][aria-label="월"]').first().fill(m);
  await scope.locator('input[type="text"][aria-label="일"]').first().fill(d);
}

test("이월과세 — 증여자 매매사례가액으로 A 취득가액·개산공제, 수증자 측은 평가액만", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  // Step1 — 비상장 · 수증일 2025-03-01 · 양도 2025-12-01
  await page.getByPlaceholder("종목명을 입력하세요").fill("이월과세테스트");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2025"); await m.nth(0).fill("03"); await d.nth(0).fill("01");
  await y.nth(1).fill("2025"); await m.nth(1).fill("12"); await d.nth(1).fill("01");
  await fieldCard(page, "양도 주식수").locator("input").first().fill("100");
  await fieldCard(page, "발행주식 총수").locator("input").first().fill("1000");

  // 이월과세(증여) — 증여자(배우자) 2015-06-01 취득
  await page.getByRole("radio", { name: /이월과세\(증여\)/ }).click();
  await fillDate(fieldCard(page, "증여자 취득일 (§104②2)"), "2015", "06", "01");
  await page.getByRole("radio", { name: "배우자" }).click();

  // 증여자 취득가액 산정 방식 — 매매사례가액 (§97의2①1호 → §97①1호 나목 · 영 §176의2③1호)
  await page.getByRole("radio", { name: "매매사례가액" }).click();
  await fieldCard(page, "증여자 취득 매매사례가액").locator("input").first().fill("300000");
  await fillDate(fieldCard(page, "매매사례 거래일"), "2015", "07", "01");
  await fieldCard(page, "증여자 취득 당시 기준시가").locator("input").first().fill("50000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  // Step2 — 부정: 수증자 측 추계 모드 비활성 + 안내 (영 §163⑨)
  await expect(page.getByTestId("gift-valuation-only-notice")).toBeVisible();
  await expect(page.getByRole("radio", { name: "환산취득가" })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "매매사례가액" })).toBeDisabled();
  // 증여자 매매사례면 분모 섹션은 없다(환산 전용)
  await expect(page.getByTestId("carryover-donor-conversion")).toHaveCount(0);

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("200000000");
  // 수증자 측 = 증여일 평가액 (B에서 쓰인다)
  // (기본 입력 방식은 「합계 직접 입력」) 1,500,000 × 100주
  await page.getByRole("textbox", { name: "취득가액 합계" }).fill("150000000");
  await expect(page.getByText(/증여일 「상속세 및 증여세법」 §60~66 평가가액 합계/)).toBeVisible();

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });
  await y.nth(0).fill("2026"); await m.nth(0).fill("02"); await d.nth(0).fill("28"); // 신고일
  await page.getByRole("button", { name: "결과 보기" }).click();

  // 결과 — A(증여자 기준) 채택: 취득가액 = 300,000 × 100주 · 개산공제 = 50,000 × 100주 × 1%
  await expect(page.getByRole("row", { name: /11\. 취득가액.*30,000,000/ }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("row", { name: /17\. 개산공제 §163⑥4.*50,000/ }).first()).toBeVisible();
  await expect(page.getByText(/적용: 증여자 취득일 전후 3개월 매매사례가액/)).toBeVisible();
});

test("이월과세 — 증여자 환산: Step 2에 분모(양도 당시 기준시가) 섹션이 서고 A가 증여자 기준으로 환산된다", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  await page.getByPlaceholder("종목명을 입력하세요").fill("이월과세환산");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2025"); await m.nth(0).fill("03"); await d.nth(0).fill("01");
  await y.nth(1).fill("2025"); await m.nth(1).fill("12"); await d.nth(1).fill("01");
  await fieldCard(page, "양도 주식수").locator("input").first().fill("100");
  await fieldCard(page, "발행주식 총수").locator("input").first().fill("1000");
  await page.getByRole("radio", { name: /이월과세\(증여\)/ }).click();
  await fillDate(fieldCard(page, "증여자 취득일 (§104②2)"), "2015", "06", "01");
  await page.getByRole("radio", { name: "배우자" }).click();
  await page.getByRole("radio", { name: "환산취득가" }).click();
  await fieldCard(page, "증여자 취득 당시 기준시가").locator("input").first().fill("50000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("200000000");
  await page.getByRole("textbox", { name: "취득가액 합계" }).fill("150000000");

  // 분모 섹션 — 비상장이라 양도연도 보충평가(영 §165④). 취득측 칸은 없다(분자는 증여자 값)
  const section = page.getByTestId("carryover-donor-conversion");
  await expect(section).toBeVisible();
  await expect(section.getByRole("textbox", { name: /취득시점/ })).toHaveCount(0);
  await section.getByRole("textbox", { name: "1주당 순손익가치", exact: true }).fill("100000");
  await section.getByRole("textbox", { name: "1주당 순자산가치", exact: true }).fill("100000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });
  await y.nth(0).fill("2026"); await m.nth(0).fill("02"); await d.nth(0).fill("28");
  await page.getByRole("button", { name: "결과 보기" }).click();

  // A 취득가액 = 200,000,000 × 50,000 / 100,000 = 100,000,000 · 개산공제 = 50,000 × 100주 × 1%
  await expect(page.getByRole("row", { name: /11\. 취득가액.*100,000,000/ }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("row", { name: /17\. 개산공제 §163⑥4.*50,000/ }).first()).toBeVisible();
});
