/**
 * 주 자산 겸용 묶음 — 증여받은 겸용주택(「증여 신고가액」 입력)을 주 자산으로 두고 토지와 함께 양도해도 파트 카드 양도차익이
 * 차손으로 뒤집히지 않고, 같은 물건을 둘째 자산으로 둔 계산과 세액이 같다(`docs/00-pm/mixed-primary-inherited-acquisition-dup.plan.md` V-3).
 * 세액 고정은 anchor(`__tests__/api/transfer.route.mixed-primary-inherited-acquisition-dup.anchor.test.ts`)가 한다 — 여기서는 실제 화면 경유의 위치 불변만 본다.
 * 종전: 주 자산 배치는 카드마다 증여 신고가액 전액을 취득가액으로 다시 빼 전 카드 차손 · 세액 0.
 */
import { test, expect, type Page } from "@playwright/test";
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
  fixedAcquisitionPrice: "600000000",
});
const LAND = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, addressJibun: "경상남도 고성군 테스트리 2",
  regionCode: NC, fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000",
  landArea: "300", landNature: "standalone",
};

type Agg = { totalTax: number; properties: { propertyId: string; transferGain: number }[] };

async function calc(page: Page, mixedFirst: boolean): Promise<Agg> {
  const m = { ...makeDefaultAsset(mixedFirst ? 1 : 2), ...MIXED };
  const l = { ...makeDefaultAsset(mixedFirst ? 2 : 1), ...LAND };
  const seed = {
    state: {
      formData: {
        assets: mixedFirst ? [m, l] : [l, m], transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: "1200000000",
        householdHousingCount: "1", isOneHousehold: false, residencePeriodMonths: "0", houses: [], presaleRights: [],
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
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.ok(), `계산 API 비정상 응답 ${res.status()}`).toBe(true);
  return ((await res.json()) as { data: { aggregated: Agg } }).data.aggregated;
}

test("[MPI-1] ★ 증여 겸용을 주 자산으로 둬도 파트 카드 차익이 양수 · 둘째 자산 배치와 세액이 같다", async ({ page }) => {
  test.setTimeout(150_000);
  const primary = await calc(page, true);
  const mu = primary.properties.filter((p) => p.propertyId.startsWith("mu-"));
  expect(mu).toHaveLength(4);
  // 종전에는 전 카드가 「안분 양도가액 − 증여 신고가액 전액」으로 차손이었다. 이 시드의 주택 건물 카드는 차익 0이 정상이다.
  expect(mu.every((p) => p.transferGain >= 0)).toBe(true);
  expect(primary.totalTax).toBeGreaterThan(0);
  const companion = await calc(page, false);
  expect(primary.totalTax).toBe(companion.totalTax);
});
