/**
 * E2E — 재개발 완공 APT(§166) × 이전 형식 필요경비(`directExpenses`) (2026-11-02)
 *
 * 계획서: docs/02-design/features/redev-transfer-expense-residual.plan.md Q-1 a
 *
 * 종전: 옛 칸 7백만이 ④로 전송되지만 §166 산식이 읽지 않아 0 입력과 세액이 같았다. 안내도 차단도 없었고, 자본적 지출액이 있으면 칸도 숨었다.
 * 지금: 「다음」 → 안내와 함께 옛 칸으로 이동(자본적 지출액이 있어도 보인다) → 칸을 비우면 계산된다 · 자본적 지출액은 인가 후 분으로 간다.
 *
 * 실행(워크트리): E2E_PORT=3164 npx playwright test e2e/redev-legacy-expense-unused.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { REDEV_LEGACY_EXPENSE_UNUSED_MESSAGE } from "../lib/calc/redev-legacy-expense-unused";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const asset = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "redevelopment_apt",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-01-01",
  fixedAcquisitionPrice: "300000000",
  useEstimatedAcquisition: false,
  redevActualAcquisitionPrice: "300000000",
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay",
  redevExemptionEligibleAtApproval: "no",
  redevApprovalDate: "2018-05-01",
  redevRightsValue: "500000000",
  redevSettlementAmount: "80000000",
  redevPreApprovalExpenses: "0",
  actualSalePrice: "700000000",
  directExpenses: "7000000", // 옛 저장 형식
  capitalExpenditure: "1000000", // 종전엔 이 값 때문에 옛 칸이 숨었다
};

const seed = {
  state: {
    formData: {
      assets: [asset],
      transferDate: "2024-06-01",
      filingDate: "2024-08-31",
      contractTotalPrice: "700000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
};

// page.evaluate에는 클로저가 넘어가지 않는다 — 키는 인자로 넘긴다.
const inField = (key: string) =>
  document.activeElement instanceof HTMLElement && !!document.activeElement.closest(`[data-field="${key}"]`);

test("재개발 완공 APT + 이전 형식 필요경비: 안내·차단 → 칸을 비우면 계산 · 자본적 지출액은 인가 후 분", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seed);

  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByTestId("redev-legacy-expense-unused-notice")).toHaveText(REDEV_LEGACY_EXPENSE_UNUSED_MESSAGE);
  await expect.poll(() => page.evaluate(inField, "directExpenses")).toBe(true);

  await page.locator('[data-field="directExpenses"]').locator("input").first().fill("");
  await expect(page.getByTestId("redev-legacy-expense-unused-notice")).toHaveCount(0);

  const body = await calculate(page);
  expect(body.expenses).toBe(0);
  expect((body.redevelopment as Record<string, unknown>).postApprovalExpenses).toBe(1_000_000);
});
