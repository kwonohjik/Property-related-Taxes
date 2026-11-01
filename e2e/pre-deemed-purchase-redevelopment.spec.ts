/**
 * E2E: 의제취득일(1985.1.1.) 전 매수 재개발 원조합원 — 영 §176조의2④ (PR-3 경로 C · Q-4 a)
 * 계획서 `docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md` §12.2.
 * 시료: 토지 출자 입주권 · 권리가액 5억 · 실가 1억 · 1984.6.1. 매수 → ② 101,411,574.
 *
 *   PD-R1. 1984-06-01 입력 → 취득일 칸 1985-01-01 · ⑤ 아래 카드 1장 · 실제 취득일 보존 · 요청 · 결과 카드 ②
 *   PD-R2. 환산 + 함께 견줄 실가 5억 → ① §166③ 4억 < ② 507,057,874 → ② 채택
 *   PD-R3. 환산 + 함께 견줄 실가 1억 → ① 4억 채택
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const RIGHT = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "land",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000", redevLandArea: "200",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "purchase", acquisitionDate: "1985-01-01",
  preDeemedOriginalAcquisitionDate: "1984-06-01", ...over,
});
const EST = {
  useEstimatedAcquisition: true, redevActualAcquisitionPrice: "", redevLandPricePerSqmAtApproval: "3000000",
  pre1990Enabled: true, pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000",
};

async function seed(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets, contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0",
        isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  return res;
}

test("PD-R1: 실가 — 덮어쓰기 · 카드 1장 · 결과 카드 ② 101,411,574", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [RIGHT({ acquisitionDate: "1984-06-01", preDeemedOriginalAcquisitionDate: "" })]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  const date = page.getByTestId("acq-date-building").locator("input");
  await date.first().focus();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).click();
  await expect(date.first()).toHaveValue("1985");
  await expect(page.getByTestId("pre-deemed-purchase-card")).toHaveCount(1);
  const original = page.getByTestId("pre-deemed-purchase-original-date").locator("input");
  await expect(original.nth(0)).toHaveValue("1984");
  await expect(original.nth(1)).toHaveValue("6");
  await expect(page.getByTestId("pre-deemed-purchase-actual-note")).toContainText("위 ⑤");

  const res = await calculate(page);
  expect(res.status()).toBe(200);
  expect(JSON.parse(res.request().postData() ?? "{}").preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
  const result = page.getByTestId("pre-deemed-purchase-result-card");
  await expect(result).toContainText("101,411,574");
  await expect(result).toContainText("← 채택");
});

test("PD-R2: 환산 + 함께 견줄 실가 5억 → ② 507,057,874 채택(① 4억)", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [RIGHT({ ...EST, preDeemedActualPrice: "500,000,000" })]);
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  const result = page.getByTestId("pre-deemed-purchase-result-card");
  await expect(result).toContainText("507,057,874");
  await expect(result).toContainText("400,000,000");
  await expect(result).toContainText("§166③ 환산취득가액");
  await expect(result).toContainText("② 채택");
});

test("PD-R3: 환산 + 함께 견줄 실가 1억 → ① 4억 채택", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [RIGHT({ ...EST, preDeemedActualPrice: "100,000,000" })]);
  const res = await calculate(page);
  expect(res.status()).toBe(200);
  await expect(page.getByTestId("pre-deemed-purchase-result-card")).toContainText("① 채택");
});
