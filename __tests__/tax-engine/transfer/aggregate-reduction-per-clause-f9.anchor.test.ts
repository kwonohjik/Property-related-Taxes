/**
 * anchor — F-9 · 다건 감면세액을 §104① **호별로** 산정한다 (계획서 `transfer-aggregate-reduction-per-clause.plan.md`).
 *
 * 근거: 재산세과-3820(2008.11.17) · 서면인터넷방문상담5팀-57(2007.01.04) — 「당해 연도에 양도한 자산이
 * 소득세법 제104조 제1항 각호의 세율이 적용되는 경우에는 **각호별로 산출세액과 감면세액을 산정**」.
 *
 * 종전 M-8은 모든 호를 합친 산출세액·과세표준에 §90① 비율을 곱해, 다른 호의 높은 세율분(미등기 70% ·
 * 비사업용 +10%p)이 감면 자산의 감면액으로 번졌다(F9-1: 13,445,744 → 7,487,000).
 *
 * Q-2 — §104⑤에서 「전체 누진」이 채택되면(산출세액이 한 덩어리) **합산을 유지**한다(F9-6·F9-7).
 * 어느 경로가 채택되는지는 §104⑤ 괄호대로 **감면 차감 후** 세액으로 고른다(F9-4·F9-6).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** §77 공익수용 현금보상 — 2024 양도분(사업인정 2013). */
const E77 = {
  type: "public_expropriation",
  cashCompensation: 600_000_000,
  bondCompensation: 0,
  businessApprovalDate: D("2013-01-01"),
};
/** 2026 양도분용 — 취득(2015) 후 2년이 지난 고시일. */
const E77_2026 = { ...E77, businessApprovalDate: D("2018-01-01") };

/** 토지 5억/1.5억 · 2010 → 2024-06-01 */
const card = (id: string, o: Record<string, unknown>, reductions: unknown[] = []) => ({
  ...baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 500_000_000,
    acquisitionPrice: 150_000_000,
    acquisitionDate: D("2010-01-01"),
    transferDate: D("2024-06-01"),
    reductions,
    ...o,
  } as Partial<TransferTaxInput>),
  propertyId: id,
  propertyLabel: id,
});
const y2026 = { acquisitionDate: D("2015-01-01"), transferDate: D("2026-06-01") };

type Breakdown = {
  rawAggregateReduction: number;
  basicDeductionApplied: number;
  aggregateCalculatedTax: number;
  aggregateTaxBase: number;
  clauseBasis?: string;
  clauseRows?: unknown[];
};
type Agg = {
  calculatedTax: number;
  reductionAmount: number;
  totalTax: number;
  comparedTaxApplied: string;
  warnings?: string[];
  reductionBreakdown: Breakdown[];
  properties: { propertyId: string; reductionAggregated: number }[];
};

const agg = (props: object[], taxYear = 2024) =>
  calculateTransferTaxAggregate(
    { taxYear, annualBasicDeductionUsed: 0, properties: props } as never,
    rates,
  ) as unknown as Agg;
const allocated = (r: Agg, id: string) => r.properties.find((p) => p.propertyId === id)?.reductionAggregated;
const OLD_WARNING = /세율군 혼재 시 정확한 안분은 별도 로직이 필요합니다/;

