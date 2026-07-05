/**
 * 다건 양도세 확정신고 기납부세액 정산 (소득세법 §111③) — 집계 엔진 anchor
 *
 * 설계: docs/02-design/features/transfer-multi-prepaid-settlement.engine.design.md
 * 확정신고 정산 = 결정세액 − 예정신고 기납부세액 = 추가납부/환급. approach A(엔진 단일진실).
 *
 * S1  기납부 < 결정세액 → settlementAdditionalPayable = (결정+가산) − 기납부
 * S2  기납부 > 결정세액 → settlementRefund = 기납부 − (결정+가산)
 * S3  기납부 = 결정세액 → 추가납부·환급 모두 0
 * S4  회귀 — priorPaidTax 미지정 → P=0, 기존 필드 불변
 * S5  지방소득세 정산 — settlementLocalPayable = 지방결정 − 지방기납부
 * S6  최종 = settlementAdditionalPayable + settlementLocalPayable
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

function landItem(id: string, label: string, overrides?: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  const base = baseTransferInput();
  return {
    ...(base as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: label,
    propertyType: "land",
    transferPrice: 500_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2026-06-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    ...overrides,
  };
}

function twoAssetInput(overrides?: Partial<AggregateTransferInput>): AggregateTransferInput {
  return {
    taxYear: 2026,
    annualBasicDeductionUsed: 0,
    properties: [
      landItem("a", "자산A"),
      landItem("b", "자산B", { transferPrice: 400_000_000, acquisitionPrice: 150_000_000 }),
    ],
    ...overrides,
  };
}

// 당초(기납부 미지정) 집계 — base 값 확보
const base = calculateTransferTaxAggregate(twoAssetInput(), mockRates);
const D = base.determinedTax;
const PEN = base.penaltyTax; // 정상신고 = 0
const LOCAL = base.localIncomeTax;

describe("S1: 기납부 < 결정세액 → 추가납부", () => {
  const P = Math.floor(D / 2);
  const r = calculateTransferTaxAggregate(twoAssetInput({ priorPaidTax: P }), mockRates);
  it("settlementAdditionalPayable = (결정+가산) − 기납부", () => {
    expect(r.settlementAdditionalPayable).toBe(D + PEN - P);
    expect(r.settlementRefund).toBe(0);
    expect(r.priorPaidTax).toBe(P);
  });
});

describe("S2: 기납부 > 결정세액 → 환급", () => {
  const P = D + PEN + 1_000_000;
  const r = calculateTransferTaxAggregate(twoAssetInput({ priorPaidTax: P }), mockRates);
  it("settlementRefund = 기납부 − (결정+가산)", () => {
    expect(r.settlementRefund).toBe(P - (D + PEN));
    expect(r.settlementAdditionalPayable).toBe(0);
  });
});

describe("S3: 기납부 = 결정세액 → 정산 0", () => {
  const r = calculateTransferTaxAggregate(twoAssetInput({ priorPaidTax: D + PEN }), mockRates);
  it("추가납부·환급 모두 0", () => {
    expect(r.settlementAdditionalPayable).toBe(0);
    expect(r.settlementRefund).toBe(0);
  });
});

describe("S4: 회귀 — priorPaidTax 미지정 → P=0, 기존 필드 불변", () => {
  it("신규 필드 P=0 추가, determinedTax·totalTax 불변", () => {
    expect(base.priorPaidTax).toBe(0);
    expect(base.priorPaidLocalTax).toBe(0);
    expect(base.settlementAdditionalPayable).toBe(D + PEN); // P=0
    expect(base.settlementRefund).toBe(0);
    // 기존 필드 불변(회귀): determinedTax·totalTax·calculatedTax는 기납부와 무관
    const again = calculateTransferTaxAggregate(twoAssetInput(), mockRates);
    expect(again.determinedTax).toBe(D);
    expect(again.totalTax).toBe(base.totalTax);
  });
});

describe("S5: 지방소득세 정산", () => {
  const PL = Math.floor(LOCAL / 3);
  const r = calculateTransferTaxAggregate(twoAssetInput({ priorPaidLocalTax: PL }), mockRates);
  it("settlementLocalPayable = 지방결정 − 지방기납부", () => {
    expect(r.settlementLocalPayable).toBe(LOCAL - PL);
    expect(r.priorPaidLocalTax).toBe(PL);
  });
});

describe("S6: 최종 납부할세액 = 국세 + 지방", () => {
  const P = Math.floor(D / 4);
  const PL = Math.floor(LOCAL / 4);
  const r = calculateTransferTaxAggregate(
    twoAssetInput({ priorPaidTax: P, priorPaidLocalTax: PL }),
    mockRates,
  );
  it("settlementTotalDue = additionalPayable + localPayable", () => {
    expect(r.settlementTotalDue).toBe(r.settlementAdditionalPayable + r.settlementLocalPayable);
    expect(r.settlementTotalDue).toBe((D + PEN - P) + (LOCAL - PL));
  });
});
