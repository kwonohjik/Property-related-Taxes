/**
 * E2E — 일반건물 지분 분할 취득(축 B) 50/50 × 부담부증여 × 이월과세 — 둘째 지분 당초 증여자 칸부터 결과·신고서까지 (PR-2)
 *
 * 계획서: docs/00-pm/gb-bg-carryover-share-bundled.plan.md §1.1 P1 · §4.4
 * 종전(F27 B PR-3)에는 ⑧ 이 「단건으로 계산하세요」로 막았고, 둘째 지분 카드에는 당초 증여자 칸이 없었다(⑧ 은 요구 — 막다른 길).
 * 시드는 vitest anchor(`transfer.route.gb-bg-carryover-share.anchor.test.ts`)와 같다 — 일반건물 K-5 · 시가 10억 · 채무 5억 ·
 * 증여 2024-05-01 · 당초 증여자 취득 2015-01-01 · 양도 2026-03-01 → 지분마다 A 채택 · 109,326,000(= 단건 A).
 * 둘째 지분의 당초 증여자 취득 당시 기준시가(토지 1천만·건물 4천만)는 시드에서 비우고 화면에서 입력한다.
 *
 * 실행(워크트리): E2E_PORT=3292 npx playwright test e2e/gb-bg-carryover-share.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const share = (n: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(n),
  assetLabel: `자산 ${n}`,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "general_building",
  acquisitionCause: "carryover_gift",
  // 분리 OFF는 원인이 하나다 — 화면은 건물 원인을 토지 원인에 맞춘다(`GeneralBuildingAcquisitionCards.tsx:259`). 다르게 시드하면 복원(M-2b)이 분리를 켜 「토지만 이월과세」로 막힌다(gb-bg-part-carryover-mismatch).
  gbBuildingAcquisitionCause: "carryover_gift",
  acquisitionDate: "2024-05-01",
  ownershipNumerator: "50",
  ownershipDenominator: "100",
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
  // 당초 증여자의 건물 취득일 — 토지와 같은 날(계획서 `gb-bg-donor-building-acquisition-date.plan.md` Q-1 a · 둘 다 이월과세면 필수)
  buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2015-01-01" },
  ...over,
});

const seed = {
  state: {
    formData: {
      assets: [share(1), share(2, { bgCoDonorLandStdPriceAtAcq: "", bgCoDonorBuildingStdPriceAtAcq: "" })],
      assetSplitMode: "fractional",
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
    },
    pendingMigration: false,
  },
  version: 0,
};

type Share = { carryoverTaxation?: unknown; burdenedGiftInfo?: { carryoverDonorBasis?: Record<string, number> } };
type Wire = { carryoverTaxation?: unknown; generalBuildingShares?: Share[] };

async function fillSecondShareCoDonor(page: Page) {
  const second = page.locator('[data-asset-card-index="1"]');
  const block = second.getByTestId("bg-codonor-block");
  await expect(block).toBeVisible();
  const input = (field: string) => block.locator(`[data-field="${field}"] input, input[data-field="${field}"]`).first();
  await input("bgCoDonorLandStdPriceAtAcq").fill("10000000");
  await input("bgCoDonorBuildingStdPriceAtAcq").fill("40000000");
}

test.describe("일반건물 지분 분할 50/50 × 부담부증여 × 이월과세 (PR-2)", () => {
  test("GBSH-E1 둘째 지분 당초 증여자 칸 입력 → 지분별 [A]/[B] 카드 2장 · 109,326,000 · 신고서 취득일 = 당초 증여자 취득일", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed);
    await fillSecondShareCoDonor(page);
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation).toBeUndefined();
    expect(body.generalBuildingShares?.map((s) => s.carryoverTaxation !== undefined)).toEqual([true, true]);
    expect(body.generalBuildingShares?.[1].burdenedGiftInfo?.carryoverDonorBasis).toMatchObject({
      landStdPriceAtAcquisition: 10_000_000,
      buildingStdPriceAtAcquisition: 40_000_000,
    });
    await expect(page.getByText("아직 계산하지 못합니다")).toHaveCount(0);

    const cards = page.getByTestId("gb-bg-carryover-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1)).toContainText("이월과세 비교과세 결과 — 자산 2");
    await expect(cards.nth(1)).toContainText("109,326,000");
    await expect(cards.nth(1)).toContainText("93,186,350");
    await expect(cards.nth(1)).toContainText("✓ 채택");
    await expect(cards.nth(1)).toContainText("신고 전체 금액");

    const form = page.locator('[data-print-id="form-table"]').first();
    await expect(form).toContainText("109,326,000");
    await expect(form).toContainText("2015-01-01");
    await expect(form).toContainText("당초 증여자 취득일");
  });

  test("GBSH-E2 375px — 둘째 지분 당초 증여자 칸·결과 화면 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed);
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(page.locator('[data-asset-card-index="1"]').getByTestId("bg-codonor-block")).toBeVisible();
    const inputOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(inputOverflow).toBeLessThanOrEqual(0);
    // 단계 버튼은 좁은 화면에서 접힌다 — 계산은 기본 폭에서 하고 결과 화면을 375px로 줄여 잰다.
    await page.setViewportSize({ width: 1280, height: 800 });
    await fillSecondShareCoDonor(page);
    await calculate(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(page.getByTestId("gb-bg-carryover-card").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
