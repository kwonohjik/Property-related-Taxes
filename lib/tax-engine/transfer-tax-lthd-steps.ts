/**
 * STEP 4 장기보유특별공제 — **표시 계층**(CalculationStep 생성)
 *
 * transfer-tax.ts 800줄 정책에 따라 분리(2026-08-04, Phase A-0).
 * 공제 **금액·율은 이미 확정된 상태**로 들어온다(`calcLongTermHoldingDeduction` ·
 * §98의2 특칙 재할당 완료). 이 모듈은 그 결과를 산식 문자열과 sub-step 금액으로
 * 풀어쓸 뿐이며 세액에는 영향을 주지 않는다.
 *
 * 「소득세법」 §95⑤(비주택→주택 용도변경)은 **별도 분기**를 탄다 — 그 경우 공제율이
 * 총 보유기간에 표2를 적용한 값이 아니라 「비주택 기간 표1 + 주택 기간 표2」이기 때문이다.
 * 분기 없이 `isOneHouseSpecial` 경로를 태우면 문구가 자기모순(28%+12%≠32%)이 되고
 * sub-step **금액까지** 어긋난다(2026-08-05 Phase G에서 정정).
 * 설계: docs/02-design/features/non-housing-to-housing-conversion.engine.design.md
 */
import type { CalculationStep } from "./types/transfer.types";
import type { UsageConversionDetail } from "./types/transfer-result.types";
import { TRANSFER, LTHD_EXCLUSION_LABEL } from "./legal-codes/transfer";
import type { LthdExclusionReason } from "./legal-codes/transfer";

export interface LthdStepArgs {
  steps: CalculationStep[];
  taxableGain: number;
  holdingPeriod: { years: number; months: number };
  longTermHoldingRate: number;
  longTermHoldingDeduction: number;
  /** 실거주 연수 — 공제율 표시용(대상 판정용 통산 연수와 분리) */
  residenceYearsForStep: number;
  /** §154⑧3호 통산 거주연수 — 표2 **대상 판정**용 */
  table2ResidenceYearsForStep: number;
  isOneHousehold: boolean;
  householdHousingCount: number;
  lthd982Applied: boolean;
  lthdExclusionReason: LthdExclusionReason | undefined;
  /** §95⑤·⑥ 용도변경 적용 내역 — 있으면 보유분을 표1+표2로 나눠 표시한다. */
  usageConversionDetail?: UsageConversionDetail;
  /**
   * §95④ 후단(가업상속공제 적용 비율분 피상속인 기산) 공제율 분해 문구.
   * 있으면 표1/표2 문구 대신 이것을 쓴다 — 두 기산일이 섞여 있어 단일 "보유 N년×2%" 표기가 성립하지 않는다.
   */
  fbLthdFormula?: string;
}

