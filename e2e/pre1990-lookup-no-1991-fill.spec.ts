/**
 * E2E: §164④ 칸 「공시가격 조회」 — 1990년분이 없으면 1991년분을 1990.1.1. 칸에 채우지 않는다(사용자 결정 2026-10-31 a).
 * 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §18 Vworld 실호출(1990년분 유무는 필지마다 다르다).
 * 조회 API는 mock — 종전: 1991년 값 5,820,000이 칸에 들어가 분자 칸에 4,656,000(= 5,820,000 × 0.8)이 보였다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

async function seed(page: Page, assets: unknown[]) {
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
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", redevSettlementAmount: "100000000", redevLandArea: "200",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "purchase", acquisitionDate: "1987-06-01",
  ...over,
});

async function mockLookup(page: Page, byYear: Record<string, number>) {
  await page.route("**/api/address/standard-price**", async (route) => {
    const year = new URL(route.request().url()).searchParams.get("year") ?? "";
    const price = byYear[year];
    await route.fulfill(price
      ? { status: 200, contentType: "application/json", body: JSON.stringify({ priceType: "land_price", year, price }) }
      : { status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "PRICE_NOT_FOUND", message: `개별공시지가 없음 (${year}년)` } }) });
  });
}
const priceInput = async (page: Page) => {
  const f = page.getByTestId("redev-land-sec164-input").locator('[data-field="pre1990PricePerSqm_1990"]');
  return (await f.evaluate((e) => e.tagName)) === "INPUT" ? f : f.locator("input");
};
const GRADES = { pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000" };

test("LK-E1: 1990년분 없음·1991년분 있음 → 칸 비움 · 1991년 값은 안내에만 · 분자 칸도 빈칸", async ({ page }) => {
  test.setTimeout(240_000);
  await mockLookup(page, { "1991": 5_820_000 });
  await seed(page, [OM({ ...GRADES, addressJibun: "부산광역시 중구 광복동1가 1", redevLandPricePerSqmAtApproval: "6000000" })]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  const card = page.getByTestId("redev-land-sec164-input");
  await card.getByRole("button", { name: "공시가격 조회" }).click();
  await expect(card).toContainText("칸을 채우지 않았습니다");
  await expect(card).toContainText("참고: 1991년 공시분 5,820,000");
  await expect(await priceInput(page)).toHaveValue("");
  await expect(page.locator('[data-field="redevLandPricePerSqmAtAcq"] input').first()).toHaveValue("");
});

test("LK-E2: 1990년분 있음 → 칸 채움 · 분자 칸 8,000,000", async ({ page }) => {
  test.setTimeout(240_000);
  await mockLookup(page, { "1990": 10_000_000, "1991": 16_800_000 });
  await seed(page, [OM({ ...GRADES, addressJibun: "서울특별시 강남구 역삼동 737", redevLandPricePerSqmAtApproval: "6000000" })]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  const card = page.getByTestId("redev-land-sec164-input");
  await card.getByRole("button", { name: "공시가격 조회" }).click();
  await expect(await priceInput(page)).toHaveValue("10,000,000");
  await expect(page.locator('[data-field="redevLandPricePerSqmAtAcq"] input').first()).toHaveValue("8,000,000");
});
