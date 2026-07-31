/**
 * 겸용주택 비사업용토지 부분 + 합산 세액 조립 헬퍼.
 * transfer-tax-mixed-use-helpers.ts에서 분리 (800줄 정책).
 */

import { applyRate, calculateProgressiveTax } from "./tax-utils";
import { calcLongTermRate, type ExcessLandResult } from "./transfer-tax-mixed-use-helpers";
import type {
  MixedUseHousingPart,
  MixedUseNonBusinessLandPart,
  MixedUseTotalTax,
} from "./types/transfer-mixed-use.types";
import type { TaxBracket } from "./types";

/** 비사업용토지 부분 조립 */
export function buildNonBusinessPart(
  housingPart: MixedUseHousingPart,
  excessResult: ExcessLandResult,
  landHoldingYears: number,
): MixedUseNonBusinessLandPart | null {
  if (excessResult.excessArea <= 0) return null;

  const transferredGain = housingPart.nonBusinessTransferredGain;
  const deductionRate = calcLongTermRate(landHoldingYears, 0, false);
  const longTermDeductionAmount = applyRate(Math.max(transferredGain, 0), deductionRate);

  return {
    excessArea: excessResult.excessArea,
    appliedMultiplier: excessResult.multiplier,
    transferGain: transferredGain,
    longTermDeductionRate: deductionRate,
    longTermDeductionAmount,
    incomeAmount: Math.max(0, transferredGain - longTermDeductionAmount),
    additionalRate: 0.10,
  };
}

/**
 * 단기보유 세율 (「소득세법」 제104조 제1항 제2·3호).
 * 3호(1년 미만) 50% — **주택**(이에 딸린 토지 포함)은 70%.
 * 2호(1~2년)   40% — 주택은 60%.
 * 2년 이상이면 null(§55① 누진).
 */
function shortTermRate(holdingYears: number, isHousing: boolean): number | null {
  if (holdingYears < 1) return isHousing ? 0.7 : 0.5;
  if (holdingYears < 2) return isHousing ? 0.6 : 0.4;
  return null;
}

/**
 * §104⑤ 비교과세용 파트 — 겸용주택의 주택분·상가토지분·상가건물분.
 * 세율 기산 연수는 caller가 산정해 넣는다(재도출 금지).
 */
export interface MixedUseRatePart {
  kind: "housing" | "commercial_land" | "commercial_building";
  income: number;
  holdingYears: number;
}

