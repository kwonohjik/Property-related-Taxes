/**
 * E2E: 원조합원(재개발 종전자산) 상속의 §163⑨. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §14·§15.
 *
 *   OM-E1. 원조합원 입주권 · 2000 상속(개별주택가격 공시 전) — 취득 단계에 ②(§164⑦) 칸이 뜨고, 채우면 ④가 `inheritedHouseValuation`을 싣는다(종전: 칸·전송 없음)
 *   OM-E2. 원조합원 입주권 · 2010 상속 · 상속세 신고가액 빈칸 — ⑧이 막는다 · 요청 없음(종전: 「종전 부동산 실거래가」로 계산)
 *   OM-E3. 같은 자산 직접 호출 — 화면 본문에서 §163⑨ 페이로드를 지우면 ⑫ 400(종전 200)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

async function calcBody(page: Page, assets: unknown[], extra: Record<string, unknown> = {}) {
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
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  return { url: r.url(), body: r.request().postDataJSON() };
}

async function seedOnly(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets, contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
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
const OM = (over: Record<string, unknown>) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular",
  acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01",
  ...over,
});
const IND = { inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000" };

test("OM-E1: 원조합원 입주권 2000 상속 — ② 칸이 뜨고 ④가 싣는다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedOnly(page, [OM({ acquisitionDate: "2000-06-01", inheritanceStartDate: "2000-06-01", ...IND })]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await expect(page.locator('[data-field="inhHouseValLandArea"]').first()).toBeVisible();
  const { body } = await calcBody(page, [OM({ acquisitionDate: "2000-06-01", inheritanceStartDate: "2000-06-01", ...IND })]);
  expect(body.inheritedHouseValuation).toBeTruthy();
  expect(body.inheritedAcquisition.assetKind).toBe("house_individual");
});

test("OM-E2: 원조합원 입주권 2010 상속 · 신고가액 빈칸 — ⑧이 막는다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedOnly(page, [OM({ acquisitionDate: "2010-06-01", inheritanceStartDate: "2010-06-01", publishedValueAtInheritance: "" })]);
  let posted = false;
  page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText(/종전 부동산 실거래가로는 계산하지 않습니다/).first()).toBeVisible();
  expect(posted).toBe(false);
});

test("OM-E3: 직접 호출 — §163⑨ 페이로드를 지우면 ⑫ 400", async ({ page }) => {
  test.setTimeout(240_000);
  const { url, body } = await calcBody(page, [OM({ acquisitionDate: "2010-06-01", inheritanceStartDate: "2010-06-01" })]);
  delete body.inheritedAcquisition;
  const r = await page.request.post(url, { data: body });
  expect(r.status()).toBe(400);
  expect(await r.text()).toContain("종전 부동산 실거래가로는 계산하지 않습니다");
});
