/**
 * E2E: 원조합원 입주권(비부담부증여) × 이월과세 검증 범위 — 계획서 `docs/02-design/features/redev-carryover-validation-scope.plan.md`(Q-1 a · Q-2 a · Q-3).
 *
 * 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000) · 증여 등기일 2023-06-01 · 증여자 취득 2012-01-01 ·
 * §166③ 인가일 개별주택공시가격 500,000,000 · 취득당시 20,000,000 · 이월과세 「환산취득가 사용」.
 *
 *   VS-E1. 취득일 빈칸(이월과세 재개발 자산은 그 칸이 화면에 없다) — 계산된다(종전 「취득일을 입력하세요」 · POST 없음) · 전체 양도차익 1,063,400,000
 *   VS-E2. 증여 당시 평가액 빈칸 — 계산하기를 누르면 ⑧이 막는다(종전 B 취득가액 0으로 계산)
 *   VS-E3. 함께 양도 · 관계 「그 외」 — ⑧이 막는다(종전 ⑧ 통과 → 서버 400)
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

async function blocked(page: Page, text: string) {
  let posted = false;
  page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 30_000 });
  expect(posted).toBe(false);
}

test("VS-E1: 취득일 빈칸 — 계산된다(종전 「취득일을 입력하세요」) · 전체 양도차익 1,063,400,000", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [redev({ acquisitionDate: "" }, {})]);
  await calc(page);
  expect(await sectionText(page, "form-table")).toContain("전체 양도차익1,063,400,000");
});

test("VS-E2: 증여 당시 평가액 빈칸 — ⑧이 막는다(종전 B 취득가액 0으로 계산)", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [redev({}, { giftDateValuation: "" })]);
  await blocked(page, "자산: 증여 당시 평가액을 입력하세요.");
});

test("VS-E3: 함께 양도 · 관계 「그 외」 — ⑧이 막는다(종전 서버 400)", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [land, redev({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000" }, { donorRelation: "other" })], { bundledSaleMode: "actual" });
  await blocked(page, "이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다");
});
