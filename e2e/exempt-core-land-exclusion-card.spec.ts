/**
 * E2E — 1세대1주택 전액 비과세 대상인데 배율 초과 부수토지(G-2)만 과세된 결과에 비과세 사유 카드가 뜬다.
 *
 * 종전: 이 결과는 `isExempt`·`isPartialExempt`가 둘 다 false라 전액 비과세 카드·부분 비과세 근거 카드가 모두 빠져
 * 결과 화면에 「1세대1주택」이 한 번도 나오지 않았다. 엔진 echo `housingLandExemptExclusion`이 카드(`calc-land-exclusion-exempt-basis`)를 연다.
 *
 * 시료(anchor E-8과 같은 주택): 2012-01-02 매매 · 2026-02-16 양도 10억 · 토지 400㎡ · 정착 100㎡ × 3배(수도권 주거) = 300㎡ 한도 → 초과 100㎡ ·
 * 기준시가 5칸 · 1세대1주택 · 거주 120개월.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const house = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetId: "p",
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "500000000",
  actualSalePrice: "1000000000",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "400",
  transferArea: "400",
  standardPriceAtAcq: "500000000",
  standardPricePerSqmAtAcq: "600000",
  buildingStandardPriceAtAcq: "200000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
  ...over,
});

async function seedAndOpen(page: Page, householdHousingCount: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedWithDeclaredRoster({
      state: {
        formData: {
          assets: [house()],
          transferDate: "2026-02-16",
          filingDate: "2026-04-30",
          contractTotalPrice: "1000000000",
          totalTransferExpense: "0",
          householdHousingCount,
          isOneHousehold: true,
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
          residencePeriodMonths: "120",
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    }),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  return res;
}

test("LX-1: 1세대1주택 + 배율 초과 부수토지 → 비과세 사유 카드(사유·배율 초과분·§154 ⑦)", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, "1");
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  const json = await r.json();
  expect(json.data.result.housingLandExemptExclusion).toEqual({ excessLand: true, laterLand: false });
  const card = page.getByTestId("calc-land-exclusion-exempt-basis");
  await expect(card).toBeVisible();
  await expect(card).toContainText("1세대1주택 특례 적용 — 1세대1주택 비과세");
  await expect(card).toContainText("건물분과 배율 이내 부수토지분은 비과세");
  await expect(card).toContainText("소득세법 시행령 §154 ⑦");
});

test("LX-2: 같은 주택이 2주택이면(과세) 카드 없음", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, "2");
  const r = await calculate(page);
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.getByText("출력 항목 선택").first()).toBeVisible();
  await expect(page.getByTestId("calc-land-exclusion-exempt-basis")).toHaveCount(0);
});
