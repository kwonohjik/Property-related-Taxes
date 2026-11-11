/**
 * 일반건물 부담부증여 K-4 × §163⑨ 단서(의제취득일 이후) — 파트별 큰 금액(PR-3 B2 · 계획서 `docs/00-pm/remaining-4-measurements.plan.md` §B · Q-43 a · Q-46 a).
 * - BG-1 상속 1988 두 파트: 토지 등급 카드 안내에 「큰 금액」 · 건물 취득시 기준시가 안내에 §163⑨2호 · 양도차익 375,000,000(route anchor BGGB와 같다).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const GB: A = {
  addressJibun: "제주특별자치도 강남구 테스트동 8-8", assetKind: "general_building", acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance",
  acquisitionDate: "1988-06-01", inheritanceStartDate: "1988-06-01", decedentAcquisitionDate: "1970-01-01", useEstimatedAcquisition: false,
  landAcqMode: "actual", buildingAcqMode: "actual", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "5000000", gbTransferBuildingValue: "200000000", gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "50000000",
  gbZoneType: "general_residential", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "500000000", bgMortgageSetAmount: "500000000",
  bgLendingDepositTotal: "0", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual",
  bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "10000000",
};

async function seed(page: Page, asset: A, contractTotalPrice: string) {
  const s = {
    state: {
      formData: rosterForDeclaredCount({
        assets: [{ ...makeDefaultAsset(1), assetId: "p", ...asset }], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice, totalTransferExpense: "0",
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
}
async function open(page: Page, n: 2 | 3) {
  const header = page.locator(`[data-asset-section="${n}"] > button`).first();
  if ((await header.innerText()).includes("펼치기")) await header.click();
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status(), await r.text()).toBe(200);
  const body = r.request().postDataJSON() as { inheritedAcquisition?: { reportedValue?: number } };
  const j = (await r.json()) as { data: { result?: { transferGain: number }; aggregated?: { totalTransferGain: number } } };
  return { gain: j.data.aggregated?.totalTransferGain ?? j.data.result?.transferGain, sent: body.inheritedAcquisition };
}

test.describe("일반건물 부담부증여 × §163⑨ 단서 — 파트별", () => {
  test("BG-1 상속 1988 두 파트 — 안내 · 375,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, GB, "1000000000");
    await open(page, 3);
    await expect(page.getByTestId("gb-bg-pre1990-land-note")).toContainText("큰 금액 × 채무비율이 토지 취득가액입니다");
    await expect(page.getByText("이 금액(§164⑤ 가액)과 건물 실지취득가액 칸의 평가액 중 큰 금액").first()).toBeVisible();
    const r = await calc(page);
    expect(r.gain).toBe(375_000_000);
  });
});
