/**
 * E2E — 일반건물 부담부증여 **초과부담부(채무 > 증여가액)**: 화면(⑧)이 계속 막는다 (계획서 `docs/00-pm/gb-excess-burdened-gift-guard.plan.md` V-5).
 * 이 계획의 수정은 API(⑫) 가드 1줄이라 화면은 바뀌지 않는다 — 그 사실(⑧ 차단 + 계산 요청이 나가지 않음)을 고정한다.
 *
 * 시료: 일반건물 단독 · 기준시가 모드 · 양도시 기준시가 8억(토지 ㎡당 600만 × 100㎡ + 건물 2억) · 채무 9.5억 · 채권최고액 0.
 *
 * 실행(워크트리): E2E_PORT=3296 npx playwright test e2e/gb-excess-burdened-gift-screen.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWizard } from "./_helpers/split-acq-display";

const gb = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetId: "z", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false,
  gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", actualSalePrice: "1600000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "950000000", bgMortgageSetAmount: "0", ...over,
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

test("GX-E1 일반건물 B > C: 화면이 «채무액 … 증여가액 … 초과합니다»로 막고 계산 요청을 보내지 않는다", async ({ page }) => {
  test.setTimeout(180_000);
  await seedWizard(page, seed([gb()]));
  let posted = 0;
  page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted += 1; });
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await expect(page.getByText(/증여가액.*초과합니다/).first()).toBeVisible({ timeout: 20_000 });
  expect(posted).toBe(0);
});

test("GX-E2 같은 시료에서 채무를 증여가액(8억)과 같게 하면 계산된다 — 경계 B = C", async ({ page }) => {
  test.setTimeout(180_000);
  await seedWizard(page, seed([gb({ bgMortgageDebtAmount: "800000000" })]));
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  expect((await res).status()).toBe(200);
});
