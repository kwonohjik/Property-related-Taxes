/**
 * 부담부증여 × §163⑨ 단서(의제취득일 이후) — 조합원입주권 원조합원 토지 출자(PR-3 B1 · 계획서 `docs/00-pm/remaining-4-measurements.plan.md` §B · Q-45 a).
 * - BR-1 입주권 토지 출자 1988 상속: ② 「부담부증여」 카드에 §164④ 칸 → 양도차익 360,000,000(route anchor BGOM과 같다 · 수정 전 450,000,000).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const RT: A = {
  addressJibun: "제주특별자치도 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "land", redevLandArea: "200", redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000",
  redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no", isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000",
  redevSettlementAmount: "100000000", actualSalePrice: "1300000000", fixedSalePrice: "1300000000",
  acquisitionCause: "inheritance", acquisitionDate: "1988-06-01", inheritanceStartDate: "1988-06-01", publishedValueAtInheritance: "300000000",
  inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01",
  pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1300000000",
  bgMortgageDebtAmount: "650000000", bgMortgageSetAmount: "650000000", bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
};

async function seed(page: Page, asset: A, contractTotalPrice: string) {
  const s = {
    state: {
      formData: rosterForDeclaredCount({
        assets: [{ ...makeDefaultAsset(1), assetId: "p", ...asset }], transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice, totalTransferExpense: "0",
        householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
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

test.describe("부담부증여 × §163⑨ 단서 — 입주권 원조합원", () => {
  test("BR-1 토지 출자 1988 — ② 카드 §164④ 칸 · 360,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, RT, "1300000000");
    await open(page, 2);
    await expect(page.getByTestId("bg-163-9-proviso-section")).toContainText("§164④ 가액 중 큰 금액");
    const r = await calc(page);
    expect(r.gain).toBe(360_000_000);
  });
});
