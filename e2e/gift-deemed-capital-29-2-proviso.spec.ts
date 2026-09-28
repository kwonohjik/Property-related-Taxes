import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: 「상증령」§29② 본문 단서 — 증자 전 1주당 가액 0(결손법인)이 화면에서 엔진까지 닿는가.
 * 종전에는 ⑧이 0을 「미입력」으로 막아 두 경로 모두 계산 버튼에서 멈췄다.
 * 엔진 규칙은 `__tests__/tax-engine/gift-deemed/capital-increase-29-2-proviso.anchor.test.ts`.
 */

async function openCapitalIncrease(page: Page) {
  await page.goto("/calc/gift-deemed");
  await page.getByTestId("deemed-type-capital_increase").click();
  const gd = page.getByTestId("deemed-detail-dialog").getByTestId("deemed-gift-date");
  await gd.getByLabel("연도").fill("2025");
  await gd.getByLabel("월").fill("3");
  await gd.getByLabel("일", { exact: true }).fill("15");
}

test.describe("§39 증자 — 「상증령」§29② 단서 · 증자 전 1주당 가액 0", () => {
  test("결손법인 고가증자 — 증자 전 0 · 인수가 90,000 → 증자 후 15,000 × 24,000주 = 1,800,000,000", async ({ page }) => {
    await openCapitalIncrease(page);
    await page.getByTestId("ci-direction-high").click();
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("0");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("1000000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("90000");
    await page.getByPlaceholder("증자 주식수").fill("200000");
    await page.getByPlaceholder("배정받은 실권주수").fill("24000");
    await page.getByPlaceholder("특수관계인이 인수한 신주수").fill("24000");
    await page.getByPlaceholder("분모 신주수").fill("24000");
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("1,800,000,000");
  });

  test("단서 영역 — 증자 전 0 · 인수가 0이면 증자 후도 0 ⇒ 이익 없음, 사유는 §29② 단서", async ({ page }) => {
    await openCapitalIncrease(page);
    await page.getByLabel("증자 전 1주당 평가가액", { exact: true }).fill("0");
    await page.getByPlaceholder("증자 전 발행주식총수").fill("1000000");
    await page.getByLabel("신주 1주당 인수가액", { exact: true }).fill("0");
    await page.getByPlaceholder("증자 주식수").fill("200000");
    await page.getByPlaceholder("배정받은 실권주수").fill("24000");
    await page.getByTestId("deemed-detail-confirm").click();
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-exclusion")).toContainText("§29② 단서");
  });
});
