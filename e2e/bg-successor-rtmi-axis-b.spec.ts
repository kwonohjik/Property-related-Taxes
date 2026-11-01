/**
 * E2E: 같은 물건 지분 분할 취득(축 B) 승계 조합원입주권 부담부증여 × 담보(상증법 §66) 승 — 카드마다 입주권 기준시가 2칸 · 양도차익 (X-3) 화면 확인(⑤⑥⑦⑧).
 * 계획서 `docs/00-pm/bg-successor-rtmi-axis-b.plan.md`. 종전에는 시가 모드가 ⑧ 차단, 기준시가 모드는 둘째 카드에 기준시가 칸이 없어 ⑧ 통과 ∧ ⑫ 400 막다른 길이었다.
 * 시료: 60/40 두 카드(둘 다 승계 · 취득 2020-01-01) · 담보 30억(물건 전체) · 시가 15억 · 양도일 2026-02-16 · 카드 1 기준시가 3억(2억+1억) · 카드 2 2억(1.5억+0.5억).
 * 오라클(손계산): 30억 − (0.6×3억 + 0.4×2억 = 2.6억) − 개산공제 260만 = 2,737,400,000.
 *
 *   XBE-1. 시가 모드: 두 카드 모두 기준시가 2칸(승계취득가액 칸 숨김) · 200 · 2,737,400,000
 *   XBE-2. 둘째 카드 기준시가를 비우면 막힌다(칸이 있어 막다른 길이 아니다)
 *   XBE-3. 둘째 카드가 원조합원이면 계속 막힌다
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


const first = (over: Record<string, unknown> = {}) => asset({ assetId: "p", ownershipNumerator: "60", ownershipDenominator: "100", bgValuationMode: "sangjeungbeop_market", bgMortgageDebtAmount: "3000000000", bgMortgageSetAmount: "3000000000", bgMarketValueAtTransfer: "1500000000", ...over });
const second = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(2), assetId: "s2", ownershipNumerator: "40", ownershipDenominator: "100", isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", acquisitionCause: "purchase", acquisitionDate: "2020-01-01",
  successorRightAcqPrice: "300000000", successorRightAddedContribution: "100000000", successorRightStdPaidAtAcq: "150000000", successorRightStdPremiumAtAcq: "50000000", ...over,
});

async function seedAxisB(page: Page, assets: unknown[], transferDate = "2026-02-16") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets, assetSplitMode: "fractional", contractTotalPrice: "3000000000", transferDate, filingDate: "2026-04-30", totalTransferExpense: "0",
        householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 지분 카드(둘째)는 ① 기본정보·② 양도정보가 숨겨져 있어 있는 섹션만 펼친다.
  for (const i of [0, 1]) for (const n of [1, 2, 3] as const) {
    if ((await page.locator(`[data-asset-card-index="${i}"] [data-asset-section="${n}"]`).count()) > 0) await expandAssetSection(page, n, i);
  }
}

test.describe("축 B 승계 입주권 × 담보 승 — 카드마다 입주권 기준시가", () => {
  test.setTimeout(240_000);

  test("XBE-1: 시가 모드 — 두 카드 기준시가 2칸 · 200 · 2,737,400,000", async ({ page }) => {
    await seedAxisB(page, [first(), second()]);
    for (const i of [0, 1]) {
      await expect(cardAt(page, i).locator('[data-field="successorRightStdPaidAtAcq"]'), `카드 ${i + 1}`).toBeVisible();
      await expect(cardAt(page, i).locator('[data-field="successorRightAcqPrice"]'), `카드 ${i + 1}`).toHaveCount(0);
    }
    const r = await calculate(page);
    expect(r.status(), await r.text()).toBe(200);
    expect(totalOf(await r.json())).toBe(2_737_400_000);
    await expect(page.locator("body")).toContainText("2,737,400,000");
    await expect(page.getByText(/분할 취득|확인하지 못했습니다/)).toHaveCount(0);
    // ⑥ 사이드바 — 결과 → 입력 단계로 돌아가 읽는다(계산 전에는 「계산 후 표시」). 카드별 지분 가중: 1.8억/0.8억 = 2.6억, 개산공제 180만/80만.
    await page.getByRole("button", { name: /^이전/ }).last().click();
    await page.getByRole("button", { name: "가산세" }).first().click();
    const side = (await page.locator("aside").innerText()).replace(/\s+/g, " ");
    expect(side, side).toContain("양도가액 지분 60% 1,800,000,000 취득가액 180,000,000 필요경비 1,800,000");
    expect(side, side).toContain("양도가액 지분 40% 1,200,000,000 취득가액 80,000,000 필요경비 800,000");
    expect(side, side).toContain("합계 양도가액 3,000,000,000");
  });

  test("XBE-2: 둘째 카드 기준시가를 비우면 막힌다 — 칸이 있어 막다른 길이 아니다", async ({ page }) => {
    await seedAxisB(page, [first(), second({ successorRightStdPaidAtAcq: "", successorRightStdPremiumAtAcq: "" })]);
    await expect(cardAt(page, 1).locator('[data-field="successorRightStdPaidAtAcq"]')).toBeVisible();
    await clickToCalc(page);
    await expect(page.getByText(/취득일까지 납입한 금액과 취득일 현재의 프리미엄을 입력하세요/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("XBE-3: 둘째 카드가 원조합원이면 계속 막힌다", async ({ page }) => {
    await seedAxisB(page, [first(), second({ isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionDate: "2009-07-01" })]);
    await clickToCalc(page);
    await expect(page.getByText(/원조합원 입주권의 기준시가/).first()).toBeVisible({ timeout: 20_000 });
  });
});
