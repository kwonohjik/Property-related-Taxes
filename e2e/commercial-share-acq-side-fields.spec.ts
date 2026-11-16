/**
 * 상가 축 B 지분 카드 — 취득 쪽 칸은 지분 값, 물건 단위 칸(양도시 가격 · 부수토지 판정)은 자산 1에서만 입력.
 * 계획서 `docs/00-pm/commercial-share-acq-side-fields.plan.md` · 고정값은 route anchor(`transfer.route.commercial-share-acq-side-fields.anchor.test.ts`)와 같다.
 *
 * - CS-E1 상속 지분 2003 × §164⑥: 지분 카드에 §164⑥ 칸 · 부수토지 섹션 대신 안내 · 지분 2 = 196,363,637(종전 ⑧ 「누락」 막다른 길)
 * - CS-E2 매매 지분 2019 × 환산: 지분 카드에 「취득시 ㎡당 호별고시가」만 · 양도시 칸 없음 · 지분 2 = 97,480,000(종전 198,320,000)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const AREA: A = { cbExclusiveArea: "50", cbSharedArea: "20", cbLandArea: "100" };

async function seed(page: Page, assets: A[]) {
  const s = {
    state: {
      formData: rosterForDeclaredCount({
        assets, assetSplitMode: "fractional", contractTotalPrice: "1000000000", transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0",
        householdHousingCount: "0", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      } as never),
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // hydration 대기(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-asset-section="2"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  for (let round = 0; round < 3; round++) {
    const heads = page.locator("[data-asset-section] > button");
    for (let k = 0; k < (await heads.count()); k++) {
      const h = heads.nth(k);
      if ((await h.isVisible()) && (await h.innerText()).includes("펼치기")) await h.click();
    }
  }
}
/** 칸별 보이는 개수 — 자산 1 카드와 지분 카드를 합친 페이지 전체 */
const visibleCount = (page: Page, field: string) =>
  page.evaluate((f) => [...document.querySelectorAll(`[data-field="${f}"]`)].filter((e) => !!(e as HTMLElement).offsetParent).length, field);
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status(), await r.text()).toBe(200);
  const j = (await r.json()) as { data: { aggregated: { properties: { transferGain: number }[] } } };
  return j.data.aggregated.properties.map((p) => p.transferGain);
}

test.describe("상가 축 B 지분 카드 — 취득 쪽 칸 · 물건 단위 칸", () => {
  test("CS-E1 상속 지분 2003 × §164⑥ — 196,363,637", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, [
      { ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "commercial_building", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000",
        acquisitionCause: "purchase", acquisitionDate: "2015-01-01", actualSalePrice: "1000000000", fixedAcquisitionPrice: "100000000", ownershipNumerator: "60", ownershipDenominator: "100", ...AREA,
        cbTotalLandArea: "1000", cbTotalBuildingFootprintArea: "800", cbZoneType: "general_residential" },
      { ...makeDefaultAsset(2), assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", acquisitionCause: "inheritance", acquisitionDate: "2003-06-01",
        inheritanceStartDate: "2003-06-01", decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "100000000",
        cbUnitPriceAtFirstOrAcq: "10000000", cbLandPricePerSqmAtAcq: "500000", cbLandPricePerSqmAtFirst: "700000", cbBuildingStdPriceAtAcq: "30000000", cbBuildingStdPriceAtFirst: "40000000", cbAcqBuildingStdBy164_5: true },
    ]);
    // 부수토지 판정 칸은 자산 1에만(지분 카드는 안내)
    expect(await visibleCount(page, "cbZoneType")).toBe(1);
    expect(await visibleCount(page, "cbTotalLandArea")).toBe(1);
    await expect(page.getByTestId("cb-share-appurtenant-note")).toBeVisible();
    // 지분 카드 §164⑥ 취득 쪽 칸
    expect(await visibleCount(page, "cbUnitPriceAtFirstOrAcq")).toBe(1);
    expect(await calc(page)).toEqual([540_000_000, 196_363_637]);
  });

  test("CS-E2 매매 지분 2019 × 환산 — 97,480,000", async ({ page }) => {
    test.setTimeout(120_000);
    const EST: A = { assetKind: "commercial_building", ...AREA, cbTotalLandArea: "1000", cbTotalBuildingFootprintArea: "800", cbZoneType: "general_residential",
      cbUnitPriceAtTransfer: "4000000", cbLandPricePerSqmAtTransfer: "3000000", useEstimatedAcquisition: true };
    await seed(page, [
      { ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", actualSalePrice: "1000000000",
        ownershipNumerator: "60", ownershipDenominator: "100", ...EST, cbUnitPriceAtFirstOrAcq: "2000000", cbLandPricePerSqmAtAcq: "1500000" },
      { ...makeDefaultAsset(2), assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", acquisitionCause: "purchase", acquisitionDate: "2019-01-01",
        useEstimatedAcquisition: true, cbUnitPriceAtFirstOrAcq: "3000000", cbLandPricePerSqmAtAcq: "1500000" },
    ]);
    // 양도시 칸은 자산 1에만 · 취득시 칸은 두 카드 모두
    expect(await visibleCount(page, "cbUnitPriceAtTransfer")).toBe(1);
    expect(await visibleCount(page, "cbLandPricePerSqmAtTransfer")).toBe(1);
    expect(await visibleCount(page, "cbUnitPriceAtFirstOrAcq")).toBe(2);
    await expect(page.getByTestId("cb-share-object-fields-note")).toBeVisible();
    expect(await calc(page)).toEqual([297_480_000, 97_480_000]);
  });
});
