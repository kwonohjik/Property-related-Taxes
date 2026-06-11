/**
 * Track A-Phase 2: 조특법 §30의5⑧⑨·§30의6⑤ — 창업자금·가업승계 특례의 상속세 §13 연계
 * Pre-Do anchor 테스트
 *
 * 법령 근거 (KoreanLaw MCP 직접 조회, MST 286597 / 276123, 2026-06-11):
 *   §30의5⑨: "창업자금은 §13①1호를 적용할 때 기간과 관계없이 상속세 과세가액에 가산하되,
 *             §24③호를 적용할 때에는 가산한 증여재산가액으로 보지 아니한다."
 *   §30의5⑩: "창업자금에 대한 증여세액에 대하여 §28를 적용하는 경우에는 §28②에도 불구하고
 *             상속세 산출세액에서 창업자금에 대한 증여세액을 공제한다."
 *   §30의6⑤: "§30의5 제8항~제13항 준용 — '창업자금'→'주식등'"
 *
 * anchor 구성:
 *   (a) SP-C6: specialTreatmentType="startup", 12년 전 증여 → 기간 무관 가산 (현행→기대)
 *   (b) SP-D2: §24 분모에서 특례 prior 제외 → ceiling 상승 (현행→기대)
 *   (c) SP-E2: §30의5⑩ 직접 공제 (안분 없음, 초과환급 불가) (현행→기대)
 *   (d) SP-REG: 일반 prior 기존 무변경 — CUTOFF-B3 재현 (회귀 방어)
 *
 * 현행 버그 상태 실측 (probe-special-13-THROWAWAY.test.ts, 2026-06-11):
 *   isWithin13Cutoff("startup", 12년) = false → 현행 버그 확인됨
 *   priorGiftAggregated = 0 (미가산) → 버그
 *   taxableEstateValue = 995,000,000 (1,000M - 5M 장례, 특례 prior 미가산) → 버그
 *   giftTaxCredit = 0, specialTreatmentCredit = 0 → 버그
 *   finalTax = 86,330,000 → 버그
 *
 * 기대값 계산 근거 (수동 검증, 2026-06-11):
 *   상속재산 1,000M, 창업자금 prior 300M (12년 전), 자녀 1명
 *   taxableEstateValue = 995M + 300M = 1,295M (장례비 5M 최소 + prior 가산)
 *   과세표준 = 1,295M - 500M(일괄) = 795M
 *   산출세액 = floor(795M × 0.3) - 60M = 238.5M - 60M = 178,500,000
 *   §30의5⑩ 직접 공제 = min(10M, 178.5M) = 10,000,000
 *   잔여 = 178.5M - 10M = 168,500,000
 *   신고세액공제 = floor(168.5M × 0.03) = 5,055,000
 *   finalTax = 168.5M - 5.055M = 163,445,000
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { isWithin13Cutoff } from "@/lib/tax-engine/inheritance-gift-common";
import type {
  InheritanceTaxInput,
  Heir,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ──────────────────────────────────────────────────────────────
// 공통 픽스처
// ──────────────────────────────────────────────────────────────

const HEIR_CHILD: Heir = {
  id: "c1",
  relation: "child",
  name: "자녀",
  isHeir: true,
  actualShareRatio: 1,
};

/** 창업자금 특례 — 12년 전 (일반 §13①1호 10년 cutoff 도과) */
const STARTUP_PRIOR_12YR: PriorGift = {
  giftDate: "2012-01-01",
  isHeir: true,
  giftAmount: 300_000_000,
  giftTaxPaid: 10_000_000, // 특례 납부 세액 (§30의5⑩ 직접 공제 대상)
  specialTreatmentType: "startup",
};

/** 가업승계 특례 — 12년 전 */
const FAMILY_BUSINESS_PRIOR_12YR: PriorGift = {
  giftDate: "2012-01-01",
  isHeir: true,
  giftAmount: 300_000_000,
  giftTaxPaid: 10_000_000,
  specialTreatmentType: "family_business",
};

/** 일반 prior — 8년 전 (10년 cutoff 이내, 무변경 확인용) */
const NORMAL_PRIOR_8YR: PriorGift = {
  giftDate: "2016-01-01",
  isHeir: true,
  giftAmount: 100_000_000,
  giftTaxPaid: 5_000_000,
  // specialTreatmentType: undefined (일반 prior)
};

const BASE_ESTATE = 1_000_000_000; // 상속재산 10억

