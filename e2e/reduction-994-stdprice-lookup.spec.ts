/**
 * §99의4 농어촌·고향주택 — 기준시가 조회형(주소 검색 → 공시가격 조회) E2E
 *
 * 검증: New994InputForm ② 가액요건의 "공시가격 조회"로 ruralHouseStdPrice(취득 당시
 *       기준시가 합계)가 자동 입력된다. (PR #813 — 계획 reduction-994-stdprice-lookup.plan.md)
 *
 * 2026-09-30 — 입력 위치가 명부 행 ⑥으로 옮겨졌다(`transfer-calc-count-exclusion-row-link.plan.md`).
 *       농어촌주택은 **그 행**이므로 주소·취득일은 행 값이고(주소 검색 칸은 숨는다), 조회도 행 지번으로 한다.
 *
 * 외부 API(/api/address/standard-price)는 mock — 정부사이트 조회는 결정적 재현 위해 mock.
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

test.describe("§99의4 농어촌주택 기준시가 조회형", () => {
  test("행 지번으로 공시가격 조회 → ruralHouseStdPrice 자동 입력", async ({ page }) => {
    // ── 외부 조회 mock ──
    await page.route("**/api/address/standard-price**", (route) =>
      route.fulfill({ json: { price: 250_000_000, priceType: "indvd_housing_price" } }),
    );

    // ── 명부 행 = 농어촌주택(지번·취득일은 행 값) → 주택 1 편집 → ⑥ 농어촌주택 ──
    await gotoTransferHoldingsStep(page, {
      houses: [otherHouse("r", "2015-03-15", { addressJibun: "서울특별시 종로구 청운동 1" })],
    });
    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await page.getByRole("dialog").getByTestId("house-row-count-exclusion-new_99_4_rural").click();
    await expect(page.getByTestId("new994-row-acq-date")).toContainText("2015-03-15");

    // ── 공시가격 조회 → ruralHouseStdPrice 자동 입력 ──
    const lookupBtn = page.getByTestId("new994-stdprice-lookup-btn");
    await expect(lookupBtn).toBeEnabled(); // 지번 채워지면 활성
    await lookupBtn.click();

    // ── 검증: 기준시가 250,000,000 반영 ──
    const priceInput = page.getByTestId("new994-stdprice-price-input").locator("input");
    await expect(priceInput).toHaveValue("250,000,000");
    // 개별주택가격 배지 노출
    await expect(page.getByTestId("new994-stdprice-pricetype-badge")).toContainText("개별주택");
  });
});
