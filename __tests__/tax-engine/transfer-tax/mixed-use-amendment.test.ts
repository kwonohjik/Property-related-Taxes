/**
 * 겸용주택 수정신고·경정청구 — 엔진 앵커
 *
 * 국세기본법 §45(수정신고)·§45의2(경정청구). 자산종류 무관 규정이라 기존 computeAmendment() 재사용.
 * 설계: docs/02-design/features/mixed-use-amendment-correction.engine.design.md (케이스 인벤토리 C1~C8)
 *
 * ⚠️ 경로 주의: 겸용 6형제와 동거하는 transfer-tax/ 에 둔다.
 *    transfer/ 에는 겸용 테스트가 0건이라 겸용 회귀 스위트에 편입되지 않는다.
 */

import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { AmendmentInput } from "@/lib/tax-engine/types/transfer-amendment.types";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  mixedUseCase14,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../_helpers/mixed-use-fixture";

const mockRates = makeMockRates();

/** 수정신고 입력 — 가산세 OFF(순수 본세 차액만 검증) */
function amendInput(originalDeterminedTax: number): AmendmentInput {
  return {
    originalDeterminedTax,
    applyUnderReportingPenalty: false,
    underReportingReason: "normal",
    underReductionMode: "auto_48_2",
    applyLatePaymentPenalty: false,
  };
}

/** 경정청구 입력 — 거울상 */
function refundInput(originalDeterminedTax: number): AmendmentInput {
  return {
    ...amendInput(originalDeterminedTax),
    correctionKind: "refund_claim",
    claimReasonType: "ordinary",
    statutoryFilingDeadline: new Date("2023-05-31"),
    amendedFilingDate: new Date("2024-03-02"),
  };
}

function calc(amendment?: AmendmentInput) {
  return calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    mixedUseCase14(),
    mockRates,
    amendment,
  );
}

// ──────────────────────────────────────────────────────────────
// A5 / C1: 비파괴 — amendment 미전달 시 기존 경로 바이트 불변
// ──────────────────────────────────────────────────────────────

describe("A5 (C1): amendment 미전달 = 기존 경로 불변", () => {
  it("amendmentDetail === undefined", () => {
    expect(calc().amendmentDetail).toBeUndefined();
  });

  it("total 전 필드가 amendment 전달 시와 동일 (부착은 additive)", () => {
    const base = calc();
    const withAmendment = calc(amendInput(1));
    expect(withAmendment.total).toEqual(base.total);
    expect(withAmendment.housingPart).toEqual(base.housingPart);
    expect(withAmendment.commercialPart).toEqual(base.commercialPart);
  });
});

// ──────────────────────────────────────────────────────────────
// A3 / C2·C3·C8: 수정신고 — 기준값 = total.transferTax (지방소득세 제외)
// ──────────────────────────────────────────────────────────────

describe("A3 (C2·C3·C8): 수정신고 추가납부세액", () => {
  it("C2: 세액 증가 → 추가납부 = 수정 결정세액 − 당초", () => {
    const base = calc();
    const original = base.total.transferTax - 5_000_000;
    const result = calc(amendInput(original));

    expect(result.amendmentDetail).toBeDefined();
    expect(result.amendmentDetail!.additionalTax).toBe(5_000_000);
    // 기준값 고정 — totalPayable(지방세 포함)이 아니라 transferTax(본세)
    expect(result.amendmentDetail!.amendedDeterminedTax).toBe(base.total.transferTax);
  });

  it("C3: 세액 감소(수정신고 실익 없음) → 추가납부 0 (max(0, …))", () => {
    const base = calc();
    const result = calc(amendInput(base.total.transferTax + 3_000_000));
    expect(result.amendmentDetail!.additionalTax).toBe(0);
  });

  it("C8: 기준값에 NBL 중과분 포함 — transferTax = 기본세율분 + NBL 중과", () => {
    const base = calc();
    expect(base.total.transferTax).toBe(
      base.total.taxByBasicRate + base.total.nonBusinessSurcharge,
    );
    // 지방소득세는 기준값에서 제외
    expect(base.total.transferTax).not.toBe(base.total.totalPayable);
    const result = calc(amendInput(0));
    expect(result.amendmentDetail!.amendedDeterminedTax).toBe(base.total.transferTax);
  });
});

// ──────────────────────────────────────────────────────────────
// A4 / C4·C5: 경정청구 — 환급세액
// ──────────────────────────────────────────────────────────────

describe("A4 (C4·C5): 경정청구 환급세액", () => {
  it("C4: 당초 > 경정 → 환급 = 당초 − 경정 결정세액", () => {
    const base = calc();
    const result = calc(refundInput(base.total.transferTax + 7_000_000));

    expect(result.amendmentDetail!.correctionKind).toBe("refund_claim");
    expect(result.amendmentDetail!.refundTax).toBe(7_000_000);
    expect(result.amendmentDetail!.additionalTax).toBe(0);
  });

  it("C5: 당초 ≤ 경정 → 환급 0 (실익 없음)", () => {
    const base = calc();
    const result = calc(refundInput(base.total.transferTax - 1_000_000));
    expect(result.amendmentDetail!.refundTax).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// A6 / C6: 거부 경로(2022.1.1 이전 양도)는 amendment 미부착 (D8)
// ──────────────────────────────────────────────────────────────

describe("A6 (C6): pre-2022-rejected 경로 — amendment 부착 금지", () => {
  const rejected = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    new Date("2021-12-31"),
    mixedUseCase14(),
    mockRates,
    refundInput(219_902_989),
  );

  it("splitMode === 'pre-2022-rejected'", () => {
    expect(rejected.splitMode).toBe("pre-2022-rejected");
  });

  it("amendmentDetail === undefined — 전달해도 부착하지 않는다", () => {
    // computeAmendment(amendment, 0) 부착 시 refundTax = 당초 전액(219,902,989) 오표시.
    // 거부 경로는 '계산 불가' 상태이지 '세액 0'이라는 유효한 결과가 아니다.
    expect(rejected.amendmentDetail).toBeUndefined();
  });
});
