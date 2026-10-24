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
