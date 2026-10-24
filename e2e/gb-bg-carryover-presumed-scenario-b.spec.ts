/**
 * E2E — 일반건물 **부담부증여 × 이월과세 × 감정가액·매매사례가액(K-7·K-6)** 이 화면에서 계산까지 간다 (F27 B · PR-1)
 *
 * 계획서: docs/00-pm/gb-bg-carryover-presumed-scenario-b.plan.md
 * 종전에는 ⑧이 통과시킨 뒤 route가 400(「취득가액 산정방식 「감정가액」은 취득 당시 감정가액을 입력해야 합니다」)이라 결과 화면이 뜨지 않았다.
 * 시드 — 시가 10억 · 채무 5억 · 증여 2024-05-01 · 당초 증여자 취득 2015-01-01(취득 당시 기준시가 토지 1천만·건물 4천만) ·
 * 당초 증여자 감정가액 토지 1억·건물 2억 · 양도인 증여일 평가액 토지 3억·건물 3억 · 양도 2026-03-01 → A 채택 결정세액 82,627,700(vitest anchor와 같은 시료).
 *
 * 실행(워크트리): E2E_PORT=3298 npx playwright test e2e/gb-bg-carryover-presumed-scenario-b.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const gbBgPresumedAsset = (method: "appraisal" | "salesCase") => ({
  ...makeDefaultAsset(1),
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
    giftTaxAmount: "0",
    donorRelation: "lineal",
    donorSameHousehold: "no",
  },
});

const seed = (method: "appraisal" | "salesCase") => ({
  state: {
    formData: {
      assets: [gbBgPresumedAsset(method)],
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

type Wire = { burdenedGiftInfo?: { acquisitionMethod?: string; carryoverDonorBasis?: { presumedLandAcquisitionPrice?: number } } };

test.describe("일반건물 부담부증여 × 이월과세 × 감정가액·매매사례가액 — 시나리오 B", () => {
  for (const [id, method, label] of [["GBPB-E1", "appraisal", "감정가액"], ["GBPB-E2", "salesCase", "매매사례가액"]] as const) {
    test(`${id} ${label}: 당초 증여자 칸이 화면에 있고, 계산하면 결과가 뜬다(결정세액 82,627,700 · 종전 400)`, async ({ page }) => {
      test.setTimeout(180_000);
      await seedWizard(page, seed(method));
      await expandAssetSection(page, 2); // 부담부증여 블록은 ② 양도정보 안에 있다
      await expect(page.getByText(`당초 증여자의 ${label} 입력`).first()).toBeVisible();
      await expect(page.locator('[data-field="bgCoDonorPresumedAcquisitionLand"]').first()).toBeVisible();
      await expect(page.locator('[data-field="bgCoDonorPresumedAcquisitionBuilding"]').first()).toBeVisible();
      const body = (await calculate(page)) as Wire;
      expect(body.burdenedGiftInfo?.acquisitionMethod).toBe(method);
      expect(body.burdenedGiftInfo?.carryoverDonorBasis?.presumedLandAcquisitionPrice).toBe(100_000_000);
      await expect(page.getByText("취득 당시 감정가액을 입력해야 합니다")).toHaveCount(0);
      await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("82,627,700");
    });
  }
});
