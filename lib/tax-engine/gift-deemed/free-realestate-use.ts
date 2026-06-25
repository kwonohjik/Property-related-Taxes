/** (5) 부동산 무상사용에 따른 이익의 증여 (상증법 §37) + 다기간(시행령§27③⑤)·경정청구(§79②1호·§81⑨) */
import { addMonths, addYears, differenceInMonths } from "date-fns";
import { GIFT } from "../legal-codes";
import { applyRateFraction, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, FreeRealEstateInput, FreeUsePeriod, RectificationInput } from "./types";
import {
  FREE_USE_ANNUAL_RATE,
  FREE_USE_DISCOUNT,
  FREE_USE_YEARS,
  FREE_USE_THRESHOLD,
  FREE_LOAN_THRESHOLD,
  RECT_MONTHS_FREE_USE,
  RECT_MONTHS_COLLATERAL,
} from "../data/gift-deemed-rates";

type SubType = FreeRealEstateInput["subType"];

interface SinglePeriodCalc {
  base: number; // free_use 부동산가액 / collateral 차입금
  benefit: number; // free_use 5년 현가합 / collateral 차입이익
  applied: boolean; // 기준금액 충족
  threshold: number;
}

/** 단일 기간 무상사용/담보이익 — 단일·다기간 공용(dual-truth 회피) */
function calcSinglePeriod(
  subType: SubType,
  p: { propertyValue?: number; loanAmount?: number; actualInterestPaid?: number }
): SinglePeriodCalc {
  if (subType === "free_use") {
    const pv = p.propertyValue ?? 0;
    // 연간 무상사용이익 = floor(부동산가액 × 2/100)
    const annualBenefit = applyRateFraction(pv, FREE_USE_ANNUAL_RATE.numer, FREE_USE_ANNUAL_RATE.denom);
    let pvSum = 0;
    for (let n = 1; n <= FREE_USE_YEARS; n++) {
      // floor(연이익 × 10^n / 11^n) — 1/1.1^n 정수경로
      pvSum += safeMultiplyThenDivide(annualBenefit, FREE_USE_DISCOUNT.unit ** n, FREE_USE_DISCOUNT.base ** n);
    }
    return { base: pv, benefit: pvSum, applied: pvSum >= FREE_USE_THRESHOLD, threshold: FREE_USE_THRESHOLD };
  }
  // collateral (무상담보) — 차입금 × 4.6% − 실제이자
  const loan = p.loanAmount ?? 0;
  const interest = p.actualInterestPaid ?? 0;
  const benefit = applyRateFraction(loan, 46, 1000) - interest;
  return { base: loan, benefit, applied: benefit >= FREE_LOAN_THRESHOLD, threshold: FREE_LOAN_THRESHOLD };
}

export function calcFreeRealEstateGift(input: FreeRealEstateInput): DeemedGiftResult {
  const { subType, isRelatedParty, hasJustifiableReason, periods, rectification } = input;

  if (!isRelatedParty && hasJustifiableReason) {
    return _fail("상증법 §37③ — 거래관행상 정당한 사유 (비특수관계인)");
  }

  // ── 다기간 (G2/G3) ──
  if (periods?.length) {
    return _attachRect(_calcMultiPeriod(subType, periods), subType, rectification);
  }

  // ── 단일기간 (기존 — 회귀 0) ──
  const c = calcSinglePeriod(subType, input);

  if (subType === "free_use") {
    const annualBenefit = applyRateFraction(input.propertyValue ?? 0, FREE_USE_ANNUAL_RATE.numer, FREE_USE_ANNUAL_RATE.denom);
    const steps: CalculationStep[] = [
      { label: "부동산 가액", amount: c.base, lawRef: GIFT.FREE_REALESTATE },
      { label: "연간 무상사용이익 (부동산가액 × 2%)", amount: annualBenefit },
      { label: `${FREE_USE_YEARS}년 현가합 (할인율 10%)`, amount: c.benefit, lawRef: GIFT.FREE_REALESTATE },
    ];
    if (!c.applied) {
      return _attachRect(
        {
          type: "free_realestate",
          applied: false,
          deemedGiftValue: 0,
          breakdown: steps,
          exclusionReason: "무상사용이익 1억 미만",
          legalBasis: GIFT.FREE_REALESTATE,
          thresholdEcho: { pvSum: c.benefit, threshold: c.threshold },
        },
        subType,
        rectification
      );
    }
    steps.push({ label: "증여재산가액", amount: c.benefit, lawRef: GIFT.FREE_REALESTATE, note: "§37① 무상사용" });
    return _attachRect(
      { type: "free_realestate", applied: true, deemedGiftValue: c.benefit, breakdown: steps, legalBasis: GIFT.FREE_REALESTATE },
      subType,
      rectification
    );
  }

  // collateral 단일
  const value = Math.max(0, c.benefit);
  const steps: CalculationStep[] = [
    { label: "차입금", amount: c.base, lawRef: GIFT.FREE_REALESTATE },
    { label: "적정이자율 4.6% 적용액", amount: applyRateFraction(c.base, 46, 1000) },
    { label: "실제 지급이자", amount: -(input.actualInterestPaid ?? 0) },
    { label: "차입이익", amount: c.benefit },
  ];
  if (!c.applied) {
    return _attachRect(
      {
        type: "free_realestate",
        applied: false,
        deemedGiftValue: 0,
        breakdown: steps,
        exclusionReason: "차입이익 1천만 미만",
        legalBasis: GIFT.FREE_REALESTATE,
        thresholdEcho: { benefit: c.benefit, threshold: c.threshold },
      },
      subType,
      rectification
    );
  }
  steps.push({ label: "증여재산가액", amount: value, lawRef: GIFT.FREE_REALESTATE, note: "§37② 무상담보" });
  return _attachRect(
    { type: "free_realestate", applied: true, deemedGiftValue: value, breakdown: steps, legalBasis: GIFT.FREE_REALESTATE },
    subType,
    rectification
  );
}

