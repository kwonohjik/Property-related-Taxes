/** (6) 금전 무상대출 등에 따른 이익의 증여 (상증법 §41의4) + 다년 분할(§41의4②) */
import { addDays, addYears, differenceInCalendarDays, format, parseISO } from "date-fns";
import { GIFT } from "../legal-codes";
import { applyRateFraction, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, FreeLoanInput } from "./types";
import { FREE_LOAN_THRESHOLD } from "../data/gift-deemed-rates";

/** 연간 증여이익 = floor(대출금 × 적정이자율) − 실제이자(연간). max(0,) */
function calcAnnualBenefit(
  loanAmount: number,
  appropriateRate: { numer: number; denom: number },
  actualInterestPaid: number,
): number {
  const interestByRate = applyRateFraction(loanAmount, appropriateRate.numer, appropriateRate.denom);
  return Math.max(0, interestByRate - actualInterestPaid);
}

export function calcFreeLoanGift(input: FreeLoanInput): DeemedGiftResult {
  const { loanAmount, actualInterestPaid, appropriateRate, isRelatedParty, hasJustifiableReason, loanStartDate, loanEndDate } = input;

  if (!isRelatedParty && hasJustifiableReason) {
    return {
      type: "free_loan",
      applied: false,
      deemedGiftValue: 0,
      breakdown: [{ label: "상증법 §41의4③ — 거래관행상 정당한 사유 (비특수관계인)", amount: 0 }],
      exclusionReason: "거래관행상 정당한 사유 (비특수관계인)",
      legalBasis: GIFT.FREE_LOAN,
    };
  }

  // ── 다년 분할 (§41의4②) — 기간 양끝 모두 입력 시만. 한쪽이라도 없으면 단건(회귀 0) ──
  if (loanStartDate && loanEndDate) {
    return _calcFreeLoanMultiPeriod(input, loanStartDate, loanEndDate);
  }

  // ── 단건 1년분 (현행 — 회귀 보존) ──
  const interestByRate = applyRateFraction(loanAmount, appropriateRate.numer, appropriateRate.denom);
  const benefit = interestByRate - actualInterestPaid;
  const value = Math.max(0, benefit);
  const applied = benefit >= FREE_LOAN_THRESHOLD;
  const ratePct = (appropriateRate.numer * 100) / appropriateRate.denom;

  const steps: CalculationStep[] = [
    { label: "대출금액", amount: loanAmount, lawRef: GIFT.FREE_LOAN },
    { label: `적정이자율(${ratePct}%) 적용액`, amount: interestByRate },
    { label: "실제 지급이자", amount: -actualInterestPaid },
    { label: "증여이익 (적정이자 − 실제이자)", amount: benefit },
  ];
  if (!applied) {
    return {
      type: "free_loan",
      applied: false,
      deemedGiftValue: 0,
      breakdown: steps,
      exclusionReason: "증여이익 1천만 미만",
      legalBasis: GIFT.FREE_LOAN,
      thresholdEcho: { benefit, threshold: FREE_LOAN_THRESHOLD },
    };
  }
  steps.push({ label: "증여재산가액", amount: value, lawRef: GIFT.FREE_LOAN });
  return { type: "free_loan", applied: true, deemedGiftValue: value, breakdown: steps, legalBasis: GIFT.FREE_LOAN };
}

/**
 * §41의4② 다년 분할 — "1년 되는 날의 다음 날에 매년 새로 대출받은 것으로 본다".
 * 각 연도 별개 증여(합산 금지, deemedGiftValue=첫 window). 마지막 해 1년 미만 시 일수 안분.
 * ⚠️ 일수/365 명문 조항 없음 — §41의4② 의제에서 도출, 교재 기준 분모 365 고정(윤년 366 미지원).
 * 날짜는 parseISO(로컬 자정)·differenceInCalendarDays(시각·DST 불변)·format로 통일 — 타임존 혼용 off-by-one 방지.
 */
function _calcFreeLoanMultiPeriod(
  input: FreeLoanInput,
  loanStartDate: string,
  loanEndDate: string,
): DeemedGiftResult {
  const { loanAmount, actualInterestPaid, appropriateRate } = input;
  const annualBenefit = calcAnnualBenefit(loanAmount, appropriateRate, actualInterestPaid);
  const start = parseISO(loanStartDate);
  const end = parseISO(loanEndDate);

  const periodBreakdown: NonNullable<DeemedGiftResult["periodBreakdown"]> = [];
  for (let index = 0; index < 100; index++) {
    const windowStart = addYears(start, index);
    if (windowStart > end) break;
    const windowEndIdeal = addDays(addYears(windowStart, 1), -1); // 1년째 (365일)
    const isLast = end <= windowEndIdeal;
    let benefit: number;
    let dayCount: number;
    if (isLast) {
      // 마지막 window — 1년 미만이면 일수 안분 floor(연이익 × 일수/365)
      const actualDays = differenceInCalendarDays(end, windowStart) + 1;
      dayCount = actualDays;
      benefit = actualDays >= 365 ? annualBenefit : safeMultiplyThenDivide(annualBenefit, actualDays, 365);
    } else {
      benefit = annualBenefit;
      dayCount = 365;
    }
    periodBreakdown.push({
      index,
      giftDate: format(windowStart, "yyyy-MM-dd"),
      baseValue: loanAmount,
      benefit,
      applied: benefit >= FREE_LOAN_THRESHOLD,
      dayCount,
    });
    if (isLast) break;
  }

  const first = periodBreakdown[0];
  const deemedGiftValue = first?.applied ? first.benefit : 0;
  const ratePct = (appropriateRate.numer * 100) / appropriateRate.denom;
  const steps: CalculationStep[] = [
    { label: "대출금액", amount: loanAmount, lawRef: GIFT.FREE_LOAN },
    { label: `적정이자율(${ratePct}%) 적용 연 증여이익`, amount: annualBenefit, lawRef: GIFT.FREE_LOAN },
  ];
  periodBreakdown.forEach((p) => {
    const dayNote = p.dayCount !== undefined && p.dayCount < 365 ? `, ${p.dayCount}일 안분` : "";
    steps.push({
      label: `${p.giftDate} (${p.index + 1}년차${dayNote})${p.applied ? "" : " — 1천만 미만"}`,
      amount: p.benefit,
    });
  });
  steps.push({ label: "증여재산가액 (첫 연도·현재 증여)", amount: deemedGiftValue, lawRef: GIFT.FREE_LOAN_PERIOD, note: "§41의4② 매년 새로" });

  return {
    type: "free_loan",
    applied: deemedGiftValue > 0,
    deemedGiftValue,
    breakdown: steps,
    legalBasis: GIFT.FREE_LOAN_PERIOD,
    periodBreakdown,
  };
}
