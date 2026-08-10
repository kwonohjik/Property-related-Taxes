/**
 * DD: 이월과세 증여자 사망 배제 (소득세법 §97조의2 ① 괄호)
 *
 * 계획서 `docs/00-pm/transfer-carryover-donor-death.plan.md` §4 케이스 매트릭스.
 *
 * 🔑 **DD-03·DD-04·DD-06이 양성 대조군이다.** 배제 단언만 있으면
 *    「사망이면 무조건 배제」로 구현해도 전부 통과한다 —
 *    이혼(A2·A4)과 시행일 前 증여(B3)는 **적용**되어야 한다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { CarryoverTaxationInput } from "@/lib/tax-engine/types/transfer-carryover.types";

const MOCK_RATES = makeMockRates();

const TRANSFER_DATE = new Date("2030-05-31");
const DONOR_ACQ_DATE = new Date("2010-01-01");

/** 증여자 취득가 3억 ↔ 증여 당시 평가 7억 — A(적용)가 B(미적용)보다 세액이 크게 만든다. */
function makeInput(carryover: Partial<CarryoverTaxationInput>, giftDate: Date) {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: 700_000_000,
    acquisitionDate: DONOR_ACQ_DATE,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: giftDate,
      donorAcquisitionDate: DONOR_ACQ_DATE,
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 300_000_000,
      giftTaxAmount: 0,
      giftDateValuation: 700_000_000,
      ...carryover,
    },
  });
}

const GIFT_2023 = new Date("2023-06-01"); // 10년 룰 · 양도까지 7년차
const GIFT_2025 = new Date("2025-06-01"); // 직계존비속 게이트 **이후**
const GIFT_2024 = new Date("2024-06-01"); // 직계존비속 게이트 **이전**

// ────────────────────────────────────────────────────────────
// A: 배우자 — 「사망으로 혼인관계가 소멸된 경우는 제외」
// ────────────────────────────────────────────────────────────

describe("DD-A: 배우자 증여자", () => {
  it("DD-01: A3 사별 → relation_invalid로 배제되고 시나리오 B 채택", () => {
    const r = calculateTransferTax(
      makeInput({ donorRelation: "spouse", donorDeceased: true }, GIFT_2023),
      MOCK_RATES,
    );
    expect(r.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(r.carryoverTaxationDetail?.exclusionReason).toBe("relation_invalid");
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("B");
  });

  it("DD-02: A3 사별 → 결정세액이 「미적용」 값으로 확정 (§97의2②3호 MAX를 타지 않는다)", () => {
    const r = calculateTransferTax(
      makeInput({ donorRelation: "spouse", donorDeceased: true }, GIFT_2023),
      MOCK_RATES,
    );
    // 현행(배제 미구현)은 시나리오 A인 169,060,000을 채택해 89,630,000 과대과세된다.
    expect(r.determinedTax).toBe(79_430_000);
  });

  it("DD-03: A2 이혼(사망 아님) → **적용**된다 [양성 대조군]", () => {
    const r = calculateTransferTax(
      makeInput({ donorRelation: "spouse", donorDeceased: false }, GIFT_2023),
      MOCK_RATES,
    );
    expect(r.carryoverTaxationDetail?.isEligible).toBe(true);
    expect(r.carryoverTaxationDetail?.exclusionReason).toBeUndefined();
  });

  it("DD-04: A4 이혼 후 전 배우자 사망 → 소멸 원인이 이혼이므로 **적용** [양성 대조군]", () => {
    // 「사망으로 혼인관계가 소멸」이 아니므로 사용자는 donorDeceased를 체크하지 않는다.
    const r = calculateTransferTax(
      makeInput({ donorRelation: "spouse", donorDeceased: false }, GIFT_2023),
      MOCK_RATES,
    );
    expect(r.determinedTax).toBe(169_060_000);
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("A");
  });
});

// ────────────────────────────────────────────────────────────
// B: 직계존비속 — 「양도 당시 사망한 경우는 제외」 (2025.1.1. 이후 증여분)
// ────────────────────────────────────────────────────────────

describe("DD-B: 직계존비속 증여자 — 시행일 게이트", () => {
  it("DD-05: B2 사망 + 증여 2025.6.1.(게이트 이후) → 배제", () => {
    const r = calculateTransferTax(
      makeInput({ donorRelation: "lineal", donorDeceased: true }, GIFT_2025),
      MOCK_RATES,
    );
    expect(r.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(r.carryoverTaxationDetail?.exclusionReason).toBe("relation_invalid");
  });

  it("DD-06: B3 사망 + 증여 2024.6.1.(게이트 이전) → 종전 규정이라 **적용** [양성 대조군]", () => {
    const r = calculateTransferTax(
      makeInput({ donorRelation: "lineal", donorDeceased: true }, GIFT_2024),
      MOCK_RATES,
    );
    expect(r.carryoverTaxationDetail?.isEligible).toBe(true);
    expect(r.carryoverTaxationDetail?.exclusionReason).toBeUndefined();
    // 「적용됨」의 실질 신호 — 취득가액이 증여자 취득가(3억)로 치환된다
    expect(r.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(300_000_000);
  });

  it("DD-06b: 경계일 — 증여 2025.1.1. 당일은 게이트 **이후**(배제)", () => {
    const r = calculateTransferTax(
      makeInput({ donorRelation: "lineal", donorDeceased: true }, new Date("2025-01-01")),
      MOCK_RATES,
    );
    expect(r.carryoverTaxationDetail?.exclusionReason).toBe("relation_invalid");
  });
});

// ────────────────────────────────────────────────────────────
// 미선택 방어 — 관계를 안 고르면 배제하지 않는다(⑧ validate가 차단)
// ────────────────────────────────────────────────────────────

describe("DD-C: 관계 미선택", () => {
  it("DD-07e: donorRelation 없이 donorDeceased만 true여도 배제하지 않는다", () => {
    const r = calculateTransferTax(
      makeInput({ donorDeceased: true }, GIFT_2023),
      MOCK_RATES,
    );
    expect(r.carryoverTaxationDetail?.exclusionReason).toBeUndefined();
  });

  it("DD-08e: 두 필드가 모두 없는 기존 입력은 종전대로 동작한다 [회귀]", () => {
    const r = calculateTransferTax(makeInput({}, GIFT_2023), MOCK_RATES);
    expect(r.carryoverTaxationDetail?.isEligible).toBe(true);
    expect(r.determinedTax).toBe(169_060_000);
  });
});
