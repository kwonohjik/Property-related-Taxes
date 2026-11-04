/**
 * 증여 겸용주택 — 취득정보의 「증여 신고가액」 칸이 없고(주택분·상가분 칸을 가리키는 안내), 그 칸 없이 둘째 자산으로 계산된다
 * (`docs/00-pm/mixed-gift-fixed-acq-price.plan.md` Q-1 a·Q-2 a). 세액 고정은 anchor(`__tests__/api/transfer.route.mixed-gift-fixed-acq-price.anchor.test.ts`).
 * 종전: 칸이 필수로 보였고, 비운 채 둘째 자산으로 두면 ⑧ 통과 ↔ ⑫ 400(「증여 자산은 신고가액(취득가액) 필수」).
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";

const NC = "4682025021";
const MIXED = withMixedHousingStd({
  addressJibun: "경상남도 고성군 테스트리 1", regionCode: NC, assetKind: "housing", isMixedUseHouse: true,
  residentialFloorArea: "100", nonResidentialFloorArea: "60", buildingFootprintArea: "100", mixedUseTotalLandArea: "200",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedIsMetropolitanArea: false,
  residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
  actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "500000000",
  acquisitionCause: "gift", acquisitionDate: "2022-10-01", donorAcquisitionDate: "2015-01-01", giftDonorRelation: "lineal", giftSameHousehold: "no",
  fixedAcquisitionPrice: "",
});
const LAND = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, addressJibun: "경상남도 고성군 테스트리 2",
  regionCode: NC, fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000",
  landArea: "300", landNature: "standalone",
};

test("[MGF-1] ★ 증여 겸용을 둘째 자산으로 — 증여 신고가액 칸 없이 안내만 · 계산 200", async ({ page }) => {
  test.setTimeout(150_000);
  const seed = {
    state: {
      formData: {
        assets: [{ ...makeDefaultAsset(1), ...LAND }, { ...makeDefaultAsset(2), ...MIXED }], transferDate: "2023-09-18", filingDate: "2023-12-31",
        contractTotalPrice: "1200000000", householdHousingCount: "1", isOneHousehold: false, residencePeriodMonths: "0", houses: [], presaleRights: [],
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
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

  // ① 화면 — 겸용 자산의 취득정보에 「증여 신고가액」 칸이 없고 안내가 있다.
  await page.getByRole("button", { name: "자산 목록" }).first().click();
  const acqSections = page.getByRole("button", { name: /^취득정보/ });
  for (let i = 0; i < (await acqSections.count()); i++) await acqSections.nth(i).click();
  await expect(page.getByText("취득가액 — 겸용주택 증여일 평가액(주택분·상가분)")).toBeVisible();
  await expect(page.getByText("증여 신고가액 (원)", { exact: true })).toHaveCount(0);

  // ② 계산 — 종전 ⑫ 400.
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.status(), `계산 API 응답 ${res.status()}`).toBe(200);
  const { aggregated } = ((await res.json()) as { data: { aggregated: { totalTax: number } } }).data;
  expect(aggregated.totalTax).toBeGreaterThan(0);
});
