/**
 * 일반건물(토지+건물 일괄) 환산 §97②2호 단서 swap end-to-end E2E (Phase 2 G2 배선 회귀 가드).
 *
 * 검증: 일반건물을 환산취득가 모드로 양도하면서 자본적지출+양도비(나목)가 환산 카드
 *   estimatedSide 합(가목)보다 크면, §97②2호 단서 자산총액 판정(안 A)으로 나목을 필요경비 적용.
 *   → 결과뷰에 "필요경비 swap 적용 — 소득세법 §97② 2호 단서" 표시(aggregated.swapApplied=true).
 *   반대면 본문 유지·미표시.
 *
 * 엔진 수치(115,000,000 등)는 anchor(general-building-97-2-swap.anchor.test.ts) 담당.
 * 본 스펙은 UI 배선(capex 입력 → 자산총액 swap → 결과뷰 표시)만 검증.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/general-building-97-2-swap.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 일반건물 환산 시드 (사례 31 베이스). capex 인자로 나목 크기 조절. */
function seedForm(capitalExpenditure: string, transferExpense: string) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "general_building",
          acquisitionCause: "purchase",
          acquisitionDate: "1999-05-24",
          useEstimatedAcquisition: true, // 환산취득가 모드
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
          capitalExpenditure,
          transferExpense,
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

async function seedAndCalc(page: Page, capitalExpenditure: string, transferExpense: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(capitalExpenditure, transferExpense),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

const SWAP_HEADING = "필요경비 swap 적용 — 소득세법 §97② 2호 단서";

test.describe("일반건물 환산 §97②2호 단서 swap 자산총액 (Phase 2 G2)", () => {
  test("나목(자본 8억+양도비 1천만) > 가목 → swap 발동 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, "800000000", "10000000");
    await expect(page.getByText(SWAP_HEADING, { exact: false }).first()).toBeVisible();
  });

  test("나목(1.1억) < 가목(2.69억) → 본문 유지, swap 미표시", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, "100000000", "10000000");
    await expect(page.getByText(SWAP_HEADING, { exact: false })).toHaveCount(0);
  });
});
