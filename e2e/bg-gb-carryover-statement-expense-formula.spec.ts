/**
 * E2E: 일반건물 부담부증여 × 이월과세(토지·건물 둘 다) — 상세 계산 명세서의 파트별 필요경비 산식은 산입분을 뗀 순액을 만들고 증여세 상당액 산입분을 뒤에 더한다.
 * 계획서 `docs/02-design/features/bg-gb-carryover-statement-expense-formula.plan.md`(Q-1 a · Q-2 a).
 *
 * 종전: 토지 줄이 「10,000,000 × 500,000,000 / 1,000,000,000 × 0.03 = 650,000」(산식 값 150,000)로 슬롯(개산공제 + 산입분)을 적었다.
 * 시료: `gb-bg-carryover-presumed-scenario-b.spec.ts`와 같다(시가 10억 · 채무 5억 · 당초 증여자 감정가액 토지 1억·건물 2억 · 취득시 기준시가 토지 1천만·건물 4천만) + 증여세 상당액.
 *
 *   GS-E1. 증여세 상당액 2,000,000 — 토지 150,000 + 500,000 = 650,000 · 건물 600,000 + 500,000 = 1,100,000
 *   GS-E2. 증여세 상당액 0 — 산입 줄이 없다
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const gbBgPresumedAsset = (method: "appraisal" | "salesCase", giftTaxAmount = "0") => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "general_building",
  acquisitionCause: "carryover_gift",
  // 분리 OFF는 원인이 하나다 — 화면은 건물 원인을 토지 원인에 맞춘다(`GeneralBuildingAcquisitionCards.tsx:259`). 다르게 시드하면 복원(M-2b)이 분리를 켜 「토지만 이월과세」로 막힌다(gb-bg-part-carryover-mismatch).
  gbBuildingAcquisitionCause: "carryover_gift",
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
  bgAcquisitionMethod: method,
  bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "500000000",
  bgMortgageSetAmount: "500000000",
  bgDonorRelation: "lineal_descendant",
  bgCoDonorLandStdPriceAtAcq: "10000000",
  bgCoDonorBuildingStdPriceAtAcq: "40000000",
  bgCoDonorPresumedAcquisitionLand: "100000000",
  bgCoDonorPresumedAcquisitionBuilding: "200000000",
  bgActualAcquisitionLand: "300000000",
  bgActualAcquisitionBuilding: "300000000",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2024-05-01",
    donorAcquisitionDate: "2015-01-01",
    donorAcquisitionPrice: "100000000",
    giftDateValuation: "1000000000",
    giftTaxAmount,
    donorRelation: "lineal",
    donorSameHousehold: "no",
  },
  // 당초 증여자의 건물 취득일 — 토지와 같은 날(계획서 `gb-bg-donor-building-acquisition-date.plan.md` Q-1 a · 둘 다 이월과세면 필수)
  buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2015-01-01" },
});

const seed = (method: "appraisal" | "salesCase", giftTaxAmount = "0") => ({
  state: {
    formData: {
      assets: [gbBgPresumedAsset(method, giftTaxAmount)],
      transferDate: "2026-03-01",
      filingDate: "2026-05-31",
      contractTotalPrice: "1000000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});


async function openStatement(page: import("@playwright/test").Page, giftTaxAmount: string) {
  await seedWizard(page, seed("appraisal", giftTaxAmount));
  await calculate(page);
  const statement = page.locator('[data-print-section="detailed-statement"]');
  await expect(statement).toBeVisible({ timeout: 30_000 });
  const expandAll = statement.getByRole("button", { name: /전체 펼치기/ });
  if (await expandAll.isVisible().catch(() => false)) await expandAll.click();
  return statement;
}

test("GS-E1: 증여세 상당액 2,000,000 — 파트별 순액 + 증여세 상당액 산입 = 슬롯", async ({ page }) => {
  test.setTimeout(240_000);
  const statement = await openStatement(page, "2000000");
  await expect(statement).toContainText(/증여세 상당액 500,000\s*—\s*이월과세 §97의2①3호·시행령 §163의2②/);
  await expect(statement).toContainText(/10,000,000 × 500,000,000\s*1,000,000,000 × 0\.03\s*=\s*150,000/);
  await expect(statement).toContainText(/40,000,000 × 500,000,000\s*1,000,000,000 × 0\.03\s*=\s*600,000/);
  await expect(statement).toContainText(/=\s*650,000/);
  await expect(statement).toContainText(/=\s*1,100,000/);
  // 종전의 거짓 등식(산식 값 150,000 · 적힌 값 650,000)이 없다
  await expect(statement).not.toContainText(/× 0\.03\s*=\s*650,000/);
});

test("GS-E2: 증여세 상당액 0 — 산입 줄이 없다", async ({ page }) => {
  test.setTimeout(240_000);
  const statement = await openStatement(page, "0");
  await expect(statement).toContainText(/10,000,000 × 500,000,000\s*1,000,000,000 × 0\.03\s*=\s*150,000/);
  await expect(statement).not.toContainText("증여세 상당액 500,000");
});
