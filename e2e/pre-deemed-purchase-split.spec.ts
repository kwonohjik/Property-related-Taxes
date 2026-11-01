/**
 * E2E: 의제취득일(1985.1.1.) 전 매수 — 토지·건물 취득일 분리 영 §176조의2④ (PR-3d · 경로 B)
 * 계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` §12.8.
 *
 *   PD-S1. 주택 토지 1984-06-01 · 건물 1990 → 토지 칸 1985-01-01 · 건물 그대로 · 토지 실제 취득일 · 요청 part land · 결과 ② 101,411,574
 *   PD-S2. 두 파트 모두 1985 전 → 입력 카드 없이 안내 · 요청에 없음
 *   PD-S3. 일반건물 분리 ON 토지 1984 · 건물 1995 → 서브객체 part land · 결과 ②
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const HOUSE = (o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 5-1", assetKind: "housing", acquisitionCause: "purchase", transferType: "regular", hasSeperateLandAcquisitionDate: true, usePreHousingDisclosure: false,
  landAcquisitionDate: "1985-01-01", acquisitionDate: "1990-03-01", preDeemedOriginalLandAcquisitionDate: "1984-06-01",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", landTransferPrice: "500,000,000", buildingTransferPrice: "500,000,000", saleSplitMode: "actual",
  landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "400,000,000",
  acquisitionArea: "200", transferArea: "200", houseSizeType: "regular", standardPriceAtTransfer: "500000000", landStandardPriceAtTransfer: "250000000", buildingStandardPriceAtTransfer: "250000000", ...o,
});
const GB2 = (o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "1985-01-01", acquisitionDate: "1995-03-01", preDeemedOriginalLandAcquisitionDate: "1984-06-01", landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "400,000,000",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", ...o,
});

async function seed(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets, contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0",
        isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}
async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  return res;
}
const stored = (page: Page) =>
  page.evaluate(() => {
    const a = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state.formData.assets[0];
    return `${a.acquisitionDate}|${a.landAcquisitionDate}|${a.preDeemedOriginalLandAcquisitionDate}`;
  });

test("PD-S1: 주택 토지 1984 · 건물 1990 — 토지 파트 ②", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [HOUSE({ landAcquisitionDate: "1984-06-01", preDeemedOriginalLandAcquisitionDate: "" })]);
  await expandAssetSection(page, 3);
  await page.getByTestId("acq-date-land").locator("input").first().focus();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).click();
  await expect.poll(() => stored(page)).toBe("1990-03-01|1985-01-01|1984-06-01");
  const card = page.getByTestId("pre-deemed-purchase-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("토지 실제 취득일");
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  expect(JSON.parse(res.request().postData() ?? "{}").preDeemedPurchase).toEqual({ part: "land", originalAcquisitionDate: "1984-06-01" });
  await expect(page.getByTestId("pre-deemed-purchase-result-card")).toContainText("101,411,574");
});

test("PD-S2: 두 파트 모두 1985 전 — 안내만 · 요청에 없음", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [HOUSE({ acquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1980-03-01", landAcquisitionPrice: "", buildingAcquisitionPrice: "", fixedAcquisitionPrice: "500,000,000" })]);
  await expandAssetSection(page, 3);
  await expect(page.getByTestId("pre-deemed-purchase-gb-not-compared")).toContainText("모두 1985.1.1. 전");
  await expect(page.getByTestId("pre-deemed-purchase-card")).toHaveCount(0);
});

test("PD-S3: 일반건물 분리 ON 토지 1984 · 건물 1995 — 서브객체 part land · 결과 ②", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [GB2()]);
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  expect(JSON.parse(res.request().postData() ?? "{}").generalBuildingValuation.preDeemedPurchase).toEqual({ part: "land", originalAcquisitionDate: "1984-06-01" });
  await expect(page.getByTestId("pre-deemed-purchase-result-card")).toContainText("101,411,574");
});
