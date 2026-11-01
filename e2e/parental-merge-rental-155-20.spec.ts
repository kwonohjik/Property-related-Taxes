/**
 * §155④⑤ × ⑳ 합가 상대 쪽 임대 — 브라우저 경로 (`docs/00-pm/parental-merge-rental-155-20.plan.md`)
 * 엔진·④⑧ 주장은 anchor(`__tests__/calc/parental-merge-rental-155-20.anchor.test.tsx`)가 고정한다. 여기서만 보이는 것:
 * 동거봉양에서도 임대 보유자 칸이 열리고, 문항에 답해야 판정이 진행되며, 결과에 근거가 보인다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const NC = "4682025021";
const UNIT = {
  unitId: "b", businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26", rentalCategory: "long_general", rentalAcquisitionType: "purchase",
  isApartment: false, region: "seoul-metro", standardPriceAtRentalStart: "300000000", acquisitionOfficialPrice: "300000000", isNationalSizeHousing: true, hasMinimum2Units: true,
  rentalMonths: "48", requirementsConfirmed: true,
};
const SEED = {
  transferDate: "2023-09-18",
  contractTotalPrice: "800000000",
  parentalCareMergeDate: "2023-06-28",
  parentalCareParentAge: "over_60",
  isFirstTransferredInMerge: true,
  assets: [{
    assetKind: "housing", acquisitionDate: "2019-08-08", regionCode: NC, addressJibun: "경상남도 창원시 테스트동 1",
    residenceInputMode: "direct", residencePeriodMonthsAsset: "0",
    rentalHousingException: { applyException: true, scenario: "A", priorRentalExemptionHistory: "none", rentalUnits: [UNIT] },
  }],
  houses: [{
    id: "a", region: "non_capital", regionCode: NC, acquisitionDate: "2018-09-27", officialPrice: "100000000", isInherited: false, isLongTermRental: false,
    isApartment: false, isOfficetel: false, isUnsoldHousing: false, mergeOrigin: "counterpart_side", acquisitionOrigin: "general",
  }],
};

async function judge(page: Page) {
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

test("[PMR-1] ★ 동거봉양 — 임대 보유자 칸 · 상대 쪽 + 문항 「예」 → 비과세 · 0061 근거", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, SEED);
  await expect(page.getByTestId("rental-units-marriage-origin")).toBeVisible();
  await expect(page.getByText("장기임대주택의 합가 전 보유자")).toBeVisible();
  await page.getByTestId("rental-merge-origin-0-counterpart").click();
  await page.getByTestId("rental-counterpart-resided-yes").click();
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByText(/기준-2024-법규재산-0061/).first()).toBeVisible();
});

test("[PMR-2] 짝 — 임대가 양도자 쪽이면 문항이 없고 과세", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, SEED);
  await page.getByTestId("rental-merge-origin-0-seller").click();
  await expect(page.getByTestId("rental-counterpart-resided-yes")).toHaveCount(0);
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
});

test("[PMR-3] 문항에 답하지 않으면 판정으로 넘어가지 않고 그 칸을 안내한다", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, SEED);
  await page.getByTestId("rental-merge-origin-0-counterpart").click();
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByText(/합가 상대 쪽 주택에 2년 이상 거주했는지 답하세요/).first()).toBeVisible();
  await expect(page.getByTestId("one-house-judgment-result")).toHaveCount(0);
});

for (const [name, colorScheme, width] of [["다크 375", "dark", 375], ["라이트 375", "light", 375]] as const) {
  test.describe(name, () => {
    test.use({ colorScheme, viewport: { width, height: 800 } });
    test(`[PMR-4] ${name} — 문항 카드 가로 넘침 없음`, async ({ page }) => {
      await gotoJudgmentHoldingsStep(page, SEED);
      await page.getByTestId("rental-merge-origin-0-counterpart").click();
      await expect(page.getByTestId("rental-counterpart-resided-hint")).toBeVisible();
      const o = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(o.s).toBeLessThanOrEqual(o.c);
    });
  });
}
