/**
 * 겸용주택 × §155⑳ — 브라우저 경로 (`docs/00-pm/mixed-use-rental-155-20.plan.md`)
 * 세액·술어는 anchor(`__tests__/calc/mixed-use-rental-155-20.anchor.test.tsx`)가 고정한다. 여기서만 보이는 것:
 * 겸용 화면에서 ⑳을 선언한 폼이 본문에 실려 계산되고 결과에 근거가 보이며, B는 ⑧에서 막힌다.
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "../lib/stores/calc-wizard-asset-factory";

const NC = "4682025021";
const UNIT = {
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26", rentalCategory: "long_general", rentalAcquisitionType: "purchase",
  isApartment: false, region: "seoul-metro", standardPriceAtRentalStart: "250000000", isNationalSizeHousing: true, hasMinimum2Units: true,
  rentalInputMode: "direct", rentalMonths: "48", requirementsConfirmed: true,
};

function formOf(scenario: "A" | "B") {
  return {
    ...createDefaultTransferFormData(),
    householdNoPresaleRightsConfirmed: true,
    transferDate: "2023-09-18",
    filingDate: "2023-12-31",
    contractTotalPrice: "1000000000",
    householdHousingCount: "2",
    isOneHousehold: true,
    houses: [{
      id: "r", region: "non_capital", regionCode: NC, acquisitionDate: "2018-09-27", officialPrice: "100000000", isInherited: false, isLongTermRental: true,
      isApartment: false, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general",
    }],
    assets: [{
      ...makeDefaultAsset(1),
      assetId: "mx1", addressJibun: "경상남도 창원시 테스트동 1", regionCode: NC, assetKind: "housing", acquisitionCause: "purchase",
      acquisitionDate: "2019-08-08", isMixedUseHouse: true,
      residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
      mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
      mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
      mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
      useEstimatedAcquisition: true, fixedAcquisitionPrice: "500000000", actualSalePrice: "1000000000",
      residencePeriods: [{ moveInDate: "2019-08-08", moveOutDate: "2022-02-08" }],
      rentalHousingException: { applyException: true, scenario, priorRentalExemptionHistory: "none", rentalUnits: [UNIT] },
    }],
  };
}

async function seed(page: Page, formData: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: { formData, currentStep: 0, pendingMigration: false },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

test("[MXR-1] ★ 겸용 + ⑳ 선언 → 본문에 실리고 주택분 비과세 · 근거 문구", async ({ page }) => {
  await seed(page, formOf("A"));
  const req = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await calculate(page);
  const body = (await req).postDataJSON() as { propertyType: string; rentalHousingException?: { scenario: string } };
  expect(body.propertyType).toBe("mixed-use-house");
  expect(body.rentalHousingException?.scenario).toBe("A");
  const json = await (await res).json();
  expect(json.data.result.housingPart.isExempt).toBe(true);
  await expect(page.getByText(/겸용주택의 주택 부분을 거주주택으로/).first()).toBeVisible();
});

test("[MXR-2] B → ⑧이 막아 계산 요청이 나가지 않는다", async ({ page }) => {
  await seed(page, formOf("B"));
  let posted = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true;
  });
  await calculate(page);
  await expect(page.getByText(/겸용주택은 직전거주주택보유주택/).first()).toBeVisible();
  expect(posted).toBe(false);
});
