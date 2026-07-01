/**
 * 양도소득세 경정청구(세액 감소·환급) 앵커 테스트
 *
 * computeAmendment(correctionKind:"refund_claim") — 환급세액 + 청구기한(§45의2).
 * 국세기본법 §45의2(①일반 5년 / ②후발적 3개월)·§52 환급가산금(안내).
 * 설계: docs/02-design/features/transfer-tax-correction-claim.engine.design.md
 */

import { describe, it, expect } from "vitest";
import { computeAmendment } from "@/lib/tax-engine/transfer-tax-amendment";
import type { AmendmentInput } from "@/lib/tax-engine/types/transfer-amendment.types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const baseRefund = (o?: Partial<AmendmentInput>): AmendmentInput => ({
  originalDeterminedTax: 50_000_000,
  correctionKind: "refund_claim",
  claimReasonType: "ordinary",
  applyUnderReportingPenalty: false,
  underReportingReason: "normal",
  underReductionMode: "exempt",
  applyLatePaymentPenalty: false,
  ...o,
});

describe("computeRefundClaim — 경정청구 환급세액", () => {
  it("R1 환급만(정상 감액) — 당초50M/경정30M → 환급20M·지방2M", () => {
    const r = computeAmendment(baseRefund(), 30_000_000);
    expect(r.correctionKind).toBe("refund_claim");
    expect(r.refundTax).toBe(20_000_000);
    expect(r.refundLocalIncomeTax).toBe(2_000_000);
    // amend 필드는 0 (거울상)
    expect(r.additionalTax).toBe(0);
    expect(r.totalPayable).toBe(0);
  });

  it("R2 경정 ≥ 당초 (역방향 가드) — 당초30M/경정50M → 환급 0", () => {
    const r = computeAmendment(baseRefund({ originalDeterminedTax: 30_000_000 }), 50_000_000);
    expect(r.refundTax).toBe(0);
    expect(r.refundLocalIncomeTax).toBe(0);
  });

  it("R3 ordinary 청구기한(5년) — 기한2022-05-31 → 2027-05-31, 청구2026-07-01 미도과", () => {
    const r = computeAmendment(
      baseRefund({
        claimReasonType: "ordinary",
        statutoryFilingDeadline: new Date("2022-05-31"),
        amendedFilingDate: new Date("2026-07-01"),
      }),
      30_000_000,
    );
    expect(r.claimDeadline).toBe("2027-05-31");
    expect(r.isDeadlineExceeded).toBe(false);
  });

  it("R4 ordinary 도과 — 기한2019-05-31 → 2024-05-31, 청구2026-07-01 도과", () => {
    const r = computeAmendment(
      baseRefund({
        claimReasonType: "ordinary",
        statutoryFilingDeadline: new Date("2019-05-31"),
        amendedFilingDate: new Date("2026-07-01"),
      }),
      30_000_000,
    );
    expect(r.claimDeadline).toBe("2024-05-31");
    expect(r.isDeadlineExceeded).toBe(true);
  });

  it("R5 posterior 청구기한(3개월) — 사유2026-06-01 → 2026-09-01, 청구2026-07-01 미도과", () => {
    const r = computeAmendment(
      baseRefund({
        claimReasonType: "posterior",
        posteriorEventDate: new Date("2026-06-01"),
        amendedFilingDate: new Date("2026-07-01"),
      }),
      30_000_000,
    );
    expect(r.claimDeadline).toBe("2026-09-01");
    expect(r.isDeadlineExceeded).toBe(false);
  });

  it("R6 posterior 도과 — 사유2026-01-01 → 2026-04-01, 청구2026-07-01 도과", () => {
    const r = computeAmendment(
      baseRefund({
        claimReasonType: "posterior",
        posteriorEventDate: new Date("2026-01-01"),
        amendedFilingDate: new Date("2026-07-01"),
      }),
      30_000_000,
    );
    expect(r.claimDeadline).toBe("2026-04-01");
    expect(r.isDeadlineExceeded).toBe(true);
  });

  it("R10 비과세/손실 조기반환 전액환급 — 경정세액 0 → 환급=당초 전액", () => {
    const r = computeAmendment(baseRefund({ originalDeterminedTax: 40_000_000 }), 0);
    expect(r.refundTax).toBe(40_000_000);
    expect(r.totalPayable).toBe(0);
  });
});

describe("R7 통합 — calculateTransferTax 경정청구 파이프라인", () => {
  const rates = makeMockRates();
  const taxable = baseTransferInput({ isOneHousehold: false, householdHousingCount: 2 });

  it("R7 amendmentDetail.refundTax = 당초세액 − 경정 결정세액", () => {
    const baseline = calculateTransferTax(taxable, rates);
    const D = baseline.determinedTax;
    expect(D).toBeGreaterThan(0);

    const refunded = calculateTransferTax(
      {
        ...taxable,
        amendment: {
          correctionKind: "refund_claim",
          claimReasonType: "ordinary",
          originalDeterminedTax: D + 10_000_000, // 당초 과다신고
          applyUnderReportingPenalty: false,
          underReportingReason: "normal",
          underReductionMode: "exempt",
          applyLatePaymentPenalty: false,
        },
      },
      rates,
    );
    expect(refunded.amendmentDetail).toBeDefined();
    expect(refunded.amendmentDetail!.correctionKind).toBe("refund_claim");
    expect(refunded.amendmentDetail!.refundTax).toBe(10_000_000);
  });
});