function makeInput(
  overrides: Partial<InheritanceTaxInput> = {},
  priors: PriorGift[] = [],
): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-01-01",
    estateItems: [{ id: "e1", category: "cash", name: "현금", marketValue: BASE_ESTATE }],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    heirs: [HEIR_CHILD],
    deductionInput: { heirs: [HEIR_CHILD] },
    preGiftsWithin10Years: [], // 기본값: 빈 배열 (overrides로 덮어씀)
    // creditInput.priorGifts: §28/§30의5⑩ 공제 계산용 (preGiftsWithin10Years와 별도 경로)
    creditInput: { isFiledOnTime: true, priorGifts: priors },
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────
// (a) SP-C6: isWithin13Cutoff — specialTreatmentType 기간 무관
// ──────────────────────────────────────────────────────────────
describe("(a) SP-C6: isWithin13Cutoff — 특례 prior 기간 무관 (§30의5⑨)", () => {
  /**
   * 현행(버그): isWithin13Cutoff → false (10년 cutoff 도과)
   * 기대(구현 후): specialTreatmentType 있으면 항상 true
   */
  it("SP-C6-1: startup, 12년 전 → §30의5⑨ 기간 무관 → true", () => {
    const result = isWithin13Cutoff(STARTUP_PRIOR_12YR, "2024-01-01");
    expect(result).toBe(true);
  });

  it("SP-C6-2: family_business, 12년 전 → §30의6⑤ 준용 → true", () => {
    const result = isWithin13Cutoff(FAMILY_BUSINESS_PRIOR_12YR, "2024-01-01");
    expect(result).toBe(true);
  });

  it("SP-C6-3: 일반 prior, 12년 전 → 여전히 false (무변경 확인)", () => {
    const normalPrior12yr: PriorGift = {
      giftDate: "2012-01-01",
      isHeir: true,
      giftAmount: 100_000_000,
      giftTaxPaid: 0,
      // specialTreatmentType: undefined — 일반
    };
    const result = isWithin13Cutoff(normalPrior12yr, "2024-01-01");
    expect(result).toBe(false); // 일반은 10년 cutoff 유지 — 무변경
  });

  it("SP-C6-4: 일반 prior, 8년 전 → true (무변경 확인)", () => {
    const result = isWithin13Cutoff(NORMAL_PRIOR_8YR, "2024-01-01");
    expect(result).toBe(true); // 8년 < 10년 → cutoff 통과 — 무변경
  });

  it("SP-C6-5: startup, 8년 전 → 현재 true, 구현 후도 true (이미 정상)", () => {
    const startupPrior8yr: PriorGift = {
      ...STARTUP_PRIOR_12YR,
      giftDate: "2016-01-01", // 8년 전
    };
    const result = isWithin13Cutoff(startupPrior8yr, "2024-01-01");
    expect(result).toBe(true); // 8년은 이미 10년 이내 → 무변경
  });
});

// ──────────────────────────────────────────────────────────────
// (b) SP-C6 통합: 창업자금 12년 prior → 과세가액 가산
// ──────────────────────────────────────────────────────────────
describe("(b) SP-C6 통합: 창업자금 12년 prior → 상속세 과세가액 가산 (§30의5⑨)", () => {
  /**
   * 현행(버그):
   *   priorGiftAggregated = 0 (12년 cutoff 도과 → 미가산)
   *   taxableEstateValue = 995,000,000 (상속재산 - 장례비 5M)
   *   giftTaxCredit = 0, specialTreatmentCredit = 0
   *   finalTax = 86,330,000 (prior 없는 것과 동일)
   *
   * 기대(구현 후):
   *   priorGiftAggregated = 300,000,000 (기간 무관 가산)
   *   taxableEstateValue = 1,295,000,000 (995M + 300M)
   *   산출세액 = 178,500,000
   *   §30의5⑩ 직접 공제 = 10,000,000
   *   finalTax = 163,445,000
   *
   * creditInput.priorGifts: §28/§30의5⑩ 공제 계산 경로 (preGiftsWithin10Years와 별도)
   */
  const result = calcInheritanceTax(
    makeInput(
      { preGiftsWithin10Years: [STARTUP_PRIOR_12YR] },
      [STARTUP_PRIOR_12YR],
    )
  );

  it("SP-C6-priorGiftAggregated: 300M (§30의5⑨ 기간 무관 가산)", () => {
    expect(result.priorGiftAggregated).toBe(300_000_000);
  });

  it("SP-C6-taxableEstateValue: 1,295M (995M + 300M prior)", () => {
    expect(result.taxableEstateValue).toBe(1_295_000_000);
  });

  it("SP-C6-finalTax: 163,445,000 (§30의5⑩ 특례 공제 반영)", () => {
    expect(result.finalTax).toBe(163_445_000);
  });
});

