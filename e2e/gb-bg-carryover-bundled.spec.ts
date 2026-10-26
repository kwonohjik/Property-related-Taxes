/**
 * E2E — 함께 부담부증여 묶음(일반건물 + 토지) × 일반건물 이월과세 — 화면 입력부터 결과·신고서까지 (PR-1)
 *
 * 계획서: docs/00-pm/gb-bg-carryover-share-bundled.plan.md §1.2 Q1 · §4.6
 * 종전(F27 B PR-3)에는 ⑧ 이 「단건으로 계산하세요」로 막았다. 시드는 vitest anchor(`transfer.route.gb-bg-carryover-bundled.anchor.test.ts`)와 같다 —
 * 일반건물 K-5 · 시가 10억 · 채무 5억 · 증여 2024-05-01 · 당초 증여자 취득 2015-01-01(취득 당시 기준시가 토지 1천만·건물 4천만) + 토지 부담부증여 3억 ·
 * 계약 13억 · 양도 2026-03-01 → A 채택 140,526,000 (미적용 110,760,000).
 *
 * 실행(워크트리): E2E_PORT=3291 npx playwright test e2e/gb-bg-carryover-bundled.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const gbAsset = {
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
    giftTaxAmount: "0",
    donorRelation: "lineal",
    donorSameHousehold: "no",
  },
};

const landBg = {
  ...makeDefaultAsset(2),
  assetKind: "land",
  addressJibun: "강원 홍천군 테스트리 1",
  acquisitionArea: "300",
  transferArea: "300",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "300000000",
  bgMortgageDebtAmount: "150000000",
  bgMortgageSetAmount: "150000000",
  bgLendingDepositTotal: "0",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual",
  bgActualAcquisitionLand: "100000000",
  standardPriceAtTransfer: "150000000",
  standardPriceAtAcq: "80000000",
};

const seed = {
  state: {
    formData: {
      assets: [gbAsset, landBg],
      assetSplitMode: "companion",
      bundledSaleMode: "actual",
      transferDate: "2026-03-01",
      filingDate: "2026-05-31",
      contractTotalPrice: "1300000000",
      totalTransferExpense: "0",
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

type Wire = { carryoverTaxation?: unknown; companionAssets?: unknown[] };

test.describe("함께 부담부증여 묶음 × 일반건물 이월과세 (PR-1)", () => {
  test("GBBU-E1 계산된다 — 자산별 [A]/[B] 카드 · 신고서 취득일 = 당초 증여자 취득일 · 명세 자산별 카드", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed);
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation).toBeDefined();
    expect(body.companionAssets).toHaveLength(1);
    await expect(page.getByText("아직 계산하지 못합니다")).toHaveCount(0);

    const card = page.getByTestId("gb-bg-carryover-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("이월과세 비교과세 결과 — 주 자산");
    await expect(card).toContainText("140,526,000");
    await expect(card).toContainText("110,760,000");
    await expect(card).toContainText("✓ 채택");
    await expect(card).not.toContainText("더 큰 세액");
    await expect(card).toContainText("신고 전체 금액");
    await expect(page.getByTestId("gb-bg-carryover-filing-tax")).toHaveCount(0);

    const form = page.locator('[data-print-id="form-table"]').first();
    await expect(form).toContainText("140,526,000");
    await expect(form).toContainText("2015-01-01");
    await expect(form).toContainText("당초 증여자 취득일");

    await expect(page.getByTestId("bg-bundle-card").filter({ hasText: "이월과세 적용(당초 증여자 기준)" })).toHaveCount(1);
  });

  test("GBBU-E2 375px — 결과 화면 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(180_000);
    // 단계 버튼은 좁은 화면에서 접힌다 — 계산은 기본 폭에서 하고 결과 화면을 375px로 줄여 잰다.
    await seedWizard(page, seed);
    await calculate(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(page.getByTestId("gb-bg-carryover-card")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
