/**
 * E2E: 부담부증여 × 이월과세 × 취득가액 「감정가액·매매사례가액」 (K-7/K-6)
 *
 * 소법 §97의2①1호 — 이월과세의 취득가액은 **당초 증여자 취득 당시**의 §97①1호 금액이다. 그래서 새 방식을 고르면
 *  · 당초 증여자 값(이월과세 박스) = 감정가액·매매사례가액 + 개산공제 base인 취득 당시 기준시가
 *  · 양도인(증여받은 사람) 값 = 증여일 상증법 평가액(소령 §163⑨ — 실지취득가액 칸, 시나리오 B)
 *
 * 문제 20 토지(채무 80M · 시가 400M · 채무비율 0.2):
 *   시나리오 A 취득가액 = 당초 증여자 감정가액 250M × 0.2 = 50,000,000
 *   시나리오 B 양도차익 = 80M − 양도인 증여일 평가액 300M × 0.2 = 20,000,000
 *
 *   CP-1. 라디오 활성 + 선택 시 당초 증여자 감정가액·양도인 평가액 안내
 *   CP-2. 모두 입력 → 계산 → A·B 값이 엔진에서 분리돼 나온다
 *   CP-3. 당초 증여자 감정가액 미입력 → 그 칸으로 막힌다(양도인 값으로 대신하지 않는다)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function asset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "land",
    transferType: "burdened_gift",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2023-06-01",
    carryover: {
      giftRegistryDate: "2023-06-01",
      donorAcquisitionDate: "2012-01-01",
      donorAcquisitionCause: "purchase",
      donorAcquisitionPrice: "100000000",
      useEstimatedAcquisition: false,
      estimationMode: "",
      giftTaxAmount: "0",
      donorCapitalExpenditure: "0",
      giftDateValuation: "300000000",
      exclusionDeclared: {},
    },
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "400000000",
    bgMortgageDebtAmount: "80000000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "appraisal",
    standardPriceAtTransfer: "320000000",
    standardPriceAtAcq: "180000000",
    // 양도인(증여받은 사람) — 증여일 상증법 평가액
    bgActualAcquisitionLand: "300000000",
    // 당초 증여자 — 취득 당시 감정가액 + 개산공제 base 기준시가
    bgCoDonorPresumedAcquisitionLand: "250000000",
    bgCoDonorLandStdPriceAtAcq: "150000000",
    bgCoDonorBuildingStdPriceAtAcq: "0",
    ...over,
  };
}

async function seedAndOpen(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [asset(over)],
          transferDate: "2026-02-16",
          filingDate: "2026-04-30",
          householdHousingCount: "1",
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
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

test.describe("부담부증여 × 이월과세 × 감정가액·매매사례가액", () => {
  test("CP-1: 이월과세에서도 새 방식 라디오가 활성이고, 선택하면 당초 증여자·양도인 입력 안내가 뜬다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { bgAcquisitionMethod: "" });
    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 2);
    await expect(card.getByRole("radio", { name: /매매사례가액/ })).toBeEnabled();
    const appraisal = card.getByRole("radio", { name: /감정가액/ });
    await expect(appraisal).toBeEnabled();
    await appraisal.check();
    // 당초 증여자 감정가액 칸(이월과세 박스) + 양도인 증여일 평가액 안내
    await expect(card.getByTestId("bg-codonor-block")).toContainText("당초 증여자의 감정가액 입력");
    await expect(card.getByTestId("bg-carryover-presumed-transferor-notice")).toContainText("소득세법 시행령 §163⑨");
    await expect(card.locator('[data-field="bgCoDonorPresumedAcquisitionLand"]')).toBeVisible();
    // 양도인 쪽 새 방식 입력 칸은 없다(양도인 값은 증여일 평가액)
    await expect(card.locator('[data-field="bgPresumedAcquisitionLand"]')).toHaveCount(0);
  });

  test("CP-2: 모두 입력 → 계산 → 시나리오 A 취득가액 50,000,000 · B 양도차익 20,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page);
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기|세금 계산하기/ }).last().click();
    const res = await calcResponse;
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    const r = body.data?.result ?? body.result ?? body.data;
    const d = r.carryoverTaxationDetail;
    expect(d.scenarioA.acquisitionPrice).toBe(50_000_000);
    expect(d.scenarioB.transferGain).toBe(20_000_000);
  });

  test("CP-3: 당초 증여자 감정가액을 비우면 막힌다(양도인 값으로 대신하지 않는다)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, { bgCoDonorPresumedAcquisitionLand: "" });
    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기|세금 계산하기/ }).last().click();
    await expect(page.getByText(/당초 증여자.*감정가액.*입력하세요/).first()).toBeVisible({ timeout: 20_000 });
  });
});
