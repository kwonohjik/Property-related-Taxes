/**
 * E2E: 원조합원 입주권(비부담부증여) × 이월과세 × **증여자 환산** — 증여세 상당액이 신고서 인가 전 분 필요경비에 들어가고(30M과 100M이 다르다),
 * 종전 부동산 취득가액은 증여세와 무관하게 §166③ 환산이다. 계획서 `docs/02-design/features/redev-carryover-estimated-donor-gift-tax.plan.md`(Q-1 c).
 *
 * 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000) · 양도가액 1,300,000,000 · 증여자 2012-01-01 취득 ·
 * 이월과세 환산(증여자 기준시가 20,000,000 / 500,000,000) · ⑤ 환산 · §166③ 인가일 500,000,000 · 취득당시 20,000,000.
 *
 *   EE-E1. 주택 출자 · 증여세 30,000,000 (A 채택) — 신고서 필요경비 30,600,000(개산공제 600,000 + 증여세) · 전체 양도차익 1,033,400,000
 *   EE-E2. 토지 출자 · 증여세 30,000,000 (A 채택) — 명세서 인가 전 분 산식에 증여세 항 · 전체 양도차익 1,033,400,000
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const LAND = { redevOriginalAssetType: "land", redevLandStdPriceAtAcq: "20000000", redevLandStdPriceAtApproval: "500000000", redevManagementDisposalHousingPrice: "", redevAcquisitionHousingPrice: "" };

const asset = (giftTax: string, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  useEstimatedAcquisition: true, redevManagementDisposalHousingPrice: "500000000", redevAcquisitionHousingPrice: "20000000",
  fixedSalePrice: "1,300,000,000", actualSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "", useEstimatedAcquisition: true, estimationMode: "general",
    donorStandardPriceAtAcquisition: "20000000", donorStandardPriceAtTransfer: "500000000",
    donorRelation: "lineal", giftTaxAmount: giftTax, donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01",
  },
  ...over,
});

async function calc(page: Page, giftTax: string, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset(giftTax, over)], contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
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

test("EE-E1: 주택 출자 · 증여세 30M — 신고서 필요경비 30,600,000 · 전체 양도차익 1,033,400,000", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "30000000");
  const formTable = await sectionText(page, "form-table");
  expect(formTable).toContain("필요경비30,600,00030,600,0000");
  expect(formTable).toContain("전체 양도차익1,033,400,000");
  expect(await sectionText(page, "detailed-statement")).toContain("이월과세 증여세 상당액 30,000,000");
});

test("EE-E2: 토지 출자 · 증여세 30M — 명세서 인가 전 분 산식에 증여세 항 · 전체 양도차익 1,033,400,000", async ({ page }) => {
  test.setTimeout(240_000);
  await calc(page, "30000000", LAND);
  expect(await sectionText(page, "form-table")).toContain("전체 양도차익1,033,400,000");
  expect(await sectionText(page, "detailed-statement")).toContain("− 이월과세 증여세 상당액 30,000,000 = 833,400,000");
});
