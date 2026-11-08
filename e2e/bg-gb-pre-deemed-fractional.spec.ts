/**
 * E2E: 부담부증여 **지분 일반건물 × 의제취득일(1985.1.1.) 전 상속 토지 파트 × 시가 모드(보충 승)** — ①(상증법 평가액)이 지분 몫으로 줄어 양도차익이 단건 대조와 같다.
 * 계획서 `docs/00-pm/bg-gb-pre-deemed-fractional-clause-a.plan.md` Q-1 (a). 종전에는 ①②를 100%로 싣고 ③·채무는 지분 몫이라 219,000,000(−18,000,000)이었다.
 * 시료: 토지 1980 상속(① 6천만 · 취득시 단가 300,000 × 100㎡) · 건물 2015 매매 · 시가 10억 · 본인 인수 채무 3억(지분 50%, 시가 해당분 5억보다 작아 보충 승).
 *
 *   GF-E1. 축 A 지분 50% — 200 · 양도차익 237,000,000 (219,000,000 아님)
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const gb = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetId: "p", addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  landAcquisitionDate: "2015-01-01", hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: false,
  gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000", gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", actualSalePrice: "1600000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "700000000", bgMortgageSetAmount: "700000000",
  ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", ...over,
});

async function seedAndOpen(page: Page, assets: unknown[], formExtra: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: {
      formData: {
        assets, transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0",
        householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, ...formExtra,
      },
      pendingMigration: false,
    },
    version: 0,
  }));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  return res;
}

test("GF-E1: 축 A 지분 50% 일반건물 · 토지 파트 의제전 상속 · 시가 보충 승 — 200 · 양도차익 237,000,000", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [gb({
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01", acquisitionCause: "inheritance", inheritanceStartDate: "1980-01-01",
    decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "60000000", gbAcqLandPricePerSqm: "300000",
    bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000",
  })]);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).toContainText("237,000,000");
  await expect(page.locator("body")).not.toContainText("219,000,000");
});
