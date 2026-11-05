/**
 * 결과 화면 「조정대상지역 판정 — 확인 필요」 — 시·도를 생략한 주소(법정동코드 없음)로 「보유 상황」을 열지 않고 계산하면 결과에 고지가 뜬다.
 * 계획서 `docs/00-pm/regulated-area-assumption-notice.plan.md`. leaf·배치는 `__tests__/calc/regulated-area-assumption-notice.ui.test.tsx`.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const HOUSE = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2018-03-02",
  fixedAcquisitionPrice: "400000000",
  actualSalePrice: "800000000",
  regionCode: "",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "0",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  standardPriceAtTransfer: "600000000",
};

async function seedAndCalc(page: import("@playwright/test").Page, address: string) {
  const seed = {
    state: {
      formData: {
        assets: [{ ...makeDefaultAsset(1), ...HOUSE, addressJibun: address }],
        transferDate: "2026-02-16",
        contractTotalPrice: "1100000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        residencePeriodMonths: "120",
        houses: [],
        presaleRights: [],
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  return res.request().postDataJSON() as { isRegulatedArea?: boolean; wasRegulatedAtAcquisition?: boolean };
}

test("[RAN-1] ★ 시·도 생략 주소 · 보유 상황 미방문 → 결과에 「조정대상지역으로 보고 계산」 고지(④ 값과 같다)", async ({ page }) => {
  test.setTimeout(150_000);
  const body = await seedAndCalc(page, "강남구 테헤란로 123");
  expect([body.isRegulatedArea, body.wasRegulatedAtAcquisition]).toEqual([true, true]);
  const line = page.getByTestId("regulated-area-assumption-line");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("regulated-area-assumption-transfer")).toContainText("양도일(2026-02-16): 조정대상지역으로 보고 계산");
  await expect(page.getByTestId("regulated-area-assumption-acquisition")).toContainText("취득 당시(2018-03-02): 조정대상지역으로 보고 계산");
});

test("[RAN-2] 정식 시·도 + 시군구(신뢰도 high) → 고지 없음", async ({ page }) => {
  test.setTimeout(150_000);
  await seedAndCalc(page, "서울특별시 강남구 테헤란로 123");
  await expect(page.getByText("결정세액").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("regulated-area-assumption-line")).toHaveCount(0);
});
