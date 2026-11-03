/**
 * E2E — 재개발 완공 APT 원조합원 환산 × 이전 형식 필요경비(`directExpenses`) 안내 (2026-11-02)
 *
 * 계획서: docs/02-design/features/redev-legacy-expense-message-lump.plan.md Q-1 a
 *
 * 종전: 환산이면 ③에 「인가전 분 필요경비」 칸이 없는데 옛 칸 안내가 그 칸으로 보냈고, 같은 ④의 보라 안내는 「인가 전 비용은 넣지 마세요」였다.
 * 지금: 옛 칸 안내도 인가 전 비용은 개산공제로 대신한다고 말한다 → 칸을 비우면 계산된다.
 *
 * 실행(워크트리): E2E_PORT=3164 npx playwright test e2e/redev-legacy-expense-message-lump.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { redevLegacyExpenseUnusedMessage } from "../lib/calc/redev-legacy-expense-unused";
import type { AssetForm } from "../lib/stores/calc-wizard-store";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

const asset = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "redevelopment_apt",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-01-01",
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay",
  redevExemptionEligibleAtApproval: "no",
  redevApprovalDate: "2018-05-01",
  redevSettlementSaleDate: "2023-05-01",
  redevRightsValue: "500000000",
  redevSettlementAmount: "80000000",
  redevPreApprovalExpenses: "0",
  // 환산(§166③) — 인가 전 분 필요경비는 개산공제다
  useEstimatedAcquisition: true,
  redevAcquisitionMethod: "estimated",
  redevAcquisitionStdPrice: "200000000",
  redevManagementDisposalStdPrice: "400000000",
  redevManagementDisposalHousingPrice: "400000000",
  redevAcquisitionHousingPrice: "200000000",
  fixedAcquisitionPrice: "",
  redevActualAcquisitionPrice: "",
  standardPriceAtTransfer: "800000000",
  standardPriceAtAcq: "300000000",
  actualSalePrice: "700000000",
  directExpenses: "7000000", // 옛 저장 형식
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

const inField = (key: string) =>
  document.activeElement instanceof HTMLElement && !!document.activeElement.closest(`[data-field="${key}"]`);

test("완공 APT 환산 + 이전 형식 필요경비: 화면에 없는 「인가전 분 필요경비」를 지목하지 않는다 → 비우면 계산", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seed);

  await page.getByRole("button", { name: "다음", exact: true }).click();
  const notice = page.getByTestId("redev-legacy-expense-unused-notice");
  await expect(notice).toHaveText(redevLegacyExpenseUnusedMessage(asset as unknown as AssetForm));
  await expect(notice).toContainText("인가 전에 쓴 비용은 개산공제로 대신하므로 따로 입력하지 않습니다.");
  await expect(notice).not.toContainText("인가전 분 필요경비");
  // ③에는 그 칸 대신 개산공제 안내가 있다 — 두 안내가 같은 방향이다
  await expect(page.getByTestId("redev-pre-expense-lump-notice")).toHaveCount(1);
  await expect(page.getByTestId("redev-expense-post-approval-notice")).toContainText("인가 전 비용은 이 칸에 넣지 마세요");
  await expect.poll(() => page.evaluate(inField, "directExpenses")).toBe(true);

  await page.locator('[data-field="directExpenses"]').locator("input").first().fill("");
  await expect(notice).toHaveCount(0);

  const body = await calculate(page);
  expect(body.expenses).toBe(0);
  expect((body.redevelopment as Record<string, unknown>).postApprovalExpenses).toBeUndefined();
});
