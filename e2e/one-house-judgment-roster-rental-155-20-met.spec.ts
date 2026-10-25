/**
 * 판정 메뉴 — 임대주택을 명부에도 「장기임대 등록주택」으로 넣고 §155⑳ 요건을 갖추면 비과세 (브라우저 경로)
 *
 * 계획서 `docs/00-pm/menu-roster-rental-155-20-met.plan.md`. 종전에는 ⑳ 카드가 「요건 충족」인데 판정 엔진이 명부의 임대 행을
 * 센 채 「과세」로 냈다(핸드오프 계산기는 0). 판정·카드·계산기 짝은 anchor RM-1~7이 고정한다. 여기서는 시드 → 판정 → 결과 화면에서
 * 결론과 주택 수 카드가 함께 바뀌는지만 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const rentalRow = {
  id: "r1",
  region: "capital",
  acquisitionDate: "2007-01-01",
  officialPrice: "250000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  acquisitionOrigin: "general",
};

const seed = (houses: object[]) => ({
  isOneHousehold: true,
  transferDate: "2024-06-01",
  contractTotalPrice: "1000000000",
  houses,
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
            standardPriceAtRentalStart: "250000000",
            acquisitionOfficialPrice: "250000000",
            isNationalSizeHousing: true,
            hasMinimum2Units: true,
            rentalMonths: "16",
            requirementsConfirmed: true,
          },
        ],
      },
    },
  ],
});

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

test("[RME-1] 명부에 임대 행 · ⑳ 충족 → 비과세 · 주택 수 「2채 중 1채」 + ⑳ 한 줄", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, seed([rentalRow]));
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByTestId("one-house-counted")).toHaveText("1채");
  await expect(page.getByTestId("one-house-count-excluded")).toContainText(
    "장기임대주택 — 거주주택 특례 요건 충족으로 거주주택을 1주택으로 봄",
  );
});

test("[RME-2] 짝 — 명부 없음(메뉴 전제) → 같은 결론 · 제외 줄 없음", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, seed([]));
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByTestId("one-house-counted")).toHaveText("1채");
  await expect(page.getByTestId("one-house-count-excluded")).toHaveCount(0);
});
