/**
 * 상속·증여 「토지·건물 소유자 다름」 — 화면에 없는 분리 입력 잔존 (계획서 `docs/02-design/features/inherit-gift-owner-split-residue.plan.md`)
 *
 *   OS-E1 R-1 D2(「토지는 다른 원인으로 취득」)에서 토지 금액 → D2를 직접 끔(금액은 남음) → 토지만 본인. 종전 100,740,000 ↔ 대조 94,022,000.
 *   OS-E2 R-3 저장된 상속 폼을 열고 상속개시일만 고침(토지 취득일은 옛 값) → 토지만 본인. 종전 옛 날짜로 계산.
 *   OS-E3 R-5 겸용을 켰다 끄고(분리 플래그 잔존) 상속개시일을 고침 → 소유자 다름. 종전 ⑧ 「건물 취득가액을 입력하세요」(칸 0개).
 * 지금: 셋 다 대조 경로와 같은 세액. 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const OWN = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", fixedAcquisitionPrice: "",
  actualSalePrice: "1200000000", acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000",
  buildingStandardPriceAtTransfer: "840000000", standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000",
  buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
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

async function calcTax(page: Page): Promise<{ status: number; tax: number | undefined }> {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  const json = await r.json();
  return { status: r.status(), tax: json?.data?.result?.calculatedTax as number | undefined };
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
async function editInheritanceDate(page: Page, v: string): Promise<string> {
  const d = card(page).locator('[data-field="acquisitionDate"] input, input[data-field="acquisitionDate"]').first();
  await d.click();
  await d.fill(v);
  await d.press("Tab");
  await expect.poll(async () => (await storedAsset(page))?.acquisitionDate).not.toBe("2015-01-01");
  return (await storedAsset(page))?.acquisitionDate as string;
}

test.describe("상속 소유자 분리 — 화면에 없는 분리 입력", () => {
  test("OS-E1: D2 토지 금액 → D2 직접 끔 → 토지만 본인 — 대조와 같은 세액", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, OWN);
    await ownerSplit(page, "land_only");
    const control = await calcTax(page);

    await seed(page, OWN);
    const d2 = card(page).getByText("토지는 다른 원인으로 취득", { exact: true }).first();
    await d2.click();
    const price = card(page).locator('[data-field="landAcquisitionPrice"] input').first();
    await price.fill("100000000");
    await price.press("Tab");
    await d2.click();
    await expect.poll(async () => {
      const a = await storedAsset(page);
      return [a?.landAcquisitionCause, a?.landAcquisitionPrice];
    }).toEqual(["", "100000000"]);
    await ownerSplit(page, "land_only");
    const stale = await calcTax(page);

    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(stale.status).toBe(200);
    expect(stale.tax).toBe(control.tax);
  });

  test("OS-E2: 저장 폼을 열고 상속개시일만 고침(토지 취득일은 옛 값) → 토지만 본인 — 고친 날짜로 시작한 대조와 같은 세액", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, OWN);
    const edited = await editInheritanceDate(page, "2016-06-01");
    expect((await storedAsset(page))?.landAcquisitionDate).toBe("2015-01-01");
    await ownerSplit(page, "land_only");
    const stale = await calcTax(page);

    await seed(page, { ...OWN, acquisitionDate: edited });
    await ownerSplit(page, "land_only");
    const control = await calcTax(page);

    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(stale.status).toBe(200);
    expect(stale.tax).toBe(control.tax);
  });

  test("OS-E3: 겸용 켰다 끔 → 상속개시일 수정 → 건물만 본인 — ⑧ 막다른 길 없이 대조와 같은 세액", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, OWN);
    const mixed = page.getByRole("switch", { name: "겸용주택 분리계산" }).first();
    await mixed.click();
    await mixed.click();
    const edited = await editInheritanceDate(page, "2016-06-01");
    expect((await storedAsset(page))?.hasSeperateLandAcquisitionDate).toBe(true);
    await ownerSplit(page, "building_only");
    const stale = await calcTax(page);

    await seed(page, { ...OWN, acquisitionDate: edited });
    await ownerSplit(page, "building_only");
    const control = await calcTax(page);

    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(stale.status).toBe(200);
    expect(stale.tax).toBe(control.tax);
  });
});
