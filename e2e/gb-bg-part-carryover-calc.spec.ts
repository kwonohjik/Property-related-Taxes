/**
 * E2E — 일반건물 부담부증여 × 이월과세 — 「토지·건물 취득일 다름」에서 **증여받은 파트에만** §97의2를 적용해 계산한다 (PR-2 화면)
 *
 * 계획서: docs/00-pm/gb-bg-part-carryover-calc.plan.md §4.4~§4.6 · §7
 * 종전(#2571, 계획서 gb-bg-part-carryover-mismatch.plan.md): 한쪽만 이월과세면 «다음»을 막았다. 그 전에는 건물만 → 이월과세 소실(66,675,500).
 * vitest anchor: `__tests__/api/transfer.route.gb-bg-part-carryover-ui.anchor.test.ts`
 *
 * 실행(워크트리): E2E_PORT=3298 npx playwright test e2e/gb-bg-part-carryover-calc.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { calculate, seedWizard } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const asset = (n: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(n),
  assetLabel: `자산 ${n}`,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "general_building",
  acquisitionCause: "carryover_gift",
  gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2024-05-01",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2000000",
  gbTransferBuildingValue: "200000000",
  gbZoneType: "general_residential",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "100000000",
  transferType: "burdened_gift",
  transferCause: "general",
  bgValuationMode: "sangjeungbeop_market",
  bgAcquisitionMethod: "converted",
  bgMarketValueAtTransfer: "1000000000",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "500000000",
  bgMortgageSetAmount: "500000000",
  bgDonorRelation: "lineal_descendant",
  bgCoDonorLandStdPriceAtAcq: "10000000",
  bgCoDonorBuildingStdPriceAtAcq: "40000000",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2024-05-01",
    donorAcquisitionDate: "2015-01-01",
    donorAcquisitionPrice: "100000000",
    giftDateValuation: "1000000000",
    giftTaxAmount: "",
    donorRelation: "lineal",
    donorSameHousehold: "no",
  },
  ...over,
});

const seedOf = (assets: unknown[], over: Record<string, unknown> = {}) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-03-01",
      filingDate: "2026-05-31",
      contractTotalPrice: "1000000000",
      totalTransferExpense: "0",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      ...over,
    },
    pendingMigration: false,
  },
  version: 0,
});
const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100000000", giftDateValuation: "1000000000", giftTaxAmount: "", donorRelation: "lineal", donorSameHousehold: "no" };
/** 분리 ON · 토지 양도인 매매(2015) · 건물만 직계존속 증여(2024-05-01) — 화면에서 증여세 신고서 금액까지 넣은 상태. */
const buildingOnly = asset(1, {
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2015-01-01", acquisitionDate: "2024-05-01", carryover: undefined,
  buildingCarryover: { ...CO, giftTaxCalculated: "30000000", giftTaxBase: "1000000000" },
});
/** 분리 ON · 토지만 이월과세 · 건물 본인 신축(2020) · 당초 증여자 건물 기준시가 0(안내 「건물이 없으면 0」대로). 수정 前 125,113,200. */
const landOnlySelfBuilt = asset(1, {
  hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", acquisitionDate: "2020-01-01",
  gbBuildingAcquisitionCause: "newConstruction", bgCoDonorBuildingStdPriceAtAcq: "0",
});

const card = (page: Page) => page.getByTestId("gb-bg-carryover-card").first();
/** [A] 열 — 증여세 상당액 행과 같은 부모(`ScenarioCol` 본문). [B] 열도 「수증자」 꼬리표를 쓰므로 범위를 좁힌다. */
const colA = (page: Page) => card(page).getByTestId("gb-bg-carryover-gift-tax").locator("xpath=..");
const donorParts = (body: Record<string, unknown>) =>
  (body.burdenedGiftInfo as { carryoverDonorBasis?: { parts?: unknown } } | undefined)?.carryoverDonorBasis?.parts;

test.describe("일반건물 부담부증여 × 이월과세 — 토지·건물 한쪽만", () => {
  test("GBPC-E1 건물만 이월과세 → 당초 증여자 건물 칸만 · 계산된다(70,371,560) · [A] 토지는 수증자 기준", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([buildingOnly]));
    await expandAssetSection(page, 2); // 부담부증여 블록(「당초 증여자」 포함)은 ② 양도정보 안에 있다
    await expect(page.getByTestId("bg-codonor-building-std")).toBeVisible();
    await expect(page.getByTestId("bg-codonor-land-std")).toHaveCount(0);
    await expect(page.getByTestId("bg-codonor-part-note")).toContainText("건물");
    const body = await calculate(page);
    expect(donorParts(body)).toEqual({ land: false, building: true });
    expect((body.carryoverTaxation as { giftRegistryDate?: string } | undefined)?.giftRegistryDate).toBe("2024-05-01");
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("70,371,560");
    await expect(colA(page)).toContainText(/토지[^\n]*취득가액 \[수증자 기준\]/);
    await expect(colA(page)).toContainText(/건물[^\n]*취득가액 \[당초 증여자 기준\]/);
    await expect(colA(page)).toContainText("토지 보유기간 기산일 [수증자 취득일]");
    await expect(colA(page)).toContainText("건물 보유기간 기산일 [당초 증여자 취득일]");
  });

  test("GBPC-E2 토지만 이월과세 + 건물 본인 신축 → 당초 증여자 토지 칸만 · 90,758,940(종전 125,113,200)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([landOnlySelfBuilt]));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("bg-codonor-land-std")).toBeVisible();
    await expect(page.getByTestId("bg-codonor-building-std")).toHaveCount(0);
    const body = await calculate(page);
    expect(donorParts(body)).toEqual({ land: true, building: false });
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("90,758,940");
    await expect(colA(page)).toContainText("건물 보유기간 기산일 [수증자 취득일]");
    await expect(colA(page)).toContainText("토지 보유기간 기산일 [당초 증여자 취득일]");
  });

  test("GBPC-E3 건물 취득원인을 «매매»로 바꾸면 이월과세 없이 계산된다(66,675,500)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([buildingOnly]));
    await expandAssetSection(page, 3, 0);
    await page.locator('[data-asset-card-index="0"] [data-field="gbBuildingAcquisitionCause"]').getByText("매매", { exact: true }).click();
    const body = (await calculate(page)) as { carryoverTaxation?: unknown };
    expect(body.carryoverTaxation).toBeUndefined();
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("66,675,500");
  });
});
