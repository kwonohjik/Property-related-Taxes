/**
 * E2E — 부담부증여 × 1세대1주택 전액 비과세: 결과에 §159 명세·증여세가 보인다 (계획서 `bg-exempt-early-return-statement.plan.md` §5-5 · Q-1 a).
 *
 * 종전: 비과세 조기 반환이 §159 명세를 싣지 않아 결과 화면에 「부담부증여 평가 명세」·증여세 결정세액이 없었다.
 * 시료(G1-14 픽스처): 주택 · 양도시 기준시가 11억 · 취득시 5억 · 채무 6억 · 1세대1주택 · 거주 120개월 · 2009-03-01 → 2024-03-01
 *   → 비과세 · 채무비율 6/11 · 무상이전분 500,000,000 · 증여세 결정세액 77,600,000(route anchor와 같은 값).
 *
 * 실행(워크트리): E2E_PORT=3298 npx playwright test e2e/bg-exempt-early-return-statement.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWizard } from "./_helpers/split-acq-display";

const house = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-03-01",
  residenceInputMode: "direct", residencePeriodMonthsAsset: "120", ownershipNumerator: "100", ownershipDenominator: "100",
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  standardPriceAtTransfer: "1100000000", standardPriceAtAcq: "500000000", bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000",
};
const seed = {
  state: {
    formData: {
      assets: [house], transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "", householdHousingCount: "1", isOneHousehold: true,
      residencePeriodMonths: "120", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
};

test("BGX-E1 단건 1세대1주택 비과세 부담부증여 — 「부담부증여 평가 명세」와 증여세 결정세액 77,600,000이 보인다", async ({ page }) => {
  test.setTimeout(180_000);
  await seedWizard(page, seed);
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  expect((await res).status()).toBe(200);
  const body = page.locator("body");
  await expect(body).toContainText("1세대1주택 비과세", { timeout: 60_000 });
  await expect(body).toContainText("부담부증여 평가 명세");
  await expect(body).toContainText(/증여세 결정세액 \(수증자 부담\)\s*77,600,000/);
  const dir = process.env.E2E_SHOT_DIR;
  if (dir) {
    for (const [name, scheme, width] of [["light", "light", 1280], ["dark", "dark", 1280], ["m375", "light", 375]] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await page.getByText("증여세 결정세액 (수증자 부담)").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${dir}/bgex-${name}.png` });
    }
  }
});
