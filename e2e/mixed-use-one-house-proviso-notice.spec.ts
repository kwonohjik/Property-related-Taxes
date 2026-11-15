/**
 * 겸용주택 1주택 — §154① 단서 적용 근거 · 삭제 전 4호 미선택 안내가 결과 화면에 보인다(일시적 2주택은 G-5 · MPN-3)
 * (`docs/00-pm/mixed-use-one-house-proviso-notice.plan.md`). 문장·조건은 anchor
 * (`__tests__/calc/mixed-use-one-house-proviso-notice.anchor.test.tsx`)가 고정한다 — 여기서는 겸용 결과 화면 표시만 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";

const GANGNAM = "1168010100";

async function calcMixed(page: Page, formOver: Record<string, unknown>, houses: Record<string, unknown>[] = []) {
  await gotoTransferHoldingsStep(page, {
    houses,
    assetOver: withMixedHousingStd({
      addressJibun: "서울특별시 강남구 역삼동 1",
      regionCode: GANGNAM,
      acquisitionDate: "2019-02-01",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "600000000",
      residenceInputMode: "direct",
      residencePeriods: [],
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
      transferDate: "2023-03-20",
      filingDate: "2023-12-31",
      contractTotalPrice: "1000000000",
      householdHousingCount: String(1 + houses.length),
      residencePeriodMonths: "0",
      ...formOver,
    },
  });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.ok(), `계산 API 비정상 응답 ${res.status()}`).toBe(true);
  return ((await res.json()) as { data: { result: { housingPart?: { isExempt: boolean } } } }).data.result;
}

test("[MPN-1] ★ 겸용 1주택 + 4호 → 주택분 비과세 · 4호·부칙 근거가 결과에 보인다", async ({ page }) => {
  test.setTimeout(90_000);
  const result = await calcMixed(page, {
    provisoReason: "rental_registration_4ho",
    proviso4hoBusinessRegDate: "2019-03-01",
    proviso4hoRentalRegDate: "2019-03-01",
    proviso4hoRegulatedOneHouse: "yes",
    proviso4hoStatus: "auto_cancelled",
  });
  expect(result.housingPart?.isExempt).toBe(true);
  await expect(
    page.getByText(/겸용주택 주택분은 「§154① 단서 4호 임대사업자 등록」에 따라 .*대통령령 제30395호 부칙 제38조 ②/).first(),
  ).toBeVisible();
});

test("[MPN-2] ★ 겸용 1주택 · 단서 미선택 · 거주 0 → 과세 · 4호 미선택 안내가 결과에 보인다", async ({ page }) => {
  test.setTimeout(90_000);
  const result = await calcMixed(page, {});
  expect(result.housingPart?.isExempt).toBe(false);
  await expect(page.getByText(/§154① 단서에서 「4호 임대사업자 등록」을 선택하고 등록 사실을 입력하세요/).first()).toBeVisible();
});

test("[MPN-3] ★ 겸용 일시적 2주택 · 단서 미선택 · 거주 0 → 과세 · 판정 메뉴로 보내는 4호 미선택 안내가 결과에 보인다", async ({ page }) => {
  test.setTimeout(90_000);
  const result = await calcMixed(page, {}, [
    { id: "b", region: "non_capital", regionCode: "4682025021", acquisitionOrigin: "general", acquisitionDate: "2022-03-01", officialPrice: "100000000", isApartment: false, isInherited: false, isLongTermRental: false },
  ]);
  expect(result.housingPart?.isExempt).toBe(false);
  await expect(page.getByText(/1세대1주택 판정 메뉴의 §154① 단서에서 「4호 임대사업자 등록」을 선택하고/).first()).toBeVisible();
});
