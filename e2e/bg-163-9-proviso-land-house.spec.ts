/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후) — 토지 1호 · 단독주택 2호 (PR-1 · 계획서 `docs/00-pm/bg-163-9-proviso-post-deemed.plan.md`).
 *
 * - BP-1 토지 상속 1988: ② 「부담부증여」 카드에 §164④ 칸 · ③ 안내(D-3m)가 산정방식 · §164④를 가리킨다 · 양도차익 104,446,760.
 * - BP-2 단독주택 증여 2005-04-29: §164⑦ 칸 · 양도차익 513,461,539.
 * - BP-3 같은 주택 · 기준시가 평가: §164 칸 없음 · ③ 안내는 「취득당시 기준시가 × 채무비율」.
 * - BP-4 상가 상속 2003(PR-2): ② 카드가 ③ §164⑥ 칸을 가리킨다 · ③ §164⑥ 섹션 부담부증여 문구 · 양도차익 205,454,546.
 * - BP-5 축 B 60/40 · 지분 2 상속 토지 1988(§11): 지분 카드 「이 지분의 취득가액을 자산 1과 따로 입력」에 §164④ 칸 · 합계 137,778,704
 *   (96,000,000 + 0.4 × 0.4 × (5억 − 238,883,100)). 종전에는 칸이 없어 평가액만(160,000,000).
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
async function seedAssets(page: Page, assets: A[], over: A) {
  const s = {
    state: {
      formData: rosterForDeclaredCount({
        assets, transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0",
        householdHousingCount: "0", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, ...over,
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
    // 양도일 2023-02-16 ≥ 2020.2.11. — 근거는 §163⑨ 본문 괄호(Q-29 a)
    await expect(section).toContainText("「부담부증여의 채무액에 해당하는 부분」");
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

  test("BP-4 상가 상속 2003 — ③ §164⑥ 칸을 가리킨다 · 205,454,546", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      addressJibun: "서울 강남구 테스트동 1-1", assetKind: "commercial_building", acquisitionCause: "inheritance", acquisitionDate: "2003-06-01",
      inheritanceStartDate: "2003-06-01", decedentAcquisitionDate: "1990-01-01", actualSalePrice: "920000000", standardPriceAtTransfer: "400000000",
      standardPriceAtAcq: "200000000", cbExclusiveArea: "50", cbSharedArea: "20", cbLandArea: "100", cbUnitPriceAtFirstOrAcq: "10000000",
      cbLandPricePerSqmAtAcq: "500000", cbLandPricePerSqmAtFirst: "700000", cbBuildingStdPriceAtAcq: "30000000", cbBuildingStdPriceAtFirst: "40000000",
      cbAcqBuildingStdBy164_5: true, ...bg("920000000", "460000000"), bgActualAcquisitionTotal: "100000000",
    }, "920000000");
    await open(page, 2);
    await expect(page.getByTestId("bg-163-9-proviso-section")).toContainText("「§164⑥ 취득당시 기준시가」 칸");
    await open(page, 3);
    await expect(page.getByTestId("cb164-6-bg-post-deemed-note")).toContainText("이 값 중 큰 금액");
    const r = await calc(page);
    expect(r.sent?.reportedValue).toBe(100_000_000);
    expect(r.gain).toBe(205_454_546);
  });

  test("BP-5 축 B 60/40 · 상속 토지 지분 — 지분 카드에 §164④ 칸 · 137,778,704", async ({ page }) => {
    test.setTimeout(120_000);
    const base: A = { assetKind: "land", acquisitionArea: "100", transferArea: "100", landAreaM2: "100", landNature: "independent", companionLandNature: "independent", standardPriceAtTransfer: "300000000" };
    await seedAssets(page, [
      { ...makeDefaultAsset(1), assetId: "p", addressJibun: "제주특별자치도 강남구 테스트동 5-5", ...base, acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
        actualSalePrice: "500000000", ...bg("500000000", "200000000"), bgActualAcquisitionLand: "100000000", ownershipNumerator: "60", ownershipDenominator: "100" },
      { ...makeDefaultAsset(2), assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", acquisitionCause: "inheritance", acquisitionDate: "1988-06-01",
        inheritanceStartDate: "1988-06-01", decedentAcquisitionDate: "1980-01-01", inheritanceValuationMethod: "supplementary",
        bgShareOwnAcquisition: true, bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100000000",
        pre1990Enabled: true, pre1990PricePerSqm_1990: "5000000", pre1990Grade_current: "100", pre1990Grade_prev: "90", pre1990Grade_atAcq: "80" },
    ], { assetSplitMode: "fractional", contractTotalPrice: "500000000" });
    // 지분 카드 ③ 취득정보까지 펼친다 — 자산 1은 매매라 단서 칸이 없고, 보이는 단서 섹션은 지분 카드의 것 하나다
    for (let round = 0; round < 3; round++) {
      const heads = page.locator("[data-asset-section] > button");
      for (let k = 0; k < (await heads.count()); k++) {
        const h = heads.nth(k);
        if ((await h.isVisible()) && (await h.innerText()).includes("펼치기")) await h.click();
      }
    }
    const share = page.getByTestId("bg-share-own-acquisition");
    await expect(share.getByTestId("bg-163-9-proviso-section")).toContainText("§164④ 가액 중 큰 금액");
    await expect(page.getByTestId("bg-163-9-proviso-section")).toHaveCount(1);
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    await page.getByRole("button", { name: /계산하기/ }).click();
    const r = await resp;
    expect(r.status(), await r.text()).toBe(200);
    const body = r.request().postDataJSON() as { companionAssets?: { inheritedAcquisition?: { reportedValue?: number } }[] };
    expect(body.companionAssets?.[0]?.inheritedAcquisition?.reportedValue).toBe(40_000_000);
    const j = (await r.json()) as { data: { aggregated: { totalTransferGain: number } } };
    expect(j.data.aggregated.totalTransferGain).toBe(137_778_704);
  });
});
