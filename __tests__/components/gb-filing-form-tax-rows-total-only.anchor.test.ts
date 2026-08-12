/**
 * anchor: GB 신고서 양식 — **산출세액 이후는 합계만** (파트 열은 `-`)
 *
 * ## 🔴 결함 (2026-08-12 사용자 지적)
 *
 * 일반건물 일괄은 한 자산이 엔진 내부에서 토지·건물1·건물2 **계산 파트**로 쪼개진다.
 * 그런데 신고서 표가 산출세액·감면세액·결정세액·가산세·총결정세액을 파트별로 채웠다:
 *
 *   · 바로 위 **과세표준·기본공제는 이미 합계-only**(파트 셀 `-`)라, 과세표준 없이
 *     유도된 세액이 나란히 서는 모양이 된다
 *   · 누진 합산과세라 **합이 맞지 않는다** — 사용자 실측:
 *     5,810,841 + 0 + 132,315 = 5,943,156 ≠ 합계 6,340,103
 *
 * `Σ refCalculatedTax ≠ 합계`는 비교과세의 본질이고 **설계상 의도된 것**이다
 * (`transfer-tax-aggregate-helpers.ts` — ❌역안분 재제안 금지). 고칠 것은 엔진이 아니라
 * **표시**다: GB 파트 열에서는 산출세액부터 싣지 않는다.
 *
 * ⚠️ **다건 양도는 대상이 아니다** — 그쪽 자산별 참고세액은 예정신고 단위라 의미가 있다
 *    (`filing-form-exempt-gain-reduction-cap.test.tsx` A-3이 그 계약을 지킨다).
 */
import { describe, it, expect } from "vitest";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const TRANSFER = "2026-02-19";

const breakdown = (propertyId: string, refCalc: number, refDet: number) =>
  ({
    propertyId,
    propertyLabel: propertyId,
    transferPrice: 100_000_000,
    acquisitionPrice: 50_000_000,
    necessaryExpense: 0,
    capitalExpenditureForDisplay: 0,
    transferGain: 50_000_000,
    isExempt: false,
    income: 40_000_000,
    incomeAfterOffset: 40_000_000,
    longTermHoldingDeduction: 10_000_000,
    refCalculatedTax: refCalc,
    refDeterminedTax: refDet,
  }) as unknown as PerPropertyBreakdown;

/** 사용자 실측과 같은 모양 — 파트 합(5,943,156)이 합계(6,340,103)와 어긋난다. */
const gbAggregate: AggregateMeta = {
  properties: [
    breakdown("land", 5_810_841, 5_810_841),
    breakdown("building1", 0, 0),
    breakdown("building2", 132_315, 132_315),
  ],
  aggregated: {
    totalIncomeAfterOffset: 52_917_098,
    basicDeduction: 2_500_000,
    taxBase: 50_417_098,
    calculatedTax: 6_340_103,
    reductionAmount: 0,
    determinedTax: 6_340_103,
    penaltyTax: 0,
    localIncomeTax: 634_010,
    priorPaidTax: 0,
    settlementAdditionalPayable: 0,
    priorPaidLocalTax: 0,
    settlementLocalPayable: 0,
  } as unknown as AggregateMeta["aggregated"],
};

function gbForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = TRANSFER;
  form.assets[0] = { ...form.assets[0], assetKind: "general_building", acquisitionDate: "2003-03-17" };
  return form;
}

function cell(rows: ReturnType<typeof buildAggregateRows>, label: string, col: string) {
  const r = rows.find((x) => x.label === label);
  return r?.values[col as keyof typeof r.values] ?? null;
}

const TAX_ROWS = ["산출세액", "감면세액", "결정세액", "가산세액", "총결정세액"];

describe("GB 신고서 — 산출세액 이후 파트 열은 비운다", () => {
  const rows = buildAggregateRows({} as unknown as TransferTaxResult, gbAggregate, gbForm());

  for (const label of TAX_ROWS) {
    it(`${label} — 토지·건물1·건물2 셀이 모두 null`, () => {
      expect(cell(rows, label, "land")).toBeNull();
      expect(cell(rows, label, "building1")).toBeNull();
      expect(cell(rows, label, "building2")).toBeNull();
    });
  }

  it("🔴 합계는 그대로 살아 있다 (빈 표가 되면 안 된다)", () => {
    expect(cell(rows, "산출세액", "total")).toBe(6_340_103);
    expect(cell(rows, "총결정세액", "total")).toBe(6_340_103);
  });

  it("산출세액 **위** 행은 파트별로 남는다 (대조군 — 통째로 비운 것이 아니다)", () => {
    expect(cell(rows, "양도가액", "land")).toBe(100_000_000);
    expect(cell(rows, "양도소득금액", "land")).toBe(40_000_000);
  });
});

describe("🔴 다건 양도는 종전대로 파트별 세액을 싣는다 (범위 가드)", () => {
  const multiAggregate: AggregateMeta = {
    ...gbAggregate,
    properties: [breakdown("primary", 5_810_841, 5_810_841), breakdown("asset-2", 132_315, 132_315)],
  };

  it("assetKind가 general_building이 아니면 값이 그대로다", () => {
    const form = createDefaultTransferFormData();
    form.transferDate = TRANSFER;
    form.assets[0] = { ...form.assets[0], assetKind: "housing" };
    const rows = buildAggregateRows({} as unknown as TransferTaxResult, multiAggregate, form);
    expect(cell(rows, "산출세액", "primary")).toBe(5_810_841);
  });
});
