/**
 * §97의3 × 조합원입주권 — 자동말소 뒤 관리처분계획 인가로 입주권이 된 원조합원 (G-7 · 서면-2023-법규재산-2731)
 * 폼 → 감면 패널(§97의3만 활성 · 안내 · D 라벨) → 계산 → request body · 장특 68,000,000
 *
 * 계획서 docs/01-plan/features/rental-97-3-textbook-gaps.plan.md §5 R-1 · Q-5 a · Q-6 a.
 * 시료: 취득 2013-06-30 1.5억 · 장기 등록·임대 2014-01-01 · 자동말소 2022-01-01 · 인가 2023-03-01 · 권리가액 3.5억 · 양도 2024-06-01 7억
 * · 기준시가 E 1억 / C 1.5억 / B 2.5억 / D(인가일) 3억 → 임대분 1/2 → 장특 1억 × 50% + 1억 × 18% = 68,000,000.
 *
 * worktree 실행: E2E_PORT=3977 npx playwright test e2e/transfer-rental-97-3-right-after-auto-cancel.spec.ts
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const REDUCTION = {
  ...getReductionDefault("rental_97_3"),
  registrationDate: "2014-01-01",
  rentalStartDate: "2014-01-01",
  isTaxRegistered: true,
  taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none",
  hasVacancyOverGrace: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: "150000000",
  rentalContinuesToTransfer: false,
  rentalEndDate: "2022-01-01",
  autoCancelled973: true,
  stdPriceAtRentalEnd: "250000000",
  stdPriceAtAcquisition: "100000000",
  stdPriceAtTransfer: "300000000",
};

test("입주권 × §97의3 — §97의3만 활성 · 안내 · D 라벨 → request body · 장특 68,000,000", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: {
      assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right",
      acquisitionCause: "purchase", acquisitionDate: "2013-06-30",
      useEstimatedAcquisition: false, fixedAcquisitionPrice: "", actualSalePrice: "700000000",
      redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2023-03-01", redevOriginalAssetType: "housing",
      redevRightsValue: "350000000", redevSettlementDirection: "pay", redevSettlementAmount: "0", redevPreApprovalExpenses: "0",
      redevActualAcquisitionPrice: "150000000",
      reductions: [REDUCTION],
    },
    formOver: { transferDate: "2024-06-01", contractTotalPrice: "700000000", isOneHousehold: false, householdRightCount: "1" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);

  // ⑤ 장기임대 그룹에서 §97의3만 활성 — 나머지 5조문은 「주택 양도에만」 사유
  await expect(page.getByText(/활성 1\s*\/\s*전체 6/).first()).toBeVisible();
  await expect(page.getByTestId("r973-right-to-move-in-notice")).toContainText("서면-2023-법규재산-2731");
  await expect(page.getByText("관리처분계획 인가일 당시 기준시가 (주택+부속토지 합계)").first()).toBeVisible();

  await page.getByRole("button", { name: "가산세" }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

  // ④⑬ request body
  const req = resp.request().postDataJSON() as { propertyType?: string; assets?: { reductions?: Record<string, unknown>[] }[]; reductions?: Record<string, unknown>[] };
  const red = (req.reductions ?? req.assets?.[0]?.reductions ?? []).find((r) => r.type === "rental_97_3")!;
  expect(red).toMatchObject({ autoCancelled973: true, rentalContinuesToTransfer: false, rentalEndDate: "2022-01-01", stdPriceAtTransfer: 300_000_000 });

  const body = (await resp.json()) as { data: { result: Record<string, unknown> } };
  expect(body.data.result.rental97LthdDetail).toMatchObject({ isEligible: true, overrideRate: 0.5, rentalGainRatio: 0.5 });
  expect(body.data.result.longTermHoldingDeduction).toBe(68_000_000);
});