/** 다기간 window 루프 — 각 window는 별개 증여. deemedGiftValue=첫 window(현재 증여)만(합산 금지) */
function _calcMultiPeriod(subType: SubType, periods: FreeUsePeriod[]): DeemedGiftResult {
  const breakdown = periods.map((p, index) => {
    const c = calcSinglePeriod(subType, p);
    return { index, giftDate: p.startDate, baseValue: c.base, benefit: c.benefit, applied: c.applied };
  });
  // ⚠️ 합산 금지(누진세율 과대): 세액연결용 deemedGiftValue = 첫 window 고정.
  //    첫 window 미달이면 0(현재 증여 과세제외). 후속 window는 미래 별건.
  const first = breakdown[0];
  const deemedGiftValue = first?.applied ? Math.max(0, first.benefit) : 0;
  const unit = subType === "free_use" ? "§37① 무상사용" : "§37② 무상담보";
  const steps: CalculationStep[] = breakdown.map((b) => ({
    label: `${b.giftDate} ${subType === "free_use" ? "현가합" : "차입이익"}${b.applied ? "" : " (기준금액 미달)"}`,
    amount: b.benefit,
    lawRef: GIFT.FREE_REALESTATE,
  }));
  steps.push({ label: "증여재산가액 (첫 기간·현재 증여)", amount: deemedGiftValue, lawRef: GIFT.FREE_REALESTATE, note: `${unit} 다기간` });
  return {
    type: "free_realestate",
    applied: deemedGiftValue > 0,
    deemedGiftValue,
    breakdown: steps,
    legalBasis: GIFT.FREE_REALESTATE,
    periodBreakdown: breakdown,
  };
}

/** 경정청구(§79②1호·§81⑨) 부착 — 입력 시 base 결과에 rectification 추가 */
function _attachRect(base: DeemedGiftResult, subType: SubType, rect?: RectificationInput): DeemedGiftResult {
  if (!rect) return base;
  // 분모·만료기간 = 부동산무상사용기간(§81⑤): 무상사용 §27③후단 5년(60월) / 담보 §27⑤후단 1년(12월)
  const totalMonths = subType === "free_use" ? RECT_MONTHS_FREE_USE : RECT_MONTHS_COLLATERAL;
  const giftDate = new Date(rect.giftDate);
  const expiry = subType === "free_use" ? addYears(giftDate, 5) : addYears(giftDate, 1);
  const term = new Date(rect.terminationDate);
  // 월수 역산 — 1개월 미만의 일수는 1개월(시행령§81⑨ 후단), 음수→0
  const diff = differenceInMonths(expiry, term);
  const remainingMonths = Math.max(0, addMonths(term, diff) < expiry ? diff + 1 : diff);
  const refundableTax = safeMultiplyThenDivide(rect.giftTaxCalculated, remainingMonths, totalMonths);
  const steps: CalculationStep[] = [
    { label: "증여세 산출세액 (세대생략 할증 §57 포함)", amount: rect.giftTaxCalculated, lawRef: GIFT.RECTIFICATION_FORMULA_81_9 },
    { label: `× 잔여 ${remainingMonths}개월 / ${totalMonths}개월`, amount: refundableTax, lawRef: GIFT.RECTIFICATION_79_2, note: "경정청구 가능 세액" },
  ];
  return {
    ...base,
    rectification: {
      giftTaxCalculated: rect.giftTaxCalculated,
      expiryDate: expiry.toISOString().slice(0, 10),
      remainingMonths,
      totalMonths,
      refundableTax,
      steps,
    },
  };
}

function _fail(reason: string): DeemedGiftResult {
  return {
    type: "free_realestate",
    applied: false,
    deemedGiftValue: 0,
    breakdown: [{ label: reason, amount: 0 }],
    exclusionReason: reason,
    legalBasis: GIFT.FREE_REALESTATE,
  };
}
