/**
 * 부담부증여 × 재개발(§166) 자산 — 결과 명세 카드의 「신고서 필요경비」 줄(분기별)
 * (계획서 `docs/02-design/features/bg-redev-card-filing-expense.plan.md` Q-1 a · Q-2 b).
 *
 *   RX-E1 입주권 축 B · 원조합원 두 지분 모두 인가 전 실비 3,000,000. 카드마다 신고서 필요경비 600,000(= 3,000,000 × 지분 50% × 채무비율 40%),
 *         인가 전 분 줄은 개산공제가 아니라 자본적지출·양도비. route anchor와 같은 시료 — 합계세액 129,026,480.
 *         종전: 카드에 신고서 취득가액 줄만 있고 필요경비는 신고서 표에만 보였다.
 *   RX-E2 실비 0 — 줄이 없다(대조군 · 합계세액 129,470,000).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const ORIG = {
  acquisitionCause: "purchase", isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2018-06-01", redevOriginalAssetType: "housing", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "100000000",
};
const first = (exp: string) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", ...HALF, ...ORIG, redevPreApprovalExpenses: exp,
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600000000",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgActualAcquisitionTotal: "300000000",
});
const share = (exp: string) => ({ ...makeDefaultAsset(2), ...HALF, ...ORIG, redevPreApprovalExpenses: exp });
const seedForm = (exp: string) => ({
  state: {
    formData: {
      assets: [first(exp), share(exp)], assetSplitMode: "fractional", contractTotalPrice: "1500000000",
      transferDate: "2026-02-16", filingDate: "2026-04-30", householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function calc(page: Page, exp: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), seedForm(exp));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status()).toBe(200);
  return (await r.json())?.data?.aggregated?.totalTax as number;
}

test("RX-E1: 재개발 지분 카드마다 신고서 필요경비(인가 전 실비)가 줄로 보인다", async ({ page }) => {
  test.setTimeout(240_000);
  expect(await calc(page, "3000000")).toBe(129_026_480);
  await expect(page.getByTestId("bg-bundle-card")).toHaveCount(2);
  const totals = page.getByTestId("bg-redev-filing-expense");
  await expect(totals).toHaveCount(2);
  for (const i of [0, 1]) await expect(totals.nth(i)).toContainText("600,000");
  const pre = page.getByTestId("bg-redev-filing-expense-pre");
  await expect(pre).toHaveCount(2);
  await expect(pre.first()).toContainText("자본적지출·양도비");
  await expect(pre.first()).not.toContainText("개산공제");
  await expect(page.getByTestId("bg-redev-filing-expense-post")).toHaveCount(0);
});

test("RX-E2: 실비가 0이면 줄이 없다 (대조군)", async ({ page }) => {
  test.setTimeout(240_000);
  expect(await calc(page, "0")).toBe(129_470_000);
  await expect(page.getByTestId("bg-bundle-card")).toHaveCount(2);
  await expect(page.getByTestId("bg-redev-filing-expense")).toHaveCount(0);
});
