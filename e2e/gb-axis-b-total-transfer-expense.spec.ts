/**
 * 일반건물 지분 묶음(축 B) × 폼 상단 총 양도비 — 화면 경유 (계획서 `docs/00-pm/gb-total-transfer-expense-loss.plan.md` 결함 A).
 *
 * - GBTE-1: 총 양도비 5,000,000 → 요청 본문의 지분 카드 `valuation.transferExpense` 가 3,000,000 · 2,000,000 (지분 60/40).
 *   종전에는 지분 카드에 총 양도비가 실리지 않아 두 카드 모두 키가 없었다.
 * - GBTE-2: 같은 결과가 「각 카드 양도비 칸에 5,000,000」과 결정세액이 같다 (총 양도비 ≡ 카드 입력).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const gb = (id: number, n: string, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id), assetId: `g${id}`, addressJibun: "서울 강남구 테스트동 1-1", regionCode: "1168010100", assetKind: "general_building",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false,
  landAcqMode: "actual", buildingAcqMode: "actual", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000",
  gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", fixedAcquisitionPrice: "200000000", actualSalePrice: "1000000000",
  ownershipNumerator: n, ownershipDenominator: "100", ...over,
});

async function calcWith(page: Page, assets: unknown[], total: string) {
  const s = {
    state: {
      formData: {
        assets, assetSplitMode: "fractional", bundledSaleMode: "actual", transferDate: "2024-03-01", filingDate: "2024-05-31",
        contractTotalPrice: "1000000000", totalTransferExpense: total, householdHousingCount: "2", householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
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

test.describe("일반건물 지분 묶음 × 총 양도비", () => {
  test("GBTE-1·2: 총 양도비 5,000,000 → 지분 카드에 3,000,000 · 2,000,000, 결정세액 = 카드 입력", async ({ page }) => {
    test.setTimeout(150_000);
    const viaTotal = await calcWith(page, [gb(1, "60"), gb(2, "40")], "5000000");
    const tx = (viaTotal.body.generalBuildingShares as { valuation: { transferExpense?: number } }[]).map((s) => s.valuation.transferExpense);
    expect(tx).toEqual([3_000_000, 2_000_000]);

    const viaCards = await calcWith(page, [gb(1, "60", { transferExpense: "5000000" }), gb(2, "40", { transferExpense: "5000000" })], "");
    expect(viaCards.json.data.aggregated.determinedTax).toBe(viaTotal.json.data.aggregated.determinedTax);
    // 양성 대조군 — 총 양도비를 넣었는데 세액이 그대로면(종전 결함) 이 단언이 붉어진다.
    const none = await calcWith(page, [gb(1, "60"), gb(2, "40")], "");
    expect(viaTotal.json.data.aggregated.determinedTax).toBeLessThan(none.json.data.aggregated.determinedTax);
  });
});
