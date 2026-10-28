/**
 * 부담부증여 명세 카드의 필요경비 줄 (비재개발 · 단건)
 * (계획서 `docs/02-design/features/bg-card-necessary-expense-row.plan.md` Q-1 a · Q-2 a · Q-3 a · Q-4 b).
 *
 *   NX-E1 실지취득가 + 자본적지출 5,000,000 · 양도비 1,000,000 — 카드에 「필요경비 = (자본적지출 5,000,000 + 양도비 1,000,000) × 채무비율 40.0000%」 2,400,000.
 *         종전: 「실지취득가 모드 — … 필요경비 반영」 문구만 있고 금액이 없었다. 결정세액 6,676,800(route anchor와 같은 시료).
 *   NX-E2 환산 + 자본적지출 3억 · 양도비 1천만 — 환산 단서 나목 채택: 124,000,000 · 사유 「…제97조 제2항 제2호 단서」. 결정세액 0.
 *   NX-E3 환산(자본적지출 없음) — 「개산공제 = 취득시 기준시가 100,000,000 × 채무비율 40.0000% × 개산공제율 3%」 1,200,000. 결정세액 4,539,000.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const HOUSING = {
  ...makeDefaultAsset(1), addressJibun: "서울 A 1", assetKind: "housing", actualSalePrice: "300000000", acquisitionCause: "purchase", acquisitionDate: "2000-01-01",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300000000",
  bgMortgageDebtAmount: "120000000", standardPriceAtTransfer: "200000000",
};
const seedForm = (asset: Record<string, unknown>) => ({
  state: {
    formData: {
      assets: [{ ...HOUSING, ...asset }], contractTotalPrice: "",
      transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function calc(page: Page, asset: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), seedForm(asset));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status()).toBe(200);
  return (await r.json())?.data?.result?.determinedTax as number;
}

test("NX-E1: 실지취득가 + 자본적지출·양도비 — 카드에 필요경비 줄(입력값 포함)", async ({ page }) => {
  test.setTimeout(240_000);
  expect(await calc(page, { bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100000000", capitalExpenditure: "5000000", transferExpense: "1000000" })).toBe(6_676_800);
  const row = page.getByTestId("bg-necessary-expense");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("(자본적지출 5,000,000 + 양도비 1,000,000) × 채무비율 40.0000%");
  await expect(row).toContainText("2,400,000");
  await expect(row).toHaveAttribute("data-kind", "actual");
});

test("NX-E2: 환산 단서 나목 채택 — 실비 줄 + 사유", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, { bgAcquisitionMethod: "converted", standardPriceAtAcq: "100000000", capitalExpenditure: "300000000", transferExpense: "10000000" });
  const row = page.getByTestId("bg-necessary-expense");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-kind", "swap");
  await expect(row).toContainText("제97조 제2항 제2호 단서");
  await expect(row).toContainText("124,000,000");
});

test("NX-E3: 환산 — 개산공제 줄(산식이 금액을 만든다)", async ({ page }) => {
  test.setTimeout(240_000);
  expect(await calc(page, { bgAcquisitionMethod: "converted", standardPriceAtAcq: "100000000" })).toBe(4_539_000);
  const row = page.getByTestId("bg-estimated-deduction");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("개산공제 = 취득시 기준시가 100,000,000 × 채무비율 40.0000% × 개산공제율 3%");
  await expect(row).toContainText("1,200,000");
});
