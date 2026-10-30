/**
 * E2E: 승계 입주권 × 이월과세(비부담부증여) 검증 — 계획서 `docs/02-design/features/successor-right-carryover-validation.plan.md`(Q-1~Q-4 a).
 *
 * 시료: 승계 입주권(관리처분 인가 2020-01-10) · 증여 등기일 2023-06-01 · 증여자 취득 2021-01-01 · 직계존비속 · 증여 당시 평가액 300,000,000 · 양도가액 1,300,000,000.
 *
 *   SR-E1. 취득일·승계취득가액 빈칸(이월과세는 두 칸이 화면에 없다) — 계산된다 · A 취득가액 = 증여자 취득가액 100,000,000(종전 「승계취득일을 입력하세요」)
 *   SR-E2. ⑤ — 이월과세는 승계취득가액 칸 대신 안내가 보인다(매매는 칸이 있다)
 *   SR-E3. 함께 양도 · ② 환산(일반 기준시가) 기준시가 빈칸 — ⑧이 막는다(종전 A 취득가액 0으로 계산 · 463,035,000)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const SUCC = { isSuccessorRightToMoveIn: true, redevApprovalDate: "2020-01-10", successorRightAcqPrice: "", successorRightAddedContribution: "" };
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

const succ = (over: Record<string, unknown>, car: Record<string, unknown>) =>
  redev({ ...SUCC, ...over }, { donorAcquisitionDate: "2021-01-01", donorHouseholdHoldingStartDate: "", useEstimatedAcquisition: false, donorAcquisitionPrice: "100000000", ...car });

test("SR-E1: 취득일·승계취득가액 빈칸 — 계산된다 · A 취득가액 100,000,000", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [succ({ acquisitionDate: "" }, {})]);
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  const json = await r.json();
  expect(json.data.result.carryoverTaxationDetail.scenarioA.acquisitionPrice).toBe(100_000_000);
});

test("SR-E2: 이월과세는 승계취득가액 칸 대신 안내 — 매매는 칸이 있다", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [succ({}, {})]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await expect(page.getByTestId("carryover-successor-right-note")).toBeVisible();
  await expect(page.locator('[data-field="successorRightAcqPrice"]')).toHaveCount(0);
  await expect(page.locator('[data-field="successorRightAddedContribution"]')).toHaveCount(1);
  await seed(page, [succ({ acquisitionCause: "purchase", acquisitionDate: "2023-06-01" }, {})]);
  await expect(page.locator('[data-field="successorRightAcqPrice"]')).toHaveCount(1);
});

test("SR-E3: 함께 양도 · 일반 기준시가 환산 기준시가 빈칸 — ⑧이 막는다(종전 A 취득가액 0)", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [land, succ({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }, { useEstimatedAcquisition: true, donorAcquisitionPrice: "", estimationMode: "general" })], { bundledSaleMode: "actual" });
  let posted = false;
  page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText("자산 2: 취득시 기준시가를 입력하세요.").first()).toBeVisible({ timeout: 30_000 });
  expect(posted).toBe(false);
});
