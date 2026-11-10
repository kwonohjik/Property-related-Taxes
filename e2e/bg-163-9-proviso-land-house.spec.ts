/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후) — 토지 1호 · 단독주택 2호 (PR-1 · 계획서 `docs/00-pm/bg-163-9-proviso-post-deemed.plan.md`).
 *
 * - BP-1 토지 상속 1988: ② 「부담부증여」 카드에 §164④ 칸 · ③ 안내(D-3m)가 산정방식 · §164④를 가리킨다 · 양도차익 104,446,760.
 * - BP-2 단독주택 증여 2005-04-29: §164⑦ 칸 · 양도차익 513,461,539.
 * - BP-3 같은 주택 · 기준시가 평가: §164 칸 없음 · ③ 안내는 「취득당시 기준시가 × 채무비율」.
 * 고정값은 route anchor(`transfer.route.bg-163-9-proviso-land-house.anchor.test.ts`)와 같다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const LAND: A = {
  addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "inheritance", acquisitionDate: "1988-06-01", inheritanceStartDate: "1988-06-01",
  decedentAcquisitionDate: "1980-01-01", actualSalePrice: "500000000", standardPriceAtTransfer: "300000000", acquisitionArea: "100", transferArea: "100",
  pre1990Enabled: true, pre1990PricePerSqm_1990: "5000000", pre1990Grade_current: "100", pre1990Grade_prev: "90", pre1990Grade_atAcq: "80",
};
const HOUSE: A = {
  addressJibun: "제주특별자치도 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "gift", acquisitionDate: "2005-04-29",
  donorAcquisitionDate: "2000-01-01", giftDonorRelation: "other", giftSameHousehold: "no", inheritanceAssetKind: "house_individual",
  actualSalePrice: "1200000000", standardPriceAtTransfer: "800000000", acquisitionArea: "200", transferArea: "200",
  inhHouseValLandArea: "200", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "300000000", inhHouseValLandPricePerSqmAtInheritance: "500000",
  inhHouseValBuildingStdPriceAtFirst: "60000000", inhHouseValBuildingStdPriceAtInheritance: "50000000",
};
const bg = (market: string, debt: string): A => ({
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: market,
  bgMortgageDebtAmount: debt, bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual",
});

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
  const j = (await r.json()) as { data: { result?: { transferGain: number } } };
  return { gain: j.data.result?.transferGain, sent: body.inheritedAcquisition };
}

test.describe("부담부증여 × §163⑨ 단서 — 토지 · 단독주택", () => {
  test("BP-1 토지 상속 1988 — §164④ 칸 · ③ 안내 · 104,446,760", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...LAND, ...bg("500000000", "200000000"), bgActualAcquisitionLand: "100000000" }, "500000000");
    await open(page, 2);
    const section = page.getByTestId("bg-163-9-proviso-section");
    await expect(section).toContainText("§164④ 가액 중 큰 금액");
    await expect(section).toContainText("해석례는 확인하지 못했습니다");
    await open(page, 3);
    await expect(page.getByText("카드에서 고른").first()).toBeVisible();
    await expect(page.getByText("§164④ 가액과 큰 금액을 씁니다").first()).toBeVisible();
    const r = await calc(page);
    expect(r.sent?.reportedValue).toBe(100_000_000);
    expect(r.gain).toBe(104_446_760);
  });

  test("BP-2 단독주택 증여 2005-04-29 — §164⑦ 칸 · 513,461,539", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...HOUSE, ...bg("1200000000", "600000000"), bgActualAcquisitionTotal: "100000000" }, "1200000000");
    await open(page, 2);
    await expect(page.getByTestId("bg-163-9-proviso-section")).toContainText("§164⑦ 가액 중 큰 금액");
    const r = await calc(page);
    expect(r.gain).toBe(513_461_539);
  });

  test("BP-3 같은 주택 · 기준시가 평가 — §164 칸 없음 · 기준시가 안내", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      ...HOUSE, ...bg("1200000000", "600000000"), bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "",
      bgStdPriceAtTransfer: "800000000", bgStdPriceAtAcquisition: "50000000",
    }, "1200000000");
    await open(page, 2);
    await open(page, 3);
    await expect(page.getByText("취득가액 — 부담부증여 §159 자동 산정").first()).toBeVisible();
    await expect(page.getByTestId("bg-163-9-proviso-section")).toHaveCount(0);
    await expect(page.getByText("취득당시 기준시가에").first()).toBeVisible();
  });
});
