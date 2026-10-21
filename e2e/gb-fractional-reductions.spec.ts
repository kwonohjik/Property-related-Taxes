/**
 * 일반건물 지분 묶음(축 B) 감면 — 화면 경유 (계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` PR-1).
 *
 * - GBFR-1: 지분 카드의 감면 패널은 첫 카드의 자산 종류로 그린다. 종전에는 저장값(기본 «주택»)으로 그려
 *   「현재 자산: 주택」과 함께 주택 감면(장기임대·미분양)이 열렸다.
 * - GBFR-2: 두 지분 모두 §77이면 요청 본문에 지분별 감면이 실리고, 결정세액이 단건 100% §77과 같다(178,389,000).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const R77 = { type: "public_expropriation", expropriationCash: "800000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2024-01-01" };
const gb = (id: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id), assetId: `g${id}`, addressJibun: "서울 강남구 테스트동 1-1", regionCode: "1168010100", assetKind: "general_building",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false,
  landAcqMode: "actual", buildingAcqMode: "actual", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000",
  gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", fixedAcquisitionPrice: "200000000", actualSalePrice: "1000000000",
  ownershipNumerator: "50", ownershipDenominator: "100", ...over,
});

async function seed(page: Page, reductions: unknown[]) {
  const s = {
    state: {
      formData: {
        // 지분 카드의 저장 assetKind는 기본값 «주택»이다(① 기본정보를 숨긴다).
        assets: [gb(1, { reductions }), gb(2, { assetKind: "housing", reductions })],
        assetSplitMode: "fractional", bundledSaleMode: "actual", transferDate: "2024-03-01", filingDate: "2024-05-31",
        contractTotalPrice: "1000000000", householdHousingCount: "2", householdNoOtherHousesConfirmed: true,
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
}

test.describe("일반건물 지분 묶음 감면", () => {
  test("GBFR-1: 지분 카드 감면 패널은 첫 카드 자산 종류(일반건물)로 그린다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, []);
    for (const step of ["보유 상황", "감면·공제"]) await page.getByRole("button", { name: step }).first().click();
    const share = page.locator('[data-asset-card-index="1"]');
    // 양성 대조군: 첫 카드는 「일반건물」 — 같은 문구가 지분 카드에도 떠야 한다.
    await expect(page.locator('[data-asset-card-index="0"]').getByText("현재 자산: 일반건물")).toBeVisible();
    await expect(share.getByText("현재 자산: 일반건물")).toBeVisible();
    await expect(share.getByText("현재 자산: 주택")).toHaveCount(0);
    // 주택 감면 그룹은 활성 0이다(종전 장기임대 3/6 · 미분양 7/9).
    await expect(share.getByText("활성 0/전체 6")).toBeVisible();
    await expect(share.getByText("활성 0/전체 9")).toBeVisible();
  });

  test("GBFR-2: 두 지분 §77 → 지분별 감면 전송 · 결정세액 178,389,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, [R77]);
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    const calc = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calc;
    const body = JSON.parse(resp.request().postData() ?? "{}");
    expect(body.reductions.map((r: { type: string }) => r.type)).toEqual(["public_expropriation"]);
    expect(body.generalBuildingShares[1].reductions.map((r: { type: string }) => r.type)).toEqual(["public_expropriation"]);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.data.aggregated.determinedTax).toBe(178_389_000);
  });
});
