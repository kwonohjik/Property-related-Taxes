/**
 * E2E: 일반건물 부담부증여 — 토지·건물 취득가액 칸을 한쪽만 입력하면 막힌다(⑤⑧). 계획서 `docs/00-pm/bg-acq-part-zero-gap.plan.md`.
 * 종전에는 ⑧이 통과해 비운 쪽 취득가액 0으로 계산됐다(화면 경로). 시료: 시가 10억 · 채무 4억 · 실지 토지 1억 + 건물 1.5억.
 * 오라클(손계산): 4억 − 2.5억 × 0.4 = 300,000,000.
 *
 *   PE-1. 건물 칸 비움: 계산으로 넘어가지 못하고 «건물 실지취득가액» 안내(종전 360,000,000)
 *   PE-2. 두 칸 입력: 200 · 300,000,000
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const gb = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), assetId: "a", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", landAcquisitionDate: "2015-01-01",
  gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", useEstimatedAcquisition: false,
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "400000000", bgMortgageSetAmount: "400000000", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000", ...over,
});
async function seed(page: Page, a: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets: [a], transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
}
async function clickToCalc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}
const card = (page: Page) => page.locator('[data-asset-card-index="0"]');

test.describe("일반건물 부담부증여 — 취득가액 두 칸", () => {
  test.setTimeout(240_000);

  test("PE-1: 건물 칸을 비우면 막힌다 — 칸이 있어 막다른 길이 아니다", async ({ page }) => {
    await seed(page, gb({ bgActualAcquisitionBuilding: "" }));
    await expect(card(page).locator('[data-field="bgActualAcquisitionBuilding"]')).toBeVisible();
    await clickToCalc(page);
    await expect(page.getByText(/건물 실지취득가액을 입력하세요/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("PE-2: 두 칸 입력 — 200 · 300,000,000", async ({ page }) => {
    await seed(page, gb());
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    await clickToCalc(page);
    const r = await res;
    expect(r.status(), await r.text()).toBe(200);
    const j = await r.json();
    expect(j.data.aggregated?.totalTransferGain ?? j.data.result?.transferGain).toBe(300_000_000);
    await expect(page.locator("body")).toContainText("300,000,000");
  });
});
