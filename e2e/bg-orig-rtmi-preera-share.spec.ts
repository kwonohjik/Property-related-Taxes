/**
 * E2E: 원조합원 입주권 부담부증여 × 지분(축 A·축 B·묶음) × 담보 승 × 괄호 열거 이전 — 차단 해제 화면 확인(⑤⑥⑦⑧).
 * 계획서 `docs/00-pm/bg-orig-rtmi-preera-share-open.plan.md`. 종전에는 시가 모드에서 ⑧이 막았다(⑫는 200).
 * 시료: 양도가액 전체 30억 · 평가액 전체 9억 · 종전 부동산 실지 전체 3억 · 시가 15억 · 양도일 2023-02-27. 청산금은 카드마다 본인 지분 해당분을 입력한다.
 *
 *   OE-1. 축 A 50% · 지분분 1억: 청산금 칸 라벨 「(지분 해당분)」 · 200 · 1,250,000,000 · 사이드바 취득가액 250,000,000(신고서 합계 — 실지 1.5억 + 지분분 청산금 1억)
 *   OE-2. 축 B 60/40 · 지분분 1.2억·0.8억: 두 카드 모두 청산금 칸 · 200 · 2,500,000,000 · 카드별 사이드바
 *   OE-3. 묶음 주택 + 원조합원 50%: 200 · 3,735,000,000
 *   OE-4. 열거 이후(2023-02-28)는 계속 막힌다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const asset = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right",
  isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionCause: "purchase", acquisitionDate: "2009-07-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "0",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1500000000", bgMortgageSetAmount: "1500000000", bgAcquisitionMethod: "actual",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgActualAcquisitionTotal: "300000000",
  actualSalePrice: "", fixedAcquisitionPrice: "", ...over,
});
const house = () => ({
  ...makeDefaultAsset(1), assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3000000000", bgMortgageSetAmount: "3000000000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
});
const SHARE = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const PRE = "2023-02-27";

async function seed(page: Page, assets: unknown[], transferDate: string, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets, transferDate, filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (let i = 0; i < assets.length; i++) for (const n of [1, 2, 3] as const) {
    if ((await page.locator(`[data-asset-card-index="${i}"] [data-asset-section="${n}"]`).count()) > 0) await expandAssetSection(page, n, i);
  }
}
const cardAt = (page: Page, i: number) => page.locator(`[data-asset-card-index="${i}"]`);
async function clickToCalc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}
async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await clickToCalc(page);
  return res;
}
const totalOf = (j: { data: { aggregated?: { totalTransferGain?: number }; result?: { transferGain?: number } } }) => j.data.aggregated?.totalTransferGain ?? j.data.result?.transferGain;
/** 결과 → 입력 단계로 돌아가 사이드바(⑥)를 읽는다 — 계산 전에는 「계산 후 표시」다. */
async function sidebarAfterCalc(page: Page) {
  await page.getByRole("button", { name: /^이전/ }).last().click();
  await page.getByRole("button", { name: "가산세" }).first().click();
  const aside = page.locator("aside");
  await expect(aside).toContainText("취득가액");
  return (await aside.innerText()).replace(/\s+/g, " ");
}

test.describe("원조합원 입주권 지분 × 담보 승 × 열거 이전", () => {
  test.setTimeout(240_000);

  test("OE-1: 축 A 50% — 지분 해당분 청산금 · 200 · 1,250,000,000", async ({ page }) => {
    await seed(page, [asset(SHARE)], PRE);
    await expect(cardAt(page, 0).locator('[data-field="redevSettlementAmount"]')).toContainText("청산금 납부액 (지분 해당분)");
    await expect(cardAt(page, 0).locator('[data-field="bgActualAcquisitionTotal"]')).toBeVisible();
    const r = await calculate(page);
    expect(r.status(), await r.text()).toBe(200);
    expect(totalOf(await r.json())).toBe(1_250_000_000);
    await expect(page.locator("body")).toContainText("1,250,000,000");
    const side = await sidebarAfterCalc(page);
    expect(side, side).toContain("양도가액 지분 50% 1,500,000,000");
    // §166 결과의 사이드바 취득가액은 신고서 합계(`redevFilingTotals`)다 — 양도가액 − 양도차익과 같다.
    expect(side, side).toContain("취득가액 250,000,000");
  });

  test("OE-2: 축 B 60/40 — 두 카드 모두 청산금 칸 · 200 · 2,500,000,000", async ({ page }) => {
    const a1 = asset({ assetId: "p", ownershipNumerator: "60", ownershipDenominator: "100", bgMortgageDebtAmount: "3000000000", bgMortgageSetAmount: "3000000000", redevSettlementAmount: "120000000" });
    const a2 = { ...makeDefaultAsset(2), assetId: "s2", ownershipNumerator: "40", ownershipDenominator: "100", isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionCause: "purchase", acquisitionDate: "2009-07-01",
      redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevOriginalAssetType: "housing", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "80000000", redevPreApprovalExpenses: "0" };
    await seed(page, [a1, a2], PRE, { assetSplitMode: "fractional", contractTotalPrice: "3000000000" });
    for (const i of [0, 1]) await expect(cardAt(page, i).locator('[data-field="redevSettlementAmount"]'), `카드 ${i + 1}`).toContainText("(지분 해당분)");
    const r = await calculate(page);
    expect(r.status(), await r.text()).toBe(200);
    expect(totalOf(await r.json())).toBe(2_500_000_000);
    await expect(page.locator("body")).toContainText("2,500,000,000");
    const side = await sidebarAfterCalc(page);
    expect(side, side).toContain("합계 양도가액 3,000,000,000");
  });

  test("OE-3: 묶음 주택 + 원조합원 50% — 200 · 3,735,000,000", async ({ page }) => {
    await seed(page, [house(), asset({ assetId: "o", ...SHARE })], PRE, { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "9000000000" });
    const r = await calculate(page);
    expect(r.status(), await r.text()).toBe(200);
    expect(totalOf(await r.json())).toBe(3_735_000_000);
    await expect(page.locator("body")).toContainText("3,735,000,000");
  });

  test("OE-4: 열거 이후(2023-02-28)는 계속 막힌다", async ({ page }) => {
    await seed(page, [asset(SHARE)], "2023-02-28");
    await clickToCalc(page);
    await expect(page.getByText(/원조합원 입주권의 기준시가/).first()).toBeVisible({ timeout: 20_000 });
  });
});
