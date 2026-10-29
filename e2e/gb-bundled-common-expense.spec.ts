/**
 * 일반건물 × 함께 양도 × 총 양도비 — 화면 경유 (계획서 `docs/00-pm/gb-total-transfer-expense-loss.plan.md` 결함 B).
 *
 * - GBCE-1: 일반건물(토지 실가 + 건물 감정 = 혼합) + 토지 자산 + 총 양도비 5,000,000 → 일반건물 몫(80%)이 필요경비에 반영되어
 *   결정세액이 「일반건물 자산 칸 4,000,000 + 토지 자산 칸 1,000,000」 직접 입력과 같고 총 양도비가 없을 때보다 작다.
 *   종전에는 일반건물 몫 4,000,000 이 소실돼 토지 자산 몫(1,000,000)만 반영됐다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const gb = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), assetId: "g1", addressJibun: "서울 강남구 역삼동 1", regionCode: "1168010100", assetKind: "general_building",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", useEstimatedAcquisition: true,
  landAcqMode: "actual", landAcquisitionPrice: "400000000", buildingAcqMode: "appraisal", buildingAcquisitionPrice: "200000000", ...over,
});
const land = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(2), assetId: "l2", addressJibun: "서울 강남구 테스트동 2-2", regionCode: "1168010100", assetKind: "land", acquisitionCause: "purchase",
  acquisitionDate: "2012-01-01", acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000",
  standardPriceAtTransfer: "200000000", actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000", ...over,
});

async function calcWith(page: Page, assets: unknown[], total: string) {
  const s = {
    state: {
      formData: {
        assets, assetSplitMode: "companion", bundledSaleMode: "actual", transferDate: "2026-02-16", filingDate: "2026-05-31",
        contractTotalPrice: "2000000000", totalTransferExpense: total, householdHousingCount: "0", isOneHousehold: false,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false,
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
  const calc = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calc;
  expect(resp.status()).toBe(200);
  return { body: JSON.parse(resp.request().postData() ?? "{}"), json: await resp.json() };
}

test.describe("일반건물 함께 양도 × 총 양도비", () => {
  test("GBCE-1: 총 양도비 5,000,000 → 일반건물 몫이 반영되어 세액 = 자산 칸 직접 입력(4,000,000 + 1,000,000)", async ({ page }) => {
    test.setTimeout(150_000);
    const viaTotal = await calcWith(page, [gb(), land()], "5000000");
    expect(viaTotal.body.commonTransferExpense).toBe(5_000_000);
    const viaAssets = await calcWith(page, [gb({ transferExpense: "4000000" }), land({ transferExpense: "1000000" })], "");
    expect(viaTotal.json.data.aggregated.determinedTax).toBe(viaAssets.json.data.aggregated.determinedTax);
    // 양성 대조군 — 일반건물 몫이 소실되면(종전 결함) 토지 자산 몫만 반영돼 세액이 오라클보다 크다.
    const none = await calcWith(page, [gb(), land()], "");
    expect(viaTotal.json.data.aggregated.determinedTax).toBeLessThan(none.json.data.aggregated.determinedTax);
  });
});
