/**
 * E2E — 일반건물 부담부증여 × 이월과세 — 화면에서 넣은 증여세(산출세액·과세가액)가 계산과 결과 카드에 닿는다
 *
 * 계획서: docs/00-pm/gb-bg-carryover-gift-tax-input.plan.md §1·§4
 * 수정 前(브라우저 실측): 산출세액 3천만·과세가액 10억 입력 → 요청 `giftTaxAmount` 0 · 109,326,000(증여세 0과 같다).
 * 시드는 vitest anchor(`transfer.route.gb-bg-carryover-gift-tax-input.anchor.test.ts`)와 같다 — 증여세 칸만 비우고 화면에서 입력한다.
 *
 * 후속(`docs/00-pm/gb-bg-carryover-gift-tax-part-limit.plan.md` Q-2 a · Q-3 b): 토지·건물 둘 다 이월과세면 평가액을 **토지분·건물분**으로 받는다.
 *   분리 OFF는 같은 블록의 「건물분」 칸, 분리 ON은 건물 블록. 자산 전체 10억 = 토지분 5억 + 건물분 5억이면 세액은 종전 그대로다(평가액 비율 = 양도가액 비율).
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
    // 둘 다 이월과세 — 토지분·건물분은 화면에서 넣는다(Q-3 b). 미리 채운 금액 칸에 `fill`하면 값이 이어 붙는 일이 있어 비워 둔다.
    giftDateValuation: "",
    giftTaxAmount: "",
    donorRelation: "lineal",
    donorSameHousehold: "no",
  },
  // 당초 증여자의 건물 취득일 — 토지와 같은 날(계획서 `gb-bg-donor-building-acquisition-date.plan.md` Q-1 a · 둘 다 이월과세면 필수)
  buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2015-01-01" },
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

type Ct = { giftTaxAmount?: number; donorCapitalExpenditure?: number };
type Wire = {
  carryoverTaxation?: Ct;
  generalBuildingShares?: { carryoverTaxation?: Ct }[];
  burdenedGiftInfo?: { carryoverDonorBasis?: { giftValuationByPart?: { land: number; building: number } } };
};

const inputOf = (page: Page, idx: number, field: string) =>
  page.locator(`[data-asset-card-index="${idx}"]`).locator(`[data-field="${field}"] input, input[data-field="${field}"]`).first();

/**
 * 그 자산 카드의 「3 취득」을 펼치고 증여세 신고서 금액을 넣는다. `base`를 비우면 산출세액만 넣는다.
 * `split`이 있으면 토지분·건물분 증여 당시 평가액도 넣는다(둘 다 이월과세 — Q-3 b). `building`이 ""이면 건물분을 비운다.
 */
async function fillGiftTax(page: Page, idx: number, calc: string, base?: string, split?: { land: string; building: string }) {
  await expandAssetSection(page, 3, idx);
  await inputOf(page, idx, "carryover.giftTaxCalculated").fill(calc);
  if (base) await inputOf(page, idx, "carryover.giftTaxBase").fill(base);
  if (split) {
    await inputOf(page, idx, "carryover.giftDateValuation").fill(split.land);
    await inputOf(page, idx, "buildingCarryover.giftDateValuation").fill(split.building);
  }
}
const HALVES = { land: "500000000", building: "500000000" };

