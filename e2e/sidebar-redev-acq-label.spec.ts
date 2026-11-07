/**
 * E2E: 사이드바 재개발 취득가액 라벨 — 「인가전 분 취득가액」은 계산 전 ⑤ 입력값일 때만, 계산 후는 신고서 합계 「취득가액」.
 * 시료: 양도 30억 · 종전 부동산 실지 3억 · 권리가액 9억.
 *
 *   SB-1. 완공 납부 2억: 계산 전 「인가전 분 취득가액」 300,000,000 → 계산 후 「취득가액」 500,000,000(수정 전 같은 값에 「인가전 분」 라벨)
 *   SB-2. 청산금 수령 1억 단독 신고: 계산 전 「취득가액」 계산 후 표시(수정 전 「인가전 분」 300,000,000) → 계산 후 33,333,333
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const asset = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "redevelopment_apt", redevSubject: "apt",
  isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-05-01", redevCompletionDate: "2023-06-01", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0", redevReceiveOnlyMode: "no", useEstimatedAcquisition: false, redevActualAcquisitionPrice: "300000000",
  actualSalePrice: "3000000000", standardPriceAtTransfer: "1000000000", fixedAcquisitionPrice: "", ...over,
});

async function seed(page: Page, a: unknown, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: {
      formData: {
        assets: [a], transferDate: "2024-06-01", filingDate: "2024-08-31", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  }));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) if ((await page.locator(`[data-asset-card-index="0"] [data-asset-section="${n}"]`).count()) > 0) await expandAssetSection(page, n, 0);
}
const aside = (page: Page) => page.locator('[data-slot="wizard-sidebar"]');
const row = (page: Page, label: string) => aside(page).locator("div.text-sm", { has: page.getByText(label, { exact: true }) }).first();

async function calcAndReturn(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20_000 });
  // 결과 화면에는 사이드바가 없다 — 입력 단계로 돌아가 계산 결과가 반영된 사이드바를 본다.
  await page.getByRole("button", { name: "이전" }).first().click();
  await expect(aside(page)).toBeVisible();
}

test.describe("사이드바 재개발 취득가액 라벨", () => {
  test.setTimeout(240_000);

  test("SB-1: 완공 납부 2억 — 계산 전 「인가전 분」 300,000,000 → 계산 후 「취득가액」 500,000,000", async ({ page }) => {
    await seed(page, asset(), { contractTotalPrice: "3000000000" });
    await expect(row(page, "인가전 분 취득가액")).toContainText("300,000,000");
    await calcAndReturn(page);
    await expect(aside(page).getByText("인가전 분 취득가액", { exact: true })).toHaveCount(0);
    await expect(row(page, "취득가액")).toContainText("500,000,000");
  });

  test("SB-2: 청산금 수령 단독 신고 — 계산 전 「취득가액」 계산 후 표시 → 33,333,333", async ({ page }) => {
    await seed(
      page,
      asset({ redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevSettlementSaleDate: "2024-03-01", redevReceiveOnlyMode: "yes", actualSalePrice: "100000000" }),
      { transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "100000000" },
    );
    await expect(aside(page).getByText("인가전 분 취득가액", { exact: true })).toHaveCount(0);
    await expect(row(page, "취득가액")).toContainText("계산 후 표시");
    await expect(row(page, "취득가액")).not.toContainText("300,000,000");
    await calcAndReturn(page);
    await expect(row(page, "취득가액")).toContainText("33,333,333");
  });
});
