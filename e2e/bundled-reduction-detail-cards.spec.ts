/**
 * E2E: 함께양도 결과에 **감면 산출근거 카드**가 뜬다.
 *
 * ## 배경
 *
 * 일괄(bundled) 모드는 자산별로 `calculateTransferTax`를 완전히 호출해 **계산은 정상**인데,
 * `PerPropertyBreakdown` 조립 시 결과의 Detail을 버려서 산출근거가 화면에 안 나왔다.
 * 감면 금액은 세액에 반영되므로 "감면" 배지는 뜨는데 **왜 그 금액인지 볼 수 없는** 상태였다.
 *
 * 정정: `pickReductionDetails()`가 감면·취득가액 상세 24종을 자산별 breakdown으로 옮기고,
 * `BundledAllocationCard`의 `PropertyCard`가 단건과 **같은 `ReductionDetailCards`**를 렌더한다.
 *
 * 실행: npx playwright test e2e/bundled-reduction-detail-cards.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 주택 1건 + 자경농지(조특법 §69 감면) 1건 함께양도. */
const house = {
  ...makeDefaultAsset(1),
  assetKind: "housing",
  acquisitionDate: "2009-03-01",
  fixedAcquisitionPrice: "300000000",
  standardPriceAtTransfer: "400000000",
  actualSalePrice: "500000000",
};

const farmland = {
  ...makeDefaultAsset(2),
  assetKind: "land",
  assetLabel: "농지(밭)",
  acquisitionDate: "2005-04-07",
  fixedAcquisitionPrice: "100000000",
  standardPriceAtTransfer: "200000000",
  actualSalePrice: "300000000",
  landNature: "standalone",
  reductions: [{ type: "self_farming", farmingYears: "18" }],
};

test.describe("함께양도 — 감면 산출근거 카드", () => {
  test("자경농지 감면 자산 카드에 산출근거가 표시된다", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(
      (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
      {
        state: {
          formData: {
            assets: [house, farmland],
            transferDate: "2024-03-01",
            filingDate: "2024-05-31",
            contractTotalPrice: "800000000",
            householdHousingCount: "2",
            houses: [],
            presaleRights: [],
          },
          pendingMigration: false,
        },
        version: 0,
      },
    );
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }

    const rp = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await rp;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");

    // 엔진: 감면 상세가 자산별 결과에 실렸는가 (표시의 전제)
    const withDetail = body.data.aggregated.properties.find(
      (p: { selfFarmingReductionDetail?: unknown }) => p.selfFarmingReductionDetail,
    );
    expect(withDetail, "감면 상세가 자산별 결과에 실려야 한다").toBeDefined();

    // 화면: 산출근거 카드가 실제로 렌더되는가 (배지만 뜨던 종전 상태와의 차이)
    await expect(
      page.getByText(/자경농지/).first(),
      "감면 산출근거 카드가 화면에 나와야 한다",
    ).toBeVisible({ timeout: 15_000 });
  });
});
