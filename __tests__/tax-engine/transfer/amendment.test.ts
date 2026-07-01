/**
 * 양도소득세 수정신고(경정) 앵커 테스트
 *
 * computeAmendment — 추가납부세액 + §48② 자동감면(신고불성실만) + 납부지연.
 * 국세기본법 §45·§47의3·§47의4·§48②1호 / 소득세법 §110①.
 * 설계: docs/02-design/features/transfer-tax-amendment.engine.design.md
 */

import { describe, it, expect } from "vitest";
import { computeAmendment } from "@/lib/tax-engine/transfer-tax-amendment";
import type { AmendmentInput } from "@/lib/tax-engine/types/transfer-amendment.types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const baseAmend = (o?: Partial<AmendmentInput>): AmendmentInput => ({
  originalDeterminedTax: 30_000_000,
  applyUnderReportingPenalty: false,
  underReportingReason: "normal",
  underReductionMode: "exempt",
  applyLatePaymentPenalty: false,
  ...o,
});

describe("computeAmendment — 수정신고 추가납부세액", () => {
  it("A1 추가납부만(가산세 OFF) — delta 20M", () => {
    const r = computeAmendment(baseAmend(), 50_000_000);
    expect(r.additionalTax).toBe(20_000_000);
    expect(r.underReportingPenalty).toBe(0);
    expect(r.latePaymentPenalty).toBe(0);
    expect(r.totalPayable).toBe(20_000_000);
    expect(r.additionalLocalIncomeTax).toBe(2_000_000);
  });

  it("A2 + 신고불성실 ON(normal, exempt) — 20M×10%", () => {
    const r = computeAmendment(
      baseAmend({ applyUnderReportingPenalty: true }),
      50_000_000,
    );
    expect(r.underReportingReductionRate).toBe(0);
    expect(r.underReportingPenalty).toBe(2_000_000);
    expect(r.totalPayable).toBe(22_000_000);
  });

  it("A3 + 납부지연 ON — 20M × 경과일 × 0.022%", () => {
    const r = computeAmendment(
      baseAmend({
        applyLatePaymentPenalty: true,
        statutoryFilingDeadline: new Date("2023-05-31"),
        amendedPaymentDate: new Date("2026-06-30"),
      }),
      50_000_000,
    );
    // 2023-05-31 → 2026-06-30 = 1126일. 20,000,000 × 1126 × 0.00022 = 4,954,400
    expect(r.latePaymentPenalty).toBe(4_954_400);
    expect(r.totalPayable).toBe(24_954_400);
  });

  it("A4 수정<당초 (경정청구 영역) — delta 0", () => {
    const r = computeAmendment(
      baseAmend({ applyUnderReportingPenalty: true, applyLatePaymentPenalty: true }),
      20_000_000,
    );
    expect(r.additionalTax).toBe(0);
    expect(r.underReportingPenalty).toBe(0);
    expect(r.latePaymentPenalty).toBe(0);
    expect(r.totalPayable).toBe(0);
  });

  it("A6 §48② 자동감면 3개월 초과 6개월 이내 → 50%", () => {
    const r = computeAmendment(
      baseAmend({
        applyUnderReportingPenalty: true,
        underReductionMode: "auto_48_2",
        statutoryFilingDeadline: new Date("2024-05-31"),
        amendedFilingDate: new Date("2024-09-15"),
      }),
      50_000_000,
    );
    expect(r.underReportingReductionRate).toBe(0.5);
    expect(r.underReportingPenalty).toBe(1_000_000); // 2M × (1−0.5)
    expect(r.totalPayable).toBe(21_000_000);
  });

  it("A6-b 경계 — 기한+3개월 당일=75%, +1일=50%", () => {
    const at3 = computeAmendment(
      baseAmend({
        applyUnderReportingPenalty: true, underReductionMode: "auto_48_2",
        statutoryFilingDeadline: new Date("2024-05-31"),
        amendedFilingDate: new Date("2024-08-31"), // 정확히 +3개월
      }),
      50_000_000,
    );
    expect(at3.underReportingReductionRate).toBe(0.75);
    expect(at3.underReportingPenalty).toBe(500_000); // 2M × 0.25

    const over3 = computeAmendment(
      baseAmend({
        applyUnderReportingPenalty: true, underReductionMode: "auto_48_2",
        statutoryFilingDeadline: new Date("2024-05-31"),
        amendedFilingDate: new Date("2024-09-01"), // +3개월 1일
      }),
      50_000_000,
    );
    expect(over3.underReportingReductionRate).toBe(0.5);
  });

  it("A7 §48② 납부지연 미적용 (과다감면 방지 회귀)", () => {
    const r = computeAmendment(
      baseAmend({
        applyUnderReportingPenalty: true, underReductionMode: "auto_48_2",
        statutoryFilingDeadline: new Date("2023-05-31"),
        amendedFilingDate: new Date("2023-09-15"), // 50% 감면
        applyLatePaymentPenalty: true,
        amendedPaymentDate: new Date("2026-06-30"),
      }),
      50_000_000,
    );
    // 신고불성실은 감면(50%)되지만 납부지연은 A3와 동일(감면 미적용)
    expect(r.latePaymentPenalty).toBe(4_954_400);
  });

  it("A8 경정 예고 후 → 감면율 0", () => {
    const r = computeAmendment(
      baseAmend({
        applyUnderReportingPenalty: true, underReductionMode: "auto_48_2",
        statutoryFilingDeadline: new Date("2024-05-31"),
        amendedFilingDate: new Date("2024-06-10"), // 1개월 이내지만
        priorAssessmentNotified: true,
      }),
      50_000_000,
    );
    expect(r.underReportingReductionRate).toBe(0);
    expect(r.underReportingPenalty).toBe(2_000_000);
  });
});

describe("A5 통합 — calculateTransferTax amendment 파이프라인", () => {
  const rates = makeMockRates();
  // 과세 발생 시나리오 (다주택 → 비과세 배제)
  const taxable = baseTransferInput({
    isOneHousehold: false,
    householdHousingCount: 2,
  });

  it("A5 amendmentDetail.additionalTax = 결정세액 − 당초세액", () => {
    const baseline = calculateTransferTax(taxable, rates);
    const D = baseline.determinedTax;
    expect(D).toBeGreaterThan(0);

    const amended = calculateTransferTax(
      {
        ...taxable,
        amendment: {
          originalDeterminedTax: D - 10_000_000,
          applyUnderReportingPenalty: false,
          underReportingReason: "normal",
          underReductionMode: "exempt",
          applyLatePaymentPenalty: false,
        },
      },
      rates,
    );
    expect(amended.amendmentDetail).toBeDefined();
    expect(amended.amendmentDetail!.additionalTax).toBe(10_000_000);
    expect(amended.amendmentDetail!.totalPayable).toBe(10_000_000);
  });
});
