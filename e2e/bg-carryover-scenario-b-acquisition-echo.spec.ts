/**
 * E2E: 부담부증여 단건 × 이월과세 — 미적용(B) 카드의 취득가액·양도가액은 §159 슬롯 값이다.
 * 계획서 `docs/02-design/features/bg-carryover-scenario-b-acquisition-echo.plan.md`(Q-1 a · Q-2 a · Q-3 a).
 *
 * 시료: 토지 · 채무 80,000,000 · 시가 400,000,000(채무비율 0.2) · 증여 당시 평가액 300,000,000 · 양도인 실지취득가액 300,000,000.
 * 종전: 비교 카드 B 열 「취득가액 [증여 당시 평가액] 300,000,000」(B 슬롯 60,000,000) · 미채택 요약 카드 양도가액 행 없음.
 *
 *   BE-E1. 증여세 2,000,000(A 채택) — 비교 카드 B 열 · [B] 미채택 요약 카드: 취득가액 60,000,000 · 양도가액 80,000,000
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const asset = (giftTax: string, method: string) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "land",
  transferType: "burdened_gift",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
    useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: giftTax, donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {},
  },
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: method, standardPriceAtTransfer: "320000000", standardPriceAtAcq: "180000000",
  bgActualAcquisitionLand: "300000000", bgCoDonorPresumedAcquisitionLand: "250000000", bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0",
});

async function calc(page: Page, giftTax: string, method: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset(giftTax, method)], transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
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

test("BE-E1: 증여세 2M (A 채택) — 비교 카드 B 열·[B] 요약 카드 취득가액 60,000,000 · 양도가액 80,000,000", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "2000000", "appraisal");
  const formTable = await sectionText(page, "form-table");
  // [B] 미채택 요약 카드(우측)
  expect(formTable).toContain("수증자 기산 보유기간 · 취득가액 = 수증자 취득가 × 채무비율(소령 §159①1호)");
  expect(formTable).toContain("양도가액80,000,000");
  expect(formTable).toContain("취득가액 (수증자 취득가 × 채무비율 · 소령 §159①1호)60,000,000");
  expect(formTable).not.toContain("취득가액 (증여 당시 평가액)");
  // 비교과세 카드(B 열) — 같은 echo
  const all = await page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " "));
  expect(all).toContain("취득가액 [수증자 취득가 × 채무비율 · 소령 §159①1호]60,000,000");
  expect(all).not.toContain("취득가액 [증여 당시 평가액]300,000,000");
});
