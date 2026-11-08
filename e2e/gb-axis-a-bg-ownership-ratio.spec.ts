/**
 * E2E — 일반건물 부담부증여 **축 A(공유 소유 — 채무는 본인 인수분)** 기준시가 모드 담보 승: 지분율이 §159에 전달된다.
 * 계획서 `docs/00-pm/gb-axis-a-bg-ownership-ratio.plan.md`. anchor `__tests__/api/transfer.route.gb-axis-a-bg-ratio.anchor.test.ts`와 같은 시료.
 *
 * 시료: 일반건물 · 지분 50%(나머지 타인) · 양도시 기준시가 8억 · 취득시 4억 · 기준시가 모드 · 본인 인수 채무 7억 → 담보 승.
 * 오라클(손계산): C = max(8억 × 50%, 7억) = 7억 → 채무비율 1 → 취득가액 4억 × 50% = 2억 · 개산공제 3% = 600만 → 양도차익 494,000,000.
 * 종전: 증여가액 C가 지분을 줄이지 않은 8억이라 채무비율 0.875 → 양도차익 339,500,000.
 *
 * 실행(워크트리): E2E_PORT=3294 npx playwright test e2e/gb-axis-a-bg-ownership-ratio.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWizard } from "./_helpers/split-acq-display";

const gbHalf = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetId: "a", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes",
  gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false,
  gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", actualSalePrice: "1600000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "700000000", bgMortgageSetAmount: "700000000", ...over,
});
const seed = (assets: unknown[]) => ({
  state: {
    formData: {
      assets, transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "", totalTransferExpense: "0", householdHousingCount: "2",
      isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function calc(page: Page) {
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  return resP;
}

test.describe("일반건물 부담부증여 축 A × 지분율", () => {
  test("GA-E1 기준시가 담보 승: 200 · 양도차익 494,000,000 · 종전 값 339,500,000 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbHalf()]));
    const res = await calc(page);
    expect(res.status(), await res.text()).toBe(200);
    const text = page.locator("body");
    await expect(text).toContainText("부담부증여 평가 명세 (소득세법 시행령 §159)", { timeout: 60_000 });
    await expect(text).toContainText("494,000,000");
    await expect(text).not.toContainText("339,500,000");
    if (process.env.E2E_SHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/gb-axis-a-result.png`, fullPage: true });
  });

  test("GA-E2 보충 승(채무 3억): 종전과 같다 — 지분 스케일이 상쇄되는 안전망", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbHalf({ bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" })]));
    const res = await calc(page);
    expect(res.status(), await res.text()).toBe(200);
    await expect(page.locator("body")).toContainText("부담부증여 평가 명세 (소득세법 시행령 §159)", { timeout: 60_000 });
  });
});
