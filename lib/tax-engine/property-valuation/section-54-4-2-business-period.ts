/**
 * 상증령 §54④2호 사업기간 판정 — U-10 (비상장주식 리뷰 2026-11-28).
 *
 * - §54④2호: 「사업개시 전의 법인, 사업개시 후 3년 미만의 법인 또는 휴업ㆍ폐업 중인 법인의 주식등」은
 *   순자산가치로만 평가한다(단서는 3·5호에만 걸린다 — 2호는 무조건).
 * - 사업개시일 = 처음으로 재화 또는 용역의 공급을 개시한 때(재산세과-130·서면4팀-504). 기간은 사업개시일부터
 *   평가기준일까지 역에 의하여 계산한다.
 * - 기간 계산: 국세기본법 §4 → 민법 초일불산입·역 계산(`civil-period` A 유형). 2023-03-01 개시 → 3년 만료일
 *   2026-03-01. 만료일은 그날 종료로 만료되므로 그날까지는 「3년 미만」, 3년 이상은 만료일 다음 날부터다.
 * - 휴업·폐업은 날짜로 알 수 없으므로 여기서 판정하지 않는다(사용자가 고른 사유를 존중).
 *
 * 엔진(unlisted-orchestrator)과 화면(CorporateInfoSection)이 함께 쓰는 단일 소스.
 */

import { toOptionalDate } from "@/lib/api/date-coerce";
import { isAfterPeriod } from "@/lib/tax-engine/civil-period";
import { periodEndFrom } from "@/lib/tax-engine/civil-period";
import { utcDayDiff } from "@/lib/tax-engine/civil-period";
import { format } from "@/lib/tax-engine/utc-date";
import { VALUATION } from "@/lib/tax-engine/legal-codes";
import { PERIOD_CALCULATION_4 } from "@/lib/tax-engine/legal-codes";
import type { UnlistedNetAssetOnlyReason } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

export type Section54_4_2BusinessPeriodStatus =
  | "pre_start" // 평가기준일 < 사업개시일 — 사업개시 전의 법인
  | "under_3y" // 사업개시일 ≤ 평가기준일 ≤ 3년 만료일
  | "three_years_or_more"
  | "unknown"; // 날짜 미입력·invalid — 자동 판정하지 않는다(종전 동작)

export interface Section54_4_2BusinessPeriod {
  status: Section54_4_2BusinessPeriodStatus;
  businessStartDate?: Date;
  /** 사업개시일부터 3년의 만료일(그날까지 3년 미만) */
  threeYearsEndDate?: Date;
}

/** §54④2호의 「사업개시 전·사업개시 후 3년 미만」을 사업개시일·평가기준일로 판정한다. */
export function resolveSection54_4_2ByBusinessStart(
  businessStartDate: unknown,
  evaluationDate: unknown,
): Section54_4_2BusinessPeriod {
  const start = toOptionalDate(businessStartDate);
  const evaluation = toOptionalDate(evaluationDate);
  if (!start || !evaluation) return { status: "unknown" };
  const threeYearsEndDate = periodEndFrom(start, 3);
  if (utcDayDiff(evaluation, start) < 0) {
    return { status: "pre_start", businessStartDate: start, threeYearsEndDate };
  }
  if (!isAfterPeriod(start, 3, evaluation)) {
    return { status: "under_3y", businessStartDate: start, threeYearsEndDate };
  }
  return { status: "three_years_or_more", businessStartDate: start, threeYearsEndDate };
}

/** 날짜로 2호(사업개시 전·3년 미만)가 성립하는가 */
export function isSection54_4_2ByBusinessStart(period: Section54_4_2BusinessPeriod): boolean {
  return period.status === "pre_start" || period.status === "under_3y";
}

/**
 * §55③2호 단서 가·나목(개인사업자 법인전환 + 개인·법인 사업기간 합계 3년 이상 → 영업권 합산) 미반영 고지 — Q-2.
 * 엔진은 단서 요건을 입력받지 않아 2호이면 영업권을 늘 뺀다. 엔진 warnings와 화면 ToneCard가 같은 문구를 쓴다.
 */
export const SECTION_55_3_2_PROVISO_NOTICE =
  `${VALUATION.UNLISTED_GOODWILL_EXCLUDE_BUSINESS_PERIOD} 단서 가·나목 — 개인사업자가 무체재산권 현물출자나 사업 양도·양수로 ` +
  "법인전환하여 그 법인이 사업용 무형자산을 계속 사용하고 개인·법인 사업기간 합계가 3년 이상이면 영업권을 합산해야 함 " +
  "— 이 계산기는 미반영, 확인 필요";

/** 2호 자동 판정의 appliedRules·warnings 문구 (오케스트레이터 전용 · 문구는 상수로 조립) */
export function section54_4_2Notices(args: {
  period: Section54_4_2BusinessPeriod;
  userReason?: UnlistedNetAssetOnlyReason;
  goodwillExcludedByLaw?: string;
}): { appliedRules: string[]; warnings: string[] } {
  const { period, userReason } = args;
  const appliedRules: string[] = [];
  const warnings: string[] = [];
  const law = VALUATION.UNLISTED_NET_ASSET_ONLY_BUSINESS_PERIOD;
  const start = period.businessStartDate ? format(period.businessStartDate, "yyyy-MM-dd") : "";
  const end = period.threeYearsEndDate ? format(period.threeYearsEndDate, "yyyy-MM-dd") : "";
  if (period.status === "pre_start") {
    appliedRules.push(`${law} — 사업개시 전의 법인(사업개시일 ${start}) → 순자산가치 단독 (무조건)`);
  } else if (period.status === "under_3y") {
    appliedRules.push(
      `${law} — 사업개시 후 3년 미만(사업개시일 ${start}, 3년 만료일 ${end} · ${PERIOD_CALCULATION_4}) → 순자산가치 단독 (무조건)`,
    );
  }
  if (isSection54_4_2ByBusinessStart(period) && (userReason === "real_estate_80" || userReason === "stock_holding_80")) {
    appliedRules.push(`${law} 우선 — 선택한 사유 ${userReason}의 단서(가중평균 < 순자산) 판정 없이 순자산가치 단독`);
  }
  if (userReason === "lt3y" && period.status === "three_years_or_more") {
    warnings.push(
      `${law} — 사업개시일(${start}) 기준 3년 이상(3년 만료일 ${end}). 휴업·폐업 중인 법인이거나 사업개시일` +
        "(처음 재화·용역을 공급한 날, 폐업 후 재개한 법인은 재개 후 처음 공급한 날)이 다른 경우에만 2호 — 확인 필요",
    );
  }
  if (args.goodwillExcludedByLaw === "lt3y") warnings.push(SECTION_55_3_2_PROVISO_NOTICE);
  return { appliedRules, warnings };
}
