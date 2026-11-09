/**
 * 일반건물 지분 × 상세명세서 산식 — 화면 경유 브라우저 확인.
 * 계획서 `docs/00-pm/gb-carryover-estimated-share-lump-deduction.plan.md` §6(#3072 이월과세 환산 개산공제 지분분) · §7(#3083 축 B 지분별 산식 echo D-1).
 *
 * - GBSF-1: 매매 환산 축 B 60/40 — 지분 2 카드 양도가액 산식이 지분 2 양도가액 400,000,000 기준, 개산공제 base가 40,000,000.
 *   종전에는 첫 지분 재료(600,000,000 · 60,000,000)로 적혀 산식이 자기 값을 못 만들었다.
 * - GBSF-2: 건물 이월과세(증여자 취득가액 환산) 축 B 60/40 — 이월과세 카드 「개산공제 1,200,000 = 취득시 기준시가 40,000,000 × 3%」.
 * - GBSF-3: 같은 이월과세 축 A 50% — 「개산공제 1,500,000 = 취득시 기준시가 50,000,000 × 3%」(종전 100% 기준 3,000,000).
 *
 * 이월과세 시료는 토지 매매 · 건물 이월과세라 취득원인이 갈린다 — 화면은 이때 「토지·건물 취득일 다름」을 켠다(마이그레이션 M-2b)
 * 그래서 분리 ON + 토지 취득일을 넣은 상태(화면에서 만들 수 있는 상태)로 둔다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";

const carryover = {
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", giftDateValuation: "800000000",
  useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "100000000",
};
const gb = (id: number, n: string, carry: boolean, third = false) => ({
  ...makeDefaultAsset(id), assetId: `g${id}`, addressJibun: "서울 강남구 테스트동 1-1", regionCode: "1168010100", assetKind: "general_building",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: carry ? "carryover_gift" : "purchase", acquisitionDate: "2024-05-01", useEstimatedAcquisition: true,
  landAcqMode: "estimated", buildingAcqMode: "estimated", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000", gbZoneType: "general_residential", gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "100000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "400000000",
  ...(carry ? { buildingCarryover: carryover, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-05-01" } : {}),
  ownershipNumerator: n, ownershipDenominator: "100", ...(third ? { ownershipRemainderThirdParty: "yes" } : {}),
});

/** 폼을 심고 계산 → 상세명세서의 그룹 · 자산별 행을 모두 펼친다. */
async function openStatement(page: Page, assets: unknown[], fractional: boolean) {
  const s = {
    state: {
      formData: {
        assets, ...(fractional ? { assetSplitMode: "fractional" } : {}), bundledSaleMode: "actual", transferDate: "2026-03-01", filingDate: "2026-05-31",
        contractTotalPrice: "1000000000", householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isOneHousehold: false, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const calc = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  expect((await calc).status()).toBe(200);
  const statement = page.locator('[data-print-section="detailed-statement"]');
  await expect(statement).toBeVisible({ timeout: 60_000 });
  const expandAll = statement.getByRole("button", { name: /전체 펼치기/ });
  if (await expandAll.isVisible().catch(() => false)) await expandAll.click();
  const perAsset = statement.getByRole("button", { name: "자산별 펼치기" });
  while ((await perAsset.count()) > 0) await perAsset.first().click();
  return statement;
}

test.describe("일반건물 지분 × 상세명세서 산식", () => {
  test("GBSF-1: 매매 환산 축 B 60/40 — 지분 2 산식이 지분 2 재료", async ({ page }) => {
    test.setTimeout(120_000);
    const st = await openStatement(page, [gb(1, "60", false), gb(2, "40", false)], true);
    await expect(st).toContainText(/400,000,000 ×\s*200,000,000\s*\(200,000,000\+200,000,000\)\s*= 200,000,000/);
    await expect(st).toContainText("취득시 토지기준시가 40,000,000 × 3% = 1,200,000");
    await expect(st).toContainText("취득시 건물기준시가 40,000,000 × 3% = 1,200,000");
    await expect(st).not.toContainText(/600,000,000 ×\s*200,000,000\s*\(200,000,000\+200,000,000\)\s*= 200,000,000/);
    await expect(st).not.toContainText("60,000,000 × 3% = 1,200,000");
  });
  test("GBSF-2: 건물 이월과세 환산 축 B 60/40 — 이월과세 카드 개산공제 base가 지분분", async ({ page }) => {
    test.setTimeout(120_000);
    const st = await openStatement(page, [gb(1, "60", true), gb(2, "40", true)], true);
    await expect(st).toContainText("개산공제 1,800,000 = 취득시 기준시가 60,000,000 × 3% — 시행령 §163⑥");
    await expect(st).toContainText("개산공제 1,200,000 = 취득시 기준시가 40,000,000 × 3% — 시행령 §163⑥");
    await expect(st).toContainText(/400,000,000 ×\s*200,000,000\s*\(200,000,000\+200,000,000\)\s*= 200,000,000/);
  });
  test("GBSF-3: 건물 이월과세 환산 축 A 50% — 개산공제 1,500,000 = 50,000,000 × 3%", async ({ page }) => {
    test.setTimeout(120_000);
    const st = await openStatement(page, [gb(1, "50", true, true)], false);
    await expect(st).toContainText("개산공제 1,500,000 = 취득시 기준시가 50,000,000 × 3% — 시행령 §163⑥");
    await expect(st).not.toContainText("개산공제 3,000,000");
  });
});
