/**
 * 상업용건물(commercial_building) 상속 취득가액 엔진정합(소령 §163⑨) end-to-end 회귀 E2E.
 *
 * 검증: 상가건물을 상속으로 취득해 양도하면, 취득가액을 "환산"이 아니라
 *   상속개시일 상증법 평가액(단일 총액)을 직접 산정한다.
 *   → 신고서 취득가액 = 상속개시일 평가액(직접), "환산취득가" 라벨은 나타나지 않는다.
 *
 * 시나리오: 양도가 5.4억 / 상속개시일 2017-09-15 / 양도 2025-06-01 /
 *   상속개시일 평가액 300,000,000 / 피상속인 취득 2010-02-02.
 *   (버그였다면 환산 135,155,041 또는 취득가 0으로 과대과세.)
 *
 * PR (fix/commercial-inheritance-acquisition) 회귀 가드.
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
          acquisitionDate: "2017-09-15", // 상속개시일 (≥1985 → post-deemed)
          decedentAcquisitionDate: "2010-02-02", // 피상속인 취득일 (상속 필수)
          inheritanceStartDate: "2017-09-15",
          inheritanceAssetKind: "land", // 상가 default
          publishedValueAtInheritance: "300000000", // 상속개시일 상증법 평가액
          useEstimatedAcquisition: false, // 상속 → 환산 미적용(토글 숨김)
        }],
        transferDate: "2025-06-01",
        filingDate: "2025-08-31",
        contractTotalPrice: "540000000", // 5.4억
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

test.describe("상업용건물 상속 취득가액 엔진 정합 (§163⑨ 직접 산정)", () => {
  test("상속 상가 → 취득가액 = 상속개시일 평가액 300,000,000 직접 (환산 아님)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    // 신고서 취득가액 행 = 상속개시일 평가액 300,000,000 직접.
    // (환산이면 135,155,041 등 다른 값, 버그면 0)
    await expect(
      page.getByRole("row", { name: /취득가액.*300,000,000/ }).first(),
    ).toBeVisible();

    // 환산취득가 상세 카드는 나타나지 않는다 (commercialBuildingValuationDetail 미생성).
    await expect(page.getByText("환산취득가 합계", { exact: false })).toHaveCount(0);
  });
});
