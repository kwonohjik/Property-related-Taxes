/**
 * E2E: 토지를 출자한 원조합원의 종전 토지 상속 §163⑨ 단서 1호(§164④). 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §16·§17.
 *
 *   OL-E1. 입주권 · 1988 상속(개별공시지가 고시 전) — 취득 단계에 §164④ 등급 칸이 뜨고 ④가 `pre1990Land`(종전 토지 면적)·엔진 자산 종류 land를 싣는다 ·
 *          취득가액 480,000,000(②) 채택(종전: 칸·전송 없음 → ① 300,000,000)
 *   OL-E2. 완공 아파트 · 2000 상속 — 주택 §164⑦ 칸이 뜨지 않고 남은 값도 싣지 않는다 · 취득가액 300,000,000(종전: §164⑦ 720,000,000 채택)
 *   OL-E3. 직접 호출 — 같은 본문의 출자 자산을 주택으로 바꾸면(주택 출자 + pre1990Land) ⑫ 400(종전 200)
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
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "land",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000", redevLandArea: "200",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular",
  acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01",
  ...over,
});
const at = (dt: string) => ({ acquisitionDate: dt, inheritanceStartDate: dt });
const GRADE = { pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000" };
const IND = { inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000" };
const APT = { assetKind: "redevelopment_apt", redevSubject: "apt" };

test("OL-E1: 토지 출자 입주권 1988 상속 — §164④ 칸이 뜨고 ②가 채택된다", async ({ page }) => {
  test.setTimeout(240_000);
  const a = OM({ ...at("1988-06-01"), ...GRADE });
  await seedOnly(page, [a]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await expect(page.locator('[data-field="pre1990Grade_current"]').first()).toBeVisible();
  const { body } = await calcBody(page, [a]);
  expect(body.pre1990Land.areaSqm).toBe(200);
  expect(body.inheritedAcquisition.assetKind).toBe("land");
  const r = await page.request.post("/api/calc/transfer", { data: body });
  expect((await r.json()).data.result.inheritedAcquisitionDetail.acquisitionPrice).toBe(480_000_000);
});

test("OL-E2: 토지 출자 완공 아파트 2000 상속 — 주택 §164⑦ 칸 없음 · 남은 값 안 실림", async ({ page }) => {
  test.setTimeout(240_000);
  const a = OM({ ...at("2000-06-01"), ...APT, ...IND });
  await seedOnly(page, [a]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await expect(page.locator('[data-field="publishedValueAtInheritance"]').first()).toBeVisible();
  await expect(page.locator('[data-field="inhHouseValLandArea"]')).toHaveCount(0);
  const { body } = await calcBody(page, [a]);
  expect(body.inheritedHouseValuation).toBeUndefined();
  expect(body.inheritedAcquisition.assetKind).toBe("land");
  const r = await page.request.post("/api/calc/transfer", { data: body });
  expect((await r.json()).data.result.inheritedAcquisitionDetail.acquisitionPrice).toBe(300_000_000);
});

test("OL-E3: 직접 호출 — 주택 출자 + pre1990Land → ⑫ 400", async ({ page }) => {
  test.setTimeout(240_000);
  const { url, body } = await calcBody(page, [OM({ ...at("1988-06-01"), ...GRADE })]);
  body.redevelopment.originalAssetType = "housing";
  const r = await page.request.post(url, { data: body });
  expect(r.status()).toBe(400);
  expect(await r.text()).toContain("출자한 원조합원");
});
