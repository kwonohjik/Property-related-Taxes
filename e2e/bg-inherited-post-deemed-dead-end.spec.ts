/**
 * 부담부증여 × 상속 × 의제취득일 이후 — ① 평가액 칸이 없는데 ⑧이 요구하던 막다른 길(계획서 `docs/00-pm/remaining-4-measurements.plan.md` §A · Q-40 a).
 * - DE-E1 주택 상속 2010 · 부담부증여 시가 10억 · 채무 6억 · 실지 2억: ③에 평가액 칸 없음 → 계산 200 · 양도차익 480,000,000(route anchor DE-2와 같다).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const H: A = {
  addressJibun: "제주특별자치도 강남구 테스트동 4-4", assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2010-01-01",
  inheritanceStartDate: "2010-01-01", decedentAcquisitionDate: "1975-01-01", publishedValueAtInheritance: "", standardPriceAtTransfer: "800000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000", bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000",
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
  
  const j = (await r.json()) as { data: { result?: { transferGain: number } } };
  return { gain: j.data.result?.transferGain };
}

test.describe("부담부증여 × 상속 × 의제취득일 이후 — 막다른 길", () => {
  test("DE-E1 주택 상속 2010 — 평가액 칸 없이 계산 · 480,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, H, "1000000000");
    await open(page, 3);
    await expect(page.locator('[data-field="publishedValueAtInheritance"]')).toHaveCount(0);
    const r = await calc(page);
    expect(r.gain).toBe(480_000_000);
  });
});
