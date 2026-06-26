/**
 * Phase 4 모듈 — 최대주주 할증평가 (별지 부표3 1쪽 ⑦·⑧·⑨)
 *
 * 법령: 상증법 §63 ③ + 상증령 §53 ④·⑤·⑥·⑦·⑧ (KoreanLaw 검증 2026-05-22)
 *
 * §63③: "최대주주등의 주식등에 대해서는 ... 그 가액의 100분의 20을 가산한다."
 *       (대통령령으로 정하는 중소기업, 중견기업 및 결손법인 등은 제외)
 *
 * §53④: "최대주주 = 보유주식 가장 많은 1인"
 * §53⑤: 평가기준일 소급 1년 내 양도·증여 주식 합산
 * §53⑥: 중소기업 = 「중소기업기본법」 §2 중소기업
 * §53⑦: 중견기업 = 「중견기업 성장촉진 및 경쟁력 강화에 관한 특별법」 §2 + 매출 5천억 미만
 * §53⑧: 할증 배제 9사유
 *   1호 평가기준일 직전 3년 계속 결손
 *   2호 평가기준일 전후 6개월(증여 전6/후3) 내 전부 매각
 *   3호 §28·§29·§29의2·§29의3·§30 증여이익 계산
 *   4호 다른 법인 최대주주에 해당하는 경우의 그 다른 법인 주식
 *   5호 3년 이내 사업개시 + 영업이익 모두 0 이하
 *   6호 신고기한 내 청산 확정
 *   7호 상속·증여로 최대주주 벗어남
 *   8호 §45의2 명의신탁 증여의제
 *   9호 중소기업 또는 중견기업 발행 주식 ★ 가장 빈번
 *
 * ★ KoreanLaw 검증: 조특법 §101 삭제 — 본 모듈은 §63③ + §53⑥⑦⑧ 사용
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import type { UnlistedPremiumExclusionReason } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import type {
  Section53_8_2Input,
  Section53_8_2FailReason,
} from "@/lib/tax-engine/types/stock-premium-exclusion.types";
import { evaluateSection53_8_2 } from "./section-53-8-2-gate";
import { toOptionalDate } from "@/lib/api/date-coerce";

export interface MaxShareholderPremiumInput {
  /** ⑥ 1주당 평가액 (할증 적용 전 base value) */
  finalPerShareValue: number;
  /** 최대주주 등 해당 여부 (§53④·⑤) */
  isMaxShareholder: boolean;
  /** 회사 규모 — §53⑥(small)·§53⑦(medium)·일반(large) */
  companySize: "small" | "medium" | "large";
  /** §53⑧1호 — 평가기준일 직전 3년 계속 결손 */
  isContinuousLossLastThreeYears?: boolean;
  /** 추가 배제 사유 (사용자 명시 시 우선 적용) */
  explicitExclusionReason?: UnlistedPremiumExclusionReason;
  /** §53⑧2호 전부매각 보조입력 (explicitExclusionReason==="all_sold_within_6m" 시) */
  section53_8_2?: Section53_8_2Input;
  /** 평가기준일 D (= evaluationDate) — 2호 게이트 기간 판정 */
  valuationDate?: Date;
}

export interface MaxShareholderPremiumResult {
  /** 할증률 (0 = 배제 / 0.20 = ×120% 적용) */
  premiumRate: number;
  /** ⑦ 비최대주주 1주당 평가액 (= finalPerShareValue) */
  perShareValueNonMaxShareholder: number;
  /** ⑧ 최대주주 1주당 평가액 (= finalPerShareValue × (1 + premiumRate)) */
  premiumPerShare: number;
  /** §53⑧ 배제 사유 (해당 시) */
  exclusionReason?: UnlistedPremiumExclusionReason;
  /** §53⑧2호 게이트 실패 사유 (요건 미충족 → 할증 적용) */
  section53_8_2FailReason?: Section53_8_2FailReason;
}

/**
 * 최대주주 할증평가 적용
 *
 * 적용 순서:
 *   1) isMaxShareholder=false → 할증 없음 (⑦ = ⑧ = ⑥)
 *   2) §53⑧ 배제 사유 판정 (9호 우선)
 *   3) 배제 사유 없음 → ×120% 적용
 *
 * @example PDF 사례 5 (중소기업)
 *   finalPerShareValue=10,456, isMaxShareholder=true, companySize="small"
 *   → §53⑧9호 배제 → ⑧ = 10,456 (할증 없음)
 *
 * @example PDF 사례 6 (일반기업, 50% 초과 가정 최대주주)
 *   finalPerShareValue=10,910, isMaxShareholder=true, companySize="large"
 *   → 배제 사유 없음 → ⑧ = 10,910 × 120% = 13,092
 */
export function calcMaxShareholderPremium(
  input: MaxShareholderPremiumInput,
): MaxShareholderPremiumResult {
  const { finalPerShareValue, isMaxShareholder, companySize } = input;

  // 비최대주주 → 할증 없음
  if (!isMaxShareholder) {
    return {
      premiumRate: 0,
      perShareValueNonMaxShareholder: finalPerShareValue,
      premiumPerShare: finalPerShareValue,
    };
  }

  // §53⑧2호: 게이트 통과해야만 유효한 배제. 실패 시 explicit 무효화 후 일반 분기로.
  let effective = input.explicitExclusionReason;
  let section53_8_2FailReason: Section53_8_2FailReason | undefined;
  if (effective === "all_sold_within_6m") {
    const D = toOptionalDate(input.valuationDate);
    const saleDate = toOptionalDate(input.section53_8_2?.saleContractDate);
    if (!D || !input.section53_8_2 || !saleDate) {
      effective = undefined;
      section53_8_2FailReason = "missing_input";
    } else {
      const gate = evaluateSection53_8_2(
        { ...input.section53_8_2, saleContractDate: saleDate },
        D,
      );
      if (!gate.eligible) {
        effective = undefined;
        section53_8_2FailReason = gate.failReason;
      }
    }
  }

  // §53⑧ 배제 사유 판정 — 우선순위:
  //   1) 명시 배제 사유 (게이트 통과한 2호 포함)
  //   2) §53⑧9호 중소·중견기업
  //   3) §53⑧1호 3년 계속 결손
  let exclusionReason: UnlistedPremiumExclusionReason | undefined;

  if (effective && effective !== "none") {
    exclusionReason = effective;
  } else if (companySize === "small" || companySize === "medium") {
    exclusionReason = "small_medium_enterprise"; // §53⑧9호
  } else if (input.isContinuousLossLastThreeYears) {
    exclusionReason = "continuous_loss_3y"; // §53⑧1호
  }

  if (exclusionReason) {
    return {
      premiumRate: 0,
      perShareValueNonMaxShareholder: finalPerShareValue,
      premiumPerShare: finalPerShareValue,
      exclusionReason,
    };
  }

  // §63③ 본문: 100분의 20 가산 = ×120%
  const premiumRate = 0.20;
  const premiumPerShare = Math.floor(finalPerShareValue * (1 + premiumRate));

  return {
    premiumRate,
    perShareValueNonMaxShareholder: finalPerShareValue,
    premiumPerShare,
    section53_8_2FailReason,
  };
}
