/**
 * 겸용주택 1세대1주택 비과세·표2 게이팅 버그 수정 회귀 E2E.
 *
 * 버그: Step4 "1세대 해당" 토글(form.isOneHousehold)이 겸용 엔진(primary.isOneHousehold 참조)에 반영 안 됨
 *   → 겸용 1세대1주택인데 12억 비과세 미적용 + 표1(거주공제 0). (사용자 스크린샷 재현)
 * 수정: 겸용 isOneHouseExempt를 form.isOneHousehold에서 도출.
 *
 * 시나리오: 취득 2010-03-15(비-PHD) / 양도 2022-02-16 / 거주 약 12년 / 40억 / 1세대1주택 1채.
 *   주택분 양도가액 = 40억×50% = 20억 > 12억 → 12억 비과세 + 표2(거주 ≥2년) 적용 기대.
 *   (스크린샷의 취득 1997은 개별주택가격 공시 이전이라 §164⑤ PHD 환산 발동 — 별도 필드 필요해 E2E는 비-PHD로 단순화.)
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
          acquisitionCause: "purchase",
          acquisitionDate: "2010-03-15",
          isMixedUseHouse: true,
          residentialFloorArea: "100",
          nonResidentialFloorArea: "100",
          mixedUseTotalLandArea: "200",
          buildingFootprintArea: "100",
          mixedTransferHousingPrice: "600000000",
          mixedTransferLandPricePerSqm: "5000000",
          mixedTransferCommercialBuildingPrice: "100000000",
          mixedAcqHousingPrice: "300000000",
          mixedAcqLandPricePerSqm: "2500000",
          mixedAcqCommercialBuildingPrice: "50000000",
          mixedIsMetropolitanArea: true,
          // 보유상황 거주: 취득~양도(약 12년)
          residenceInputMode: "interval",
          residencePeriods: [{ moveInDate: "2010-03-15", moveOutDate: "2022-02-16" }],
        }],
        transferDate: "2022-02-16",
        filingDate: "2022-04-30",
        // 40억 → 주택분 20억 > 12억 (비과세 + 표2 가시화)
        contractTotalPrice: "4000000000",
        householdHousingCount: "1",
        isOneHousehold: true, // Step4 "1세대 해당" 토글 ON
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

function amt(text: string): number {
  return parseInt(text.replace(/[^0-9-]/g, "") || "0", 10);
}

test.describe("겸용주택 1세대1주택 비과세·표2 (isOneHousehold 게이팅 수정)", () => {
  test("토글 ON → 12억 비과세 양도차익 > 0 + 거주 기간분 장특 > 0(표2)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    const filing = page.locator('[data-print-section="form-table"]').first();
    const cellTotal = async (rowLabel: string) => {
      const row = filing.locator("tr", { hasText: rowLabel }).first();
      return amt(await row.locator("td").nth(1).innerText()); // 합계 열
    };

    // 12억 비과세 적용 → 비과세 양도차익 합계 > 0
    expect(await cellTotal("비과세 양도차익")).toBeGreaterThan(0);
    // 표2 적용 → 거주 기간분 장특 합계 > 0
    expect(await cellTotal("거주 기간분 장특")).toBeGreaterThan(0);
  });
});
