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

  // §53⑧ 배제 사유 판정 — 우선순위:
  //   1) 명시 배제 사유 (사용자 입력)
  //   2) §53⑧9호 중소·중견기업
  //   3) §53⑧1호 3년 계속 결손
  //   (2·3·4·5·6·7·8호는 후속 PR — 입력 모델 보완 필요)
  let exclusionReason: UnlistedPremiumExclusionReason | undefined;

  if (input.explicitExclusionReason) {
    exclusionReason = input.explicitExclusionReason;
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
  };
}
