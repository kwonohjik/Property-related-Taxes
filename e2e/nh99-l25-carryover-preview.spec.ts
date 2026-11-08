/**
 * E2E — 이월과세 주택의 Step4 미리보기 2곳 (L25 · L21/L23/L24 후속).
 *
 * 이월과세 카드에는 취득일 칸이 없어 `acquisitionDate`가 정상 경로에서 빈 값(또는 옛 잔재)이다. 한시 유예 나·다목 보유 2년 게이트와
 * §154⑤ 단서 재기산 미리보기가 그 칸을 읽어 엔진과 반대로 떴다. 이제 증여 등기접수일(= 엔진이 읽는 취득일)로 판정한다.
 *  G1: 잔재 빔 · 등기 2025-03-01(양도 2026-07-15) → 「충족」이 안 보이고 보유 2년 미만 안내가 보인다. G3 짝: 등기 2020-01-01 → 「충족」.
 *  R1: 잔재 빔 · 등기 2019-01-01(양도 2022-03-01 · 처분 2021-06-01) → 재기산 고지. R2 짝: 등기 2021-09-01 → 재기산 아님.
 * 값 단언은 jsdom/route anchor가 한다: `__tests__/calc/nh99-l25-carryover-preview.{anchor.test.ts,ui.test.tsx}` · `__tests__/api/transfer.route.nh99-l25-…`.
 *
 * 실행(워크트리): E2E_PORT=3295 npx playwright test e2e/nh99-l25-carryover-preview.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { seedWizard, singleSeed } from "./_helpers/split-acq-display";

const carryHouse = (S: string, G: string, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "carryover_gift",
  acquisitionDate: S, // 칸이 없는 옛 잔재
  actualSalePrice: "800000000",
  residencePeriodMonthsAsset: "0",
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
  ...over,
});

const graceForm = {
  transferDate: "2026-07-15",
  contractTotalPrice: "800000000",
  householdHousingCount: "2",
  isOneHousehold: true,
  isRegulatedArea: true,
  wasRegulatedAtAcquisition: true,
  residencePeriodMonths: "0",
  gracePeriod: { contractDate: "2026-04-01", isLandPermitTarget: false, depositReceiptConfirmed: true },
  houses: [
    {
      id: "h2", region: "capital", regionCode: "1168010100", acquisitionDate: "2012-01-01", officialPrice: "300000000",
      isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
    },
  ],
};
const restartForm = {
  transferDate: "2022-03-01",
  contractTotalPrice: "500000000",
  householdHousingCount: "1",
  isOneHousehold: true,
  residencePeriodMonths: "0",
  finalHouseRestartHistory: "yes",
  finalHouseRestartDisposals: [{ id: "d1", kind: "transfer", date: "2021-06-01", temporaryTwoHouse: "no" }],
};

const MET = "충족 — 중과 경과조치 배제 대상";
const GATE = "미충족 — 양도 주택 보유기간이 2년 미만입니다";

test.describe("이월과세 Step4 미리보기 (L25)", () => {
  test("G1 잔재 빔 · 등기 2025-03-01 → 보유 2년 미만 안내, 「충족」 아님 / G3 등기 2020-01-01 → 「충족」", async ({ page }) => {
    test.setTimeout(240_000);
    const asset = (G: string) => carryHouse("", G, { regionCode: "1168010100" });
    await seedWizard(page, singleSeed([asset("2025-03-01")], graceForm));
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByRole("heading", { name: "보유 상황" })).toBeVisible();
    await expect(page.getByText(GATE)).toBeVisible();
    await expect(page.getByText(MET)).toHaveCount(0);

    await seedWizard(page, singleSeed([asset("2020-01-01")], graceForm));
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByRole("heading", { name: "보유 상황" })).toBeVisible();
    await expect(page.getByText(MET)).toBeVisible();
    await expect(page.getByText(GATE)).toHaveCount(0);
  });

  test("R1 잔재 빔 · 등기 2019-01-01 → 재기산 고지 / R2 등기 2021-09-01 → 재기산 아님", async ({ page }) => {
    test.setTimeout(240_000);
    const preview = page.getByTestId("final-house-restart-preview");
    await seedWizard(page, singleSeed([carryHouse("", "2019-01-01", { actualSalePrice: "500000000" })], restartForm));
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByRole("heading", { name: "보유 상황" })).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveClass(/rose/);

    await seedWizard(page, singleSeed([carryHouse("", "2021-09-01", { actualSalePrice: "500000000" })], restartForm));
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByRole("heading", { name: "보유 상황" })).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(preview).not.toHaveClass(/rose/);
  });
});
