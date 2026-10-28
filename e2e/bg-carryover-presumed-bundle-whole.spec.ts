/**
 * E2E: 이월과세 × 감정가액 × 함께 양도 — 화면 검증(⑧)은 통과하는데 서버가 400을 돌려주던 막다른 길.
 * 계획서 `docs/02-design/features/bg-carryover-presumed-bundle-whole-400.plan.md`(Q-1 a · Q-2 a).
 *
 * 증여세용 물건 전체 재계산이 이월과세 치환을 거치지 않아 「감정가액을 입력해야 합니다」로 던졌다(M-0.5).
 * 시료: 토지 2건 · 채무 80,000,000 · 시가 400,000,000(채무비율 0.2) · 당초 증여자 감정가액 250,000,000 · 증여세 상당액 4,000,000.
 *
 *   BW-E1. 계산이 200으로 끝나고 묶음 카드마다 개산공제 900,000(산식 값) · 증여세 산입 800,000 줄이 뜬다
 *   BW-E2. 당초 증여자 감정가액을 비우면 화면이 그 칸으로 막는다(서버까지 가지 않는다)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const land = (id: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(id),
  addressJibun: `서울 강남구 테스트동 ${id}-1`,
  assetKind: "land",
  transferType: "burdened_gift",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
    useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {},
  },
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "appraisal", standardPriceAtTransfer: "320000000", standardPriceAtAcq: "180000000",
  bgActualAcquisitionLand: "300000000", bgCoDonorPresumedAcquisitionLand: "250000000", bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0",
  ...over,
});

async function seedAndOpen(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [land(1, over), land(2, over)],
          transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test("BW-E1: 이월과세 × 감정가액 함께 양도 — 계산이 끝나고 카드에 개산공제·증여세 산입 줄", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page);
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  const body = await r.json();
  expect(body.data.mode).toBe("bundled");

  const est = page.getByTestId("bg-bundle-card-estimated-deduction");
  await expect(est).toHaveCount(2);
  for (const row of await est.all()) {
    await expect(row).toContainText("개산공제 = 취득시 기준시가 150,000,000 × 채무비율 20.0000% × 개산공제율 3%");
    await expect(row).toContainText("900,000");
  }
  const gift = page.getByTestId("bg-bundle-card-carryover-gift-tax");
  await expect(gift).toHaveCount(2);
  for (const row of await gift.all()) await expect(row).toContainText("800,000");
});

test("BW-E2: 당초 증여자 감정가액을 비우면 화면이 그 칸으로 막는다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedAndOpen(page, { bgCoDonorPresumedAcquisitionLand: "" });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText(/당초 증여자.*감정가액.*입력하세요/).first()).toBeVisible({ timeout: 20_000 });
});