describe("F-9 다건 감면 호별 산정", () => {
  it("F9-1 미등기 토지(70%) + §77 등기 토지 — 누진 호의 세액·과세표준만으로 7,487,000", () => {
    const r = agg([card("L", { isUnregistered: true }), card("B", {}, [E77])]);
    expect(r.comparedTaxApplied).toBe("groups");
    expect(r.reductionAmount).toBe(7_487_000);
    const b = r.reductionBreakdown[0];
    // 74,870,000 × (252,000,000 − 2,500,000) × 10% / 249,500,000
    expect(b.aggregateCalculatedTax).toBe(74_870_000);
    expect(b.aggregateTaxBase).toBe(249_500_000);
    // 미등기 소득은 기본공제를 받지 못한다 — 기본공제 2,500,000은 B의 감면소득에 닿는다(종전 C = 0).
    expect(b.basicDeductionApplied).toBe(2_500_000);
    expect(b.rawAggregateReduction).toBe(7_487_000);
    expect(b.clauseBasis).toBe("per_clause");
    expect(allocated(r, "B")).toBe(7_487_000);
    // 결정세액 = 319,869,999 − 7,487,000
    expect(r.calculatedTax - r.reductionAmount).toBe(312_382_999);
    expect((r.warnings ?? []).some((w) => OLD_WARNING.test(w))).toBe(false);
  });

  it("F9-2 비사업용 토지(+10%p) + §77 사업용 토지 — 12,570,000 (종전 14,594,323)", () => {
    const r = agg([card("L", { ...y2026, isNonBusinessLand: true }), card("B", y2026, [E77_2026])], 2026);
    expect(r.comparedTaxApplied).toBe("groups");
    // 83,800,000 × (273,000,000 − 0) × 15% / 273,000,000 — 기본공제는 비감면 L이 먼저 흡수(§103②)
    expect(r.reductionAmount).toBe(12_570_000);
    expect(r.reductionBreakdown[0].aggregateCalculatedTax).toBe(83_800_000);
    expect(r.reductionBreakdown[0].aggregateTaxBase).toBe(273_000_000);
  });

  it("F9-3 (동등성) 모두 누진 호 — 종전 값 그대로 17,469,000 · 배분 8,734,500씩", () => {
    const r = agg([card("L", {}, [E77]), card("B", {}, [E77])]);
    expect(r.reductionAmount).toBe(17_469_000);
    expect(allocated(r, "L")).toBe(8_734_500);
    expect(allocated(r, "B")).toBe(8_734_500);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined();
  });

  /**
   * §104⑤ 괄호 — 「감면세액을 **차감한 세액이 더 큰 경우의** 산출세액」.
   * 호별 감면은 두 경로의 감면 비율을 다르게 만들어 감면 전 MAX와 답이 갈릴 수 있다(D-6 전제 붕괴).
   */
  it("F9-4 감면 전엔 전체 누진이 크지만 감면 후엔 세율군별이 크다 → 세율군별 214,820,000 · 감면 7,582,000", () => {
    const r = agg([card("L", { acquisitionDate: D("2023-01-01") }), card("B", {}, [E77])]);
    // 감면 전: 세율군별 214,820,000 < 전체 누진 215,850,000
    // 감면 후: 214,820,000 − 7,582,000 = 207,238,000 > 215,850,000 − 9,073,261 = 206,776,739
    expect(r.comparedTaxApplied).toBe("groups");
    expect(r.calculatedTax).toBe(214_820_000);
    expect(r.reductionAmount).toBe(7_582_000);
    expect(r.reductionBreakdown[0].clauseBasis).toBe("per_clause");
  });

  it("F9-6 감면 전엔 세율군별이 크지만 감면 후엔 전체 누진이 크다 → 전체 누진 · 합산 감면(Q-2)", () => {
    const bond5 = { ...E77_2026, cashCompensation: 0, bondCompensation: 600_000_000, bondHoldingYears: 5 };
    const r = agg(
      [card("L", { ...y2026, isNonBusinessLand: true }, [bond5]), card("B", { ...y2026, transferPrice: 300_000_000 })],
      2026,
    );
    // 감면 전: 세율군별 135,735,000 > 전체 누진 129,060,000
    expect(r.comparedTaxApplied).toBe("general");
    expect(r.calculatedTax).toBe(129_060_000);
    expect(r.reductionAmount).toBe(40_916_183);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined();
    expect(r.reductionBreakdown[0].aggregateCalculatedTax).toBe(129_060_000);
  });

  it("F9-7 (Q-2) 감면 후에도 전체 누진이 크면 합산 감면을 유지한다 — 15,004,006", () => {
    const r = agg(
      [
        card("L", { ...y2026, acquisitionDate: D("2025-01-01"), acquisitionPrice: 100_000_000 }),
        card("B", y2026, [E77_2026]),
      ],
      2026,
    );
    expect(r.comparedTaxApplied).toBe("general");
    expect(r.calculatedTax).toBe(245_670_000);
    expect(r.reductionAmount).toBe(15_004_006);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined();
  });

  it("F9-5 같은 감면 유형이 두 호에 걸치면 호마다 계산해 합한다 — 배분도 호별 몫대로", () => {
    const r = agg(
      [card("L", { ...y2026, isNonBusinessLand: true }, [E77_2026]), card("B", y2026, [E77_2026])],
      2026,
    );
    // L: 109,900,000 × (273,000,000 − 2,500,000) × 15% / 270,500,000 = 16,485,000
    // B:  83,800,000 × 273,000,000 × 15% / 273,000,000                 = 12,570,000
    expect(r.reductionAmount).toBe(29_055_000);
    expect(allocated(r, "L")).toBe(16_485_000);
    expect(allocated(r, "B")).toBe(12_570_000);
    expect(r.reductionBreakdown[0].clauseRows).toHaveLength(2);
  });

  it("F9-8 감면 자산의 파트가 두 호에 걸치면(부분 비사업용) 합산 유지 + 안내 — 대조: 파트 없는 자산은 호별", () => {
    const partialNbl = {
      ...y2026,
      isNonBusinessLand: true,
      nonBusinessLandDetails: {
        landType: "housing_site",
        landArea: 600,
        zoneType: "general_residential",
        acquisitionDate: D("2015-01-01"),
        transferDate: D("2026-06-01"),
        housingFootprint: 100,
        isMetropolitanArea: true,
        businessUsePeriods: [],
        gracePeriods: [],
      },
    };
    const r = agg([card("L", partialNbl, [E77_2026]), card("B", { ...y2026, isUnregistered: true })], 2026);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined();
    expect((r.warnings ?? []).some((w) => /서로 다른 세율의 호에 걸쳐/.test(w))).toBe(true);

    const twin = agg([card("L", { ...y2026, isNonBusinessLand: true }, [E77_2026]), card("B", { ...y2026, isUnregistered: true })], 2026);
    expect(twin.reductionBreakdown[0].clauseBasis).toBe("per_clause");
    expect((twin.warnings ?? []).some((w) => /서로 다른 세율의 호에 걸쳐/.test(w))).toBe(false);
  });
});
