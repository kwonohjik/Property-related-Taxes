/**
 * 감사 결함 회귀 테스트 — lib/tax-engine/transfer-tax-penalty.ts
 *
 * findingRef: transfer-tax-penalty.ts:172 (신고불성실가산세 기준금액 감면 이중차감)
 *
 * 결함: 인터페이스 계약상 determinedTax 는 "세액공제·감면 적용 후"(net)인데,
 *       penaltyBase 산식이 reductionAmount 를 재차감하여 감면이 두 번 반영됨.
 *       프로덕션 라우트(app/api/calc/transfer/route.ts:756-757,
 *       multi/route.ts:299-306)가 net determinedTax + 동일 감면액을 함께 주입 →
 *       감면이 있는 무신고·과소신고에서 가산세 과소산정.
 *
 * 법령: 국세기본법 §47의2(무신고 20%)·§47의3(과소신고 10%).
 *       무신고·과소신고납부세액 = 결정세액(감면 반영 후) − 기납부세액.
 *       감면은 결정세액 산정에서 한 번만 반영.
 *
 * 기대값은 위 조문에서 독립 도출(엔진 출력 복사 아님):
 *   무신고: 결정세액(net) × 20%
 *   과소신고: 결정세액(net) × 10%
 */

import { describe, it, expect } from "vitest";
import {
  calculateFilingPenalty,
  type FilingPenaltyInput,
} from "@/lib/tax-engine/transfer-tax-penalty";

// 프로덕션 라우트가 주입하는 계약: determinedTax = net(감면 반영 후),
// reductionAmount = 동일 감면액. reductionAmount 는 재차감되면 안 됨.
const routeContractBase: FilingPenaltyInput = {
  determinedTax:      0,
  reductionAmount:    0,
  priorPaidTax:       0,
  originalFiledTax:   0,
  excessRefundAmount: 0,
  interestSurcharge:  0,
  filingType:         "none",
  penaltyReason:      "normal",
};

describe("audit-fix: 신고불성실가산세 감면 이중차감 제거", () => {
  it("무신고 + 감면 존재: penaltyBase = net 결정세액, 감면 재차감 없음", () => {
    // 산출세액 100,000,000, 감면 30,000,000 → 결정세액(net) 70,000,000
    // §47의2 무신고: 70,000,000 × 20% = 14,000,000 (감면은 결정세액에 이미 1회 반영)
    const result = calculateFilingPenalty({
      ...routeContractBase,
      determinedTax:   70_000_000, // net (라우트 baseResult.determinedTax)
      reductionAmount: 30_000_000, // 라우트 baseResult.reductionAmount (동일 감면)
      filingType:      "none",
    });
    expect(result.penaltyBase).toBe(70_000_000);
    expect(result.penaltyRate).toBe(0.20);
    expect(result.filingPenalty).toBe(14_000_000);
  });

  it("과소신고 + 감면 존재: 감면 재차감 없이 10% 적용", () => {
    // 결정세액(net) 50,000,000, 당초신고 0, 기납부 0
    // §47의3 과소신고: 50,000,000 × 10% = 5,000,000
    const result = calculateFilingPenalty({
      ...routeContractBase,
      determinedTax:   50_000_000,
      reductionAmount: 20_000_000, // 정보용 — 재차감 금지
      filingType:      "under",
    });
    expect(result.penaltyBase).toBe(50_000_000);
    expect(result.penaltyRate).toBe(0.10);
    expect(result.filingPenalty).toBe(5_000_000);
  });

  it("감면 유무가 penaltyBase 에 영향 없음 (reductionAmount 순수 정보값)", () => {
    const withReduction = calculateFilingPenalty({
      ...routeContractBase,
      determinedTax:   70_000_000,
      reductionAmount: 30_000_000,
      filingType:      "none",
    });
    const withoutReduction = calculateFilingPenalty({
      ...routeContractBase,
      determinedTax:   70_000_000,
      reductionAmount: 0,
      filingType:      "none",
    });
    expect(withReduction.penaltyBase).toBe(withoutReduction.penaltyBase);
    expect(withReduction.filingPenalty).toBe(withoutReduction.filingPenalty);
  });

  it("기납부세액은 여전히 차감 (계약 유지 확인)", () => {
    // 결정세액(net) 70,000,000 − 기납부 10,000,000 = 60,000,000, 무신고 20% = 12,000,000
    const result = calculateFilingPenalty({
      ...routeContractBase,
      determinedTax:   70_000_000,
      reductionAmount: 30_000_000,
      priorPaidTax:    10_000_000,
      filingType:      "none",
    });
    expect(result.penaltyBase).toBe(60_000_000);
    expect(result.filingPenalty).toBe(12_000_000);
  });
});
