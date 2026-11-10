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
import { TRANSFER_REDUCTION_ARTICLE } from "./legal-codes/transfer-house";
import { applyRate } from "./tax-utils";
import type { Rental97Result } from "./transfer-reductions/types";
import type { LthdExclusionReason } from "./legal-codes/transfer";
import {
  isLthdTable2HoldingOnlyEra,
  LTHD_TABLE2_RESIDENCE_MIN_YEARS,
  resolveLthdTable2Era,
  table2ResidencePct,
} from "./data/lthd-table2-era";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import { buildSplitLthdFormula, buildSplitLthdSubFormulas } from "./transfer-tax-split-display";

/**
 * 장특공제 보유·거주 분리 sub-step 라벨 — **표시 계층이 이 문자열로 sub-step을 찾는다**.
 * (`components/calc/results/transfer/lthd-split-display.ts`). 종전에는 양쪽이 리터럴을
 * 복제하고 있어 한쪽만 바꾸면 조용히 「표1」로 떨어졌다 — 단일 소스로 고정한다.
 */
export const LTHD_HOLDING_STEP_LABEL = "보유 기간분 장특";
export const LTHD_RESIDENCE_STEP_LABEL = "거주 기간분 장특";

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
  /**
   * §159의4 표2의 **거주 2년 요건** 충족 여부 — 계산 축(`transfer-tax.ts`)이 쓴 것과 **같은 술어**의
   * 결과를 그대로 받는다. 여기서 `table2ResidenceYearsForStep >= 2`로 다시 판정하면 §155의3
   * 상생임대주택 면제가 표시 축에만 빠져 「공제율은 표2인데 문구는 표1」이 된다.
   */
  meetsTable2Residence: boolean;
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
  /**
   * 부수토지 L-1b에서 표1 축이 이긴 경우(기본통칙 95-0…1 max) — 표2 형식 산식을 쓰면
   * 분해가 실제 공제율과 어긋나 자기모순이 된다. 켜지면 표1 형식으로 내려간다.
   */
  appurtenantTable1Applied?: boolean;
  /**
   * 양도일 — 표2 연혁(OH-31). 2009~2020 양도분 표2는 보유 연 8%(80% 한도) **단일축**이라 산식 문구를
   * 「보유 N년×8%」로 쓰고 거주분 sub-step을 내지 않는다(거주분 공제율 개념이 없다).
   */
  transferDate?: Date;
  /**
   * 토지·건물 분리(split) 결과 — 있으면 문구를 **파트별**로 풀어 쓴다(Phase C, 표시 전용).
   * 공제 금액·율은 이미 파트별로 확정돼 있어 단일 공제율·건물 보유연수 하나로는 설명되지 않는다.
   * 파트 echo가 없거나 합이 총액과 어긋나면(§98의2 특칙 재할당 등) 종전 문구로 후퇴한다.
   */
  splitDetail?: SplitGainResult;
  /**
   * 조특법 §97의3(특례 공제율 대체)·§97의4(추가공제율 가산) echo(`transfer-tax-lthd-rental97.ts`).
   * 있으면 `longTermHoldingRate`는 §95② 표의 율이 아니라 **혼합율(§97의3)·가산율(§97의4)**이다 —
   * 표1·표2 분해 문구를 그 율 옆에 붙이면 「보유 20년×2% = 64%」처럼 자기모순이 된다.
   * 표 분해는 echo의 일반 공제율(`baseLthdRate`)로 쓴다. 표시 전용 — 공제액·세액과 무관하다.
   */
  rental97LthdDetail?: Rental97Result;
}

/** 공제율(소수) → % 표시값(표시 전용 — 세액 계산에 쓰지 않는다) */
const pctOf = (rate: number) => Math.round(rate * 100);

type RentalLthdView =
  | { kind: "special"; overrideRate: number; baseRate: number; rentalGain: number; nonRentalGain: number }
  | { kind: "additional"; additionalRate: number; baseRate: number };

