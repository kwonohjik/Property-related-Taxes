/**
 * anchor: 상세명세서·신고서 **표시 축** 정정 4건 (UI 리뷰 보통 #17·#18·#21·#22).
 *
 * 네 건 모두 「같은 이름의 슬롯이 경로마다 **다른 축**을 담는다」는 한 가지 모양이다.
 *
 * | 축 | 슬롯 | 종전에 담긴 것 |
 * |---|---|---|
 * | §161 (#17) | `result.taxableGain` | 양도차익이 아니라 **장특공제 후 소득금액** |
 * | §161 (#18) | `findStepByLabel("양도소득금액")` | 부분일치로 **「비과세 양도소득금액」** step |
 * | 재개발 (#21) | `branch.gain` | 12억 안분이 걸리면 **안분 後 과세대상** |
 * | 환산 (#22) | `directExpenses` | **legacy** 필드 — 신규 입력은 자본적지출·양도비로 분리 |
 */
import { describe, it, expect } from "vitest";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import {
  buildRedevPerAssetForGain,
  buildRedevPerAssetForGrossGain,
  buildRedevPerAssetForExpense,
} from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

/** `buildStatementItems`가 훑는 슬롯의 수치 기본값 — 이 축과 무관한 NPE만 막는다. */
const NUMERIC_DEFAULTS = {
  transferPrice: 1_000_000_000,
  acquisitionPrice: 500_000_000,
  expenses: 0,
  basicDeduction: 2_500_000,
  taxBase: 0,
  appliedRate: 0.4,
  progressiveDeduction: 25_940_000,
  calculatedTax: 0,
  reductionAmount: 0,
  determinedTax: 0,
  localIncomeTax: 0,
  totalTax: 0,
  longTermHoldingRate: 0,
  penaltyTax: 0,
  ruralSpecialTax: 0,
};

/** §161 결과 — `taxableGain` 슬롯에 **소득금액**이 담긴다(엔진 계약). */
function rentalHousingResult(): TransferTaxResult {
  return {
    ...NUMERIC_DEFAULTS,
    transferGain: 500_000_000,
    // 장특공제 120,000,000이 이미 빠진 「과세대상 양도소득금액」이다.
    taxableGain: 200_000_000,
    longTermHoldingDeduction: 120_000_000,
    isExempt: false,
    rentalHousingExceptionDetail: { applied: true, appliedTable: "table-1" },
    steps: [
      {
        label: "비과세 양도소득금액 (소령 §161①)",
        formula: "§95① 양도소득금액 380,000,000 − 과세대상 양도소득금액 200,000,000 = 180,000,000",
        amount: 180_000_000,
        legalBasis: "소득세법 시행령 §161①",
      },
    ],
  } as unknown as TransferTaxResult;
}

const items = (r: TransferTaxResult) =>
  buildStatementItems(r, undefined, undefined, undefined, undefined);

