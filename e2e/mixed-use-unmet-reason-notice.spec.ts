/**
 * 겸용주택 — 일시적 2주택 처분기한이 지나 과세되면 사유가 결과 화면에 보인다
 * (`docs/00-pm/mixed-use-unmet-reason-calc.plan.md` · V-5). 문장·세액은 anchor
 * (`__tests__/calc/mixed-use-unmet-reason-notice.anchor.test.tsx`)가 고정한다 — 여기서는 겸용 결과 화면 표시만 본다.
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";

const NC = "4682025021";

test("[MUR-1] ★ 겸용 · 일시적 2주택 처분기한 경과 → 처분기한 미충족 사유가 결과에 보인다", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("b", "2020-01-02", { regionCode: NC, officialPrice: "100000000" })],
    assetOver: withMixedHousingStd({
      addressJibun: "경상남도 고성군 테스트리 1",
      regionCode: NC,
      acquisitionDate: "2018-06-01",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "600000000",
      isMixedUseHouse: true,
      residentialFloorArea: "100",
      nonResidentialFloorArea: "60",
      mixedUseTotalLandArea: "200",
      buildingFootprintArea: "100",
      mixedTransferHousingPrice: "600000000",
      mixedTransferLandPricePerSqm: "5000000",
      mixedTransferCommercialBuildingPrice: "100000000",
      mixedAcqHousingPrice: "300000000",
      mixedAcqLandPricePerSqm: "2500000",
      mixedAcqCommercialBuildingPrice: "50000000",
      mixedIsMetropolitanArea: true,
    }),
    formOver: {
      transferDate: "2023-09-18",
      filingDate: "2023-11-30",
      contractTotalPrice: "1000000000",
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "2020-01-02",
    },
  });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.ok(), `계산 API 비정상 응답 ${res.status()}`).toBe(true);
  const { result } = ((await res.json()) as { data: { result: { housingPart?: { isExempt: boolean } } } }).data;
  expect(result.housingPart?.isExempt).toBe(false);
  await expect(
    page.getByText(/일시적 2주택 비과세 특례\(소득세법 시행령 §155①\)를 적용하지 않았습니다 — 신규주택 취득일부터 3년 이내 종전주택 양도 미충족/).first(),
  ).toBeVisible();
});
