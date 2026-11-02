/**
 * E2E — 재개발·재건축 자산(§166) × 이전 형식 필요경비(`directExpenses`) (2026-11-02)
 *
 * 계획서: docs/02-design/features/redev-transfer-expense-residual.plan.md Q-1 a
 *
 * 종전: 옛 칸 값은 요청에 실리지만 재개발 산식이 읽지 않아 세액에 닿지 않았고, ⑧도 안내도 없었다.
 * 지금: 「다음」 → ⑧이 옛 칸으로 이동 · ⑤ 안내 → 칸을 비우고 자본적지출 칸에 옮기면 계산되고 그 금액이 재개발 인가 후 분 필요경비로 실린다.
 *
 * 실행(워크트리): E2E_PORT=3275 npx playwright test e2e/redev-legacy-expense-unused.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

// 청산금 수령분 단독 신고(사례 46) 시드 — `redev-receive-only-filing-total.spec.ts`와 같은 값에 옛 칸과 자산 양도가액(「다음」 검증 필수)을 더했다.
const asset = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "redevelopment_apt",
  acquisitionCause: "purchase",
  acquisitionDate: "2002-04-09",
  fixedAcquisitionPrice: "200000000",
  useEstimatedAcquisition: false,
  redevActualAcquisitionPrice: "200000000",
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "housing",
  redevSettlementDirection: "receive",
  redevReceiveOnlyMode: "yes",
  redevExemptionEligibleAtApproval: "no",
  redevApprovalDate: "2009-10-23",
  redevRightsValue: "500000000",
  redevSettlementAmount: "114000000",
  redevSettlementSaleDate: "2024-01-26",
  redevPreApprovalExpenses: "0",
  redevPostApprovalExpenses: "0",
  actualSalePrice: "525000000",
  directExpenses: "5000000", // 옛 저장 형식
};

const seed = {
  state: {
    formData: {
      assets: [asset],
      transferDate: "2024-01-26",
      filingDate: "2024-03-31",
      contractTotalPrice: "525000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
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

test("재개발 APT + 이전 형식 필요경비: ⑧이 옛 칸으로 이동 → 자본적지출로 옮기면 계산 · 인가 후 분 필요경비로 실린다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seed);

  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect.poll(() => page.evaluate(inField, "directExpenses")).toBe(true);
  await expect(page.getByTestId("redev-legacy-expense-unused-notice")).toBeVisible();
  await expect(page.getByTestId("redev-legacy-expense-unused-notice")).toContainText("「인가전 분 필요경비」");

  await page.locator('[data-field="directExpenses"]').locator("input").first().fill("");
  await page.getByTestId("capital-expenditure").fill("5000000");
  await expect(page.getByTestId("redev-legacy-expense-unused-notice")).toHaveCount(0);

  const body = await calculate(page);
  expect(body.expenses).toBe(0);
  expect((body.redevelopment as Record<string, unknown>).postApprovalExpenses).toBe(5_000_000);
});
