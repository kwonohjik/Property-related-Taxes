/**
 * E2E — 주택·건물 부담부증여 × 토지·건물 취득일 다름 → 토지·건물을 나눠 계산 (V-4 PR-B · 설계서 Q-2 a · Q-3 a)
 *
 * 설계서: docs/00-pm/bg-house-building-split.design.md §5.2 · §7
 * 종전(PR-1 #2628): 같은 입력을 «다음»에서 막았다(「아직 계산하지 못합니다」). 이제 파트 칸을 받아 계산한다.
 *   · 본인 취득 「토지·건물 취득일 다름」 — 시가 토지분·건물분 평가액 · 토지·건물 실지취득가액 → 67,270,000(vitest anchor와 같은 셀)
 *   · 이월과세 토글 C 저장값 — 「건물분 증여자 취득일」이 비면 «다음»이 그 칸으로 · 채우면 73,198,000
 *
 * 실행(워크트리): E2E_PORT=3297 npx playwright test e2e/bg-house-building-split.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

type Over = Record<string, unknown>;
type Wire = { landAcquisitionDate?: string; burdenedGiftInfo?: { marketValueByPart?: unknown; carryoverDonorBasis?: { buildingDonorAcquisitionDate?: string } } };

/** 시가 10억 · 채무 4억 · 토지분 6억 · 건물분 4억 · K-4 — 칸은 화면에서 넣는 것만 비운다. */
const asset = (over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2022-01-10",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2000-06-01",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1000000000",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "400000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual",
  standardPriceAtTransfer: "800000000",
  standardPriceAtAcq: "400000000",
  bgMarketValueLand: "",
  bgMarketValueBuilding: "",
  bgActualAcquisitionLand: "100000000",
  bgActualAcquisitionBuilding: "150000000",
  ...over,
});

const seed = (assets: Over[]) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-02-16",
      filingDate: "2026-04-30",
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

const focusedIn = (page: Page, field: string) =>
  page.evaluate((f) => !!(document.activeElement as HTMLElement | null)?.closest(`[data-field="${f}"]`), field);
const inputOf = (page: Page, field: string) => page.locator(`[data-field="${field}"] input, input[data-field="${field}"]`).first();

test.describe("주택 부담부증여 × 토지·건물 취득일 다름 — 나눠 계산", () => {
  test("BGS-E1 본인 취득 · 평가액 파트 칸을 비우면 «다음»이 토지분 평가액으로 · 넣으면 67,270,000 · 분리 상세", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset()]));
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect.poll(() => focusedIn(page, "bgMarketValueLand")).toBe(true);
    await inputOf(page, "bgMarketValueLand").fill("600000000");
    await inputOf(page, "bgMarketValueBuilding").fill("400000000");
    const body = (await calculate(page)) as Wire;
    expect(body.landAcquisitionDate).toBe("2000-06-01");
    expect(body.burdenedGiftInfo?.marketValueByPart).toEqual({ land: 600_000_000, building: 400_000_000 });
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("67,270,000");
    await expect(page.getByTestId("split-card-acq-mode-land").first()).toBeVisible();
  });

  test("BGS-E2 저장된 토글 C(이월과세) · 건물분 증여자 취득일 비움 → «다음»이 그 칸으로 · 넣으면 73,198,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset({
      acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "",
      carryoverDonorSplit: true,
      bgMarketValueLand: "600000000", bgMarketValueBuilding: "400000000",
      bgActualAcquisitionLand: "600000000", bgActualAcquisitionBuilding: "400000000",
      bgCoDonorActualAcquisitionLand: "50000000", bgCoDonorActualAcquisitionBuilding: "100000000",
      carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150000000", giftDateValuation: "1000000000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" },
      buildingCarryover: { ...CARRYOVER_DEFAULTS },
    })]));
    await expect(page.getByTestId("carryover-donor-split-bg-note").first()).toContainText("건물분 증여자 취득일");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect.poll(() => focusedIn(page, "buildingCarryover.donorAcquisitionDate")).toBe(true);
    await expandAssetSection(page, 3);
    const dateCard = page.locator('[data-field="buildingCarryover.donorAcquisitionDate"]').first();
    await fillDateAndVerify(page, { year: "2015", month: "01", day: "01" }, { scope: dateCard });
    const body = (await calculate(page)) as Wire;
    expect(body.burdenedGiftInfo?.carryoverDonorBasis?.buildingDonorAcquisitionDate).toBe("2015-01-01");
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("73,198,000");
  });
});
