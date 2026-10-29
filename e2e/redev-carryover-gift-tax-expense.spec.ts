/**
 * E2E: 원조합원 입주권(비부담부증여) × 이월과세 — 증여세 상당액은 신고서 필요경비(인가 전 분)에 들어가고, 비교·요약 카드의 취득가액은 §166 신고서 값이다.
 * 계획서 `docs/02-design/features/redev-carryover-gift-tax-expense.plan.md`(Q-1 a · Q-2 a · Q-3 a).
 *
 * 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000) · 양도가액 1,300,000,000 · 당초 증여자 2012-01-01 취득.
 *
 *   NE-E1. 증여자 취득가액 100,000,000 · 증여세 0 (A 채택) — 비교 카드 A 300,000,000 · B 500,000,000 · [B] 요약 카드 · 종전 「증여 당시 평가액」 없음
 *   NE-E2. 증여자 취득가액 20,000,000 · 증여세 30,000,000 (A 채택) — 신고서 필요경비 30,000,000 · 전체 양도차익이 증여세 0 시료보다 30,000,000 적다
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const asset = (giftTax: string, donorAcq: string) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  redevActualAcquisitionPrice: "100,000,000", fixedSalePrice: "1,300,000,000", actualSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: donorAcq, useEstimatedAcquisition: false, estimationMode: "",
    donorRelation: "lineal", giftTaxAmount: giftTax, donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01",
  },
});

async function calc(page: Page, giftTax: string, donorAcq: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset(giftTax, donorAcq)], contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
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

test("NE-E1: 증여자 100M · 증여세 0 (A 채택) — 비교·요약 카드 취득가액이 신고서(300,000,000 · 500,000,000)와 같다", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "0", "100000000");
  const formTable = await sectionText(page, "form-table");
  expect(formTable).toContain("양도가액1,300,000,000900,000,000400,000,000취득가액300,000,000100,000,000200,000,000필요경비000");
  expect(formTable).toContain(`취득가액 (${BASIS})500,000,000`); // [B] 미채택 요약 카드
  expect(formTable).not.toContain("증여 당시 평가액");
  const all = await bodyText(page);
  expect(all).toContain(`취득가액 [${BASIS}]300,000,000`);
  expect(all).toContain(`취득가액 [${BASIS}]500,000,000`);
  expect(all).not.toContain("취득가액 [당초 증여자 취득가]100,000,000");
});

test("NE-E2: 증여자 20M · 증여세 30M (A 채택) — 신고서 필요경비 30,000,000 · 증여세 0 시료보다 전체 양도차익 30,000,000 적다", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "0", "20000000");
  const base = await sectionText(page, "form-table");
  expect(base).toContain("전체 양도차익1,080,000,000");
  await calc(page, "30000000", "20000000");
  const formTable = await sectionText(page, "form-table");
  expect(formTable).toContain("필요경비30,000,00030,000,0000");
  expect(formTable).toContain("전체 양도차익1,050,000,000");
  expect(await sectionText(page, "detailed-statement")).toContain("이월과세 증여세 상당액");
});
