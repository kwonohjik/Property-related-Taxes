/**
 * E2E: 의제취득일(1985.1.1.) 전 매수 일반건물 일괄취득 — 영 §176조의2④ (PR-3c · 경로 A · Q-8 a · Q-15 b)
 * 계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` §12.
 * 시료: 양도 10억 · 실가 5억 · 1984.6.1. 매수 → ② 5억 × 50.29 ÷ 49.59 = 507,057,874.
 *
 *   PD-G1. 1984-06-01 입력 → 토지·건물 저장값 1985-01-01 · 카드 · 실제 취득일 보존 · 요청 서브객체 · 결과 카드 ②
 *   PD-G2. 환산 → 입력 카드 없이 안내만 · 요청에 없음
 *   PD-G3. 실제 취득일 빈칸(옛 저장값) → 막힘 · 카드에 입력하면 계산
 *   PD-G4. 지분 분할 50%+50% · 취득월 다름 → 결과에 지분마다 비교 카드
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const GB = (o: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular",
  acquisitionDate: "1985-01-01", landAcquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", fixedAcquisitionPrice: "500,000,000",
  gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
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

async function clickCalc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}
async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await clickCalc(page);
  return res;
}
const stored = (page: Page) =>
  page.evaluate(() => {
    const a = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}").state.formData.assets[0];
    return `${a.acquisitionDate}|${a.landAcquisitionDate}|${a.preDeemedOriginalAcquisitionDate}`;
  });

test("PD-G1: 덮어쓰기 · 카드 · 요청 · 결과 카드 ② 507,057,874", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [GB({ acquisitionDate: "1984-06-01", landAcquisitionDate: "1984-06-01", preDeemedOriginalAcquisitionDate: "" })]);
  await expandAssetSection(page, 3);
  await page.getByTestId("acq-date-building").locator("input").first().focus();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).click();
  await expect.poll(() => stored(page)).toBe("1985-01-01|1985-01-01|1984-06-01");
  await expect(page.getByTestId("pre-deemed-purchase-card")).toHaveCount(1);
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  const body = JSON.parse(res.request().postData() ?? "{}");
  expect(body.generalBuildingValuation.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
  const result = page.getByTestId("pre-deemed-purchase-result-card");
  await expect(result).toContainText("507,057,874");
  await expect(result).toContainText("← 채택");
});

test("PD-G2: 환산 — 입력 카드 없이 안내 · 요청에 없음", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [GB({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "" })]);
  await expandAssetSection(page, 3);
  await expect(page.getByTestId("pre-deemed-purchase-gb-not-compared")).toBeVisible();
  await expect(page.getByTestId("pre-deemed-purchase-card")).toHaveCount(0);
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  expect(JSON.parse(res.request().postData() ?? "{}").generalBuildingValuation.preDeemedPurchase).toBeUndefined();
  await expect(page.getByTestId("pre-deemed-purchase-result-card")).toHaveCount(0);
});

test("PD-G3: 실제 취득일 빈칸 → 막힘 · 카드 입력 후 계산", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [GB({ preDeemedOriginalAcquisitionDate: "" })]);
  await clickCalc(page);
  await expect(page.getByText(/실제 취득일을 입력하세요/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "자산 목록" }).first().click();
  await expandAssetSection(page, 3);
  const parts = page.getByTestId("pre-deemed-purchase-original-date").locator("input");
  await parts.nth(0).fill("1984");
  await parts.nth(1).fill("6");
  await parts.nth(2).fill("1");
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  await expect(page.getByTestId("pre-deemed-purchase-result-card")).toContainText("507,057,874");
});

test("PD-G4: 지분 분할 — 지분마다 자기 배율의 비교 카드", async ({ page }) => {
  test.setTimeout(240_000);
  const SHARE = (id: number, o: Record<string, unknown>) => ({ ...GB({ ownershipNumerator: "50", ownershipDenominator: "100", ...o }), ...(({ assetId }) => ({ assetId }))(makeDefaultAsset(id)) });
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets: [SHARE(1, {}), SHARE(2, { preDeemedOriginalAcquisitionDate: "1984-09-01" })], assetSplitMode: "fractional", bundledSaleMode: "actual",
        contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0",
        isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  const cards = page.getByTestId("pre-deemed-purchase-result-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("253,528,937");
  await expect(cards.nth(1)).toContainText("247,929,402");
});
