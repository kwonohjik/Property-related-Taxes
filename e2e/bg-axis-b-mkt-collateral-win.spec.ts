/**
 * E2E: 부담부증여 **축 B(같은 물건 지분 분할 취득) × 시가 모드 × 담보 승(상증법 §66)** — ⑧ 거짓 차단 해소 + ⑤ 취득시 기준시가 칸 (S-1) 화면 확인.
 * 계획서 `docs/00-pm/bg-nonsupp-winner-support.plan.md` §4.1. 종전에는 두 카드를 «채무액(12억)이 증여가액(10억)을 초과»로 막았고(⑫는 200),
 * 풀면 취득시 기준시가 칸이 없는 막다른 길이었다.
 * 시료: 주택 · 지분 60/40(취득일 다름) · 시가 모드 · 양도시 시가 10억 · 채무 12억(물건 전체) · 담보평가 12억 > 시가 → 담보 승 · 취득시 기준시가 5억.
 *
 *   AE-1. 계산 200 · 첫 카드에 «담보평가 승» 안내와 취득시 기준시가 칸 · «채무액 초과» 차단 없음
 *   AE-2. 실지취득가액을 비워도 200 — 엔진이 읽지 않는 값을 요구하지 않는다
 *   AE-3. 취득시 기준시가를 비우면 막힌다(⑧ ⊇ ⑫ — 막다른 길이 아니라 칸이 있다)
 *   AE-4. 보충적평가 승(채무 6억)이면 실지취득가액 요구가 그대로다 — 요구를 풀지 않았다는 안전망
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const card = (id: number, num: string, acq: string, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  assetId: id === 1 ? "p" : `s${id}`, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq,
  ownershipNumerator: num, ownershipDenominator: "100", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", ...over,
});
const MKT = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "400000000" };
const WIN = { bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1200000000", bgMortgageSetAmount: "1200000000" };
const SUPP = { bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" };

async function seedAndOpen(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets, assetSplitMode: "fractional", contractTotalPrice: "1000000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0",
        householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

/** 첫 카드의 «양도정보» 섹션을 펼친다 — 취득시 기준시가 칸(`bg-acq-std-price`)이 그 안에 있다(접힌 상태에서는 hidden). */
async function openTransferSection(page: Page) {
  await page.getByRole("button", { name: /^양도정보/ }).first().click();
}

async function clickToCalc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}
async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await clickToCalc(page);
  return res;
}

test("AE-1: 축 B 시가 모드 담보 승 — 200 · 첫 카드 담보 승 안내 + 취득시 기준시가 칸 · «채무액 초과» 차단 없음", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [card(1, "60", "2009-03-01", { ...MKT, ...WIN }), card(2, "40", "2012-03-01", {})]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(1);
  // 필요경비 칸은 개산공제만 쓰이므로 요약 칩이 «개산공제만» — 축 B 플래그가 필요경비 leaf까지 닿았다는 화면 증거
  await expect(page.getByRole("button", { name: /자본적 지출.*개산공제만/ }).first()).toBeVisible();
  await openTransferSection(page);
  await expect(page.getByTestId("bg-acq-std-price").first()).toBeVisible();
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator("body")).not.toContainText("증여가액(1,000,000,000원)을 초과합니다");
});

test("AE-2: 실지취득가액을 비워도 계산된다 — 엔진이 읽지 않는 값을 요구하지 않는다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [card(1, "60", "2009-03-01", { ...MKT, ...WIN, bgActualAcquisitionTotal: "" }), card(2, "40", "2012-03-01", {})]);
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
});

test("AE-3: 취득시 기준시가를 비우면 막힌다 — 칸이 있어 막다른 길이 아니다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [card(1, "60", "2009-03-01", { ...MKT, ...WIN, standardPriceAtAcq: "" }), card(2, "40", "2012-03-01", {})]);
  await openTransferSection(page);
  await expect(page.getByTestId("bg-acq-std-price").first()).toBeVisible();
  await clickToCalc(page);
  await expect(page.getByText(/취득시 기준시가를/).first()).toBeVisible({ timeout: 20_000 });
});

test("AE-4: 보충적평가 승(채무 6억)이면 실지취득가액 요구가 그대로다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, [card(1, "60", "2009-03-01", { ...MKT, ...SUPP, bgActualAcquisitionTotal: "" }), card(2, "40", "2012-03-01", {})]);
  await expect(page.getByTestId("bg-collateral-forced-notice")).toHaveCount(0);
  await clickToCalc(page);
  await expect(page.getByText(/실지취득가액을 입력하세요/).first()).toBeVisible({ timeout: 20_000 });
});
