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
