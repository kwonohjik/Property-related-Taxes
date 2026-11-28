/**
 * 상증법 §63③ 최대주주 할증 연혁 게이트 — U-04 (비상장주식 리뷰 2026-11-28).
 *
 * - 중견기업 제외: 2022.12.31. 개정(법률 제19195호)으로 신설. 부칙 §2 「이 법 시행 이후 상속이 개시되거나
 *   증여를 받는 경우부터 적용」 → 평가기준일(상속개시일·증여일) 2023.1.1. 이후만 배제. 그 전은 일반기업과 같이
 *   100분의 20 가산.
 * - 중견기업 정의(상증령 §53⑦)는 대통령령 제33278호(2023.2.28.)로 신설됐고 §53에 대한 적용례가 없다.
 *   2023.1.1.~2.27. 구간은 법률 부칙대로 배제하되 「확인 필요」를 고지한다(사용자 결정 Q-1).
 * - 2019.12.31. 이전(법률 제16846호 부칙 §2): 최대주주등 지분 100분의 50 초과면 100분의 30 가산 단계가 있었다.
 *   이 계산은 100분의 20만 적용하므로 「확인 필요」 고지만 단다(범위 밖).
 * - 날짜를 모르면(간편 미리보기 등) 현행(중견기업 배제)으로 본다 — U-03 선례.
 */

import { isBefore, isValid, parseISO } from "../utc-date";
import { VALUATION } from "../legal-codes";

/** 중견기업 할증 제외 적용 시작 평가기준일 (상증법 법률 제19195호 부칙 §2) */
export const MID_SIZED_PREMIUM_EXCLUSION_FROM = parseISO("2023-01-01");
/** 중견기업 정의(상증령 §53⑦) 시행일 (대통령령 제33278호) */
export const MID_SIZED_DECREE_DEFINITION_FROM = parseISO("2023-02-28");
/** 100분의 30 가산 단계 폐지 평가기준일 (상증법 법률 제16846호 부칙 §2) */
export const PREMIUM_30_TIER_ABOLISHED_FROM = parseISO("2020-01-01");

function known(d: Date | undefined): d is Date {
  return !!d && isValid(d);
}

/** 평가기준일에 중견기업이 할증 배제 대상인지. 날짜 없음·invalid = 현행(배제). */
export function isMidSizedPremiumExcluded(valuationDate: Date | undefined): boolean {
  if (!known(valuationDate)) return true;
  return !isBefore(valuationDate, MID_SIZED_PREMIUM_EXCLUSION_FROM);
}

export interface PremiumEraNoticeInput {
  companySize?: "small" | "medium" | "large";
  /** 엔진이 정한 할증률 (0 | 0.2) */
  premiumRate: number;
  /** 엔진이 정한 배제 사유 */
  exclusionReason?: string;
  valuationDate?: Date;
}

/** 상장·비상장 공용 연혁 고지 문구 (문구 이원화 방지 — 단일 소스) */
export function maxShareholderPremiumEraNotices(p: PremiumEraNoticeInput): string[] {
  const notices: string[] = [];
  const d = known(p.valuationDate) ? p.valuationDate : undefined;
  if (p.companySize === "medium" && p.premiumRate > 0) {
    notices.push(
      `${VALUATION.MAX_SHAREHOLDER_PREMIUM} 중견기업 할증 제외는 평가기준일 2023.1.1. 이후분부터 적용(${VALUATION.MID_SIZED_PREMIUM_EXCLUSION_ADDENDA}) — 그 전 평가기준일이라 중견기업 최대주주 주식에 100분의 20을 가산했습니다.`,
    );
  }
  if (
    d &&
    p.companySize === "medium" &&
    p.exclusionReason === "small_medium_enterprise" &&
    isBefore(d, MID_SIZED_DECREE_DEFINITION_FROM)
  ) {
    notices.push(
      `평가기준일 2023.1.1.~2023.2.27. — 법률 부칙(${VALUATION.MID_SIZED_PREMIUM_EXCLUSION_ADDENDA})대로 중견기업 할증을 배제했습니다. ${VALUATION.MID_SIZED_DEF} 중견기업 정의 시행(2023.2.28.) 전 구간 — 확인 필요.`,
    );
  }
  if (d && p.premiumRate > 0 && isBefore(d, PREMIUM_30_TIER_ABOLISHED_FROM)) {
    notices.push(
      `평가기준일 2019.12.31. 이전 — 종전 ${VALUATION.MAX_SHAREHOLDER_PREMIUM}은 최대주주등이 의결권 있는 발행주식총수등의 100분의 50을 초과 보유하면 100분의 30을 가산했습니다(${VALUATION.PREMIUM_30_TIER_ADDENDA}로 폐지). 이 계산은 100분의 20을 적용했습니다 — 50% 초과 보유 여부 확인 필요.`,
    );
  }
  return notices;
}

/**
 * ⑧·⑫ 공용 술어 — 배제 사유 9호(중소·중견기업)를 골랐는데 기업 규모가 일반기업.
 * 엔진은 9호를 규모·날짜로만 판정하므로 이 조합은 계산 전에 막는다(사용자 결정 Q-2 (a′)).
 */
export function isSmeReasonWithLargeSize(v: {
  isMaxShareholder?: boolean;
  premiumExclusionReason?: string;
  companySize?: string;
}): boolean {
  return (
    !!v.isMaxShareholder &&
    v.premiumExclusionReason === "small_medium_enterprise" &&
    v.companySize === "large"
  );
}

export const SME_REASON_LARGE_SIZE_MESSAGE =
  "할증 배제 사유 「중소·중견기업」(9호)은 기업 규모로 판정합니다 — 기업 규모를 중소기업·중견기업으로 고르거나 배제 사유를 「배제 사유 없음」으로 바꾸세요.";
