/**
 * E2E — 주택·건물 부담부증여 × 토지·건물 취득일 다름 → «다음» 차단·그 칸으로 이동 (V-4 PR-1 · Q-1 a)
 *
 * 계획서: docs/00-pm/bg-carryover-non-gb-building-date.plan.md §4.1 · §7
 * 저장된 이력(토글이 이미 켜진 값)이 다음 단계로 넘어가지 못하고 막힌 칸으로 포커스가 가는지 본다.
 *   · 이월과세 토글 C 「증여자가 토지·건물을 다른 날 취득」 ON — 수정 前: 조용히 무시(자산 전체 한 날짜로 86,424,375)
 *   · 본인 취득 「토지·건물 취득일 다름」 + 날짜 다름 — 수정 前: 화면에 없는 「토지 취득가액」 칸을 요구(막다른 길)
 * 시드는 vitest anchor(`transfer.route.bg-house-building-date-block.anchor.test.ts`)와 같은 셀(`carryover-donor-built-bg.spec.ts` 시드).
 *
 * 실행(워크트리): E2E_PORT=3297 npx playwright test e2e/bg-house-building-date-block.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { seedWizard } from "./_helpers/split-acq-display";

type Over = Record<string, unknown>;

const asset = (over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-06-01",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "800000000",
  bgLendingDepositTotal: "300000000",
  bgMortgageDebtAmount: "200000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "converted",
  standardPriceAtTransfer: "800000000",
  standardPriceAtAcq: "400000000",
  landStandardPriceAtTransfer: "0",
  buildingStandardPriceAtTransfer: "800000000",
  bgActualAcquisitionTotal: "600000000",
  bgCoDonorLandStdPriceAtAcq: "0",
  bgCoDonorBuildingStdPriceAtAcq: "150000000",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2023-06-01",
    donorAcquisitionDate: "2000-06-01",
    donorAcquisitionPrice: "100000000",
    giftDateValuation: "600000000",
    giftTaxAmount: "0",
    donorRelation: "lineal",
    donorSameHousehold: "no",
  },
  ...over,
});

const seed = (assets: Over[]) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-02-16",
      filingDate: "2026-04-30",
      contractTotalPrice: "800000000",
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

test.describe("주택 부담부증여 × 토지·건물 취득일 다름 — 차단", () => {
  test("BGD-E1 저장된 토글 C ON(이월과세) → 차단 안내 · «다음» 막힘 · 토글로 이동", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset({ carryoverDonorSplit: true })]));
    await expect(page.getByTestId("carryover-donor-split-bg-blocked").first()).toContainText("아직 계산하지 못합니다");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect.poll(() => focusedIn(page, "carryoverDonorSplit")).toBe(true);
  });

  test("BGD-E2 본인 취득 · 「토지·건물 취득일 다름」 날짜 다름 → «다음» 막힘 · 토지 취득일로 이동(화면에 없는 「토지 취득가액」 아님)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset({ acquisitionCause: "purchase", acquisitionDate: "2022-01-10", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2000-06-01" })]));
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect.poll(() => focusedIn(page, "landAcquisitionDate")).toBe(true);
    await expect(page.locator('[data-field="landAcquisitionPrice"]')).toHaveCount(0);
  });
});
