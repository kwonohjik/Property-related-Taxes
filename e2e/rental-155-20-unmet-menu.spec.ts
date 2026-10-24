/**
 * 판정 메뉴 × §155⑳ 불성립 + 명부의 임대주택 — 브라우저 경로 (계획서 `docs/00-pm/rental-155-20-unmet-blocks-155-1.plan.md` D-4 · Q-3 (a))
 *
 * 임대주택을 명부에 「장기임대 등록주택」으로 넣으면, §155⑳이 서지 않아도(임대개시 기준시가 7억) 판정 엔진이 그 주택을 세어 낸
 * 일시적 2주택 비과세를 거두지 않는다. 종전에는 `applyRentalHousingVerdict`가 무조건 거둬 「과세」였다. 세부 단언은 anchor(UO-8a~e)가 고정한다.
 */
import { test, expect } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

test("[UOE-2] 불성립 + 명부에 임대주택 → 판정 메뉴 비과세(일시적 2주택) · 적용한 비과세 한 줄", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2024-06-01",
    contractTotalPrice: "1000000000",
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: "2008-01-01",
        addressJibun: "서울특별시 종로구 청운동 1",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "60",
        rentalHousingException: {
          applyException: true,
          scenario: "A",
          priorRentalExemptionHistory: "none",
          rentalUnits: [
            {
              unitId: "b",
              businessRegistrationDate: "2023-02-01",
              rentalRegistrationDate: "2023-02-01",
              rentalCategory: "long_general",
              rentalAcquisitionType: "purchase",
              isApartment: false,
              region: "seoul-metro",
              standardPriceAtRentalStart: "700000000",
              acquisitionOfficialPrice: "700000000",
              isNationalSizeHousing: true,
              hasMinimum2Units: true,
              rentalInputMode: "direct",
              rentalMonths: "16",
              requirementsConfirmed: true,
            },
          ],
        },
      },
    ],
    houses: [
      {
        id: "r1",
        region: "capital",
        acquisitionDate: "2023-01-01",
        officialPrice: "700000000",
        isInherited: false,
        isLongTermRental: true,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        acquisitionOrigin: "general",
      },
    ],
  });
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByTestId("one-house-rental-verdict")).toHaveText("요건 미충족 — 특례가 적용되지 않습니다");
  await expect(page.getByTestId("one-house-rental-other-exemption")).toHaveText(
    "임대주택을 세대 주택 수에 넣어 판정했고, 적용한 비과세는 「일시적 2주택 비과세」입니다.",
  );
});

/**
 * CRE-2 — 세대 구성 불성립(조특법 §98 감면주택 행 — ⑳ 겹침 해석 미확보)도 같다(계획서 `rental-155-20-composition-revoke.plan.md` D-3 · Q-2 (a)).
 * 호별 요건은 성립(임대개시 기준시가 3억)이고 세대 구성만 서지 않는다. 종전 메뉴는 과세였다.
 */
test("[CRE-2] 세대 구성 불성립 + 명부에 임대주택 → 판정 메뉴 비과세(일시적 2주택) · 구성 사유 표시", async ({ page }) => {
  const unit = {
    unitId: "b",
    businessRegistrationDate: "2023-02-01",
    rentalRegistrationDate: "2023-02-01",
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "seoul-metro",
    standardPriceAtRentalStart: "300000000",
    acquisitionOfficialPrice: "300000000",
    isNationalSizeHousing: true,
    hasMinimum2Units: true,
    rentalInputMode: "direct",
    rentalMonths: "16",
    requirementsConfirmed: true,
  };
  const base = { isInherited: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, acquisitionOrigin: "general" };
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2024-06-01",
    contractTotalPrice: "1000000000",
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: "2008-01-01",
        addressJibun: "서울특별시 종로구 청운동 1",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "60",
        rentalHousingException: { applyException: true, scenario: "A", priorRentalExemptionHistory: "none", rentalUnits: [unit] },
      },
    ],
    houses: [
      { ...base, id: "r1", region: "capital", acquisitionDate: "2023-01-01", officialPrice: "300000000", isLongTermRental: true },
      {
        ...base,
        id: "h3",
        region: "non_capital",
        regionCode: "4682025021",
        acquisitionDate: "1996-06-01",
        officialPrice: "100000000",
        isLongTermRental: false,
        countExclusion: {
          kind: "special",
          special: { article: "unsold_98", houseAcquisitionDate: "1996-06-01", houseContractDate: "1996-06-01", isNationalHousing: false, requirementsConfirmed: true },
        },
      },
    ],
  });
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByTestId("one-house-rental-composition")).toContainText("조특령 §98②·⑥");
  await expect(page.getByTestId("one-house-rental-other-exemption")).toHaveText(
    "임대주택을 세대 주택 수에 넣어 판정했고, 적용한 비과세는 「일시적 2주택 비과세」입니다.",
  );
  // ⑳을 적용하지 않았으므로 ㉒ 안내·구성 「확인 필요」는 싣지 않는다(계산기와 같다)
  await expect(page.getByTestId("one-house-rental-period-pending")).toHaveCount(0);
  await expect(page.getByText(/겹쳐 적용하는지는 해석이 확인되지 않았습니다/)).toHaveCount(0);
});
