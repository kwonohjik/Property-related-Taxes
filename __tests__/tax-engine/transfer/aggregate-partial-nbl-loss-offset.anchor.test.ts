/**
 * anchor: 한 필지 중 일부만 비사업용인 토지(부분 비사업용)와 양도차손의 다건 통산.
 *
 * 계획서: docs/02-design/features/transfer-partial-nbl-loss-offset.investigation.plan.md
 *
 * 대조 기준은 사업용 부분과 비사업용 부분을 별개 자산으로 나눠 신고한 값이다. 사업용·비사업용 부분을 각각 「하나의 자산」으로 본
 * 대법원 2012두15371과 세율별로 정하는 「소득세법 시행령」 §167의2①을 따랐다. 차손 통산을 정면으로 다룬 해석례는 없다(계획서 §3).
 *
 * 모의 세율표: 누진 8구간 · 비사업용 토지 +10%p.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const base = (o: Record<string, unknown>) =>
  baseTransferInput({
    propertyType: "land", transferDate: D("2026-06-01"), acquisitionDate: D("2015-01-01"),
    isOneHousehold: false, householdHousingCount: 0, expenses: 0, annualBasicDeductionUsed: 0, ...o,
  } as Partial<TransferTaxInput>);
const agg = (xs: [string, TransferTaxInput][]) =>
  calculateTransferTaxAggregate(
    { taxYear: 2026, annualBasicDeductionUsed: 0, properties: xs.map(([id, x]) => ({ ...x, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput) },
    rates,
  );

/** 비사업용 토지 짝 12억 / 3억 — 소득 738,000,000(장특 18%). */
const nblPair = () => base({ transferPrice: 1_200_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2017-02-20"), isNonBusinessLand: true });

describe("차손인 부분 비사업용 토지 — 면적 비율이 짝 자산 세액에 묻지 않는다", () => {
  /** 2억 / 3억 → 차손 1억. */
  const lossPart = (ratio: number) => base({ transferPrice: 200_000_000, acquisitionPrice: 300_000_000, isNonBusinessLand: true, nonBusinessLandAreaRatio: ratio });

  it.each([0.2, 0.5, 0.8])("비율 %d — 입력 순서와 무관하게 323,972,000", (ratio) => {
    // 통산 후 738,000,000 − 100,000,000 − 기본공제 2,500,000 = 635,500,000
    // 8호: 0.42 × 635,500,000 − 35,940,000 + 10%p 63,550,000 = 294,520,000 · 지방소득세 29,452,000
    expect(agg([["A", lossPart(ratio)], ["B", nblPair()]]).totalTax).toBe(323_972_000);
    expect(agg([["B", nblPair()], ["A", lossPart(ratio)]]).totalTax).toBe(323_972_000);
  });
});

/** 기본공제를 이미 쓴 신고 — 기본공제 위치의 영향을 뺀다. */
const aggUsed = (xs: [string, TransferTaxInput][]) =>
  calculateTransferTaxAggregate(
    { taxYear: 2026, annualBasicDeductionUsed: 2_500_000, properties: xs.map(([id, x]) => ({ ...x, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput) },
    rates,
  );
/** 부분 비사업용 50% · 20억 / 6억 — 소득 1,092,000,000(장특 22%), 파트 각 546,000,000. */
const part50 = () => base({ transferPrice: 2_000_000_000, acquisitionPrice: 600_000_000, isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5 });
const sep50 = (): [string, TransferTaxInput][] => [
  ["A1", base({ transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000 })],
  ["A2", base({ transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, isNonBusinessLand: true })],
];
const landLoss3 = () => base({ transferPrice: 200_000_000, acquisitionPrice: 500_000_000 });
const nblLoss3 = () => base({ transferPrice: 200_000_000, acquisitionPrice: 500_000_000, isNonBusinessLand: true });

describe("부분 비사업용 토지가 받는 차손 — 같은 세율 파트에서 먼저 공제(영 §167의2①1호)", () => {
  it("일반 토지 차손 3억 → 1호 파트에서 공제: 총세액 353,672,000 = 분리 신고", () => {
    // 1호 546,000,000 − 300,000,000 = 246,000,000 → 0.38 × 246,000,000 − 19,940,000 = 73,540,000
    // 8호 546,000,000 → 0.42 × 546,000,000 − 35,940,000 + 54,600,000 = 247,980,000
    // 321,520,000 + 지방소득세 32,152,000 = 353,672,000 (종전: 자산 전체에서 공제 후 면적 비율)
    const r = aggUsed([["A", part50()], ["Z", landLoss3()]]);
    expect(r.totalTax).toBe(353_672_000);
    expect(r.lossOffsetTable).toEqual([expect.objectContaining({ fromPropertyId: "Z", toPropertyId: "A", amount: 300_000_000, scope: "same_group" })]);
    expect(aggUsed([["Z", landLoss3()], ["A", part50()]]).totalTax).toBe(353_672_000);
    expect(aggUsed([...sep50(), ["Z", landLoss3()]]).totalTax).toBe(353_672_000);
  });

  it("비사업용 토지 차손 3억 → 8호 파트에서 공제: 총세액 = 분리 신고", () => {
    // 8호 246,000,000 → 0.38 × 246,000,000 − 19,940,000 + 24,600,000 = 98,140,000
    // 1호 546,000,000 → 0.42 × 546,000,000 − 35,940,000 = 193,380,000
    // 합계 291,520,000. 전체 누진 0.42 × 792,000,000 − 35,940,000 = 296,700,000이 더 커 1호 비교과세를 택한다.
    const r = aggUsed([["A", part50()], ["Z", nblLoss3()]]);
    expect(r.calculatedTax).toBe(296_700_000);
    expect(r.totalTax).toBe(aggUsed([...sep50(), ["Z", nblLoss3()]]).totalTax);
  });

  it("차손이 한 파트를 다 지워도 파트로 남는다 — 일반 차손 6억: 1호 파트 0, 나머지는 8호로 안분", () => {
    const loss6 = () => base({ transferPrice: 200_000_000, acquisitionPrice: 800_000_000 });
    const r = aggUsed([["A", part50()], ["Z", loss6()]]);
    expect(r.totalTax).toBe(aggUsed([...sep50(), ["Z", loss6()]]).totalTax);
  });

  it("부분 비사업용 자산 자체가 차손 — 차손도 파트별로 같은 세율 자산에 먼저 간다", () => {
    const lossPart = () => base({ transferPrice: 200_000_000, acquisitionPrice: 300_000_000, isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5 });
    const sepLoss = (): [string, TransferTaxInput][] => [
      ["A1", base({ transferPrice: 100_000_000, acquisitionPrice: 150_000_000 })],
      ["A2", base({ transferPrice: 100_000_000, acquisitionPrice: 150_000_000, isNonBusinessLand: true })],
    ];
    const gain = () => base({ transferPrice: 800_000_000, acquisitionPrice: 300_000_000 });
    const r = aggUsed([["A", lossPart()], ["Z", gain()]]);
    expect(r.lossOffsetTable).toEqual([
      expect.objectContaining({ fromPart: "land", amount: 50_000_000, scope: "same_group" }),
      expect.objectContaining({ fromPart: "non_business_land", amount: 50_000_000, scope: "other_group" }),
    ]);
    expect(r.totalTax).toBe(aggUsed([...sepLoss(), ["Z", gain()]]).totalTax);
  });
});
