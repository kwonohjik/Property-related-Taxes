/**
 * (6b) §43² 1년 이내 동일거래(§41의4) 합산 — 상증법§43²·상증령§32의4.
 *
 * ⚠️ 핵심: 각 건의 raw benefit(적정이자−실제이자)을 **임계판정 전** 합산 → 합계로 1천만 판정.
 *    단건 free-loan.ts는 임계 미달 시 deemedGiftValue=0 반환 → raw 손실. 합산 레이어는 raw 직접 산출한다.
 *    (개별 1천만 미만 건도 합산 대상 — 사례2 ㉮·㉯ 누락 차단)
 * 증여시기 = 합산 누계가 처음 1천만 이상이 되는 건의 loanDate (isThresholdCrossing).
 */
import { addYears, format, parseISO } from "date-fns";
import { GIFT } from "../legal-codes";
import { applyRateFraction } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, FreeLoanAggregatedInput, FreeLoanItem } from "./types";
import { FREE_LOAN_THRESHOLD } from "../data/gift-deemed-rates";

/** 건별 raw benefit(임계판정 전) = max(0, floor(대출금×적정이자율) − 실제이자). §41의4③ 정당사유 게이트 0. */
function rawBenefitOf(item: FreeLoanItem): { rawBenefit: number; eligible: boolean } {
  if (!item.isRelatedParty && item.hasJustifiableReason) return { rawBenefit: 0, eligible: false };
  const interestByRate = applyRateFraction(item.loanAmount, item.appropriateRate.numer, item.appropriateRate.denom);
  return { rawBenefit: Math.max(0, interestByRate - item.actualInterestPaid), eligible: true };
}

export function calcFreeLoanAggregatedGift(input: FreeLoanAggregatedInput): DeemedGiftResult {
  // 거래일 오름차순 정렬 (누적 합산 순서)
  const loans = [...input.loans].sort((a, b) => (a.loanDate < b.loanDate ? -1 : a.loanDate > b.loanDate ? 1 : 0));

  // 기준일 = 최종 거래일, 1년 소급 윈도 (상증법§43² "그 증여일부터 소급하여 1년 이내").
  // parseISO(로컬 자정)·format로 통일 — 타임존 혼용 방지. "1년 이내"=당일 포함 해석 → >= cutoff(폐구간).
  const refDate = loans.length > 0 ? loans[loans.length - 1].loanDate : "";
  const cutoff = refDate ? format(addYears(parseISO(refDate), -1), "yyyy-MM-dd") : "";
  const inWindow = loans.filter((l) => l.loanDate >= cutoff);

  let cumulative = 0;
  let crossed = false;
  const aggregationBreakdown: NonNullable<DeemedGiftResult["aggregationBreakdown"]> = inWindow.map((item, i) => {
    const { rawBenefit, eligible } = rawBenefitOf(item);
    cumulative += rawBenefit;
    const isThresholdCrossing = !crossed && cumulative >= FREE_LOAN_THRESHOLD;
    if (isThresholdCrossing) crossed = true;
    return {
      label: item.label?.trim() || `건 ${i + 1}`,
      loanDate: item.loanDate,
      loanAmount: item.loanAmount,
      rawBenefit,
      eligible,
      cumulativeBenefit: cumulative,
      isThresholdCrossing,
    };
  });

  const totalRawBenefit = cumulative;
  const applied = totalRawBenefit >= FREE_LOAN_THRESHOLD;
  const giftDate = aggregationBreakdown.find((b) => b.isThresholdCrossing)?.loanDate;

  const steps: CalculationStep[] = aggregationBreakdown.map((b) => ({
    label: `${b.label} (${b.loanDate})${b.eligible ? "" : " — 정당사유 제외"}`,
    amount: b.rawBenefit,
  }));
  steps.push({
    label: applied ? `합산 증여재산가액 (증여시기 ${giftDate})` : "합산액 1천만 미만 — 미적용",
    amount: applied ? totalRawBenefit : 0,
    lawRef: GIFT.DUP_EXCLUSION_ANNUAL,
    note: "§43② 1년 이내 동일거래 합산",
  });

  return {
    type: "free_loan_aggregated",
    applied,
    deemedGiftValue: applied ? totalRawBenefit : 0,
    breakdown: steps,
    legalBasis: GIFT.DUP_EXCLUSION_ANNUAL,
    exclusionReason: applied ? undefined : "합산액 1천만 미만",
    aggregationBreakdown,
  };
}