// ──────────────────────────────────────────────────────────────
// (c) SP-D2: §24 분모에서 특례 prior 제외 → ceiling 상승
// ──────────────────────────────────────────────────────────────
describe("(c) SP-D2: §24 분모 특례 prior 제외 (§30의5⑨ 단서)", () => {
  /**
   * §24 3호: 상속세 과세가액 > 5억 시 "사전증여 가산가액 - 증여재산공제"를 분모에서 차감
   * §30의5⑩ 단서: 특례 prior는 §24 3호 분모 대상에서 제외
   *
   * 현행(버그): 특례 prior 12년 미가산 → 과세가액 995M < 분자계산 여부 무관
   * 구현 후:
   *   과세가액 = 1,295M (특례 prior 300M 가산)
   *   §24 3호 분모: totalPriorGiftAmount는 일반만 포함 (특례 제외) → 0
   *   ceiling = 1,295M - 0 = 1,295M
   *   공제(일괄500M) < ceiling → 한도 미초과
   *
   * 검증 방법:
   *   ceilingDetail.netPriorGiftDeducted = 0 (특례 제외로 분모 0)
   */

  const resultD2 = calcInheritanceTax(
    makeInput(
      { preGiftsWithin10Years: [STARTUP_PRIOR_12YR] },
      [STARTUP_PRIOR_12YR],
    )
  );

  it("SP-D2: deductionDetail 존재 확인", () => {
    expect(resultD2.deductionDetail).toBeDefined();
  });

  it("SP-D2: limitCeiling — 구현 후 1,295M (특례 prior 분모 제외)", () => {
    // §24 3호: 과세가액 1,295M > 5억 → 단서 적용
    // 분모: 특례 prior 제외 → netPriorGiftDeducted = 0
    // ceiling = 1,295M - 0 = 1,295M
    const ceiling = (resultD2.deductionDetail as unknown as Record<string, unknown>)?.limitCeiling as number | undefined;
    // limitCeiling이 result에 직접 노출되지 않으면 finalTax 정합성으로 간접 확인
    // (공제 500M < ceiling 1,295M → 한도 미초과 → 정상 공제)
    if (ceiling !== undefined) {
      expect(ceiling).toBe(1_295_000_000);
    } else {
      // limitCeiling이 직접 노출되지 않는 경우: 공제 정상 적용 확인 (한도 미초과)
      expect(resultD2.finalTax).toBe(163_445_000);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// (d) SP-E2: §30의5⑩ 직접 공제 확인
// ──────────────────────────────────────────────────────────────
describe("(d) SP-E2: §30의5⑩ 직접 공제 (안분 없음, 초과환급 불가)", () => {
  /**
   * 현행(버그):
   *   giftTaxCredit = 0 (cutoff 도과로 §13 미합산 → isWithin13Cutoff=false → §28 eligible 없음)
   *   specialTreatmentCredit = 0 (미구현)
   *
   * 기대(구현 후):
   *   giftTaxCredit = 0 (일반 prior 없음)
   *   specialTreatmentCredit = 10,000,000 (§30의5⑩ 직접 공제)
   *
   * creditInput.priorGifts 경로: §28/§30의5⑩은 creditInput.priorGifts를 통해 계산됨
   */

  const resultE2 = calcInheritanceTax(
    makeInput(
      { preGiftsWithin10Years: [STARTUP_PRIOR_12YR] },
      [STARTUP_PRIOR_12YR],
    )
  );

  it("SP-E2-giftTaxCredit: 현행 0 (일반 §28 공제 없음)", () => {
    expect(resultE2.creditDetail?.giftTaxCredit).toBe(0);
  });

  it("SP-E2-specialTreatmentCredit: 10,000,000 (§30의5⑩ 직접 공제)", () => {
    // giftTaxPaid = 10M, 산출세액 178.5M → 한도 미초과 → 전액 공제
    expect(resultE2.creditDetail?.specialTreatmentCredit).toBe(10_000_000);
  });
});

// ──────────────────────────────────────────────────────────────
// (e) SP-E3: 가업승계(family_business) — §30의6⑤ 준용 확인
// ──────────────────────────────────────────────────────────────
describe("(e) SP-E3: family_business — §30의6⑤ 준용 (startup과 동일 동작)", () => {
  const resultE3 = calcInheritanceTax(
    makeInput(
      { preGiftsWithin10Years: [FAMILY_BUSINESS_PRIOR_12YR] },
      [FAMILY_BUSINESS_PRIOR_12YR],
    )
  );

  it("SP-E3-priorGiftAggregated: 300M (§30의6⑤ 준용)", () => {
    expect(resultE3.priorGiftAggregated).toBe(300_000_000);
  });

  it("SP-E3-specialTreatmentCredit: 10,000,000 (§30의6⑤→§30의5⑩ 준용)", () => {
    expect(resultE3.creditDetail?.specialTreatmentCredit).toBe(10_000_000);
  });
});

// ──────────────────────────────────────────────────────────────
// (f) SP-REG: 일반 prior 기존 무변경 (회귀 방어)
// ──────────────────────────────────────────────────────────────
describe("(f) SP-REG: 일반 prior — 기존 동작 무변경 (회귀 방어)", () => {
  /**
   * specialTreatmentType=undefined인 일반 prior는 구현 전후 동일 결과를 보장.
   *
   * 시나리오: 상속재산 1,000M, 일반 prior 8년 전 100M, 자녀 1명
   * 계산:
   *   taxableEstateValue = 995M + 100M = 1,095M
   *   과세표준 = 1,095M - 500M = 595M
   *   산출세액 = floor(595M × 0.3) - 60M = 178.5M - 60M = 118,500,000
   *
   * §28 처리 주의:
   *   §28은 creditInput.priorGifts 경로로 계산됨 (preGiftsWithin10Years와 별도).
   *   테스트에서 creditInput.priorGifts를 넘기지 않으면 giftTaxCredit = 0.
   *   따라서 SP-REG에서는 creditInput.priorGifts도 함께 제공.
   *
   *   giftTaxBase 미설정 → fallback = giftAmount = 100M
   *   안분 한도 = floor(100M × 118.5M / 595M) = 19,915,966
   *   기납부 5M < 안분 한도 → giftTaxCredit = 5,000,000
   *   잔여 = 118.5M - 5M = 113,500,000
   *   신고공제 = floor(113.5M × 0.03) = 3,405,000
   *   finalTax = 113,500,000 - 3,405,000 = 110,095,000
   *
   * 실측 검증 (2026-06-11): creditInput.priorGifts 없을 때 finalTax = 114,945,000
   *   신고공제 = floor(118.5M × 0.03) = 3,555,000, finalTax = 118.5M - 3.555M = 114,945,000
   */
  const resultReg = calcInheritanceTax(
    makeInput(
      { preGiftsWithin10Years: [NORMAL_PRIOR_8YR] },
      [NORMAL_PRIOR_8YR], // creditInput.priorGifts 제공
    )
  );

  it("SP-REG-priorGiftAggregated: 100M 가산 (8년 이내 정상)", () => {
    expect(resultReg.priorGiftAggregated).toBe(100_000_000);
  });

  it("SP-REG-taxableEstateValue: 1,095M", () => {
    expect(resultReg.taxableEstateValue).toBe(1_095_000_000);
  });

  it("SP-REG-giftTaxCredit: 5M (§28 안분 한도 이내)", () => {
    expect(resultReg.creditDetail?.giftTaxCredit).toBe(5_000_000);
  });

  it("SP-REG-specialTreatmentCredit: 0 (일반 prior)", () => {
    expect(resultReg.creditDetail?.specialTreatmentCredit).toBe(0);
  });

  it("SP-REG-finalTax: 110,095,000 (회귀 방어 anchor)", () => {
    expect(resultReg.finalTax).toBe(110_095_000);
  });
});

// ──────────────────────────────────────────────────────────────
// (g) SP-REG2: prior 없음 — 완전 무변경 기준선
// ──────────────────────────────────────────────────────────────
describe("(g) SP-REG2: prior 없음 — 기준선 무변경", () => {
  /**
   * 상속재산 1,000M, 자녀 1명, prior 없음
   * taxableEstateValue = 995M
   * 과세표준 = 495M
   * 산출세액 = floor(495M × 0.2) - 10M = 99M - 10M = 89,000,000
   * 신고공제 = floor(89M × 0.03) = 2,670,000
   * finalTax = 89M - 2.67M = 86,330,000
   */
  const result = calcInheritanceTax(makeInput());

  it("SP-REG2-finalTax: 86,330,000 (prior 없음 기준선)", () => {
    expect(result.finalTax).toBe(86_330_000);
  });
});
