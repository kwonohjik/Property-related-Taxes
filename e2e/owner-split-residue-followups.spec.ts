/**
 * 소유자 분리 후속 (계획서 `docs/02-design/features/owner-split-residue-followups.plan.md`)
 *
 *   FU-E1 V-7 상속 토지만 본인 — 「취득 당시 감정평가가액」 두 칸을 채우면 요청에 실리고 세액이 기준시가 비율 대조와 달라진다.
 *   FU-E2 C-2 신축 건물만 본인 — 건물 취득가액으로 신축비용 전액이 실린다(종전 기준시가 비율로 토지에 나눴다).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const STD = {
  actualSalePrice: "1200000000", acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000",
  buildingStandardPriceAtTransfer: "840000000", standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000",
  buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
const INH = {
  ...makeDefaultAsset(1), ...STD, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", fixedAcquisitionPrice: "",
};
const NEWC = {
  ...makeDefaultAsset(1), ...STD, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "newConstruction",
  occupancyApprovalDate: "2015-01-01", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000",
};
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice: "1200000000", householdHousingCount: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function seed(page: Page, asset: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), form(asset));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
}
const card = (page: Page) => page.locator('[data-asset-card-index="0"]');
const storedAsset = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0]);

async function calc(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  const json = await r.json();
  return { status: r.status(), tax: json?.data?.result?.calculatedTax as number | undefined, body: r.request().postDataJSON() as Record<string, unknown> };
}
async function ownerSplit(page: Page, owns: "building_only" | "land_only") {
  await card(page).getByText("토지·건물 소유자 다름", { exact: true }).first().click();
  if (owns === "land_only") {
    await card(page).getByRole("button", { name: /토지만/ }).first().click();
    // V-3′ 건물(주택) 소유자 세대(⑧ 필수) — 같은 세대(종전 계산)
    await card(page).getByTestId("building-owner-same-household-yes").first().check();
    await expect.poll(async () => (await storedAsset(page))?.buildingOwnerSameHousehold).toBe(true);
  }
  await expect.poll(async () => (await storedAsset(page))?.selfOwns).toBe(owns);
}

test.describe("소유자 분리 후속", () => {
  test("FU-E1: 상속 토지만 본인 — 취득 당시 감정평가가액 두 칸이 요청에 실리고 세액이 기준시가 비율 대조와 달라진다", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, INH);
    await ownerSplit(page, "land_only");
    const control = await calc(page);

    await seed(page, INH);
    await ownerSplit(page, "land_only");
    for (const [id, v] of [["acq-appraisal-land", "150000000"], ["acq-appraisal-building", "150000000"]] as const) {
      const input = card(page).getByTestId(id);
      await input.fill(v);
      await input.press("Tab");
    }
    await expect.poll(async () => (await storedAsset(page))?.buildingAppraisalAtAcquisition?.replace(/,/g, "")).toBe("150000000");
    const appraised = await calc(page);

    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(control.body.landAppraisalAtAcquisition).toBeUndefined();
    expect(appraised.status).toBe(200);
    expect([appraised.body.landAppraisalAtAcquisition, appraised.body.buildingAppraisalAtAcquisition]).toEqual([150_000_000, 150_000_000]);
    expect(appraised.tax).toBeGreaterThan(0);
    expect(appraised.tax).not.toBe(control.tax);
  });

  test("FU-E2: 신축 건물만 본인 — 건물 취득가액으로 신축비용 전액이 실린다", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, NEWC);
    await ownerSplit(page, "building_only");
    const r = await calc(page);
    expect(r.status).toBe(200);
    expect(r.tax).toBeGreaterThan(0);
    expect(r.body.buildingAcquisitionPrice).toBe(300_000_000);
  });
});
