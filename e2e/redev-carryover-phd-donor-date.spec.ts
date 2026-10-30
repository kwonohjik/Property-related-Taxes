/**
 * E2E: 원조합원 입주권(비부담부증여) × 이월과세 — 「소득세법 시행령」 제164조 제7항(공시되기 전에 취득한 주택) 판정을 당초 증여자 취득일로 본다.
 * 계획서 `docs/02-design/features/redev-carryover-phd-donor-date.plan.md`(Q-1 a · Q-2 a · Q-3 a).
 *
 * 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000) · 양도가액 1,300,000,000 · 증여 등기일 2023-06-01 ·
 * 증여자 취득 2000-03-01(최초공시 2005-04-30 전) · 이월과세 「환산취득가 사용」 · §166③ 인가일 개별주택공시가격 500,000,000.
 *
 *   PD-E1. §164⑦ 칸을 채운 저장 입력 — ⑤에 §164⑦ 블록이 보이고(종전엔 숨김) 「취득당시」 칸 없이 계산된다(종전 ⑧이 그 칸을 요구) · A 취득가액 313,684,209
 *   PD-E2. 「취득당시」 칸만 있는 저장 입력 — 계산하기를 누르면 ⑧이 §164⑦ 칸을 요구한다(종전 A 300,849,600으로 계산)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const asset = (over: Record<string, unknown>) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  redevManagementDisposalHousingPrice: "500000000", redevAcquisitionHousingPrice: "", redevFirstDisclosureDate: "2005-04-30", redevActualAcquisitionPrice: "",
  fixedSalePrice: "1,300,000,000", actualSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-03-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "", useEstimatedAcquisition: true, estimationMode: null,
    donorRelation: "lineal", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2000-03-01",
  },
  ...over,
});
const PHD = {
  redevFirstDisclosureHousingPrice: "100000000", redevLandArea: "100",
  redevLandPricePerSqmAtAcq: "500000", redevBuildingStdPriceAtAcq: "10000000", redevLandPricePerSqmAtFirst: "800000", redevBuildingStdPriceAtFirst: "15000000",
};

async function seed(page: Page, a: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [a], contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test("PD-E1: §164⑦ 칸을 채운 입력 — ⑤에 §164⑦ 블록이 보이고 「취득당시」 칸 없이 계산된다 · A 취득가액 313,684,209", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, asset(PHD));
  await page.getByRole("button", { name: /3\s*취득/ }).first().click(); // ③ 취득 섹션 열기
  await expect(page.locator('[data-field="redevFirstDisclosureHousingPrice"]:visible').first()).toBeVisible();
  await expect(page.locator('[data-field="redevAcquisitionHousingPrice"]')).toHaveCount(0);
  await expect(page.getByText("이월과세 — 취득일은 당초 증여자 취득일(2000-03-01)입니다").first()).toBeVisible();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  const json = (await r.json()) as { data: { result: { carryoverTaxationDetail: { scenarioA: { acquisitionPrice: number } } } } };
  expect(json.data.result.carryoverTaxationDetail.scenarioA.acquisitionPrice).toBe(313_684_209);
});

test("PD-E2: 「취득당시」 칸만 있는 입력 — 계산하기를 누르면 ⑧이 §164⑦ 최초공시 주택가격을 요구한다", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, asset({ redevAcquisitionHousingPrice: "20000000" }));
  let posted = false;
  page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText("§164⑦ 본문 — A(최초공시 주택가격) 입력 필수입니다").first()).toBeVisible();
  expect(posted).toBe(false);
});
