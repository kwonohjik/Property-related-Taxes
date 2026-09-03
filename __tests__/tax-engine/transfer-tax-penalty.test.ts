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

  it("T10 감면액은 가산세 기준금액에 영향 없음 (2026-07-29 정정)", () => {
    // ⚠️ 기대값 뒤집음. 종전 T10은 `penaltyBase = 10,000,000 − 감면 2,000,000 = 8,000,000`을
    //   고정했으나 **법령 근거가 없었다**(주석에 조문 인용 없이 산식만 적혀 있었다).
    //
    // 국세기본법 §47의2①·§47의3① 기준은 "무신고납부세액"·"과소신고한 납부세액"이고,
    // 조문이 기준금액에서 **제외하라고 명시한 것은 가산세와 이자 상당 가산액뿐**이다.
    // 납부세액은 감면·세액공제를 반영한 뒤의 금액이므로 **감면은 이미 1회 반영**돼 있다.
    // `FilingPenaltyInput.determinedTax` 주석도 "세액공제·감면 적용 후"라고 명시하고 있었다
    // — 즉 종전 구현은 **계약 주석과 어긋난 이중차감**이었다(#591 감사 백로그 R7).
    const result = calculateFilingPenalty({
      ...base,
      filingType: "none",
      penaltyReason: "normal",
      reductionAmount: 2_000_000, // 정보값 — 기준금액 불변
    });
    expect(result.penaltyBase).toBe(10_000_000);
    expect(result.filingPenalty).toBe(2_000_000);
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

  /**
   * 🔴 G-03 (2026-09-03): 산정기간은 「법정납부기한의 **다음 날**부터 납부일의 **전날**까지」다
   * (국세기본법 §47의4①1호). 종전 기댓값은 종기를 납부일 당일로 잡아 전 건이 하루 과다했다.
   * 아래 기댓값은 전부 `(납부일 − 기한) − 1`일로 정정한 것이다.
   */
  it("D3 30일 뒤 납부 (2024년 — 현행 0.022%) — 산정일수 29일", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2024-10-30"),
    });
    // 2024-10-01 ~ 2024-10-29 = 29일 (납부일 10-30의 전날까지)
    expect(result.elapsedDays).toBe(29);
    expect(result.dailyRate).toBe(0.00022);
    // 10_000_000 × 29 × 22/100,000 = 63,800
    expect(result.delayedPaymentPenalty).toBe(63_800);
  });

  it("D4 365일 뒤 납부 — 산정일수 364일", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2025-09-30"),
    });
    expect(result.elapsedDays).toBe(364);
    // 10_000_000 × 364 × 22/100,000 = 800,800
    expect(result.delayedPaymentPenalty).toBe(800_800);
  });

  it("D5 2021년 납부 — 이전 이자율 0.025% 적용", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2021-05-31"),
      actualPaymentDate: new Date("2021-07-01"),
    });
    expect(result.dailyRate).toBe(0.00025);
    // 2021-06-01 ~ 2021-06-30 = 30일: 10_000_000 × 30 × 25/100,000 = 75,000
    expect(result.elapsedDays).toBe(30);
    expect(result.delayedPaymentPenalty).toBe(75_000);
  });

  /** 🔴 G-03 경계 — 1일 지연은 법정 산정기간이 0일이라 가산세가 없다. */
  it("D3b 1일 뒤 납부 — 산정기간 0일이라 가산세 0 (§47의4①1호)", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2024-10-01"),
    });
    expect(result.elapsedDays).toBe(0);
    expect(result.delayedPaymentPenalty).toBe(0);
  });

  /** 🔴 G-03 경계 — 2일 지연이 가산세가 붙는 최소 격자(산정기간 1일). */
  it("D3c 2일 뒤 납부 — 산정일수 1일", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: deadline,
      actualPaymentDate: new Date("2024-10-02"),
    });
    expect(result.elapsedDays).toBe(1);
    // 10_000_000 × 1 × 22/100,000 = 2,200
    expect(result.delayedPaymentPenalty).toBe(2_200);
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
    // G-03: 라벨을 「경과일수」 → 「산정일수」로 바꿨다(종기가 납부일 전날이라 "경과"와 다르다).
    expect(result.steps.some(s => s.label === "산정일수")).toBe(true);
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
    // 신고불성실: 2,000,000 / 지연납부: 29일(G-03 — 납부일 전날까지) × 0.022% = 63,800
    expect(result.filingPenalty?.filingPenalty).toBe(2_000_000);
    expect(result.delayedPaymentPenalty?.delayedPaymentPenalty).toBe(63_800);
    expect(result.totalPenalty).toBe(2_063_800);
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
    // G-03: 29일 × 20,000,000 × 22/100,000 = 127,600
    expect(result.filingPenalty).toBeNull();
    expect(result.delayedPaymentPenalty?.delayedPaymentPenalty).toBe(127_600);
    expect(result.totalPenalty).toBe(127_600);
  });

  it("U4 입력 없으면 totalPenalty 0", () => {
    const result = calculateTransferTaxPenalty({});
    expect(result.filingPenalty).toBeNull();
    expect(result.delayedPaymentPenalty).toBeNull();
    expect(result.totalPenalty).toBe(0);
  });
});
