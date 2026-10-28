/**
 * 토지만 본인 × 같은 세대 — 세대 합가 여부·합가일 입력(계획서 `docs/02-design/features/land-only-household-merge-date.plan.md` Q-1 b · Q-2 a).
 *
 *   HM-E1 같은 세대를 고르면 합가 여부 카드가 나타나고, 「합침」을 고르면 합가일 칸이 나타난다.
 *   HM-E2 합가함 + 합가일 → 요청에 합가 여부·합가일이 실리고 세액이 「처음부터 같은 세대」(비과세 0)와 달라진다(토지분 비과세 제외).
 *   HM-E3 같은 세대를 「아니오(다른 세대)」로 바꾸면 합가 답이 지워진다(stale 방지).
 *   HM-E4 미응답은 계산 전에 막힌다(합가 여부 칸).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 *
 * 시료: 양도 12억(토지 4.8억 + 건물 7.2억) · 주택 2015-01-01 · 토지 2010-01-01 · 2023-02-16 양도 — 합가일 2022-06-01이면 토지분 184,730,000(독립 산식은 route anchor).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

const ASSET = {
  ...makeDefaultAsset(1),
  actualSalePrice: "1200000000", acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000",
  buildingStandardPriceAtTransfer: "840000000", standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000",
  buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000", residenceInputMode: "direct", residencePeriods: [], hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "120000000", buildingAcquisitionPrice: "180000000", saleSplitMode: "actual",
  landTransferPrice: "480000000", buildingTransferPrice: "720000000",
};
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice: "1200000000", householdHousingCount: "1",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: true, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), form(ASSET));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
}
const card = (page: Page) => page.locator('[data-asset-card-index="0"]');
const storedAsset = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0]);

async function landOnly(page: Page) {
  await card(page).getByText("토지·건물 소유자 다름", { exact: true }).first().click();
  await card(page).getByRole("button", { name: /토지만/ }).first().click();
  await expect.poll(async () => (await storedAsset(page))?.selfOwns).toBe("land_only");
}
async function sameHousehold(page: Page) {
  await card(page).getByTestId("building-owner-same-household-yes").first().check();
  await expect.poll(async () => (await storedAsset(page))?.buildingOwnerSameHousehold).toBe(true);
}
async function calc(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  const json = await r.json();
  return { status: r.status(), tax: json?.data?.result?.calculatedTax as number | undefined, body: r.request().postDataJSON() as Record<string, unknown> };
}

test.describe("토지만 본인 × 같은 세대 — 세대 합가일", () => {
  test("HM-E1: 같은 세대를 고르면 합가 여부 카드, 합침을 고르면 합가일 칸이 나타난다", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page);
    await landOnly(page);
    await expect(card(page).getByTestId("building-owner-household-merged")).toHaveCount(0);
    await sameHousehold(page);
    await expect(card(page).getByTestId("building-owner-household-merged").first()).toBeVisible();
    await expect(card(page).getByTestId("building-owner-household-merge-date")).toHaveCount(0);
    await card(page).getByTestId("building-owner-household-merged-yes").first().check();
    await expect(card(page).getByTestId("building-owner-household-merge-date").first()).toBeVisible();
    await card(page).getByTestId("building-owner-household-merged-no").first().check();
    await expect(card(page).getByTestId("building-owner-household-merge-date")).toHaveCount(0);
  });

  test("HM-E2: 합가함 + 합가일 → 요청에 실리고 세액이 처음부터 같은 세대와 달라진다", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page);
    await landOnly(page);
    await sameHousehold(page);
    await card(page).getByTestId("building-owner-household-merged-no").first().check();
    await expect.poll(async () => (await storedAsset(page))?.buildingOwnerHouseholdMerged).toBe(false);
    const control = await calc(page);
    expect(control.status).toBe(200);
    expect(control.tax).toBe(0);
    expect(control.body.buildingOwnerHouseholdMerged).toBe(false);
    expect(control.body.buildingOwnerHouseholdMergeDate).toBeUndefined();

    await seed(page);
    await landOnly(page);
    await sameHousehold(page);
    await card(page).getByTestId("building-owner-household-merged-yes").first().check();
    await fillDateAndVerify(page, { year: "2022", month: "6", day: "1" }, { scope: card(page).getByTestId("building-owner-household-merge-date").first().locator("xpath=ancestor::div[@data-field='buildingOwnerHouseholdMergeDate'][1]") });
    await expect.poll(async () => (await storedAsset(page))?.buildingOwnerHouseholdMergeDate).toBe("2022-06-01");
    const merged = await calc(page);
    expect(merged.status).toBe(200);
    expect([merged.body.buildingOwnerHouseholdMerged, merged.body.buildingOwnerHouseholdMergeDate]).toEqual([true, "2022-06-01"]);
    expect(merged.tax).toBe(184_730_000);
  });

  test("HM-E3: 같은 세대를 「아니오」로 바꾸면 합가 답이 지워진다", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page);
    await landOnly(page);
    await sameHousehold(page);
    await card(page).getByTestId("building-owner-household-merged-yes").first().check();
    await expect.poll(async () => (await storedAsset(page))?.buildingOwnerHouseholdMerged).toBe(true);
    await card(page).getByTestId("building-owner-same-household-no").first().check();
    await expect.poll(async () => (await storedAsset(page))?.buildingOwnerSameHousehold).toBe(false);
    await expect.poll(async () => (await storedAsset(page))?.buildingOwnerHouseholdMerged).toBeUndefined();
    await expect(card(page).getByTestId("building-owner-household-merged")).toHaveCount(0);
  });

  test("HM-E4: 미응답이면 계산 전에 막힌다(합가 여부 칸)", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page);
    await landOnly(page);
    await sameHousehold(page);
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    await expect(page.getByText(/처음부터 같은 세대였는지, 중간에 합쳤는지/).first()).toBeVisible({ timeout: 30_000 });
  });
});