/** §97의3 특례가 **적용된** 경우·§97의4 가산이 **적용된** 경우만 — 미적용·배제는 일반 문구 그대로다. */
function resolveRentalLthdView(d: Rental97Result | undefined): RentalLthdView | undefined {
  if (!d || !d.isEligible) return undefined;
  if (d.effectCategory === "long_term_holding_special") {
    // specialApplied === false: 일반 공제액이 커서 특례를 적용하지 않았다(§97의3③) — 율이 이미 일반 공제율이다.
    if (d.specialApplied === false || d.overrideRate === undefined || d.baseLthdRate === undefined) return undefined;
    if (d.rentalGainApplied === undefined || d.nonRentalGainApplied === undefined) return undefined;
    return {
      kind: "special",
      overrideRate: d.overrideRate,
      baseRate: d.baseLthdRate,
      rentalGain: d.rentalGainApplied,
      nonRentalGain: d.nonRentalGainApplied,
    };
  }
  if (d.effectCategory === "long_term_holding_additional") {
    if (d.additionalRate === undefined || d.baseLthdRate === undefined) return undefined;
    return { kind: "additional", additionalRate: d.additionalRate, baseRate: d.baseLthdRate };
  }
  return undefined;
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
    appurtenantTable1Applied,
    meetsTable2Residence,
    transferDate,
    splitDetail,
    rental97LthdDetail,
  } = args;
  // §98의2 특칙은 공제액을 덮어쓰고, §95⑤·§95④ 후단은 자기 분해 문구가 있다 — 그 경우 임대 특례 문구를 쓰지 않는다.
  const rentalView = lthd982Applied || conv || fbLthdFormula ? undefined : resolveRentalLthdView(rental97LthdDetail);
  // 표1·표2 분해 문구에 쓰는 율 — 임대 특례가 적용됐으면 혼합·가산 전의 일반 공제율이다.
  const tableRatePct = pctOf(rentalView ? rentalView.baseRate : longTermHoldingRate);
  const holdingPeriodStr = holdingPeriod.years > 0 || holdingPeriod.months > 0
    ? `보유기간 ${holdingPeriod.years}년 ${holdingPeriod.months}개월`
    : "";
  // 1세대1주택 특례 여부에 따라 계산식 분리 표시 (LTHD 계산 입력과 동일 기준 — §99의4 반영)
  const isOneHouseSpecial =
    isOneHousehold &&
    householdHousingCount === 1 &&
    meetsTable2Residence &&
    longTermHoldingDeduction > 0 &&
    // 부수토지에서 표1이 이겼으면 공제율의 출처가 표2가 아니다 — 표2 형식으로 쓰면
    // 「보유 20년×4%=40% + 거주 3년×4%=12% = 30%」처럼 분해가 합과 어긋난다.
    !appurtenantTable1Applied;
  // 2009~2020 양도분 표2 — 보유 연 8% 단일축(OH-31). 계산 축(`calcLongTermRate`)과 같은 leaf로 가른다.
  const era = transferDate ? resolveLthdTable2Era(transferDate) : undefined;
  const table2Era982 = era;
  const singleAxisTable2 = isOneHouseSpecial && !conv && transferDate !== undefined && isLthdTable2HoldingOnlyEra(transferDate);
  // 보유분 공제율 — §95⑤이면 표1(비주택 기간) + 표2(주택 기간)의 합(40% 한도)이고,
  // 그 외 표2 경로는 총 보유기간 × 4%(단일축 시기는 × 8%, 80% 한도)다. sub-step 안분도 이 값을 기준으로 한다.
  const holdingPct = conv
    ? conv.table1Pct + conv.table2HoldingPct > 40
      ? 40
      : conv.table1Pct + conv.table2HoldingPct
    : singleAxisTable2
      ? Math.min(holdingPeriod.years * 8, 80)
      : Math.min(holdingPeriod.years * 4, 40);
  const residencePct = conv
    ? conv.residencePct
    : singleAxisTable2
      ? 0
      : table2ResidencePct(residenceYearsForStep);

  // 표2 거주기간 열은 2년 이상부터다 — 2년 미만이면 「N년×4%」로 쓰지 않는다(합과 어긋난다).
  const residenceTerm =
    residenceYearsForStep >= LTHD_TABLE2_RESIDENCE_MIN_YEARS
      ? `거주 ${residenceYearsForStep}년×4%=${residencePct}%`
      : `거주 ${residenceYearsForStep}년(2년 미만 — 거주기간 공제 없음)=0%`;

  const lthdFormulaRate = fbLthdFormula
    ? `${fbLthdFormula} (소득세법 §95④ 후단)`
    : lthd982Applied
    ? table2Era982 === "holding_8pct" || table2Era982 === "holding_8pct_residence_2y"
      ? `§98의2 특칙 — 표2 보유 ${holdingPeriod.years}년×8% = ${pctOf(longTermHoldingRate)}% (80% 한도 — 2020.12.31. 이전 양도분, 법 §98의2①1호)`
      : `§98의2 특칙 — 표2 보유 ${holdingPeriod.years}년×4% = ${pctOf(longTermHoldingRate)}% (40% 한도, 법 §98의2①1호)`
    : conv
    ? `비주택 보유 ${conv.nonHousingYears}년 표1 ${conv.table1Pct}% + 주택 보유 ${conv.housingYears}년 표2 ${conv.table2HoldingPct}%`
      + ` = 보유분 ${holdingPct}%${conv.holdingRateCapped ? " (40% 한도 적용)" : ""}`
      + ` + ${residenceTerm} = ${holdingPct + residencePct}%`
    : singleAxisTable2
    ? `표2 보유 ${holdingPeriod.years}년×8% = ${tableRatePct}% (80% 한도 — 2020.12.31. 이전 양도분)`
    : isOneHouseSpecial
    ? `보유 ${holdingPeriod.years}년×4%=${holdingPct}% + ${residenceTerm} = ${tableRatePct}%`
    : `보유 ${holdingPeriod.years}년×2% = ${tableRatePct}% (30% 한도)`;
  // §97의3 — 「임대기간 분 × 특례율 + 그 밖의 분 × 일반 공제율」(혼합율 하나로 쓰면 분해와 맞지 않는다).
  // §97의4 — 「일반 공제율 + 추가공제율 = 적용 공제율」.
  const rentalHead =
    rentalView?.kind === "special"
      ? [
          `임대기간 분 양도차익 ${rentalView.rentalGain.toLocaleString()} × ${pctOf(rentalView.overrideRate)}%`,
          ...(rentalView.nonRentalGain > 0
            ? [`그 밖의 양도차익 ${rentalView.nonRentalGain.toLocaleString()} × ${tableRatePct}%`]
            : []),
        ].join(" + ") + ` = ${longTermHoldingDeduction.toLocaleString()}`
      : undefined;
  const formulaRateText =
    rentalView?.kind === "special"
      ? `${TRANSFER_REDUCTION_ARTICLE.RENTAL_97_3} 장기보유특별공제 특례` +
        (rentalView.nonRentalGain > 0 ? ` — 그 밖의 양도차익의 일반 공제율: ${lthdFormulaRate}` : "")
      : rentalView?.kind === "additional"
        ? `${lthdFormulaRate} + ${TRANSFER_REDUCTION_ARTICLE.RENTAL_97_4} 추가공제율 ${pctOf(rentalView.additionalRate)}%` +
          ` = ${pctOf(longTermHoldingRate)}%`
        : lthdFormulaRate;
  const lthdExcluded = lthdExclusionReason !== undefined && !lthd982Applied;
  // split: 파트별 풀어 쓰기. 용도변경(§95⑤)·가업상속 후단·§98의2 특칙과는 병용되지 않지만(엔진 분기가 split을 먼저
  // 반환) 표시 계층도 같은 조건을 가드로 둔다 — 하나라도 걸리면 종전 문구다.
  const splitArgs =
    splitDetail && !lthdExcluded && !lthd982Applied && !conv && !fbLthdFormula
      ? {
          sd: splitDetail,
          longTermHoldingDeduction,
          isTable2: isOneHouseSpecial,
          singleAxis: singleAxisTable2,
          residenceYears: residenceYearsForStep,
        }
      : undefined;
  const splitFormula = splitArgs ? buildSplitLthdFormula(splitArgs) : null;
  steps.push({
    label: "장기보유특별공제",
    formula: lthdExcluded
      ? `0 — ${LTHD_EXCLUSION_LABEL[lthdExclusionReason!]}`
      : splitFormula
      ? splitFormula
      : [
          rentalHead ?? `${taxableGain.toLocaleString()} × ${pctOf(longTermHoldingRate)}%`,
          formulaRateText,
          holdingPeriodStr,
        ].filter(Boolean).join(" | "),
    amount: longTermHoldingDeduction,
    legalBasis: conv ? TRANSFER.LONG_TERM_DEDUCTION_CONVERSION : TRANSFER.LONG_TERM_DEDUCTION,
  });

  // STEP 4.1·4.2: 1세대1주택 특례(표2) 적용 시 보유분/거주분 sub-step 정식 emit.
  // 명세서 카드의 "보유 기간분 장특"·"거주 기간분 장특" 행에 step.formula 자동 매핑 (정확한 안분율 노출).
  // 비특례 케이스는 sub-step 미발생 (보유분 일률 표1 적용 — UI는 표1 안내 노출).
  // 단일축 시기(2009~2020 양도분 표2)는 거주분이 없어 나눌 것이 없다 — sub-step을 내지 않는다.
  const splitSub = splitFormula ? buildSplitLthdSubFormulas(splitArgs!) : null;
  if (singleAxisTable2 && !lthd982Applied && longTermHoldingDeduction > 0) {
    // 2009.1.1.~2020.12.31. 양도분 표2 — 보유기간별 공제율(연 8%, 80% 한도) 한 열뿐이라 공제 전액이 보유 기간분이고
    // 거주 기간분은 0이다(거주기간별 공제율 자체가 없다 — 2021.1.1. 이후에야 보유 4% + 거주 4%로 나뉜다). 신고서·명세서가
    // 2021 이후 방식(보유 4%/년 + 거주 4%/년)으로 총액을 다시 쪼개 보유분·거주분을 반반으로 적던 자리다. §98의2 특칙은 자기 경로.
    steps.push({
      label: LTHD_HOLDING_STEP_LABEL,
      formula: `총 장기보유특별공제 ${longTermHoldingDeduction.toLocaleString()} 전액 (표2 보유 ${holdingPeriod.years}년×8% = ${tableRatePct}%, 80% 한도 — 2020.12.31. 이전 양도분은 보유기간별 공제율 한 열뿐)`,
      amount: longTermHoldingDeduction,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
      sub: true,
      lthdTable2HoldingOnly: true,
    });
    steps.push({
      label: LTHD_RESIDENCE_STEP_LABEL,
      formula: "0 (2020.12.31. 이전 양도분 표2는 거주기간별 공제율이 없음 — 거주 기간분 공제 대상 아님)",
      amount: 0,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
      sub: true,
    });
  } else if (splitSub && isOneHouseSpecial && !singleAxisTable2 && longTermHoldingDeduction > 0) {
    // split — 파트별 분해의 합(거주분 = floor(공제액 × 거주% ÷ 총%), 보유분 = 잔액 흡수). 건물 보유연수 하나로 총액을
    // 안분하던 종전 금액은 신고서(split-2col)가 보이는 파트 합과 달랐다 — 합은 같고 배분만 틀렸다.
    steps.push({
      label: LTHD_HOLDING_STEP_LABEL,
      formula: splitSub.holding.formula,
      amount: splitSub.holding.amount,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
      sub: true,
    });
    steps.push({
      label: LTHD_RESIDENCE_STEP_LABEL,
      formula: splitSub.residence.formula,
      amount: splitSub.residence.amount,
      legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
      sub: true,
    });
  } else if ((isOneHouseSpecial || conv) && !singleAxisTable2 && longTermHoldingDeduction > 0) {
    const totalRate = holdingPct + residencePct;
    if (totalRate > 0 && rentalView?.kind === "special") {
      // §97의3 특례(§95② 표2 대상 1세대1주택) — 특례 공제율은 「§95②에도 불구하고」 적용하는 단일 율이라
      // 거주기간별 공제율이 아니다 ⇒ 임대기간 분 공제는 보유 기간분에 넣고, 거주 기간분은 그 밖의 양도차익 × 표2
      // 거주기간별 공제율만이다(가정 — 법문은 보유·거주를 나누지 않는다). 총액을 표2 비율(40%/48%)로 나누던 종전
      // 금액은 특례 공제를 거주분에도 배분했다. 합 = 총 장특공제 불변(잔액은 보유분에 흡수).
      const residenceAmt = applyRate(rentalView.nonRentalGain, residencePct / 100);
      const holdingAmt = longTermHoldingDeduction - residenceAmt;
      steps.push({
        label: LTHD_HOLDING_STEP_LABEL,
        formula:
          `임대기간 분 양도차익 ${rentalView.rentalGain.toLocaleString()} × ${pctOf(rentalView.overrideRate)}%` +
          ` (${TRANSFER_REDUCTION_ARTICLE.RENTAL_97_3})` +
          (rentalView.nonRentalGain > 0
            ? ` + 그 밖의 양도차익 ${rentalView.nonRentalGain.toLocaleString()} × ${holdingPct}% (보유 ${holdingPeriod.years}년 × 4%, 40% 한도)`
            : "") +
          ` = ${holdingAmt.toLocaleString()}`,
        amount: holdingAmt,
        legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
        sub: true,
      });
      steps.push({
        label: LTHD_RESIDENCE_STEP_LABEL,
        formula:
          `그 밖의 양도차익 ${rentalView.nonRentalGain.toLocaleString()} × ${residencePct}% = ${residenceAmt.toLocaleString()}` +
          ` (거주 ${residenceYearsForStep}년 × 4%, 40% 한도 — 임대기간 분 양도차익은 ${TRANSFER_REDUCTION_ARTICLE.RENTAL_97_3} 특례 공제율만 적용)`,
        amount: residenceAmt,
        legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
        sub: true,
      });
    } else if (totalRate > 0) {
      // 보유·거주 기간분 각각 자기 공제율로 직접 산정(§95② 표2 / §95⑤). floor 잔액(≤1원)은
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
        label: LTHD_HOLDING_STEP_LABEL,
        formula: `${longTermHoldingDeduction.toLocaleString()} × ${holdingPct}% / ${totalRate}% = ${holdingAmt.toLocaleString()} (${holdingDesc})`,
        amount: holdingAmt,
        legalBasis: basis,
        sub: true,
      });
      steps.push({
        label: LTHD_RESIDENCE_STEP_LABEL,
        formula: `${longTermHoldingDeduction.toLocaleString()} × ${residencePct}% / ${totalRate}% = ${residenceAmt.toLocaleString()} (${residenceDesc})`,
        amount: residenceAmt,
        legalBasis: basis,
        sub: true,
      });
    }
  }
}
