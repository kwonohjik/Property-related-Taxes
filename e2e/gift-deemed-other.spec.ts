import { test, expect, type Page } from "@playwright/test";

/** E2E: 증여로 보는 경우 — Phase 3 기타이익·자본거래연계·법인 (§42·§41의3·§45의5). 상세 입력은 모달 안. */

async function openDetail(page: Page, type: string) {
  await page.getByTestId(`deemed-type-${type}`).click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await dialog.getByLabel("연도").fill("2025");
  await dialog.getByLabel("월").fill("3");
  await dialog.getByLabel("일", { exact: true }).fill("15");
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("증여로 보는 경우 — 기타이익·법인", () => {
  test("§42 무상 재산사용 시가상당액 5천만 → 5천만", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "property_service_use");
    await page.getByPlaceholder("시가 상당액 (원)").fill("50000000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("50,000,000");
  });

  test("§41의3 상장이익 (정산5만−과세1만−기업5천)×2만주 → 7억", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "listing_gain");
    await page.getByPlaceholder("정산기준일 1주당 평가가액 (원)").fill("50000");
    await page.getByPlaceholder("1주당 과세가액(취득가액) (원)").fill("10000");
    await page.getByPlaceholder("1주당 기업가치 실질증가이익 (원)").fill("5000");
    await page.getByPlaceholder("증여·유상취득 주식수").fill("20000");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("700,000,000");
  });

  test("§45의5 특정법인 (거래10억−법인세2억)×50% → 4억 + 증여세 연결", async ({ page }) => {
    await page.goto("/calc/gift-deemed");
    await openDetail(page, "specific_corp");
    await page.getByPlaceholder("거래이익 (원)").fill("1000000000");
    await page.getByPlaceholder("법인세 상당액 (원)").fill("200000000");
    await page.getByPlaceholder("지배주주등 지분율").fill("50");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("400,000,000");
    await page.getByTestId("deemed-to-wizard").click();
    await expect(page).toHaveURL(/\/calc\/gift-tax/);
  });
});
