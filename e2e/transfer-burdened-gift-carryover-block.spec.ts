/**
 * E2E: **부담부증여 × 이월과세(증여)** — 차단 → **지원 개시**(2026-08-10 D-7)
 *
 * 계획서: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md`
 *
 * ## 무엇이 바뀌었나
 *
 * 종전에는 STEP 0.48(§159)이 STEP 0.475(§97의2)의 결과를 덮어써 이월과세 입력이 세액에
 * 도달하지 않았고(실측 71,260,000 불변), 그래서 ⑧가 조합을 **차단**했다.
 *
 * 근거는 국세청 **재산세과-1059(2009.12.18.)**다 — 증여받은 자산을 다시 부담부증여하면
 * 「**시행령 §159 제1호에 따른 취득가액 산정 시** §97①1호 가액에 **이월과세가 적용되는 것임**」.
 * D-7a가 §159 안분 단계에 세 축(취득가액 §97의2①1호 · 증여세 ①3호 · 보유기간 §95④ 단서)을
 * 배선하고, D-7b가 ⑧를 **「두 벌 모두 입력」 요구**로 바꿨다.
 *
 *   CB-1. 「당초 증여자」 값을 안 넣으면 **여전히 막힌다** (fallback 금지 — 시나리오 A=B가 되면
 *         §97의2가 조용히 무력화된다)
 *   CB-2. 넣으면 **계산까지 간다**
 *   CB-3. 일반 양도 + 이월과세는 막지 않는다 (회귀 0 · CB-1의 양성 대조군)
 *
 * ⚠️ 금액 anchor는 vitest가 담당한다
 *    (`__tests__/tax-engine/transfer-tax/burdened-gift-carryover-{block,d7a}.anchor.test.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** ⑧ validate가 「당초 증여자」 값을 요구하는 문구. 종전의 「아직 지원하지 않습니다」를 대체한다. */
const NEED_CODONOR_MSG = /「당초 증여자」.*입력하세요/;
/** ❌ 되살아나면 안 되는 종전 차단 문구 — 지원이 열렸으므로 어디에도 있으면 안 된다. */
const OLD_BLOCK_MSG = /조합은 아직 지원하지 않습니다/;

function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            transferType: "burdened_gift",
            bgValuationMode: "sangjeungbeop_standard",
            bgLendingDepositTotal: "300000000",
            bgMortgageDebtAmount: "200000000",
            bgDonorRelation: "lineal_descendant",
            acquisitionCause: "carryover_gift",
            gbBuildingAcquisitionCause: "gift",
            acquisitionDate: "2023-06-01",
            landAcquisitionDate: "2023-06-01",
            carryover: {
              giftRegistryDate: "2023-06-01",
              donorAcquisitionDate: "2012-01-01",
              donorAcquisitionCause: "purchase",
              donorAcquisitionPrice: "100000000",
              useEstimatedAcquisition: false,
              estimationMode: "",
              giftTaxAmount: "0",
              donorCapitalExpenditure: "0",
              giftDateValuation: "600000000",
              exclusionDeclared: {},
            },
            gbLandArea: "1279",
            gbBuildingFootprintArea: "388.27",
            gbZoneType: "commercial",
            gbTransferLandPricePerSqm: "6215000",
            gbTransferBuildingValue: "631846500",
            gbAcqLandPricePerSqm: "2130000",
            gbAcqBuildingValue: "424472064",
            ...over,
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

test.describe("부담부증여 × 이월과세(증여) — 지원 개시", () => {
  test("CB-1: 「당초 증여자」 값이 없으면 계산이 막힌다 (fallback 금지)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndCalc(page);
    await expect(page.getByText(NEED_CODONOR_MSG).first()).toBeVisible({ timeout: 20_000 });
    // 종전 차단 문구는 되살아나면 안 된다.
    await expect(page.getByText(OLD_BLOCK_MSG)).toHaveCount(0);
  });

  test("CB-2: 「당초 증여자」 기준시가를 넣으면 계산까지 간다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndCalc(page, {
      bgCoDonorLandStdPriceAtAcq: "1500000000",
      bgCoDonorBuildingStdPriceAtAcq: "200000000",
    });

    await expect(page.getByText(NEED_CODONOR_MSG)).toHaveCount(0);
    await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("CB-3: 일반 양도 + 이월과세는 막지 않는다 (회귀 0 · CB-1의 양성 대조군)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // ⚠️ 이 케이스가 없으면 CB-1이 「부담부증여라서」가 아니라 다른 이유로 막힌 것과 구별되지 않는다.
    await seedAndCalc(page, { transferType: "regular" });
    await expect(page.getByText(NEED_CODONOR_MSG)).toHaveCount(0);
  });
});