/** 합산 세액 조립 */
export function buildTotalTax(
  housingIncome: number,
  commercialIncome: number,
  nonBizIncome: number,
  brackets: TaxBracket[],
  /** 기본공제 연간 한도 (DB 세율 basicDeductionRules.annualLimit). 미전달 시 250만원 fallback. */
  basicDeductionLimit = 2_500_000,
  /**
   * 단기보유 세율 판정용 파트. **미전달 또는 `nonBizIncome > 0`이면 종전 경로**
   * (합산 누진 + 비사업용 10%p 가산)를 그대로 쓴다 — 계획서 §4.2 · P3b 범위.
   */
  rateParts?: MixedUseRatePart[],
): MixedUseTotalTax {
  const BASIC_DEDUCTION = basicDeductionLimit;

  const aggregateIncome = housingIncome + commercialIncome + nonBizIncome;
  const taxBase = Math.max(0, aggregateIncome - BASIC_DEDUCTION);
  const taxByBasicRate = calculateProgressiveTax(taxBase, brackets);

  // ── §104①2·3호 단기세율 + §104⑤ 비교과세 ────────────────────────────────
  // 「소득세법」 제104조 제5항: MAX(1호 합산누진, 2호 자산별 산출세액 합).
  // 2호 **단서**(동일 호·동일세율 합산)는 P1(`transfer-tax-split-rate.ts`)과 같은 규칙 —
  // 세율이 갈리면 본문인 자산별 합계다.
  //
  // ⚠️ 범위 — `nonBizIncome > 0`(배율 초과 비사업용 토지)이면 진입하지 않는다.
  //    §104⑤ MAX를 도입하는 순간 비사토 +10%p가 2호 안에서 계산되어 종전 모델
  //    「합산 누진 + 가산」을 대체하는데, 그 통일은 세무 판단 대기다(계획서 D-8 · P6).
  const shortTermTax = (() => {
    if (!rateParts || rateParts.length === 0 || nonBizIncome > 0 || taxBase <= 0) return null;
    const rates = rateParts.map((p) => shortTermRate(p.holdingYears, p.kind === "housing"));
    // 전 파트가 2년 이상이면 §55① 누진 하나뿐 — 1호와 같아지므로 진입 의미가 없다.
    if (rates.every((r) => r === null)) return null;

    // 기본공제는 세율이 가장 높은 파트에 전액 귀속(납세자 유리 — §103② 취지).
    // 누진 파트의 한계세율은 최고 45%이므로 단기 단일세율(40~70%)과의 비교는 그 값으로 한다.
    const effRate = (i: number) => rates[i] ?? brackets[brackets.length - 1].rate;
    const order = rateParts.map((_, i) => i).sort((a, b) => effRate(b) - effRate(a));
    let remaining = Math.min(BASIC_DEDUCTION, aggregateIncome);
    const bases = new Array<number>(rateParts.length).fill(0);
    for (const i of order) {
      const used = Math.min(remaining, rateParts[i].income);
      bases[i] = Math.max(0, rateParts[i].income - used);
      remaining -= used;
    }

    // 2호 — 세율이 같은 파트끼리만 묶어 1회 floor(단서), 나머지는 자산별.
    const byRate = new Map<string, number>();
    let progressiveBase = 0;
    rateParts.forEach((_, i) => {
      const r = rates[i];
      if (r === null) {
        progressiveBase += bases[i]; // 누진 호(§104①1호)는 과세표준 합산 후 1회
        return;
      }
      byRate.set(String(r), (byRate.get(String(r)) ?? 0) + bases[i]);
    });
    let sum = progressiveBase > 0 ? calculateProgressiveTax(progressiveBase, brackets) : 0;
    for (const [r, base] of byRate) sum += applyRate(base, Number(r));
    return sum;
  })();
  // 적용된 누진세율 구간 추출 (UI 산식 표시용)
  const applicable = brackets.find((b) => taxBase <= (b.max ?? Infinity)) ?? brackets[brackets.length - 1];
  const appliedRate = taxBase > 0 ? applicable.rate : 0;
  const progressiveDeduction = taxBase > 0 ? applicable.deduction : 0;
  // §104①8호 비사업용 토지 +10%p 중과는 **과세표준**(=양도소득금액−기본공제)에 적용된다(단건 엔진
  // transfer-tax-rate-calc.ts:307-311와 동일 원리). 양도소득기본공제는 세율이 가장 높은 부분(비사업용
  // +10%p)에 전액 귀속(납세자 유리 원칙) → 중과 base = nonBiz의 과세표준 귀속분 = max(0, nonBiz − 적용공제).
  // 적용공제 = aggregateIncome − taxBase (= min(aggregate, 기본공제); nonBiz < 공제면 base 0으로 흡수).
  const appliedDeduction = aggregateIncome - taxBase;
  const nonBizSurchargeBase = Math.max(0, nonBizIncome - appliedDeduction);
  const nonBusinessSurcharge = applyRate(nonBizSurchargeBase, 0.10);
  // §104⑤1호 — 합산 과세표준 누진(+ 비사토 가산은 종전 모델). `shortTermTax`가 있으면
  // `nonBizIncome === 0`이므로 가산은 0이고 이 값이 곧 1호다.
  const clause1 = taxByBasicRate + nonBusinessSurcharge;
  const usesShortTerm = shortTermTax !== null && shortTermTax > clause1;
  const transferTax = usesShortTerm ? shortTermTax : clause1;
  const localTax = applyRate(transferTax, 0.10);

  return {
    aggregateIncome,
    basicDeduction: BASIC_DEDUCTION,
    taxBase,
    taxByBasicRate,
    // 2호(자산별 합)가 채택되면 대표세율은 파트 최고세율이고 누진공제는 표시할 수 없다.
    appliedRate: usesShortTerm
      ? Math.max(
          ...(rateParts ?? []).map(
            (p) => shortTermRate(p.holdingYears, p.kind === "housing") ?? appliedRate,
          ),
        )
      : appliedRate,
    progressiveDeduction: usesShortTerm ? 0 : progressiveDeduction,
    nonBusinessSurcharge,
    transferTax,
    localTax,
    totalPayable: transferTax + localTax,
  };
}
