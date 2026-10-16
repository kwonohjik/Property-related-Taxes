/**
 * 양도소득세 — 부담부증여 × 재개발·재건축 완공 아파트(원조합원) × 시가 모드 × 환산(K-5): 「소득세법 시행령」 §166③ (2026-10-16)
 *
 *   RB-1. K-5 — 재개발 블록 ⑤에 실가/환산 라디오 없이 §166③ 안내와 인가일 기준시가 칸이 뜨고, 결과의 인가전 취득가액이
 *         평가액 5억 × 채무비율 0.4 × 3억 ÷ 4억 = 150,000,000 · 개산공제 3,600,000 (종전: 일반 환산 120,000,000 · 실비 × r)
 *   RB-2. K-4 — ⑤ 섹션이 없다(엔진이 부담부증여 실지취득가액 안분값을 쓴다)
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 포트는 `baseURL` — 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function seed(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "redevelopment_apt",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1500000000",
    bgMortgageDebtAmount: "600000000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "converted",
    bgActualAcquisitionTotal: "300000000",
    standardPriceAtTransfer: "1500000000",
    redevSubject: "apt",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevApprovalDate: "2018-06-01",
    redevRightsValue: "500000000",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "200000000",
    redevPreApprovalExpenses: "10000000",
    redevPostApprovalExpenses: "5000000",
    redevCompletionDate: "2021-09-01",
    redevManagementDisposalHousingPrice: "400000000",
    redevAcquisitionHousingPrice: "300000000",
    ...over,
  };
}

async function seedAndOpen(page: Page, asset: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset],
          transferDate: "2024-03-01",
          filingDate: "2024-05-31",
          contractTotalPrice: "1500000000",
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
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const res = await calcResponse;
  expect(res.status(), await res.text()).toBe(200);
  return res;
}

test.describe("부담부증여 × 재개발 완공 아파트 × 환산 — §166③", () => {
  test("RB-1: K-5 → ⑤에 §166③ 칸 · 인가전 취득가액 150,000,000 · 개산공제 3,600,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, seed());
    for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
    const card = page.locator('[data-asset-card-index="0"]');
    await expect(card.getByTestId("redev-bg-sec166-3-notice")).toBeVisible();
    await expect(card.locator('[data-field="useEstimatedAcquisition"]')).toHaveCount(0);
    await expect(card.locator('[data-field="redevManagementDisposalHousingPrice"]').first()).toBeVisible();
    const res = await calculate(page);
    const sent = res.request().postDataJSON() as Record<string, unknown>;
    expect(sent.useEstimatedAcquisition).toBe(true);
    const body = await res.json();
    const pre = (body.data?.result ?? body.result).redevelopmentDetail.preApproval;
    expect(pre.apportionedAcquisition).toBe(150_000_000);
    expect(pre.expenses).toBe(3_600_000);
  });

  test("RB-2: K-4 → ⑤ 섹션이 없다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, seed({ bgAcquisitionMethod: "actual" }));
    for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
    const card = page.locator('[data-asset-card-index="0"]');
    await expect(card.getByText("인가전 분 종전 부동산 취득가액")).toHaveCount(0);
    await expect(card.locator('[data-field="redevActualAcquisitionPrice"]')).toHaveCount(0);
  });
});
