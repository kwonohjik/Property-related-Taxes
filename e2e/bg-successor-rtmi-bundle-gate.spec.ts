/**
 * E2E: 함께 양도 묶음(서로 다른 물건)의 조합원입주권 담보 승 — ⑧ 게이트가 막던 조합 (X-1). 계획서 `docs/00-pm/bg-successor-rtmi-extend-measure.md` C1·C2·D1.
 * 시료: 주택(취득시 기준시가 5억 · 시가 10억 · 담보 30억) + 승계 입주권(I-1 시료와 같음 · 기준시가 3억) · 계약금액 90억 · 시가 모드 · 양도일 2026-02-16.
 * 오라클(손계산): 주택 30억 − 5억 − 1,500만 = 2,485,000,000 · 입주권 30억 − 3억 − 300만 = 2,697,000,000 → 합 5,182,000,000.
 *
 *   BE-1. 승계 입주권 묶음: ⑧ 게이트 문구 없음 · 200 · 합계 5,182,000,000 · 입주권 카드에 기준시가 2칸(승계취득가액 칸 숨김) · ⑦ 카드 2,485,000,000/2,697,000,000 · ⑥ 사이드바 입주권 취득가액 300,000,000/필요경비 3,000,000
 *   BE-2. 열거 이전(2023-02-27): 200 · 합계 5,085,000,000 · 입주권 카드는 승계취득가액 칸
 *   BE-3. 원조합원 열거 이후: 계속 막힌다 — «원조합원 입주권의 기준시가»
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const asset = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right",
  isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", acquisitionCause: "purchase", acquisitionDate: "2020-01-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
  successorRightAcqPrice: "300000000", successorRightAddedContribution: "100000000",
  successorRightStdPaidAtAcq: "200000000", successorRightStdPremiumAtAcq: "100000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3000000000", bgMortgageSetAmount: "3000000000", bgAcquisitionMethod: "actual",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgActualAcquisitionTotal: "",
  actualSalePrice: "", fixedAcquisitionPrice: "", ...over,
});


const house = () => ({
  ...makeDefaultAsset(1), assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "3000000000", bgMortgageSetAmount: "3000000000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
});
const rtmi = (over: Record<string, unknown> = {}) => ({ ...asset(), assetId: "o", addressJibun: "서울 강남구 테스트동 9-9", ...over });

async function seedBundle(page: Page, assets: unknown[], transferDate = "2026-02-16") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "9000000000", transferDate, filingDate: "2026-04-30", totalTransferExpense: "0",
        householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const i of [0, 1]) for (const n of [1, 2, 3] as const) await expandAssetSection(page, n, i);
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

test.describe("함께 양도 묶음 × 조합원입주권 담보 승 — 게이트 해제", () => {
  test.setTimeout(240_000);

  test("BE-1: 주택 + 승계 입주권 — 게이트 문구 없음 · 200 · 합계 5,182,000,000 · 입주권 카드 기준시가 2칸", async ({ page }) => {
    await seedBundle(page, [house(), rtmi()]);
    await expect(cardAt(page, 1).getByTestId("bg-successor-right-std-forced")).toBeVisible();
    await expect(cardAt(page, 1).locator('[data-field="successorRightStdPaidAtAcq"]')).toBeVisible();
    await expect(cardAt(page, 1).locator('[data-field="successorRightAcqPrice"]')).toHaveCount(0);
    const r = await calculate(page);
    expect(r.status(), await r.text()).toBe(200);
    expect(totalOf(await r.json())).toBe(5_182_000_000);
    await expect(page.getByText(/함께 양도와 같이 계산하지 않습니다/)).toHaveCount(0);
    const body = (await page.evaluate(() => document.body.textContent ?? "")).replace(/\s+/g, " ");
    for (const v of ["2,485,000,000", "2,697,000,000", "5,182,000,000"]) expect(body, v).toContain(v);
    // ⑥ 사이드바 — 결과 → 입력 단계로 돌아가 읽는다(계산 전에는 「계산 후 표시」).
    await page.getByRole("button", { name: /^이전/ }).last().click();
    await page.getByRole("button", { name: "가산세" }).first().click();
    const side = (await page.locator("aside").innerText()).replace(/\s+/g, " ");
    expect(side, side).toContain("입주권 양도가액 3,000,000,000 취득가액 300,000,000 필요경비 3,000,000");
    expect(side, side).toContain("합계 양도가액 6,000,000,000");
  });

  test("BE-2: 열거 이전 2023-02-27 — 200 · 합계 5,085,000,000 · 입주권 카드는 승계취득가액 칸", async ({ page }) => {
    await seedBundle(page, [house(), rtmi()], "2023-02-27");
    await expect(cardAt(page, 1).getByTestId("bg-successor-right-std-forced")).toHaveCount(0);
    await expect(cardAt(page, 1).locator('[data-field="successorRightAcqPrice"]')).toBeVisible();
    const r = await calculate(page);
    expect(r.status(), await r.text()).toBe(200);
    expect(totalOf(await r.json())).toBe(5_085_000_000);
  });

  test("BE-3: 원조합원 열거 이후는 계속 막힌다", async ({ page }) => {
    await seedBundle(page, [house(), rtmi({ isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionDate: "2009-07-01", bgActualAcquisitionTotal: "300000000" })]);
    await clickToCalc(page);
    await expect(page.getByText(/원조합원 입주권의 기준시가/).first()).toBeVisible({ timeout: 20_000 });
  });
});
