/**
 * 합병 후 3년 미경과 합병법인 순손익액 계산 (순수 함수)
 *
 * 법령·예규: 상증령 §56③, 상증통 63-56…12 · 서서-1071(2004.7.13.) · 재재산-181(2020.2.18.)
 *
 * 단일 통합 알고리즘 (사례㉮·㉯·㉰ 분기 없음 — 동일 사업연도는 overlap=12개월으로 자연 흡수):
 *   각 합병법인 역년마다:
 *     targetSum  = Σ 피합병 사업연도: netIncome × (역년과 겹치는 개월수) / 12   // 월수 안분
 *     combined   = 합병법인 순손익액 + targetSum                                // 음수 통산(절단 X)
 *     shares     = 겹침 有 → 합병후 발행주식총수 / 無 → 합병법인 당시 주식수(합병전 단독연도)
 *     perShare   = floor(combined / shares)
 *   음수→0 절단은 본 모듈이 아니라 최종 calcWeightedAvg3y(§56①)에서만 적용한다.
 *
 * 설계: docs/02-design/features/unlisted-net-income-fiscal-year-change.engine.design.md §3
 * Anchor: __tests__/tax-engine/property-valuation/merger-net-income.test.ts (A-1·A-2·A-3)
 */

import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import { monthsBetween } from "@/lib/tax-engine/property-valuation/fiscal-year-annualize";
import type {
  MergerNetIncomeContext,
  MergerNetIncomeResult,
  MergerYearEcho,
} from "@/lib/tax-engine/types/merger-net-income.types";

/**
 * 피합병 사업연도(targetStart~targetEnd)와 합병법인 역년(acqStart~acqEnd)의 겹치는 캘린더 개월수.
 * 겹침 없으면 0. (절상 없음 — §17의3② 월할 기준)
 */
function overlapMonths(
  targetStart: Date,
  targetEnd: Date,
  acqStart: Date,
  acqEnd: Date,
): number {
  const s = targetStart > acqStart ? targetStart : acqStart;
  const e = targetEnd < acqEnd ? targetEnd : acqEnd;
  if (e < s) return 0;
  return monthsBetween(s, e, { floorToOne: false });
}

export function computeMergerPerShareNetIncome(
  ctx: MergerNetIncomeContext,
): MergerNetIncomeResult {
  const breakdown = ctx.acquirer.map((acq): MergerYearEcho => {
    let targetApportioned = 0;
    let hasOverlap = false;
    for (const tg of ctx.targetFiscalYears) {
      const months = overlapMonths(tg.startDate, tg.endDate, acq.startDate, acq.endDate);
      if (months <= 0) continue;
      hasOverlap = true;
      // netIncome × months / 12 (음수 허용 — safeMultiplyThenDivide는 BigInt fallback로 정밀)
      targetApportioned += safeMultiplyThenDivide(tg.netIncome, months, 12);
    }
    const combinedNetIncome = acq.netIncome + targetApportioned;
    const sharesUsed = hasOverlap ? ctx.postMergerShares : acq.shares;
    const perShare = sharesUsed > 0 ? Math.floor(combinedNetIncome / sharesUsed) : 0;
    return {
      acquirerNetIncome: acq.netIncome,
      targetApportioned,
      combinedNetIncome,
      sharesUsed,
      perShare,
    };
  }) as [MergerYearEcho, MergerYearEcho, MergerYearEcho];

  return {
    perShare: [breakdown[0].perShare, breakdown[1].perShare, breakdown[2].perShare],
    combined: [
      breakdown[0].combinedNetIncome,
      breakdown[1].combinedNetIncome,
      breakdown[2].combinedNetIncome,
    ],
    breakdown,
  };
}