test.describe("일반건물 부담부증여 × 이월과세 — 화면 증여세 입력", () => {
  test("GBGT-E1 단건: 산출세액 3천만·과세가액 10억 → 상당액 30,000,000 전송 · 104,646,000 · [A] 열에 상당액", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([asset(1)]));
    await fillGiftTax(page, 0, "30000000", "1000000000", HALVES);
    // 분리 OFF — 같은 블록에 「토지분」·「건물분」 두 칸이 보인다
    const card0 = page.locator('[data-asset-card-index="0"]');
    await expect(card0.getByText("토지분 증여 당시 평가액")).toBeVisible();
    await expect(card0.getByText("건물분 증여 당시 평가액")).toBeVisible();
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation?.giftTaxAmount).toBe(30_000_000);
    expect(body.burdenedGiftInfo?.carryoverDonorBasis?.giftValuationByPart).toEqual({ land: 500_000_000, building: 500_000_000 });
    const card = page.getByTestId("gb-bg-carryover-card").first();
    await expect(card).toContainText("104,646,000");
    await expect(card.getByTestId("gb-bg-carryover-gift-tax")).toContainText("30,000,000");
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("104,646,000");
  });

  test("GBGT-E2 지분 50/50: 두 지분에 같은 신고서 금액 → 지분마다 15,000,000(이중 산입 없음) · 104,646,000", async ({ page }) => {
    test.setTimeout(180_000);
    // 토지분·건물분 평가액은 시드로 넣는다(화면 입력은 E1·E5·E6이 본다) — 지분 카드 두 장에 같은 칸을 연달아 채우면 미리 든 값 뒤에 이어 붙는 일이 있었다.
    const halves = (n: number) => asset(n, { ...half, carryover: { ...asset(n).carryover, giftDateValuation: "500000000" }, buildingCarryover: { ...asset(n).carryover, giftDateValuation: "500000000" } });
    await seedWizard(page, seedOf([halves(1), halves(2)], { assetSplitMode: "fractional" }));
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
    await fillGiftTax(page, 0, "30000000", "1000000000", HALVES);
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // 단계 버튼은 좁은 화면에서 접힌다 — 계산은 기본 폭에서 하고 결과 화면을 375px로 줄여 잰다(GBSH-E2와 같다).
    await page.setViewportSize({ width: 1280, height: 800 });
    await calculate(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(page.getByTestId("gb-bg-carryover-gift-tax").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("GBGT-E5 ⑧ 둘 다 이월과세: 건물분 평가액을 비우면 «다음»이 막히고 건물분 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([asset(1)]));
    await fillGiftTax(page, 0, "30000000", "1000000000", { land: "500000000", building: "" });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="buildingCarryover.giftDateValuation"]')))
      .toBe(true);
  });

  test("GBGT-E7 ⑧ 둘 다 이월과세 · 분리 OFF: 「건물분 증여자 취득일」을 비우면 «다음»이 막히고 그 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seedOf([asset(1, { buildingCarryover: { ...CARRYOVER_DEFAULTS } })]));
    await expandAssetSection(page, 3);
    await expect(page.locator('[data-field="buildingCarryover.donorAcquisitionDate"]')).toContainText("건물분 증여자 취득일");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="buildingCarryover.donorAcquisitionDate"]')))
      .toBe(true);
  });

  test("GBGT-E6 분리 ON 둘 다: 토지 블록 6억 · 건물 블록 4억 → 상당액 1억 · A 93,742,700 < B → 97,800,000(종전 A 99,966,000 채택)", async ({ page }) => {
    test.setTimeout(180_000);
    const co = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100000000", giftDateValuation: "", giftTaxAmount: "", donorRelation: "lineal", donorSameHousehold: "no" };
    await seedWizard(page, seedOf([asset(1, { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", buildingCarryover: co })]));
    await fillGiftTax(page, 0, "100000000", "1000000000", { land: "600000000", building: "400000000" });
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation?.giftTaxAmount).toBe(100_000_000);
    expect(body.burdenedGiftInfo?.carryoverDonorBasis?.giftValuationByPart).toEqual({ land: 600_000_000, building: 400_000_000 });
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("97,800,000");
  });

  /**
   * V-3 Q-3 a(`docs/00-pm/gb-bg-on-building-block-fields.plan.md`) — 당초 증여자 자본적지출(§97의2①2호)은 토지 블록 한 칸(토지·건물 합계)이고 A 필요경비에 더해진다.
   * K-4 실지 · 양도인 6억·4억 · 당초 증여자 5천만·1억 · 신고서 1억/10억 → 자본적지출 없음 90,260,000 · 1억 → 75,440,000(vitest anchor와 같은 값).
   */
  test("GBGT-E8 분리 ON 둘 다 · K-4: 건물 블록엔 자본적지출 칸이 없고, 토지 블록 1억 → 75,440,000 · [A] 열에 증여자 자본적지출", async ({ page }) => {
    test.setTimeout(180_000);
    const co = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100000000", giftDateValuation: "", giftTaxAmount: "", donorRelation: "lineal", donorSameHousehold: "no" };
    await seedWizard(page, seedOf([asset(1, {
      hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", buildingCarryover: co,
      bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "600000000", bgActualAcquisitionBuilding: "400000000",
      bgCoDonorActualAcquisitionLand: "50000000", bgCoDonorActualAcquisitionBuilding: "100000000",
    })]));
    await fillGiftTax(page, 0, "100000000", "1000000000", { land: "600000000", building: "400000000" });
    await expect(page.locator('[data-field="buildingCarryover.donorCapitalExpenditure"]')).toHaveCount(0);
    await expect(page.locator('[data-field="carryover.donorCapitalExpenditure"]')).toContainText("증여자 자본적지출(토지·건물 합계)");
    await inputOf(page, 0, "carryover.donorCapitalExpenditure").fill("100000000");
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation?.donorCapitalExpenditure).toBe(100_000_000);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("75,440,000");
    await expect(page.getByTestId("gb-bg-carryover-donor-capex")).toContainText("100,000,000");
  });
});
