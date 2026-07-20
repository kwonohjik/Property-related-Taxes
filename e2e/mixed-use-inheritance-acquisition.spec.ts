/**
 * 겸용주택 상속 취득가액 엔진 정합(소령 §163⑨) end-to-end 회귀 E2E.
 *
 * 검증: 겸용주택을 상속(acquisitionCause="inheritance", 취득일=상속개시일 ≥1985)으로 취득해
 *   양도하면, 취득가액을 "환산"이 아니라 상속개시일 평가액(취득시 기준시가)으로 직접 산정한다.
 *   → 결과 카드 취득가액 라벨이 "상속개시일 평가액(취득가액)"(inheritance_direct)로 전환되고
 *     "환산취득가액" 라벨은 나타나지 않는다.
 *
 * 시나리오(Pre-Do 실측 케이스 근사): 양도가 33억 / 상속개시일 2017-09-15 / 양도 2025-06-01 /
 *   주택:상가 연면적 100:100 / 상속개시일 개별주택가격 5억·상가건물 3억·공시지가 2M/㎡.
 *   (미공시 PHD 미발동 — mixedAcqHousingPrice 설정. Phase2 조합 없음.)
 *
 * PR #710 (feat/mixed-use-inheritance-acquisition) 회귀 가드.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "inheritance",
          acquisitionDate: "2017-09-15", // 상속개시일 (≥1985 → acquisitionByInheritance 게이트 ON)
          inheritanceStartDate: "2017-09-15",
          inheritanceDate: "2017-09-15",
          decedentAcquisitionDate: "2010-02-02", // 피상속인 취득일 (상속 필수 — §104②1호 단기보유 통산)
          isMixedUseHouse: true,
          residentialFloorArea: "100",
          nonResidentialFloorArea: "100",
          mixedUseTotalLandArea: "200",
          buildingFootprintArea: "100",
          // 양도시 기준시가
          mixedTransferHousingPrice: "800000000",
          mixedTransferLandPricePerSqm: "3000000",
          mixedTransferCommercialBuildingPrice: "500000000",
          // 취득시(=상속개시일) 기준시가 = 상속개시일 평가액(직접 취득가액)
          mixedAcqHousingPrice: "500000000",
          mixedAcqLandPricePerSqm: "2000000",
          mixedAcqCommercialBuildingPrice: "300000000",
          mixedIsMetropolitanArea: true,
          residenceInputMode: "interval",
          residencePeriods: [{ moveInDate: "2017-09-15", moveOutDate: "2025-06-01" }],
        }],
        transferDate: "2025-06-01",
        filingDate: "2025-08-31",
        contractTotalPrice: "3300000000", // 33억
        householdHousingCount: "1",
        isOneHousehold: true,
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

test.describe("겸용주택 상속 취득가액 엔진 정합 (§163⑨ 직접 산정)", () => {
  test("상속 겸용 → 결과 취득가액이 '상속개시일 평가액'(직접)·'환산취득가액' 라벨 부재", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    // 주택분·상가분 두 부분 모두 상속개시일 평가액(취득가액) 라벨로 전환 (inheritance_direct/phd_max)
    await expect(page.getByText("상속개시일 평가액(취득가액)")).toHaveCount(2);

    // 환산 라벨은 이 케이스에서 나타나지 않는다 (상속이 환산을 대체)
    await expect(page.getByText("주택 환산취득가액")).toHaveCount(0);
    await expect(page.getByText("상가 환산취득가액")).toHaveCount(0);
  });
});
