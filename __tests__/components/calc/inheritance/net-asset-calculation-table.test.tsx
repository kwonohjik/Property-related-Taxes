/**
 * @vitest-environment jsdom
 *
 * NetAssetCalculationTable — 별지 2쪽 「4.순자산가액」 입력폼 anchor
 *
 * 버그 회귀 (스크린샷): 행 단위 평가차액(④ 표) 입력 시 ② 평가차액이 0으로 stale,
 *   ⑧ 자산총액 소계·다 순자산가액 미리보기가 평가차액을 반영하지 못함.
 *   원인: raw.assetValuationDelta 직접 읽기 (dual-truth). resolveEvaluationDelta 단일 도출로 정정.
 *
 * - NAC-1: 행 모드 → ② 입력란 disabled + 보정값 70,000,000 표시
 * - NAC-2: 행 모드 → ⑧ 자산총액 소계 = 1,070,000,000 (① + 보정 ②)
 * - NAC-3: 총액 모드(행 미입력) → ② 편집 가능 + 입력값 그대로
 *
 * 실행: npx vitest run __tests__/components/calc/inheritance/net-asset-calculation-table.test.tsx
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NetAssetCalculationTable } from "@/components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable";
import type { EvaluationDeltaRow } from "@/lib/tax-engine/property-valuation/evaluation-delta";
import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(() => cleanup());

const EMPTY: UnlistedNetAssetCalculation = {
  bsTotalAssets: 0, assetValuationDelta: 0, corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0, otherEarnedRights: 0, prepaidExpenses: 0,
  preGiftRetainedEarnings: 0, bsTotalLiabilities: 0, corporateTaxPayable: 0,
  farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0, retirementProvision: 0,
  otherProvision: 0, reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
};

// 스크린샷 시나리오: 토지 +40M, 건물 +10M, 차입금 −20M → 평가차액 70,000,000
const ROWS: EvaluationDeltaRow[] = [
  { rowId: "a1", category: "asset", accountName: "토지", evaluationAmount: 140_000_000, bookAmount: 100_000_000 },
  { rowId: "a2", category: "asset", accountName: "건물", evaluationAmount: 120_000_000, bookAmount: 110_000_000 },
  { rowId: "l1", category: "liability", accountName: "차입금", evaluationAmount: 70_000_000, bookAmount: 90_000_000 },
];

describe("[NAC] 행 단위 평가차액 → ②·⑧ 보정 (스크린샷 회귀)", () => {
  it("NAC-1: 행 모드 → ② 평가차액 입력란 disabled + 70,000,000 표시", () => {
    render(
      <NetAssetCalculationTable
        netAssetValueRaw={{ ...EMPTY, bsTotalAssets: 1_000_000_000, assetValuationDelta: 0, evaluationDeltaRows: ROWS }}
        onChange={() => {}}
      />,
    );
    const deltaInput = screen.getByDisplayValue("70,000,000") as HTMLInputElement;
    expect(deltaInput.disabled).toBe(true);
  });

  it("NAC-2: 행 모드 → ⑧ 자산총액 소계 = 1,070,000,000 (raw.assetValuationDelta=0이어도 반영)", () => {
    render(
      <NetAssetCalculationTable
        netAssetValueRaw={{ ...EMPTY, bsTotalAssets: 1_000_000_000, assetValuationDelta: 0, evaluationDeltaRows: ROWS }}
        onChange={() => {}}
      />,
    );
    // ⑧ 자산총액 소계 + 다 순자산가액(부채 0) 둘 다 동일값 → getAllByText
    expect(screen.getAllByText("1,070,000,000원").length).toBeGreaterThanOrEqual(1);
  });

  it("NAC-3: 총액 모드(행 미입력) → ② 편집 가능 + 입력값 50,000,000 그대로", () => {
    render(
      <NetAssetCalculationTable
        netAssetValueRaw={{ ...EMPTY, bsTotalAssets: 1_000_000_000, assetValuationDelta: 50_000_000 }}
        onChange={() => {}}
      />,
    );
    const deltaInput = screen.getByDisplayValue("50,000,000") as HTMLInputElement;
    expect(deltaInput.disabled).toBe(false);
    // ⑧ 자산총액 = 1,000,000,000 + 50,000,000
    expect(screen.getAllByText("1,050,000,000원").length).toBeGreaterThanOrEqual(1);
  });
});
