/**
 * 일반건물 증축(G3) 환산 §97②2호 단서 swap E2E (Phase 2 G3 배선 회귀 가드).
 *
 * 증축(gbHasExtension) 케이스: 원건물(토지+건물1) 실가 + 증축분(건물2) 환산.
 *
 * 🔄 2026-10-22 E-1 Q-7 a(`docs/00-pm/gb-extension-actual-expenses.plan.md` §5.1) — 자산 단위 자본적지출은 증축분(환산)의
 *    §97②2호 단서 비교로 가지 않고 **실가 파트(토지·원건물)에 §97②1호로 가산**된다. 단서는 「자산별」 비교라 원건물 지출을
 *    증축분 나목으로 볼 근거가 없다. 종전 이 스펙은 「자본적지출 5억 > 증축분 가목 → swap 발동」을 고정했다.
 *    ⇒ 두 금액 모두 swap 표시가 없고, 상세명세서 산식에 안분 가산이 적힌다.
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
          ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
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
  test("자본적지출 5억(증축분 가목보다 큼) → swap 아님 · 실가 파트에 §97②1호 가산 (E-1 Q-7)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, "500000000");
    await expect(page.getByText(SWAP_HEADING, { exact: false })).toHaveCount(0);
    await expect(page.getByText("자본적지출·양도비 안분", { exact: false }).first()).toBeAttached();
  });

  test("자본적지출 작음 → 본문 유지, swap 미표시", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, "1000000");
    await expect(page.getByText(SWAP_HEADING, { exact: false })).toHaveCount(0);
  });
});
