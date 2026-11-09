/**
 * anchor(표시 전용) — 합산 신고서 표의 자산별 세액 칸에 「(참고)」 + 표 아래 안내 (2026-11-09 사용자 결정 a).
 *
 * 자산별 산출세액 칸은 자산 단독 누진 참고값(`refCalculatedTax`)이라 합이 합계와 다르다 — 브라우저 실측
 * (함께 양도 주택 9억 + 4억): 74,870,000 + 27,610,000 = 102,480,000 vs 합계 123,060,000(합산 과세표준 372,500,000 · 40% 구간).
 * 설계상 의도(❌역안분 — `FilingFormTableAggregateHelpers.ts` 자산별 세액 주석)라 값은 그대로 두고, 그 사실을 화면에 알린다.
 * 종전에는 「(참고)」가 연간 합산 자산 카드(`MultiTransferPropertyBreakdown.tsx`)에만 있고 신고서 표에는 없었다.
 */
import { describe, it, expect } from "vitest";
import { buildAggregateRows, REF_TAX_FOOTNOTE } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const breakdown = (propertyId: string, refCalc: number, extra: Record<string, unknown> = {}) =>
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
    appliedRate: 0.38,
    refCalculatedTax: refCalc,
    refDeterminedTax: refCalc,
    ...extra,
  }) as unknown as PerPropertyBreakdown;

const aggregated = (calculatedTax: number) =>
  ({
    totalIncomeAfterOffset: 375_000_000,
    basicDeduction: 2_500_000,
    taxBase: 372_500_000,
    calculatedTax,
    reductionAmount: 0,
    determinedTax: calculatedTax,
    penaltyTax: 0,
    localIncomeTax: 12_306_000,
    priorPaidTax: 0,
    settlementAdditionalPayable: calculatedTax,
    settlementRefund: 0,
    priorPaidLocalTax: 0,
    settlementLocalPayable: 12_306_000,
  }) as unknown as AggregateMeta["aggregated"];

function twoHouseForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-03-10";
  form.assets = [
    { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2018-02-01" } as AssetForm,
    { ...makeDefaultAsset(2), assetId: "a2", assetKind: "housing", acquisitionDate: "2016-04-01" } as AssetForm,
  ];
  return form;
}

const rowsOf = (meta: AggregateMeta, form = twoHouseForm()) =>
  buildAggregateRows({} as TransferTaxResult, meta, form);
const taxRow = (rows: ReturnType<typeof buildAggregateRows>) => rows.find((r) => r.label === "산출세액")!;

describe("합산 신고서 표 — 자산별 세액 칸(참고)", () => {
  it("[RT-1] 🔴 주택 2채(실측값) — 자산 칸 둘 다 「(참고)」 · 표 아래 안내 · 값은 그대로", () => {
    const rows = rowsOf({
      properties: [breakdown("primary", 74_870_000), breakdown("a2", 27_610_000, { appliedRate: 0.35 })],
      aggregated: aggregated(123_060_000),
    });
    const r = taxRow(rows);
    expect(r.values.total).toBe(123_060_000);
    expect(r.values.primary).toBe(74_870_000);
    expect(r.values.a2).toBe(27_610_000);
    expect(r.notes).toEqual({ primary: "(참고)", a2: "(참고)" });
    expect(r.footnote).toBe(REF_TAX_FOOTNOTE);
    expect(rows.filter((x) => x.footnote)).toHaveLength(1); // 안내는 한 줄만
  });

  it("[RT-2] 기존 세율 주석(shortTermNote)과 합친다 — 「(참고) <주석>」", () => {
    const rows = rowsOf({
      properties: [
        breakdown("primary", 74_870_000, { shortTermNote: "주택·부수토지 일체과세" }),
        breakdown("a2", 27_610_000),
      ],
      aggregated: aggregated(123_060_000),
    });
    expect(taxRow(rows).notes).toEqual({ primary: "(참고) 주택·부수토지 일체과세", a2: "(참고)" });
  });

  it("[RT-3] 자산 1건 — 자산 칸이 곧 합계 문맥이라 표기·안내 없음", () => {
    const form = twoHouseForm();
    form.assets = [form.assets[0]];
    const r = taxRow(rowsOf({ properties: [breakdown("primary", 74_870_000)], aggregated: aggregated(74_870_000) }, form));
    expect(r.notes).toBeUndefined();
    expect(r.footnote).toBeUndefined();
  });

  it("[RT-4] 일반건물 파트 열(세액 칸 비움) — 표기·안내 없음", () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-02-19";
    form.assets[0] = { ...form.assets[0], assetKind: "general_building", acquisitionDate: "2003-03-17" };
    const r = taxRow(
      rowsOf(
        {
          properties: [breakdown("land", 5_810_841), breakdown("building1", 0), breakdown("building2", 132_315)],
          aggregated: aggregated(6_340_103),
        },
        form,
      ),
    );
    expect(r.values.land ?? null).toBeNull();
    expect(r.notes).toBeUndefined();
    expect(r.footnote).toBeUndefined();
  });
});
