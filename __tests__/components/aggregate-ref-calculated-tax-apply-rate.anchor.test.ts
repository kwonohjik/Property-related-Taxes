/**
 * 다건 자산별 산출세액(참고) `refCalculatedTax` 닫힌 산식 — 결과뷰 리뷰 2026-11-21 R-c05-02 형제(리뷰 지적 R-c05-02-sibling-ref).
 *
 * 상세명세서 자산별 행은 「과세표준 × 세율 − 누진공제 = 산출세액」 등식을 그대로 적는다
 * (`buildCalculatedTaxFormula`). 엔진이 그 값을 `Math.floor(과세표준 × 세율)`(double 곱)로 내면
 * 경계 바로 아래로 떨어지는 값에서 등식이 1원 틀린다:
 *   95,000,000 × 0.35 = 33,249,999.999999996 → floor 33,249,999 (세액 `applyRate`는 33,250,000)
 *
 * 실측(이 수정 전, mock 세율표 · 토지 A 395,000,000/300,000,000 2022-01-01 취득 + 보유 1년 미만 토지 B):
 *   · refCalculatedTax 17,809,999 · 명세서 「95,000,000 × 35% - 15,440,000 = 17,809,999」
 *   · 같은 자산 하나뿐인 일반 누진 군의 groupCalculatedTax는 17,810,000
 * 합산 세액(calculatedTax·determinedTax)은 바뀌지 않는다 — 자산별 참고값만 바뀐다.
 */
import { describe, expect, it } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PerPropertyBreakdown, TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer-result.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { buildCalculatedTaxFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { resolveRefCalculatedTax } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { getRefDeterminedTax } from "@/components/calc/results/MultiTransferTaxSummaryCard";

const land = (id: string, acq: string, tp: number, ap: number): TransferTaxItemInput =>
  ({
    ...baseTransferInput({
      isOneHousehold: false, householdHousingCount: 0, propertyType: "land",
      acquisitionDate: new Date(acq), transferDate: new Date("2024-06-01"), transferPrice: tp, acquisitionPrice: ap,
    }),
    propertyId: id, propertyLabel: id,
  }) as TransferTaxItemInput;

const run = () =>
  calculateTransferTaxAggregate(
    {
      taxYear: 2024,
      properties: [land("A", "2022-01-01", 395_000_000, 300_000_000), land("B", "2024-01-01", 400_000_000, 300_000_000)],
      annualBasicDeductionUsed: 0,
    },
    makeMockRates(),
  );
const assetA = () => run().properties.find((p) => p.propertyId === "A")!;

describe("전제 — 자산 A는 과세표준 95,000,000 · 35% · 누진공제 15,440,000", () => {
  it("격자", () => {
    const a = assetA();
    expect([a.taxBaseShare, a.appliedRate, a.progressiveDeduction, a.refCalculatedTaxNote]).toEqual([
      95_000_000, 0.35, 15_440_000, undefined,
    ]);
    expect(Math.floor(95_000_000 * 0.35)).toBe(33_249_999);
  });

  it("🔒 합산 세액은 그대로다(일반 누진 17,810,000 + 단기 48,750,000)", () => {
    const r = run();
    expect([r.calculatedTax, r.determinedTax]).toEqual([66_560_000, 66_560_000]);
    expect(r.groupTaxes.find((g) => g.group === "progressive")?.groupCalculatedTax).toBe(17_810_000);
  });
});

describe("엔진 — refCalculatedTax·refDeterminedTax", () => {
  it("🔑 17,810,000 (= 95,000,000 × 35% − 15,440,000) · 17,809,999가 아니다", () => {
    const a = assetA();
    expect([a.refCalculatedTax, a.refDeterminedTax]).toEqual([17_810_000, 17_810_000]);
  });
});

describe("표시 — 상세명세서 자산별 산식 · 신고서 자산 열", () => {
  it("🔑 명세서 등식이 성립한다", () => {
    expect(buildCalculatedTaxFormula(assetA())).toBe("95,000,000 × 35% - 15,440,000 = 17,810,000");
  });

  it("🔑 신고서 자산 A 열 산출세액·결정세액(참고)", () => {
    const r = run();
    const rows = buildAggregateRows({} as unknown as TransferTaxResult, { properties: r.properties, aggregated: r } as unknown as AggregateMeta, undefined);
    const row = (key: string) => rows.find((x) => x.label.trim().startsWith(key))!.values;
    expect(row("산출세액").A).toBe(17_810_000);
    expect(row("결정세액").A).toBe(17_810_000);
  });
});

describe("fallback — refCalculatedTax·refDeterminedTax가 없는 옛 저장 결과", () => {
  const legacy = (): PerPropertyBreakdown => {
    const { refCalculatedTax: _c, refDeterminedTax: _d, ...rest } = assetA();
    void _c;
    void _d;
    return rest as unknown as PerPropertyBreakdown;
  };

  it("🔑 resolveRefCalculatedTax = 17,810,000", () => {
    expect(resolveRefCalculatedTax(legacy())).toBe(17_810_000);
  });

  it("🔑 getRefDeterminedTax = 17,810,000", () => {
    expect(getRefDeterminedTax(legacy())).toBe(17_810_000);
  });
});