/** STEP 4 + 4.1 + 4.2 — 장특공제 본 step과 보유분/거주분 sub-step을 push한다. */
export function pushLongTermHoldingSteps(args: LthdStepArgs): void {
  const {
    steps,
    taxableGain,
    holdingPeriod,
    longTermHoldingRate,
    longTermHoldingDeduction,
    residenceYearsForStep,
    table2ResidenceYearsForStep,
    isOneHousehold,
    householdHousingCount,
    lthd982Applied,
    lthdExclusionReason,
    usageConversionDetail: conv,
    fbLthdFormula,
  } = args;
  const holdingPeriodStr = holdingPeriod.years > 0 || holdingPeriod.months > 0
    ? `보유기간 ${holdingPeriod.years}년 ${holdingPeriod.months}개월`
    : "";
  // 1세대1주택 특례 여부에 따라 계산식 분리 표시 (LTHD 계산 입력과 동일 기준 — §99의4 반영)
  const isOneHouseSpecial =
    isOneHousehold &&
    householdHousingCount === 1 &&
    table2ResidenceYearsForStep >= 2 &&
    longTermHoldingDeduction > 0;
  // 보유분 공제율 — §95⑤이면 표1(비주택 기간) + 표2(주택 기간)의 합(40% 한도)이고,
  // 그 외 표2 경로는 총 보유기간 × 4%다. sub-step 안분도 이 값을 기준으로 한다.
  const holdingPct = conv
    ? conv.table1Pct + conv.table2HoldingPct > 40
      ? 40
      : conv.table1Pct + conv.table2HoldingPct
    : Math.min(holdingPeriod.years * 4, 40);
  const residencePct = conv ? conv.residencePct : Math.min(residenceYearsForStep * 4, 40);

  const lthdFormulaRate = fbLthdFormula
    ? `${fbLthdFormula} (소득세법 §95④ 후단)`
    : lthd982Applied
    ? `§98의2 특칙 — 표2 보유 ${holdingPeriod.years}년×4% = ${Math.round(longTermHoldingRate * 100)}% (40% 한도, 법 §98의2①1호)`
    : conv
    ? `비주택 보유 ${conv.nonHousingYears}년 표1 ${conv.table1Pct}% + 주택 보유 ${conv.housingYears}년 표2 ${conv.table2HoldingPct}%`
      + ` = 보유분 ${holdingPct}%${conv.holdingRateCapped ? " (40% 한도 적용)" : ""}`
      + ` + 거주 ${residenceYearsForStep}년×4%=${residencePct}% = ${holdingPct + residencePct}%`
    : isOneHouseSpecial
    ? `보유 ${holdingPeriod.years}년×4%=${holdingPct}% + 거주 ${residenceYearsForStep}년×4%=${residencePct}% = ${Math.round(longTermHoldingRate * 100)}%`
    : `보유 ${holdingPeriod.years}년×2% = ${Math.round(longTermHoldingRate * 100)}% (30% 한도)`;
  const lthdExcluded = lthdExclusionReason !== undefined && !lthd982Applied;
  steps.push({
    label: "장기보유특별공제",
    formula: lthdExcluded
      ? `0 — ${LTHD_EXCLUSION_LABEL[lthdExclusionReason!]}`
      : [
          `${taxableGain.toLocaleString()} × ${Math.round(longTermHoldingRate * 100)}%`,
          lthdFormulaRate,
          holdingPeriodStr,
        ].filter(Boolean).join(" | "),
    amount: longTermHoldingDeduction,
    legalBasis: conv ? TRANSFER.LONG_TERM_DEDUCTION_CONVERSION : TRANSFER.LONG_TERM_DEDUCTION,
  });

  // STEP 4.1·4.2: 1세대1주택 특례(표2) 적용 시 보유분/거주분 sub-step 정식 emit.
  // 명세서 카드의 "보유 기간분 장특"·"거주 기간분 장특" 행에 step.formula 자동 매핑 (정확한 안분율 노출).
  // 비특례 케이스는 sub-step 미발생 (보유분 일률 표1 적용 — UI는 표1 안내 노출).
  if ((isOneHouseSpecial || conv) && longTermHoldingDeduction > 0) {
    const totalRate = holdingPct + residencePct;
    if (totalRate > 0) {
      // 보유·거주 기간분 각각 자기 공제율로 직접 산정(§95② 별표 표2 / §95⑤). floor 잔액(≤1원)은
      // 보유분(기저 공제)에 흡수 — 합 = 총 장특공제 불변식 유지. 세액은 총액만 사용(무관).
      const residenceAmt = Math.floor((longTermHoldingDeduction * residencePct) / totalRate);
      const holdingAmt = longTermHoldingDeduction - residenceAmt;
      const basis = conv ? TRANSFER.LONG_TERM_DEDUCTION_CONVERSION : TRANSFER.LONG_TERM_DEDUCTION;
      const holdingDesc = conv
        ? `비주택 ${conv.nonHousingYears}년 표1 ${conv.table1Pct}% + 주택 ${conv.housingYears}년 표2 ${conv.table2HoldingPct}%, 40% 한도`
        : `보유 ${holdingPeriod.years}년 × 4%, 40% 한도`;
      const residenceDesc = conv
        ? `주택으로 보유한 기간 중 거주 ${residenceYearsForStep}년 × 4%, 40% 한도`
        : `거주 ${residenceYearsForStep}년 × 4%, 40% 한도`;
      steps.push({
        label: "보유 기간분 장특",
        formula: `${longTermHoldingDeduction.toLocaleString()} × ${holdingPct}% / ${totalRate}% = ${holdingAmt.toLocaleString()} (${holdingDesc})`,
        amount: holdingAmt,
        legalBasis: basis,
        sub: true,
      });
      steps.push({
        label: "거주 기간분 장특",
        formula: `${longTermHoldingDeduction.toLocaleString()} × ${residencePct}% / ${totalRate}% = ${residenceAmt.toLocaleString()} (${residenceDesc})`,
        amount: residenceAmt,
        legalBasis: basis,
        sub: true,
      });
    }
  }
}
