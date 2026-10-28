/**
 * E2E: 원조합원 입주권 부담부증여 × 이월과세 — 비교·요약 카드의 취득가액은 §166 신고서 값이고, 증여세 상당액은 신고서 필요경비에 들어간다.
 * 계획서 `docs/02-design/features/bg-redev-carryover-acquisition-echo.plan.md`(Q-1 a · Q-2 a · Q-3 b).
 *
 * 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000) · 부담부증여 시가 400,000,000 · 채무 80,000,000 · 양도인 실지취득가액 300,000,000.
 *
 *   RE-E1. 증여자 실지 100M · 증여세 0 (A 채택) — 신고서 취득가액 15,999,999 · 비교 카드 A·B 열 15,999,999 / 26,666,666 · [B] 요약 카드 양도가액 80,000,000 · 종전 「증여 당시 평가액」 없음
 *   RE-E2. 증여자 실지 20M · 증여세 30M (A 채택) — 신고서 필요경비 1,600,000 · 전체 양도차익 66,666,668 · 산식에 「이월과세 증여세 상당액」
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const asset = (giftTax: string, donorActualLand: string) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "right_to_move_in",
  transferType: "burdened_gift",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
    useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: giftTax, donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {},
  },
  bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual", standardPriceAtTransfer: "320000000", standardPriceAtAcq: "180000000",
  bgActualAcquisitionLand: "300000000", bgCoDonorActualAcquisitionLand: donorActualLand, bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0",
  redevSubject: "right", isSuccessorRightToMoveIn: false, redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgActualAcquisitionTotal: "300000000",
});

async function calc(page: Page, giftTax: string, donorActualLand: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset(giftTax, donorActualLand)], transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
}

const sectionText = (page: Page, id: string) => page.locator(`[data-print-id="${id}"]`).first().evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " "));
const bodyText = (page: Page) => page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " "));
const BASIS = "신고서 취득가액 · 인가 전·후 분 합 · 소령 §166①1호";

test("RE-E1: 증여자 실지 100M · 증여세 0 (A 채택) — 비교·요약 카드 취득가액이 신고서(15,999,999)와 같다", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "0", "100000000");
  const formTable = await sectionText(page, "form-table");
  // 신고서 합계열
  expect(formTable).toContain("양도가액80,000,00048,000,00032,000,000취득가액15,999,9995,333,33310,666,666필요경비000전체 양도차익64,000,001");
  // [B] 미채택 요약 카드(우측): 라벨 · 양도가액 행 · 취득가액 26,666,666
  expect(formTable).toContain("취득가액 = 신고서 취득가액(인가 전·후 분 합 · 소령 §166①1호)");
  expect(formTable).toContain("양도가액80,000,000");
  expect(formTable).toContain(`취득가액 (${BASIS})26,666,666`);
  expect(formTable).not.toContain("증여 당시 평가액");
  // 비교과세 카드: A·B 열
  const all = await bodyText(page);
  expect(all).toContain(`취득가액 [${BASIS}]15,999,999`);
  expect(all).toContain(`취득가액 [${BASIS}]26,666,666`);
  expect(all).not.toContain("취득가액 [증여 당시 평가액]300,000,000");
  expect(all).not.toContain("취득가액 [당초 증여자 취득가]5,333,333");
});

test("RE-E2: 증여자 실지 20M · 증여세 30M (A 채택) — 신고서 필요경비 1,600,000 · 증여세 줄 · 산식", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "30000000", "20000000");
  const formTable = await sectionText(page, "form-table");
  // 신고서 합계열 필요경비 = 증여세 산입분(1,600,000) · 전체 양도차익 = 종전 68,266,668 − 1,600,000
  expect(formTable).toContain("필요경비1,600,000");
  expect(formTable).toContain("전체 양도차익66,666,668");
  const statement = await sectionText(page, "detailed-statement");
  expect(statement).toContain("이월과세 증여세 상당액");
  const all = await bodyText(page);
  expect(all).toContain("1,600,000");
});
