/**
 * 양도소득세 가산세 엔진 단위 테스트
 *
 * 신고불성실가산세: 국세기본법 §47의2·§47의3
 * 지연납부가산세:   국세기본법 §47의4
 * 납부세액 기준:    부칙 §12848호 §10② (2015.7.1 이후)
 */

import { describe, it, expect } from "vitest";
import {
  calculateFilingPenalty,
  calculateDelayedPaymentPenalty,
  calculateTransferTaxPenalty,
  type FilingPenaltyInput,
  type DelayedPaymentInput,
} from "@/lib/tax-engine/transfer-tax-penalty";

// ============================================================
// 신고불성실가산세 테스트
// ============================================================

describe("calculateFilingPenalty — 신고불성실가산세", () => {
  const base: FilingPenaltyInput = {
    determinedTax:      10_000_000,
    reductionAmount:     0,
    priorPaidTax:        0,
    originalFiledTax:    0,
    excessRefundAmount:  0,
    interestSurcharge:   0,
    filingType:         "none",
    penaltyReason:      "normal",
  };

  it("T1 무신고 일반 — 납부세액 × 20%", () => {
    const result = calculateFilingPenalty({ ...base, filingType: "none", penaltyReason: "normal" });
    expect(result.penaltyBase).toBe(10_000_000);
    expect(result.penaltyRate).toBe(0.20);
    expect(result.filingPenalty).toBe(2_000_000);
  });

  it("T2 무신고 부정행위 — 납부세액 × 40%", () => {
    const result = calculateFilingPenalty({ ...base, filingType: "none", penaltyReason: "fraudulent" });
    expect(result.penaltyRate).toBe(0.40);
    expect(result.filingPenalty).toBe(4_000_000);
  });

  it("T3 무신고 역외거래 부정행위 — 납부세액 × 60%", () => {
    const result = calculateFilingPenalty({ ...base, filingType: "none", penaltyReason: "offshore_fraud" });
    expect(result.penaltyRate).toBe(0.60);
    expect(result.filingPenalty).toBe(6_000_000);
  });

  it("T4 과소신고 일반 — 납부세액 × 10%", () => {
    const result = calculateFilingPenalty({
      ...base,
      filingType: "under",
      penaltyReason: "normal",
      originalFiledTax: 3_000_000,
    });
    expect(result.penaltyBase).toBe(7_000_000);
    expect(result.penaltyRate).toBe(0.10);
    expect(result.filingPenalty).toBe(700_000);
  });

  it("T5 과소신고 부정행위 — 납부세액 × 40%", () => {
    const result = calculateFilingPenalty({ ...base, filingType: "under", penaltyReason: "fraudulent" });
    expect(result.penaltyRate).toBe(0.40);
    expect(result.filingPenalty).toBe(4_000_000);
  });

  it("T6 초과환급신고 일반 — (과소+환급) × 10%", () => {
    const result = calculateFilingPenalty({
      ...base,
      filingType: "excess_refund",
      penaltyReason: "normal",
      originalFiledTax: 2_000_000,
      excessRefundAmount: 1_000_000,
    });
    // penaltyBase = 10_000_000 - 2_000_000 + 1_000_000 = 9_000_000
    expect(result.penaltyBase).toBe(9_000_000);
    expect(result.penaltyRate).toBe(0.10);
    expect(result.filingPenalty).toBe(900_000);
  });

  it("T7 정상신고 — 가산세 0", () => {
    const result = calculateFilingPenalty({ ...base, filingType: "correct" });
    expect(result.filingPenalty).toBe(0);
  });

  it("T8 납부세액 0 이하 — 가산세 0", () => {
    const result = calculateFilingPenalty({
      ...base,
      filingType: "none",
      priorPaidTax: 10_000_000, // 기납부가 결정세액과 동일
    });
    expect(result.penaltyBase).toBe(0);
    expect(result.filingPenalty).toBe(0);
  });

  it("T9 이자상당액 가산액 제외", () => {
    const result = calculateFilingPenalty({
      ...base,
      filingType: "none",
      penaltyReason: "normal",
      interestSurcharge: 1_000_000,
    });
    // penaltyBase = 10_000_000 - 1_000_000 = 9_000_000
    expect(result.penaltyBase).toBe(9_000_000);
    expect(result.filingPenalty).toBe(1_800_000);
  });

  it("T10 세액감면 차감 후 납부세액 기준", () => {
    const result = calculateFilingPenalty({
      ...base,
      filingType: "none",
      penaltyReason: "normal",
      reductionAmount: 2_000_000,
    });
    // penaltyBase = 10_000_000 - 2_000_000 = 8_000_000
    expect(result.penaltyBase).toBe(8_000_000);
    expect(result.filingPenalty).toBe(1_600_000);
  });

  it("T11 steps에 법령 근거 포함", () => {
    const result = calculateFilingPenalty({ ...base, filingType: "none" });
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.legalBasis).toContain("국세기본법");
  });
});

