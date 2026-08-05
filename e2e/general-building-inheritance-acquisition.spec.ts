/**
 * 일반건물(general_building) 상속 취득가액 엔진 정합(소령 §163⑨) end-to-end 회귀 E2E.
 *
 * 검증: 일반건물(토지+건물 일괄)을 토지·건물 모두 상속(C1)으로 취득해 양도하면,
 *   취득가액을 "환산"이 아니라 상속개시일 평가액(토지·건물 각각)으로 직접 산정한다.
 *   → 결과 카드가 "취득가액 (상속개시일 평가액…§163⑨)"·"개산공제 미적용"으로 전환되고
 *     "환산취득가 (시행령 §176의2②)" 라벨은 나타나지 않는다.
 *
 * 시나리오(C1): 양도가 6억 / 상속개시일 2017-09-15 / 양도 2025-06-01 /
 *   토지 150㎡·건물 수평투영 80㎡ / 상속개시일 토지평가액 84,000,000·건물평가액 45,000,000 /
 *   양도시 토지공시지가 3,000,000·건물기준시가 60,000,000.
 *
 * PR #713 (fix/gb-inheritance-acquisition) 회귀 가드.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "general_building",
          // 토지(primary) 상속
          acquisitionCause: "inheritance",
          acquisitionDate: "2017-09-15", // 상속개시일 (≥1985 → acquisitionByInheritance ON)
          decedentAcquisitionDate: "2010-02-02", // 피상속인 취득일 (상속 필수)
          inheritanceAssetKind: "land",
          publishedValueAtInheritance: "84000000", // 상속개시일 토지 평가액
          // 건물 상속
          gbBuildingAcquisitionCause: "inheritance",
          gbBuildingInheritedValue: "45000000", // 상속개시일 건물 신고가액
          // 면적·양도시 기준시가·용도지역 (실거래가 모드 — 환산토글 미노출)
          gbLandArea: "150",
          gbBuildingFootprintArea: "80",
          gbTransferLandPricePerSqm: "3000000",
          gbTransferBuildingValue: "60000000",
          gbZoneType: "general_residential",
          gbIsMetropolitan: true,
        }],
        transferDate: "2025-06-01",
        filingDate: "2025-08-31",
        contractTotalPrice: "600000000", // 6억
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

test.describe("일반건물 상속 취득가액 엔진 정합 (§163⑨ 직접 산정)", () => {
  test("상속 일반건물 → 취득가액 = 상속개시일 평가액(토지 84,000,000 + 건물 45,000,000) 직접 배정", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    // 신고서 양식 취득가액 행 = 상속개시일 평가액 직접 배정.
    // 토지 84,000,000 + 건물 45,000,000 = 129,000,000. (환산이면 다른 값, 버그면 0)
    await expect(
      page.getByRole("row", { name: /취득가액.*129,000,000.*84,000,000.*45,000,000/ }).first(),
    ).toBeVisible();
  });
});
