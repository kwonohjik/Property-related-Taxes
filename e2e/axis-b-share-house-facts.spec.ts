/**
 * 축 B(같은 물건 지분 분할 취득) × 영 §155 — 브라우저 경로.
 * 세액·키는 anchor(`__tests__/calc/axis-b-share-house-facts.anchor.test.tsx`)가 고정한다. 여기서만 보이는 것:
 * 화면 폼(첫 자산에서만 ⑳ 선언)이 계산되면 둘째 지분 카드도 비과세가 된다.
 */
import { test, expect } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";

const NC = "4682025021";
const share = (n: number, num: string, over: object = {}) => ({
  ...makeDefaultAsset(n), assetId: `s${n}`, addressJibun: "경상남도 창원시 테스트동 1", regionCode: NC, assetKind: "housing", acquisitionCause: "purchase",
  acquisitionDate: "2019-08-08", fixedAcquisitionPrice: "500000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  ownershipNumerator: num, ownershipDenominator: "100", ...over,
});

test("[ASH-1] ★ 60/40 지분 + ⑳ → 둘째 지분 카드도 비과세 · 총세액 0", async ({ page }) => {
  const unit = {
    ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26", standardPriceAtRentalStart: "250000000",
    rentalInputMode: "direct", rentalMonths: "48", requirementsConfirmed: true,
  };
  const formData = {
    ...createDefaultTransferFormData(), transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: "1000000000",
    assetSplitMode: "fractional", bundledSaleMode: "actual", isOneHousehold: true, householdHousingCount: "2", householdNoPresaleRightsConfirmed: true,
    houses: [{ id: "r", region: "non_capital", regionCode: NC, acquisitionDate: "2018-09-27", officialPrice: "100000000", isInherited: false, isLongTermRental: true,
      isApartment: false, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general" }],
    assets: [
      share(1, "60", { residencePeriods: [{ moveInDate: "2019-08-08", moveOutDate: "2022-02-08" }],
        rentalHousingException: { applyException: true, scenario: "A", priorRentalExemptionHistory: "none", rentalUnits: [unit] } }),
      share(2, "40"),
    ],
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const json = await (await res).json();
  const cards = json.data.aggregated.properties as { propertyId: string; isExempt?: boolean }[];
  expect(cards.length).toBe(2);
  expect(cards.every((c) => c.isExempt === true)).toBe(true);
  expect(json.data.aggregated.totalTax).toBe(0);
});
