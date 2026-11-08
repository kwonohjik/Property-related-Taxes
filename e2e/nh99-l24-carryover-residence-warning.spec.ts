/**
 * E2E — 이월과세 주택의 Step4 「⚠️ 조정대상지역 거주요건(2년) 불충족」 경고 (L24 · L21/L23 후속).
 *
 * 이월과세 카드에는 취득일 칸이 없어 `acquisitionDate`가 정상 경로에서 빈 값이다. 경고 게이트가 그 칸을 읽어 경고가 영원히 안 떴다.
 * 이제 증여 등기접수일(= 엔진이 읽는 취득일)로 판정한다. R1: 잔재 빔 · 등기 2019-03-01 · 거주 6개월 → 경고가 보여야 한다.
 * 부정형 짝: 등기 2016-06-01(경과규정 2017.8.3. 전) → 경고 없음. 값 단언은 jsdom/route anchor가 한다:
 * `__tests__/calc/nh99-l24-carryover-residence-warning.{anchor.test.ts,ui.test.tsx}` · `__tests__/api/transfer.route.nh99-l24-…`.
 *
 * 실행(워크트리): E2E_PORT=3294 npx playwright test e2e/nh99-l24-carryover-residence-warning.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { seedWizard, singleSeed } from "./_helpers/split-acq-display";

const carryHouse = (S: string, G: string) => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  assetKind: "housing",
  acquisitionCause: "carryover_gift",
  acquisitionDate: S, // 칸이 없는 옛 잔재
  actualSalePrice: "600000000",
  residencePeriodMonthsAsset: "6",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: G,
    donorAcquisitionDate: "2010-01-01",
    donorAcquisitionCause: "purchase",
    donorAcquisitionPrice: "100000000",
    giftDateValuation: "200000000",
    giftTaxAmount: "0",
    donorRelation: "spouse",
    donorSameHousehold: "no",
  },
});

const form = {
  transferDate: "2024-06-01",
  contractTotalPrice: "600000000",
  householdHousingCount: "1",
  isOneHousehold: true,
  residencePeriodMonths: "6",
  wasRegulatedAtAcquisition: true,
  wasRegulatedAtAcquisitionTouched: true,
};
const WARN = "조정대상지역 거주요건(2년) 불충족";

test.describe("이월과세 거주요건 불충족 경고 (L24)", () => {
  test("R1 잔재 빔 · 등기 2019-03-01 → 경고가 보인다 / 등기 2016-06-01(경과규정 전) → 경고 없음", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, singleSeed([carryHouse("", "2019-03-01")], form));
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByRole("heading", { name: "보유 상황" })).toBeVisible();
    await expect(page.getByText(WARN)).toBeVisible();

    await seedWizard(page, singleSeed([carryHouse("", "2016-06-01")], form));
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByRole("heading", { name: "보유 상황" })).toBeVisible();
    await expect(page.getByText(WARN)).toHaveCount(0);
  });
});
