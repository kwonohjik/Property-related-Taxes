/**
 * 공유지분 주택 수 카운트 모듈 (P3-7)
 *
 * 지방세법 시행령 §28의4④ — 공동소유 주택 카운트 규칙:
 *   공동소유 주택은 지분이 가장 큰 자의 소유로 봄 (협의 없으면 각자 소유).
 *   1세대 내 공유: 부부 공동명의 1주택 → 1주택 카운트.
 *   별도세대와 공유: 각자 1주택씩 카운트 (지분율 무관).
 *
 * 핵심 원칙:
 *   - 지분율은 카운트에 영향 없음 (지분 0.01이어도 1주택)
 *   - 1세대 내 공유 → 1세대 전체에서 1주택 카운트
 *   - 별도세대와 공유 → 본인에게 1주택 카운트
 */

import { ACQUISITION } from "../legal-codes";

// ============================================================
// 공유지분 주택 수 카운트
// ============================================================

export interface CoOwnershipCountInput {
  /** 납세자의 지분율 (0~1, 단독이면 undefined 또는 1.0) */
  ownershipShare?: number;
  /**
   * 공동소유자 모두 동일 1세대 여부
   * true: 1세대 내 공유 (부부 공동명의 등) → 1주택으로 카운트
   * false: 별도세대와 공유 → 납세자 입장에서 1주택 카운트
   */
  coOwnersAllInHousehold?: boolean;
}

export interface CoOwnershipCountResult {
  /**
   * 이 주택이 납세자의 주택 수 카운트에서 차지하는 수
   * 항상 0 또는 1 (지분율 무관)
   */
  countForTaxpayer: number;
  /** 판정 사유 설명 */
  reason: string;
  /** 법적 근거 */
  legalBasis: string;
}

/**
 * [P3-7] 공유지분 주택 카운트 판정
 *
 * §28의4④: 공동소유 주택은 지분 가장 큰 자 소유로 봄.
 * 실무 해석: 1세대 내 공유 → 1세대에서 1주택. 별도세대와 공유 → 각자 1주택.
 *
 * 지분율은 주택 수 카운트에 영향 없음:
 *   50% 지분 → 1주택, 10% 지분 → 1주택, 100% 단독 → 1주택
 */
export function countCoOwnedHouse(input: CoOwnershipCountInput): CoOwnershipCountResult {
  // 단독 소유 (지분 개념 없음)
  if (input.ownershipShare === undefined || input.ownershipShare >= 1.0) {
    return {
      countForTaxpayer: 1,
      reason: "단독 소유 → 1주택 카운트",
      legalBasis: ACQUISITION.HOUSE_COUNT_CO_OWNERSHIP,
    };
  }

  // 1세대 내 공유 (부부 공동명의 등) → 1세대에서 1주택 카운트
  // 납세자 입장에서도 1주택 (세대 전체 1주택을 대표)
  if (input.coOwnersAllInHousehold) {
    return {
      countForTaxpayer: 1,
      reason: `1세대 내 공유(지분 ${(input.ownershipShare * 100).toFixed(1)}%) — 1세대 전체에서 1주택 카운트 (지분율 무관)`,
      legalBasis: ACQUISITION.HOUSE_COUNT_CO_OWNERSHIP,
    };
  }

  // 별도세대와 공유 → 납세자 입장에서 1주택 카운트 (지분율 무관)
  return {
    countForTaxpayer: 1,
    reason: `별도세대와 공유(지분 ${(input.ownershipShare * 100).toFixed(1)}%) — 납세자 1주택 카운트 (지분율 무관, §28의4④)`,
    legalBasis: ACQUISITION.HOUSE_COUNT_CO_OWNERSHIP,
  };
}
