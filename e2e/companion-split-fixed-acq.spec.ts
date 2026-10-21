/**
 * E2E — 함께 양도 두 번째 자산 × 매매 별개 취득 (2026-10-21)
 *
 * 계획서: docs/00-pm/companion-split-fixed-acq-price.plan.md (Q-1 a)
 *
 * 종전: ⑧은 통과하는데 계산 요청이 400 `companionAssets.0.fixedAcquisitionPrice`(화면에 없는 자산 전체 취득가액)였다.
 * 지금: 계산되고, 요청에는 자산 전체 취득가액 없이 토지·건물 파트 가액만 실린다.
 *
 * 실행(워크트리): E2E_PORT=3276 npx playwright test e2e/companion-split-fixed-acq.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const first = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 2-2",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-02",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "400000000",
};

const second = {
  ...makeDefaultAsset(2),
  assetId: "a2",
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-06-01",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2003-06-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "300000000",
  buildingAcquisitionPrice: "250000000",
  saleSplitMode: "actual",
  landTransferPrice: "1200000000",
  buildingTransferPrice: "300000000",
  actualSalePrice: "1500000000",
  landStandardPriceAtTransfer: "900000000",
  buildingStandardPriceAtTransfer: "600000000",
};

const seed = {
  state: {
    formData: {
      assets: [first, second],
      transferDate: "2025-06-30",
      filingDate: "2025-08-31",
      contractTotalPrice: "1900000000",
      bundledSaleMode: "actual",
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
};

test("두 번째 자산이 매매 별개 취득이어도 계산된다 — 요청에 자산 전체 취득가액 없이 파트 가액만", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seed);
  const body = await calculate(page);
  const comp = (body.companionAssets as Record<string, unknown>[])[0];
  expect(comp.isSeparateAcquisition).toBe(true);
  expect(comp.fixedAcquisitionPrice).toBeUndefined();
  expect(comp.landAcquisitionPrice).toBe(300_000_000);
  expect(comp.buildingAcquisitionPrice).toBe(250_000_000);
  await expect(page.getByText("입력값이 올바르지 않습니다")).toHaveCount(0);
});
