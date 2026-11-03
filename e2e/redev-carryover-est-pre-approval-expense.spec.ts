/**
 * E2E — 원조합원 재개발 × 이월과세 × ② 「환산취득가 사용」 ON의 「인가전 분 필요경비」 (2026-11-03)
 *
 * 계획서: docs/02-design/features/redev-carryover-est-pre-approval-expense.plan.md Q-1 a · Q-2 a
 *
 * 종전: ③이 칸을 숨기고 「쓰이지 않습니다」라고 안내했지만, B(이월과세 미적용)가 채택되면 숨은 값이 공제됐다.
 * 지금: 칸이 보이고 A·B 쓰임을 안내한다 → 넣은 값이 ④로 가고, B 채택 결정세액에 반영된다.
 *
 * 실행(워크트리): E2E_PORT=3174 npx playwright test e2e/redev-carryover-est-pre-approval-expense.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { REDEV_PRE_APPROVAL_SCENARIO_DEPENDENT_NOTE } from "../lib/calc/redev-pre-approval-acq-mode";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { seedWizard } from "./_helpers/split-acq-display";

const CAR = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "",
  useEstimatedAcquisition: true, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000",
  exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01", donorRelation: "lineal", donorSameHousehold: "no",
};
const asset = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1",
  assetKind: "redevelopment_apt",
  redevSubject: "apt",
  redevOriginalAssetType: "housing",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10",
  redevCompletionDate: "2025-09-01",
  redevRightsValue: "900000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "200000000",
  redevPreApprovalExpenses: "0",
  redevManagementDisposalHousingPrice: "600000000",
  redevAcquisitionHousingPrice: "250000000",
  redevAcquisitionStdPrice: "200000000",
  redevManagementDisposalStdPrice: "400000000",
  actualSalePrice: "700,000,000",
  transferType: "regular",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-06-01",
  acquisitionPrice: "100000000",
  carryover: CAR, // ② 「환산취득가 사용」 ON
};

const seed = {
  state: {
    formData: {
      assets: [asset],
      transferDate: "2026-02-16",
      filingDate: "2026-04-30",
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

test("이월과세 ② 환산 ON: 「인가전 분 필요경비」 칸이 보이고 넣은 값이 B 채택 세액에 반영된다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seed);
  // 칸은 첫 단계(자산 목록)의 ③에 있다

  const field = page.locator('[data-field="redevPreApprovalExpenses"]');
  await expect(field).toHaveCount(1);
  await expect(field).toContainText(REDEV_PRE_APPROVAL_SCENARIO_DEPENDENT_NOTE);
  await expect(page.getByTestId("redev-pre-expense-lump-notice")).toHaveCount(0);
  const violet = page.getByTestId("redev-expense-post-approval-notice");
  await expect(violet).toContainText("「인가전 분 필요경비」에 넣으세요");
  await expect(violet).toContainText(REDEV_PRE_APPROVAL_SCENARIO_DEPENDENT_NOTE);

  // ③ 취득 섹션이 접혀 있으면 펼친다
  if (!(await field.locator("input").first().isVisible())) await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await field.locator("input").first().fill("7000000");

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON();
  expect((body.redevelopment as Record<string, unknown>).preApprovalExpenses).toBe(7_000_000);
  const res = await resP;
  expect(res.status()).toBe(200);
  const result = (await res.json()).data.result;
  expect(result.carryoverTaxationDetail.adoptedScenario).toBe("B");
  // 0이면 60,621,000 — 7백만이 B의 인가 전 분 필요경비로 공제된다(anchor RC-2와 같은 값)
  expect(result.totalTax).toBe(57_695_000);
  await page.locator('[data-print-id="form-table"]').first().waitFor({ timeout: 60_000 });
  expect(result.redevelopmentDetail.preApproval.expenses).toBe(7_000_000);
  // 결과 신고서 — B(채택) 표의 필요경비 행: 합계 · ① 인가전 분 모두 7,000,000 (계획서 V-4)
  const table = (await page.locator('[data-print-id="form-table"]').first().innerText()).replace(/\s+/g, " ");
  expect(table).toContain("[B] 이월과세 미적용 ✓ 신고 채택");
  expect(table).toContain("필요경비 7,000,000 7,000,000 0 0");
});
