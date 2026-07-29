/**
 * 일반건물 증축(G3) 환산 §97②2호 단서 swap E2E (Phase 2 G3 배선 회귀 가드).
 *
 * 증축(gbHasExtension) 케이스: 원건물(토지+건물1) 실가 + 증축분(건물2) 환산.
 * 자본적지출이 건물2 환산 estimatedSide보다 크면 swap 발동(transferExpense는 F1로 제외 — capex만).
 *   → 결과뷰 "필요경비 swap 적용" 표시.
 *
 * 엔진 수치는 anchor(general-building-97-2-swap.anchor.test.ts A3), API 배선은
 * general-building-swap-api-wiring.test.ts가 담당. 본 스펙은 증축 폼 end-to-end 표시만 검증.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(capitalExpenditure: string) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "general_building",
          acquisitionCause: "purchase",
          acquisitionDate: "1999-05-24",
          useEstimatedAcquisition: false, // 원건물 실가
          gbLandArea: "85",
          gbBuildingArea: "180.96",
          gbBuildingFootprintArea: "90.48",
          gbTransferLandPricePerSqm: "10830000",
          gbTransferBuildingValue: "20629440",
          gbAcqLandPricePerSqm: "2800000",
          gbAcqBuildingValue: "28144700",
          gbBuildingAcquisitionCause: "purchase",
          gbBuildingAcquisitionDate: "1999-05-24",
          gbZoneType: "commercial",
          gbIsMetropolitan: true,
          // 원건물(토지+건물1) 일괄 실가 취득
          fixedAcquisitionPrice: "300000000",
          gbBundledAcquisitionExpenses: "5000000",
          // 증축(건물2) — 환산
          gbHasExtension: true,
          gbExtensionDate: "2015-06-01",
          gbExtensionAcquisitionCause: "newConstruction",
          gbExtensionAcquisitionMode: "estimated",
          gbTransferExtensionBuildingStdPrice: "8000000",
          gbAcquisitionExtensionBuildingStdPrice: "6000000",
          capitalExpenditure,
        }],
        transferDate: "2023-02-19",
        filingDate: "2023-04-30",
        contractTotalPrice: "925000000",
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

async function seedAndCalc(page: Page, capitalExpenditure: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(capitalExpenditure),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

const SWAP_HEADING = "필요경비 swap 적용 — 소득세법 §97② 2호 단서";

test.describe("일반건물 증축(G3) 환산 §97②2호 단서 swap", () => {
  test("자본적지출 > 증축분 가목 → swap 발동 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, "500000000");
    await expect(page.getByText(SWAP_HEADING, { exact: false }).first()).toBeVisible();
  });

  test("자본적지출 작음 → 본문 유지, swap 미표시", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, "1000000");
    await expect(page.getByText(SWAP_HEADING, { exact: false })).toHaveCount(0);
  });
});
