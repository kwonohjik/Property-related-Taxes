/**
 * E2E: 원조합원 입주권(비부담부증여) × 이월과세 잔여 묶음 — 계획서 `docs/02-design/features/redev-carryover-residue-bundle.plan.md`.
 *
 * 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000) · 증여 등기일 2023-06-01 · 증여자 취득 2012-01-01 ·
 * §166③ 인가일 개별주택공시가격 500,000,000 · 취득당시 20,000,000.
 *
 *   RB-E1. 예전에 고른 환산 방식 「phd」와 그 칸이 남은 저장 입력 — 계산된다(종전 서버 400 · 그 칸은 화면에 없다) · 전체 양도차익 1,063,400,000
 *   RB-E2. 단건 · 증여자 취득가액 100,000,000(A 채택) — 명세서 인가 전 분 「증여자 취득가액 = 100,000,000 (이월과세 …)」(종전 「실제 취득가액 (실가 모드)」)
 *   RB-E3. 함께 양도 · 토지 + 입주권 ② 환산(A 채택) — 명세서 자산별 취득가액이 「§166 분할 합(인가 전 분 §166③ 환산 36,000,000 포함)」(종전 「환산취득가 236,000,000」)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const redev = (over: Record<string, unknown>, car: Record<string, unknown>) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  redevManagementDisposalHousingPrice: "500000000", redevAcquisitionHousingPrice: "20000000", redevActualAcquisitionPrice: "",
  fixedSalePrice: "1,300,000,000", actualSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "", useEstimatedAcquisition: true, estimationMode: null,
    donorRelation: "lineal", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01", ...car,
  },
  ...over,
});
const land = { ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
const PHDF = {
  phdHousingType: "individual", phdFirstDisclosureDate: "2005-04-30", phdFirstDisclosureHousingPrice: "100000000", acquisitionArea: "100",
  phdLandPricePerSqmAtAcq: "500000", phdBuildingStdPriceAtAcq: "10000000", phdLandPricePerSqmAtFirst: "800000", phdBuildingStdPriceAtFirst: "15000000",
  phdTransferHousingPrice: "500000000", phdLandPricePerSqmAtTransfer: "3000000", phdBuildingStdPriceAtTransfer: "20000000",
};

async function seed(page: Page, assets: unknown[], extra: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets, contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, ...extra,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calc(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
}

const sectionText = (page: Page, id: string) => page.locator(`[data-print-id="${id}"]`).first().evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " "));

test("RB-E1: 예전에 고른 환산 방식 phd와 그 칸이 남은 입력 — 계산된다(종전 서버 400) · 전체 양도차익 1,063,400,000", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [redev(PHDF, { estimationMode: "phd" })]);
  await calc(page);
  expect(await sectionText(page, "form-table")).toContain("전체 양도차익1,063,400,000");
});

test("RB-E2: 단건 · 증여자 취득가액 100,000,000(A 채택) — 명세서 인가 전 분이 「증여자 취득가액」", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [redev({}, { useEstimatedAcquisition: false, donorAcquisitionPrice: "100000000" })]);
  await calc(page);
  const t = await sectionText(page, "detailed-statement");
  expect(t).toContain("증여자 취득가액 = 100,000,000 (이월과세 — 「소득세법」 §97의2①1호)");
  expect(t).not.toContain("실제 취득가액 = 100,000,000 (실가 모드)");
});

test("RB-E3: 함께 양도 · 토지 + 입주권 ② 환산(A 채택) — 자산별 취득가액이 §166 분할 합으로 적힌다", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [land, redev({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }, {})], { bundledSaleMode: "actual" });
  await calc(page);
  const t = await sectionText(page, "detailed-statement");
  expect(t).toContain("증여자 취득 당시 기준 취득가액 236,000,000 — §166 분할 합(인가 전 분 §166③ 환산 36,000,000 포함)");
  expect(t).not.toContain("증여자 취득 당시 환산취득가 236,000,000");
});
