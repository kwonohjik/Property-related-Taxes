/**
 * E2E — 이월과세 자산의 화면이 읽는 취득일은 증여 등기접수일이다 (L23 · L21 후속).
 *
 * 이월과세 카드에는 취득일 칸이 없다. 매매로 입력했다가 취득원인을 바꾸면 옛 `acquisitionDate`가 남는데, 화면 일곱 곳이 그 잔재를 읽어
 * 엔진(증여 등기접수일)과 다른 날짜를 보여 주었다. 대표 둘을 브라우저로 본다 — 「3 취득」 칩과 날짜 순서 경고(N3·N2), 다주택 중과 한시 배제기간 카드(N5).
 * 값 단언은 jsdom/route anchor가 한다: `__tests__/calc/nh99-l23-carryover-ui-acq-reads.{anchor.test.ts,ui.test.tsx}`.
 *
 * 실행(워크트리): E2E_PORT=3293 npx playwright test e2e/nh99-l23-carryover-ui-acq-reads.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { seedWizard, singleSeed } from "./_helpers/split-acq-display";

const carryHouse = (S: string, G: string) => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "제주특별자치도 서귀포시 테스트동 1-1",
  regionCode: "5013010100",
  assetKind: "housing",
  acquisitionCause: "carryover_gift",
  acquisitionDate: S, // 칸이 없는 옛 잔재
  actualSalePrice: "1500000000",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: G,
    donorAcquisitionDate: "2000-06-01",
    donorAcquisitionPrice: "100000000",
    giftDateValuation: "1000000000",
    giftTaxAmount: "0",
    donorRelation: "lineal",
    donorSameHousehold: "no",
  },
});

const chip = (page: import("@playwright/test").Page) => page.locator('[data-asset-card-index="0"] [data-asset-section="3"] > button').first();

test.describe("이월과세 화면 취득일 읽기 (L23)", () => {
  test("N3 「3 취득」 칩 — 잔재 없이 등기접수일만 있으면 ✓, 잔재만 있으면 ○", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([carryHouse("", "2020-01-01")], { transferDate: "2024-06-01", contractTotalPrice: "1500000000", householdHousingCount: "1", isOneHousehold: true }));
    await expect(chip(page)).toContainText("취득");
    await expect(chip(page)).toContainText("✓");
    await expect(chip(page)).not.toContainText("○");

    await seedWizard(page, singleSeed([carryHouse("2010-01-01", "")], { transferDate: "2024-06-01", contractTotalPrice: "1500000000", householdHousingCount: "1", isOneHousehold: true }));
    await expect(chip(page)).toContainText("○");
    await expect(chip(page)).not.toContainText("✓");
  });

  test("N2 날짜 순서 경고 — 잔재가 양도일 이후(2030)여도 정상 등기접수일이면 경고가 뜨지 않는다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([carryHouse("2030-01-01", "2020-01-01")], { transferDate: "2024-06-01", contractTotalPrice: "1500000000", householdHousingCount: "1", isOneHousehold: true }));
    await expect(chip(page)).toContainText("✓");
    await expect(page.getByText("날짜를 확인해 주세요")).toHaveCount(0);
  });

  test("N5 보유 상황 — 한시 배제기간 카드는 등기접수일 보유(2년↑)일 때만 뜬다 (잔재 방향과 반대)", async ({ page }) => {
    test.setTimeout(240_000);
    const form = { transferDate: "2023-03-01", contractTotalPrice: "1500000000", householdHousingCount: "2", isOneHousehold: true, isRegulatedArea: true, wasRegulatedAtAcquisition: true };
    // 잔재 2018(보유 2년↑) · 등기접수일 2022-03-01(1년) → 엔진은 중과 — 「일반세율」 카드가 뜨면 안 된다
    await seedWizard(page, singleSeed([carryHouse("2018-05-05", "2022-03-01")], form));
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByRole("heading", { name: "보유 상황" })).toBeVisible();
    await expect(page.getByTestId("surcharge-suspended-notice")).toHaveCount(0);

    // 잔재 2022-03-01(1년) · 등기접수일 2018-05-05(2년↑) → 한시 배제 — 카드가 떠야 한다
    await seedWizard(page, singleSeed([carryHouse("2022-03-01", "2018-05-05")], form));
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId("surcharge-suspended-notice")).toBeVisible();
  });
});
