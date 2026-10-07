/**
 * 판정 메뉴 ③ — 혼인합가 + 명부 밖 장기임대주택의 **혼인 전 보유자**(기획재정부 조세정책과-1199) → 판정 본문 → 결과 (브라우저 경로)
 *
 * 엔진 규칙·배선은 anchor가 고정한다(`merge-composition-1199-marriage-rentals.anchor.test.ts` ·
 * `rental-units-marriage-origin-1199.anchor.test.tsx`). 여기서만 관측되는 것은 **② 화면에서 선언한 임대주택마다 ③ 화면에
 * 보유자 칸이 뜨고, 고른 값이 판정 본문 `rentalHousingException.rentalUnits[].mergeOrigin`으로 실려 결론이 바뀌는가**다.
 *
 * 시나리오: 평가셋 `E132-current`(서면-2022-법규재산-4283 — 양도자 쪽 거주주택+임대 2, 배우자 쪽 일반주택+임대 1).
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const SEED = {
  "isOneHousehold": true,
  "transferDate": "2026-05-20",
  "contractTotalPrice": "800000000",
  "marriageDate": "2019-06-15",
  "isFirstTransferredInMerge": true,
  "assets": [
    {
      "assetKind": "housing",
      "acquisitionDate": "2017-02-15",
      "residenceInputMode": "direct",
      "residencePeriodMonthsAsset": "36",
      "rentalHousingException": {
        "applyException": true,
        "scenario": "A",
        "priorRentalExemptionHistory": "none",
        "rentalUnits": [
          {
            "unitId": "c",
            "businessRegistrationDate": "2017-03-15",
            "rentalRegistrationDate": "2017-03-15",
            "rentalCategory": "long_general",
            "rentalAcquisitionType": "purchase",
            "isApartment": false,
            "region": "seoul-metro",
            "standardPriceAtRentalStart": "300000000",
            "acquisitionOfficialPrice": "300000000",
            "isNationalSizeHousing": true,
            "hasMinimum2Units": true,
            "rentalMonths": "110",
            "requirementsConfirmed": true
          },
          {
            "unitId": "d",
            "businessRegistrationDate": "2017-10-15",
            "rentalRegistrationDate": "2017-10-15",
            "rentalCategory": "long_general",
            "rentalAcquisitionType": "purchase",
            "isApartment": false,
            "region": "seoul-metro",
            "standardPriceAtRentalStart": "300000000",
            "acquisitionOfficialPrice": "300000000",
            "isNationalSizeHousing": true,
            "hasMinimum2Units": true,
            "rentalMonths": "100",
            "requirementsConfirmed": true
          },
          {
            "unitId": "e",
            "businessRegistrationDate": "2018-05-29",
            "rentalRegistrationDate": "2018-05-29",
            "rentalCategory": "long_general",
            "rentalAcquisitionType": "purchase",
            "isApartment": false,
            "region": "seoul-metro",
            "standardPriceAtRentalStart": "300000000",
            "acquisitionOfficialPrice": "300000000",
            "isNationalSizeHousing": true,
            "hasMinimum2Units": true,
            "rentalMonths": "95",
            "requirementsConfirmed": true
          }
        ]
      }
    }
  ],
  "houses": [
    {
      "id": "a",
      "region": "capital",
      "acquisitionDate": "2016-03-15",
      "officialPrice": "300000000",
      "isInherited": false,
      "isLongTermRental": false,
      "isApartment": false,
      "isOfficetel": false,
      "isUnsoldHousing": false,
      "mergeOrigin": "counterpart_side"
    }
  ]
};

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as { rentalHousingException?: { rentalUnits?: { mergeOrigin?: string }[] } };
}

test("[MR-1] 임대주택이 양쪽에 있어 각각 2주택 이상이면 → 본문에 보유자가 실리고 과세 · 1199 사유", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, SEED);
  await expect(page.getByTestId("rental-units-marriage-origin")).toBeVisible();
  await page.getByTestId("rental-merge-origin-0-seller").click();
  await page.getByTestId("rental-merge-origin-1-seller").click();
  await page.getByTestId("rental-merge-origin-2-counterpart").click();
  const body = await judge(page);
  expect(body.rentalHousingException?.rentalUnits?.map((u) => u.mergeOrigin)).toEqual([
    "seller_side",
    "seller_side",
    "counterpart_side",
  ]);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.getByText(/기획재정부 조세정책과-1199/).first()).toBeVisible();
});

test("[MR-2] 짝 — 임대주택이 모두 양도자 쪽이면 배우자 쪽은 1주택이라 비과세", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, SEED);
  for (const i of [0, 1, 2]) await page.getByTestId(`rental-merge-origin-${i}-seller`).click();
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});
