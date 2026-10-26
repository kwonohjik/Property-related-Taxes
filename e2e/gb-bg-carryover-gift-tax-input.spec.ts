/**
 * E2E — 일반건물 부담부증여 × 이월과세 — 화면에서 넣은 증여세(산출세액·과세가액)가 계산과 결과 카드에 닿는다
 *
 * 계획서: docs/00-pm/gb-bg-carryover-gift-tax-input.plan.md §1·§4
 * 수정 前(브라우저 실측): 산출세액 3천만·과세가액 10억 입력 → 요청 `giftTaxAmount` 0 · 109,326,000(증여세 0과 같다).
 * 시드는 vitest anchor(`transfer.route.gb-bg-carryover-gift-tax-input.anchor.test.ts`)와 같다 — 증여세 칸만 비우고 화면에서 입력한다.
 *
 * 실행(워크트리): E2E_PORT=3293 npx playwright test e2e/gb-bg-carryover-gift-tax-input.spec.ts
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
const half = { ownershipNumerator: "50", ownershipDenominator: "100" };

type Ct = { giftTaxAmount?: number };
type Wire = { carryoverTaxation?: Ct; generalBuildingShares?: { carryoverTaxation?: Ct }[] };

/** 그 자산 카드의 「3 취득」을 펼치고 증여세 신고서 금액을 넣는다. `base`를 비우면 산출세액만 넣는다. */
async function fillGiftTax(page: Page, idx: number, calc: string, base?: string) {
  await expandAssetSection(page, 3, idx);
  const card = page.locator(`[data-asset-card-index="${idx}"]`);
  const input = (field: string) => card.locator(`[data-field="${field}"] input, input[data-field="${field}"]`).first();
  await input("carryover.giftTaxCalculated").fill(calc);
  if (base) await input("carryover.giftTaxBase").fill(base);
}

test.describe("일반건물 부담부증여 × 이월과세 — 화면 증여세 입력", () => {
  test("GBGT-E1 단건: 산출세액 3천만·과세가액 10억 → 상당액 30,000,000 전송 · 104,646,000 · [A] 열에 상당액", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([asset(1)]));
    await fillGiftTax(page, 0, "30000000", "1000000000");
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation?.giftTaxAmount).toBe(30_000_000);
    const card = page.getByTestId("gb-bg-carryover-card").first();
    await expect(card).toContainText("104,646,000");
    await expect(card.getByTestId("gb-bg-carryover-gift-tax")).toContainText("30,000,000");
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("104,646,000");
  });

  test("GBGT-E2 지분 50/50: 두 지분에 같은 신고서 금액 → 지분마다 15,000,000(이중 산입 없음) · 104,646,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([asset(1, half), asset(2, half)], { assetSplitMode: "fractional" }));
    await fillGiftTax(page, 0, "30000000", "1000000000");
    await fillGiftTax(page, 1, "30000000", "1000000000");
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation).toBeUndefined();
    expect(body.generalBuildingShares?.map((s) => s.carryoverTaxation?.giftTaxAmount)).toEqual([15_000_000, 15_000_000]);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("104,646,000");
    const cards = page.getByTestId("gb-bg-carryover-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1).getByTestId("gb-bg-carryover-gift-tax")).toContainText("15,000,000");
  });

  test("GBGT-E3 ⑧: 산출세액만 넣으면 «다음»이 막히고 과세가액 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([asset(1)]));
    await fillGiftTax(page, 0, "30000000");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="carryover.giftTaxBase"]')))
      .toBe(true);
  });

  test("GBGT-E4 375px — 증여세 칸·결과 카드 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([asset(1)]));
    await fillGiftTax(page, 0, "30000000", "1000000000");
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // 단계 버튼은 좁은 화면에서 접힌다 — 계산은 기본 폭에서 하고 결과 화면을 375px로 줄여 잰다(GBSH-E2와 같다).
    await page.setViewportSize({ width: 1280, height: 800 });
    await calculate(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(page.getByTestId("gb-bg-carryover-gift-tax").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
