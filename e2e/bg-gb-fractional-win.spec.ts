/**
 * E2E: 부담부증여 **지분 일반건물(토지+건물 일괄) × 시가 모드 × 담보 승(상증법 §66)** — ⑧ 차단 해소 + 취득 안내 + 축 B 막다른 길 해소 + 의제취득일 전 파트는 계속 막힘 (Q-3 · Q-1 a · Q-2 a).
 * 계획서 `docs/00-pm/bg-gb-fractional-gate.plan.md` §3·§4. 종전에는 «지분 50%를 가진 자산에서 담보평가액 … 계산하지 않습니다»로 막혔다.
 * 시료: 일반건물 · 양도시 기준시가 8억 · 취득시 4억 · 시가 10억 · 본인 인수 채무 7억(축 A 지분 50%, 시가 해당분 5억보다 커 담보 승).
 *
 *   GB-E1. 축 A 지분 50% — 200 · 양도차익 494,000,000 · 차단 문구 없음 · 취득 안내가 «취득시 기준시가 × 채무비율» (정반대 «실지취득가액 × 채무비율» 없음)
 *   GB-E2. 축 B 60/40 · 실지취득가액 비움 — 200 · 988,000,000 (종전 ⑫ 400 «토지·건물 칸이 모두 필요합니다» 막다른 길)
 *   GB-E3. 토지 파트가 의제취득일 전 상속 + 지분 50% + 담보 승 · ① 비움 — 200 · 581,550,000 · 담보 승 안내가 뜨고 3자 max 안내·① 칸은 없다
 *          (종전 «… 만 계산합니다» 차단 → V-P5 개방 · `bg-gb-pre-deemed-fractional-clause-a.plan.md`)
 *   GB-E4. 같은 파트 · 축 B 60/40 · ① 비움 — 200 · 1,163,100,000 · 첫 카드 담보 승 안내
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const gb = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetId: "p", addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  landAcquisitionDate: "2015-01-01", hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: false,
  gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000", gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", actualSalePrice: "1600000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "700000000", bgMortgageSetAmount: "700000000",
  ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", ...over,
});

async function seedAndOpen(page: Page, assets: unknown[], formExtra: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: {
      formData: {
        assets, transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0",
        householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, ...formExtra,
      },
      pendingMigration: false,
    },
    version: 0,
  }));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function openAcquisitionSection(page: Page) {
  await page.getByRole("button", { name: /^취득정보/ }).first().click();
}
async function clickToCalc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}
async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await clickToCalc(page);
  return res;
}

test("GB-E1: 축 A 지분 50% 일반건물 시가 담보 승 — 200 · 양도차익 494,000,000 · 취득 안내 «기준시가 × 채무비율»", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [gb()]);
  await openAcquisitionSection(page);
  const notice = page.getByTestId("gb-bg-collateral-acq-notice").first();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("취득시 기준시가 × 채무비율");
  await expect(page.locator("body")).not.toContainText("취득가액은 실지취득가액 × 채무비율입니다");
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).not.toContainText("지분 50%를 가진 자산에서 담보평가액");
  await expect(page.locator("body")).toContainText("494,000,000");
});

test("GB-E2: 축 B 60/40 일반건물 담보 승 · 실지취득가액 비움 — 200 · 988,000,000 (종전 ⑫ 400 막다른 길)", async ({ page }) => {
  test.setTimeout(240_000);
  const blank = { bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "", bgMortgageDebtAmount: "1400000000", bgMortgageSetAmount: "1400000000", ownershipRemainderThirdParty: "" };
  await seedAndOpen(
    page,
    [gb({ assetId: "p", ownershipNumerator: "60", ownershipDenominator: "100", ...blank }), gb({ assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", ...blank })],
    { assetSplitMode: "fractional", contractTotalPrice: "1600000000" },
  );
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).not.toContainText("토지·건물 칸이 모두 필요합니다");
  await expect(page.locator("body")).toContainText("988,000,000");
});

/** 토지 파트만 1980 상속(의제취득일 전) · 의제취득일 토지 단가 300,000 · ①(상증법 평가액)은 비운다 — 담보 승이면 쓰이지 않는다. */
const PRE_LAND = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01", acquisitionCause: "inheritance", inheritanceStartDate: "1980-01-01",
  decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "", gbAcqLandPricePerSqm: "300000" };

async function expectCollateralNoticeOnly(page: Page) {
  await openAcquisitionSection(page);
  await expect(page.getByTestId("gb-bg-collateral-acq-notice").first()).toBeVisible();
  await expect(page.getByTestId("gb-bg-three-way-acq-notice")).toHaveCount(0);
  await expect(page.getByTestId("gb-bg-pre-deemed-reported-land")).toHaveCount(0);
}

test("GB-E3: 토지 파트가 의제취득일 전 상속 + 지분 50% + 담보 승 · ① 비움 — 200 · 581,550,000 · 담보 승 안내만", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [gb(PRE_LAND)]);
  await expectCollateralNoticeOnly(page);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).not.toContainText("만 계산합니다");
  await expect(page.locator("body")).toContainText("581,550,000");
});

test("GB-E4: 같은 파트 · 축 B 60/40 · ① 비움 — 200 · 1,163,100,000 · 첫 카드 담보 승 안내", async ({ page }) => {
  test.setTimeout(240_000);
  const share = { ...PRE_LAND, bgMortgageDebtAmount: "1400000000", bgMortgageSetAmount: "1400000000", ownershipRemainderThirdParty: "" };
  await seedAndOpen(
    page,
    [gb({ assetId: "p", ownershipNumerator: "60", ownershipDenominator: "100", ...share }), gb({ assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", ...share })],
    { assetSplitMode: "fractional", contractTotalPrice: "1600000000" },
  );
  await expectCollateralNoticeOnly(page);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).toContainText("1,163,100,000");
});