describe("§161 — 양도차익 축과 소득금액 축을 섞지 않는다 (#17)", () => {
  it("🔑 X-1: 과세대상 양도차익 = 전체 양도차익 · 비과세 양도차익 = 0", () => {
    const m = items(rentalHousingResult());
    expect(m.get("transferGain")?.value).toBe(500_000_000);
    // 종전: 500,000,000 − 200,000,000 = 300,000,000 (장특공제 120,000,000만큼 부풀었다)
    expect(m.get("exemptGain")?.value).toBe(0);
    // 종전: 200,000,000 (소득금액이 양도차익 자리에 실렸다)
    expect(m.get("taxableGain")?.value).toBe(500_000_000);
  });

  it("X-2: 신고서 양식과 **같은 값**이다 (두 카드가 갈리지 않는다)", () => {
    const m = items(rentalHousingResult());
    // FilingFormTableHelpers.ts:531~532의 isRH 분기와 동일 규칙.
    const effGain = 500_000_000;
    expect(m.get("exemptGain")?.value).toBe(0);
    expect(m.get("taxableGain")?.value).toBe(effGain);
  });

  it("🔑 X-3: 「양도소득금액」 행이 비과세 step의 산식을 빌려오지 않는다 (#18)", () => {
    const m = items(rentalHousingResult());
    const income = m.get("incomeAmount");
    expect(String(income?.formula)).not.toContain("비과세 양도소득금액");
    // 순수 「양도소득금액」 step이 없으므로 기본 산식으로 떨어진다.
    expect(String(income?.formula)).toContain("장기보유특별공제");
  });

  it("X-4: 일반 경로(§161 미적용)는 종전 그대로 차감식이다", () => {
    const plain = {
      ...NUMERIC_DEFAULTS,
      transferGain: 500_000_000,
      taxableGain: 300_000_000,
      longTermHoldingDeduction: 60_000_000,
      isExempt: false,
      steps: [],
    } as unknown as TransferTaxResult;
    const m = items(plain);
    expect(m.get("exemptGain")?.value).toBe(200_000_000);
    expect(m.get("taxableGain")?.value).toBe(300_000_000);
  });
});

/** 12억 안분이 걸린 재개발 — `gain`은 안분 후, `gainBeforeAllocation`이 안분 전이다. */
function allocatedRedev(): RedevelopmentResult {
  const branch = (gross: number, taxable: number, expenses: number) => ({
    apportionedTransfer: 1_000_000_000,
    apportionedAcquisition: 1_000_000_000 - gross,
    gain: taxable,
    gainBeforeAllocation: gross,
    expenses,
    holdingMonths: 120,
    lthd: 0,
    lthdRate: 0,
  });
  return {
    preApproval: branch(300_000_000, 120_000_000, 3_000_000),
    postApprovalExistingHouse: branch(200_000_000, 80_000_000, 5_000_000),
    settlement: branch(100_000_000, 40_000_000, 2_000_000),
    total: { gain: 240_000_000, lthd: 0, taxableIncome: 240_000_000 },
    salePriceTotal: 3_000_000_000,
    highValueAllocation: { taxableRatio: 0.4 },
    estimatedLumpDeduction: 3_000_000,
  } as unknown as RedevelopmentResult;
}

describe("재개발 분할 행 — 전체/과세대상 축을 가른다 (#21) · 필요경비 합계 정합 (#20)", () => {
  it("🔑 Y-1: 「전체 양도차익」 분할 행은 12억 안분 **전** 값이다", () => {
    const arr = buildRedevPerAssetForGrossGain(allocatedRedev());
    expect(arr.map((a) => Number(a.value))).toEqual([300_000_000, 200_000_000, 100_000_000]);
  });

  it("Y-2: 「과세대상 양도차익」 분할 행은 종전대로 안분 **후** 값이다", () => {
    const arr = buildRedevPerAssetForGain(allocatedRedev());
    expect(arr.map((a) => Number(a.value))).toEqual([120_000_000, 80_000_000, 40_000_000]);
  });

  it("Y-3: 두 축이 실제로 다르다 — 구별력 확인", () => {
    const gross = buildRedevPerAssetForGrossGain(allocatedRedev()).map((a) => Number(a.value));
    const taxable = buildRedevPerAssetForGain(allocatedRedev()).map((a) => Number(a.value));
    expect(gross).not.toEqual(taxable);
  });

  it("🔑 Y-4: 「필요경비」 분할 행이 세 분기 값을 각각 담는다 (합계와 일치)", () => {
    const arr = buildRedevPerAssetForExpense(allocatedRedev());
    expect(arr.map((a) => Number(a.value))).toEqual([3_000_000, 5_000_000, 2_000_000]);
    // 합계(`redevBranchTotals().expenses`)와 분할 합이 맞는다 — 종전엔 3,000,000 vs 10,000,000.
    expect(arr.reduce((s, a) => s + Number(a.value), 0)).toBe(10_000_000);
  });
});
