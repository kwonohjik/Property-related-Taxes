/**
 * 상가건물 상속 §163⑨2호 (pre-disclosure) max(상증법 평가액, §164⑥ 취득당시 기준시가) E2E 회귀 가드.
 *
 * 검증: 상가 기준시가 최초고시(2005-01-01) 전 상속 상가 + §164⑥ 3시점 입력 시,
 *   취득가액 = max(상속개시일 상증법 평가액, §164⑥ 취득당시 기준시가 P_A).
 *   상증법 평가액 100,000,000 < P_A 119,607,326 → 취득가액 = 119,607,326.
 *
 * 시나리오: 양도가 5.4억 / 상속개시일 2000-12-07(<2005) / 양도 2025-06-01 /
 *   상증법 평가액 100,000,000 / §164⑥ 입력(case-29): 연면적 69.52·대지 12.57·
 *   최초고시 호별고시가 3,000,000·개공지 취득 3,978,096/최초 11,060,632·건물기준 취득 69,602,660/최초 69,527,856
 *   → P_A = 119,607,326.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "commercial_building",
          acquisitionCause: "inheritance",
          acquisitionDate: "2000-12-07", // 상속개시일 (>1985 post-deemed, <2005 pre-disclosure)
          decedentAcquisitionDate: "1995-01-01",
          inheritanceStartDate: "2000-12-07",
          inheritanceAssetKind: "land",
          publishedValueAtInheritance: "100000000", // 상증법 평가액 (< P_A)
          useEstimatedAcquisition: false,
          // §164⑥ 취득당시 기준시가 입력 (case-29 → P_A 119,607,326)
          cbExclusiveArea: "36",
          cbSharedArea: "33.52",
          cbLandArea: "12.57",
          cbUnitPriceAtFirstOrAcq: "3000000",
          cbLandPricePerSqmAtAcq: "3978096",
          cbLandPricePerSqmAtFirst: "11060632",
          cbBuildingStdPriceAtAcq: "69602660",
          cbBuildingStdPriceAtFirst: "69527856",
          // 상속개시 2000년 → §164⑥ 단서(나목 가액 부재) 구간. 준용 산정 확인 필수.
          cbAcqBuildingStdBy164_5: true,
        }],
        transferDate: "2025-06-01",
        filingDate: "2025-08-31",
        contractTotalPrice: "540000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("상가 상속 §163⑨2호 max(상증법, §164⑥)", () => {
  test("pre-disclosure 상가 상속 → 취득가액 = §164⑥ P_A 119,607,326 (상증법 100M보다 큼)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    // 신고서 취득가액 행 = max(상증법 100,000,000, §164⑥ P_A 119,607,326) = 119,607,326.
    await expect(
      page.getByRole("row", { name: /취득가액.*119,607,326/ }).first(),
    ).toBeVisible();

    // 환산취득가(§176의2②2호) 카드는 나타나지 않는다 (§164⑥은 취득당시 기준시가 max, 환산 아님).
    await expect(page.getByText("환산취득가 합계", { exact: false })).toHaveCount(0);
  });
});
