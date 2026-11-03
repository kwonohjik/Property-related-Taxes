/**
 * E2E — 축 B 둘째 지분 카드 × 재개발 옛 필요경비 칸 막다른 길 (2026-11-02)
 *
 * 계획서: docs/02-design/features/axis-b-share-expense-section-kind.plan.md Q-1 a
 *
 * 종전: 둘째 지분은 저장 자산 종류가 「주택」이라 ④가 재개발로 판정하지 않았다 — 옛 칸 + 자본적 지출액이면 옛 칸이 숨은 채
 *       ⑧이 「이 칸은 비우세요」로 막아 화면에서 풀 수 없었다.
 * 지금: 「다음」 → 둘째 카드 옛 칸·안내가 보이고 초점이 간다 → 칸을 비우면 계산된다.
 *
 * 실행(워크트리): E2E_PORT=3164 npx playwright test e2e/axis-b-share-redev-legacy-expense.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { redevLegacyExpenseUnusedMessage } from "../lib/calc/redev-legacy-expense-unused";
import type { AssetForm } from "../lib/stores/calc-wizard-store";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const share = (i: number, n: string, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(i),
  ...DIRECT_RESIDENCE,
  addressJibun: `서울 강남구 테스트동 ${i}-1`,
  assetKind: "redevelopment_apt",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-01-01",
  redevSubject: "apt",
  redevOriginalAssetType: "housing",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevExemptionEligibleAtApproval: "no",
  redevApprovalDate: "2018-05-01",
  redevSettlementDirection: "pay",
  redevRightsValue: "500000000",
  redevSettlementAmount: i === 1 ? "48000000" : "32000000",
  redevPreApprovalExpenses: "0",
  redevActualAcquisitionPrice: "300000000",
  fixedAcquisitionPrice: "300000000",
  useEstimatedAcquisition: false,
  ownershipNumerator: n,
  ownershipDenominator: "100",
  ...over,
});

const seed = {
  state: {
    formData: {
      assets: [
        share(1, "60"),
        // 화면이 만드는 둘째 지분 — 저장 자산 종류 기본값(주택). 옛 저장 형식 필요경비 + 자본적 지출액
        { ...share(2, "40", { directExpenses: "7000000", capitalExpenditure: "1000000" }), assetKind: "housing", redevSubject: "" },
      ],
      assetSplitMode: "fractional",
      bundledSaleMode: "apportioned",
      transferDate: "2024-06-01",
      filingDate: "2024-08-31",
      contractTotalPrice: "1000000000",
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

const inField = (key: string) =>
  document.activeElement instanceof HTMLElement && !!document.activeElement.closest(`[data-field="${key}"]`);

test("축 B 둘째 재개발 지분: 옛 칸 + 자본적 지출액 → 칸·안내가 보이고 비우면 계산", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seed);

  await page.getByRole("button", { name: "다음", exact: true }).click();
  const second = page.locator('[data-asset-card-index="1"]');
  await expect(second.getByTestId("redev-legacy-expense-unused-notice")).toHaveText(redevLegacyExpenseUnusedMessage(seed.state.formData.assets[1] as unknown as AssetForm));
  await expect.poll(() => page.evaluate(inField, "directExpenses")).toBe(true);

  await second.locator('[data-field="directExpenses"]').locator("input").first().fill("");
  await expect(second.getByTestId("redev-legacy-expense-unused-notice")).toHaveCount(0);

  const body = await calculate(page);
  expect(body.expenses).toBe(0);
});