// ============================================================
// 지연납부가산세 테스트
// ============================================================

describe("calculateDelayedPaymentPenalty — 지연납부가산세", () => {
  const deadline = new Date("2024-09-30");
  const unpaidTax = 10_000_000;

  it("D1 납부기한 전 납부 — 가산세 0", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2024-09-29"),
    });
    expect(result.elapsedDays).toBe(0);
    expect(result.delayedPaymentPenalty).toBe(0);
  });

  it("D2 납부기한 당일 납부 — 가산세 0", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2024-09-30"),
    });
    expect(result.elapsedDays).toBe(0);
    expect(result.delayedPaymentPenalty).toBe(0);
  });

  it("D3 30일 경과 (2024년 — 현행 0.022%)", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2024-10-30"),
    });
    expect(result.elapsedDays).toBe(30);
    expect(result.dailyRate).toBe(0.00022);
    // 10_000_000 × 30 × 0.00022 = 66,000
    expect(result.delayedPaymentPenalty).toBe(66_000);
  });

  it("D4 365일 경과", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2025-09-30"),
    });
    expect(result.elapsedDays).toBe(365);
    // 10_000_000 × 365 × 0.00022 = 803,000
    expect(result.delayedPaymentPenalty).toBe(803_000);
  });

  it("D5 2021년 납부 — 이전 이자율 0.025% 적용", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2021-05-31"),
      actualPaymentDate: new Date("2021-07-01"),
    });
    expect(result.dailyRate).toBe(0.00025);
    // 31일 경과: 10_000_000 × 31 × 0.00025 = 77,500
    expect(result.elapsedDays).toBe(31);
    expect(result.delayedPaymentPenalty).toBe(77_500);
  });

  it("D6 미납세액 0 — 가산세 0", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax: 0,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2024-11-30"),
    });
    expect(result.delayedPaymentPenalty).toBe(0);
  });

  it("D7 steps에 경과일수·이자율 포함", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2024-10-30"),
    });
    expect(result.steps.some(s => s.label === "경과일수")).toBe(true);
    expect(result.steps.some(s => s.label === "지연납부가산세")).toBe(true);
  });
});

// ============================================================
// 통합 가산세 테스트
// ============================================================

describe("calculateTransferTaxPenalty — 통합", () => {
  it("U1 신고불성실 + 지연납부 합산", () => {
    const result = calculateTransferTaxPenalty({
      filing: {
        determinedTax:      10_000_000,
        reductionAmount:     0,
        priorPaidTax:        0,
        originalFiledTax:    0,
        excessRefundAmount:  0,
        interestSurcharge:   0,
        filingType:         "none",
        penaltyReason:      "normal",
      },
      delayedPayment: {
        unpaidTax: 10_000_000,
        paymentDeadline: new Date("2024-09-30"),
        actualPaymentDate: new Date("2024-10-30"),
      },
    });
    // 신고불성실: 2,000,000 / 지연납부: 66,000
    expect(result.filingPenalty?.filingPenalty).toBe(2_000_000);
    expect(result.delayedPaymentPenalty?.delayedPaymentPenalty).toBe(66_000);
    expect(result.totalPenalty).toBe(2_066_000);
  });

  it("U2 신고불성실만 제공", () => {
    const result = calculateTransferTaxPenalty({
      filing: {
        determinedTax:      5_000_000,
        reductionAmount:     0,
        priorPaidTax:        0,
        originalFiledTax:    0,
        excessRefundAmount:  0,
        interestSurcharge:   0,
        filingType:         "under",
        penaltyReason:      "normal",
      },
    });
    expect(result.filingPenalty?.filingPenalty).toBe(500_000);
    expect(result.delayedPaymentPenalty).toBeNull();
    expect(result.totalPenalty).toBe(500_000);
  });

  it("U3 지연납부만 제공", () => {
    const result = calculateTransferTaxPenalty({
      delayedPayment: {
        unpaidTax: 20_000_000,
        paymentDeadline: new Date("2024-09-30"),
        actualPaymentDate: new Date("2024-10-30"),
      },
    });
    expect(result.filingPenalty).toBeNull();
    expect(result.delayedPaymentPenalty?.delayedPaymentPenalty).toBe(132_000);
    expect(result.totalPenalty).toBe(132_000);
  });

  it("U4 입력 없으면 totalPenalty 0", () => {
    const result = calculateTransferTaxPenalty({});
    expect(result.filingPenalty).toBeNull();
    expect(result.delayedPaymentPenalty).toBeNull();
    expect(result.totalPenalty).toBe(0);
  });
});
