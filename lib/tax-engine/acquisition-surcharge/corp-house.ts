/**
 * 법인 주택 중과 및 부담부증여 관련 모듈
 *
 * [P1-6] 부담부증여 — 배우자·직계존비속 간 적용 배제 (지방세법 §7④)
 * [P2 확장 대비] 법인 12% 주택 중과 기본 구조
 *
 * 지방세법 §7④:
 * "다만, 배우자 또는 직계존비속으로부터의 부동산 등의 부담부증여의 경우에는
 * 증여로 본다."
 * → 배우자·직계존비속 간 부담부증여는 전체를 무상취득으로 처리
 */

import { ACQUISITION } from "../legal-codes";

// ============================================================
// P1-6: 부담부증여 배우자·직계존비속 배제
// ============================================================

/**
 * [P1-6] 부담부증여 배우자·직계존비속 간 적용 배제 여부 판정
 *
 * 지방세법 §7④: 배우자 또는 직계존비속으로부터의 부담부증여 → 전체 증여로 봄.
 * 즉, 유상/무상 분리 계산 없이 전체 과세표준에 증여세율(3.5%) 적용.
 *
 * @param giftRelation "spouse_or_lineal"이면 배우자 또는 직계존비속
 * @returns true이면 부담부증여 분리 계산 배제 → 전체 무상 처리
 */
export function isBurdenedGiftExcluded(
  giftRelation: "spouse_or_lineal" | "other" | undefined
): boolean {
  return giftRelation === "spouse_or_lineal";
}

/**
 * [P1-6] 부담부증여 취득 원인 재정의
 *
 * acquisition-tax-base.ts 부담부증여 분기 진입부에서 조기 리턴 처리를 위한 헬퍼.
 * 배우자·직계존비속 간 부담부증여는 전체 증여("gift")로 재정의하여 분리 계산 skip.
 *
 * @param acquisitionCause 원래 취득 원인
 * @param giftRelation 증여자 관계
 * @returns 재정의된 취득 원인 (배우자·직계 간 부담부증여 → "gift")
 */
export function resolveEffectiveCause(
  acquisitionCause: string,
  giftRelation: "spouse_or_lineal" | "other" | undefined
): string {
  if (acquisitionCause === "burdened_gift" && isBurdenedGiftExcluded(giftRelation)) {
    // 지방세법 §7④: 전체를 증여로 봄
    return "gift";
  }
  return acquisitionCause;
}

/**
 * [P1-6] 부담부증여 배제 안내 메시지
 */
export function getBurdenedGiftExclusionMessage(): string {
  return (
    "배우자 또는 직계존비속 간 부담부증여는 전체를 증여로 봅니다 " +
    `(지방세법 §7④). 승계 채무를 포함한 전체 시가에 증여세율(3.5%)을 적용합니다.`
  );
}

// ============================================================
// 법인 중과 기본 판정 (P2 확장 대비)
// ============================================================

/**
 * [P2 확장 대비] 법인 주택 취득 중과 적용 여부 기본 판정
 *
 * 현재 Phase 1에서는 단순히 법인 여부만 판단.
 * Phase 2에서 §13②단서(대도시 법인) + 중과제외업종 분기 확장 예정.
 *
 * [v4 D8] §13의2 vs §13② 중과제외업종 단서 차이:
 * §13의2① 1호 단서는 시행령 §28의2 8호 나목 5종만 적용
 * (주택건설사업자·주택조합·민간임대·공공주택건설·도시정비사업자).
 * 사회기반시설·은행업·해외건설 등은 §13② 대도시 법인 중과 단서 한정 (§13의2 적용 안 됨).
 */
export interface CorpHouseCheckInput {
  acquiredBy: string;
  isHousing: boolean;
  acquisitionCause: string;
}

export interface CorpHouseCheckResult {
  isCorpSurcharged: boolean;
  reason: string;
  legalBasis: string[];
}

/**
 * 법인 주택 12% 중과 여부 판정
 * (§13의2① 1호 — 법인의 주택 유상취득)
 */
export function assessCorpHouseSurcharge(input: CorpHouseCheckInput): CorpHouseCheckResult {
  if (input.acquiredBy !== "corporation") {
    return {
      isCorpSurcharged: false,
      reason: "개인(individual) 취득 — 법인 중과 미적용",
      legalBasis: [],
    };
  }

  if (!input.isHousing) {
    return {
      isCorpSurcharged: false,
      reason: "주택이 아닌 물건 — 법인 주택 중과(§13의2①) 미적용",
      legalBasis: [],
    };
  }

  // 법인의 주택 유상취득 해당 원인
  const onerousCauses = [
    "purchase", "exchange", "auction", "in_kind_investment", "new_construction",
  ];
  if (!onerousCauses.includes(input.acquisitionCause)) {
    return {
      isCorpSurcharged: false,
      reason: `${input.acquisitionCause}은 법인 주택 중과 대상 아님 (유상취득만 해당)`,
      legalBasis: [],
    };
  }

  return {
    isCorpSurcharged: true,
    reason: `법인의 주택 유상취득 중과 (${ACQUISITION.MULTI_HOUSE_SURCHARGE} 1호) — 12%`,
    legalBasis: [ACQUISITION.MULTI_HOUSE_SURCHARGE],
  };
}
