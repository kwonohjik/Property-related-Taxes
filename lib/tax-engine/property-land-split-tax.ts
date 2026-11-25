/**
 * 재산세 토지 — 별도합산분 · 종합합산 이관분 세액 leaf (PSA-E4 · 계획서
 * docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md v3 §13).
 * 순수 함수 — DB·`new Date(x)`·로컬 달력 함수 없음.
 *
 * ## 합산 단위 — 「지방세법」 §113①은 «인별 전국»이 아니라 «납세의무자 × 해당 지방자치단체 관할구역»
 * 종합합산(1호)·별도합산(2호) 모두 «납세의무자가 소유하고 있는 해당 지방자치단체 관할구역에 있는 … 토지의 가액을 모두 합한 금액을 과세표준»으로 한다
 * (전국 합산은 종부세). 이 필지 외 같은 관할구역 토지는 입력(`otherSeparateValue`·`otherComprehensiveValue`)으로 받는다 — 합산을 무시하는 단순화를 하지 않는다.
 *
 * ## 분류마다 같은 4단계 (c ∈ {별도합산, 종합합산})
 *   1. 합산 가액 V_c = 이 필지 몫 가액 + 같은 관할구역 타 토지 가액
 *   2. 합산 과세표준 B_c = floor(V_c × 공정시장가액비율) → 합산 산출세액 T_c (분류별 누진세율 — 합산 과세표준에 1회)
 *   3. 이 필지 몫 S_c = floor(T_c × 이 필지 가액 / V_c) — 필지별 안분의 법령 근거는 «확인 필요»(PSA-V-17)
 *   4. 세부담상한(§122·영 §118) — 이 필지 합계 S_sep + S_comp에 적용
 * 부가세(`calcSurtax`)는 합계 본세 기준이고 도시지역분은 **이 필지 자기 과세표준**(선형) 기준이다(Q-18).
 *
 * ## 단일 술어 — «엔진이 읽는 칸만 요구»
 * `propertyLandSplitRequired(For)`가 ⑧(화면)·⑫(Zod)·엔진 읽기의 유일한 술어다. 요구되지 않은 칸은 엔진이 읽지 않는다(stale 무해).
 * 엔진 직접 호출에서 요구 칸이 `undefined`이면 **이 필지 단독**으로 계산하고 고지한다(입구 차단은 Zod·⑧ 몫 — 자동 0 기본값은 입구에 두지 않는다).
 */
import { PROPERTY_CAL, PROPERTY_LAND_SPLIT, PROPERTY_CONST } from "./legal-codes";
import { calculateProration } from "./tax-utils";
import { applyFairMarketRatio } from "./tax-utils";
import { applyRate } from "./tax-utils";
import { applyBurdenCap } from "./property-tax-comprehensive-aggregate";
import { calculateComprehensiveAggregateTax } from "./property-tax-comprehensive-aggregate";
import { getPropertyRateSet } from "./data/property-rate-history";
import { isSeparateAggregateLand } from "./separate-aggregate-land";
import type { LandProgressiveRateSet } from "./data/property-rate-history";
import type { PropertyRateSet } from "./data/property-rate-history";
import type { SeparateAggregateLandItem } from "./separate-aggregate-land";
import type {
  LandTaxType,
  PropertyLandSplitClass,
  PropertyLandSplitResult,
  PropertyLandSplitTransferReason,
} from "./types/property.types";

// ============================================================
// 요구 술어 — ⑧·⑫·엔진 공용
// ============================================================

export interface PropertyLandSplitRequired {
  /** 같은 관할구역 타 **별도합산**과세대상 토지 공시가액 합계 칸 */
  otherSeparate: boolean;
  /** 같은 관할구역 타 **종합합산**과세대상 토지 공시가액 합계 칸 */
  otherComprehensive: boolean;
}

const NONE_REQUIRED: PropertyLandSplitRequired = { otherSeparate: false, otherComprehensive: false };

/**
 * 분류 면적으로 요구 칸을 정한다.
 * - 직접 «종합합산» 선택(Q-16): 종합합산 칸 항상.
 * - 별도합산 선택: 별도합산 인정 면적 > 0이면 별도합산 칸, 종합합산 이관 면적 > 0이면 종합합산 칸(Q-13).
 */
export function propertyLandSplitRequired(i: {
  landTaxType?: LandTaxType;
  recognizedArea?: number;
  excessArea?: number;
}): PropertyLandSplitRequired {
  if (i.landTaxType === "comprehensive_aggregate") return { otherSeparate: false, otherComprehensive: true };
  if (i.landTaxType === "separate_aggregate") {
    return { otherSeparate: (i.recognizedArea ?? 0) > 0, otherComprehensive: (i.excessArea ?? 0) > 0 };
  }
  return NONE_REQUIRED;
}

/** 과세기준일 기본값 — 엔진(`calculatePropertyTax`)·Zod·⑧이 같은 식을 쓴다(미입력 시 올해 6.1.). */
export function landSplitTaxBaseDate(targetDate?: string): string {
  return targetDate ?? `${new Date().getFullYear()}-06-01`;
}

/**
 * 입력(와이어·엔진 공통 형태)에서 요구 칸을 구한다 — 별도합산 필지는 `isSeparateAggregateLand`로 분류 면적을 미리 판정한다.
 * 필지 판정이 던지면(미등재 용도지역 등) 요구 없음으로 두고 입구의 다른 검증·엔진 오류에 맡긴다.
 */
export function propertyLandSplitRequiredFor(i: {
  landTaxType?: LandTaxType;
  separateAggregateItem?: SeparateAggregateLandItem;
  targetDate?: string;
}): PropertyLandSplitRequired {
  if (i.landTaxType !== "separate_aggregate") return propertyLandSplitRequired({ landTaxType: i.landTaxType });
  if (!i.separateAggregateItem) return NONE_REQUIRED;
  try {
    const check = isSeparateAggregateLand({
      ...i.separateAggregateItem,
      taxBaseDate: landSplitTaxBaseDate(i.targetDate),
    });
    return propertyLandSplitRequired({
      landTaxType: i.landTaxType,
      recognizedArea: check.recognizedArea,
      excessArea: check.excessArea,
    });
  } catch {
    return NONE_REQUIRED;
  }
}

export type PropertyLandSplitInputKey = "otherSeparateAggregateValue" | "otherComprehensiveValue";

/** ⑧·⑫ 공용 — 요구됐는데 비어 있는 칸(순서 고정: 별도합산 → 종합합산). `0`은 «없음»이라 입력으로 센다. */
export function missingLandSplitInputs(
  required: PropertyLandSplitRequired,
  values: { otherSeparateAggregateValue?: number | null; otherComprehensiveValue?: number | null },
): PropertyLandSplitInputKey[] {
  const missing: PropertyLandSplitInputKey[] = [];
  if (required.otherSeparate && values.otherSeparateAggregateValue == null) missing.push("otherSeparateAggregateValue");
  if (required.otherComprehensive && values.otherComprehensiveValue == null) missing.push("otherComprehensiveValue");
  return missing;
}

export const PROPERTY_LAND_SPLIT_INPUT_MESSAGE: Record<PropertyLandSplitInputKey, string> = {
  otherSeparateAggregateValue:
    "같은 지방자치단체 관할구역에서 이 토지 외에 소유한 별도합산과세대상 토지의 공시가액 합계를 입력하세요 — 없으면 0을 입력합니다(합산 과세라 이 필지의 세액이 달라질 수 있습니다 — 「지방세법」 제113조 제1항 제2호).",
  otherComprehensiveValue:
    "같은 지방자치단체 관할구역에서 이 토지 외에 소유한 종합합산과세대상 토지의 공시가액 합계를 입력하세요 — 없으면 0을 입력합니다(합산 과세라 이 필지의 세액이 달라질 수 있습니다 — 「지방세법」 제113조 제1항 제1호).",
};

// ============================================================
// 고지 문구
// ============================================================

export const PROPERTY_LAND_SPLIT_JURISDICTION_LABEL = "같은 지방자치단체 관할구역 합산";
export const PROPERTY_LAND_SPLIT_NO_OTHER_NOTICE =
  "같은 지방자치단체 관할구역 합산 입력이 없어 이 필지 단독으로 계산했습니다 — 같은 관할구역에 다른 종합합산·별도합산 토지가 있으면 합산 과세라 세액이 달라집니다 — 확인 필요.";
export const PROPERTY_LAND_SPLIT_COMBINED_NOTICE =
  "같은 지방자치단체 관할구역의 다른 토지를 합산해 과세표준·세율을 정했고, 이 필지의 세액은 합산 세액을 공시가액 비율로 나눈 값입니다(필지별 안분의 법령 근거는 확인 필요).";
export const PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE =
  "종합합산으로 넘어간 부분이 있어 과세대상 구분이 직전 연도와 달라질 수 있는데, 직전 연도에 실제 부과된 세액은 그 구분의 기준이 아닐 수 있어 세부담상한(150%)을 적용하지 않았습니다(「지방세법 시행령」 제118조 제1항 제1호 다목) — 확인 필요.";
export const PROPERTY_LAND_SPLIT_RECOMPUTE_NOTICE =
  "세부담상한의 직전 연도 세액상당액은 직전 과세표준을 분류별 가액 비율로 나눠 분류별 직전 세율로 이 필지만 재산정한 값입니다(같은 관할구역 타 토지의 합산 효과는 넣지 않음 — 「지방세법 시행령」 제118조 제1항 제1호 다목, 기준 단위는 확인 필요).";

const TRANSFER_REASON_NOTICE: Record<PropertyLandSplitTransferReason, string> = {
  no_building: "건축물이 없는 토지",
  demolished_period: "철거ㆍ멸실 특례 기간이 지났거나 특례를 적용할 수 없는 토지",
  area_excess: "기준면적(바닥면적 × 용도지역 배율)을 초과한 토지",
  direct_type: "과세 유형을 종합합산으로 직접 선택한 토지",
};

// ============================================================
// 분류별 누진세율
// ============================================================

/** 토지 누진 3구간(종합합산·별도합산 같은 구조) — 합산 과세표준에 1회 적용. 구간 경계 `≤`가 하위 구간. */
export function applyLandBrackets(
  taxBase: number,
  r: LandProgressiveRateSet,
): { tax: number; rate: number; deduction: number } {
  if (taxBase <= 0) return { tax: 0, rate: r.rate1, deduction: 0 };
  if (taxBase <= r.bracket1) return { tax: applyRate(taxBase, r.rate1), rate: r.rate1, deduction: 0 };
  if (taxBase <= r.bracket2) return { tax: applyRate(taxBase, r.rate2) - r.deduction2, rate: r.rate2, deduction: r.deduction2 };
  return { tax: applyRate(taxBase, r.rate3) - r.deduction3, rate: r.rate3, deduction: r.deduction3 };
}

/** 한 분류의 4단계(1~3). 이 필지 몫 가액이 0이면 몫도 0(합산 세액은 다른 토지분). */
function calcClass(
  ownValue: number,
  otherValue: number,
  fairMarketRatio: number,
  rates: LandProgressiveRateSet,
  comprehensiveRateSet?: PropertyRateSet,
): PropertyLandSplitClass {
  const combinedValue = ownValue + otherValue;
  const combinedTaxBase = applyFairMarketRatio(combinedValue, fairMarketRatio);
  const bracket = applyLandBrackets(combinedTaxBase, rates);
  const { rate, deduction } = bracket;
  // 종합합산 세율은 기존 단일 소스(`calculateComprehensiveAggregateTax`)를 그대로 쓴다 — 구간 표시(rate·deduction)만 구간표에서 읽는다.
  const tax = comprehensiveRateSet ? calculateComprehensiveAggregateTax(combinedTaxBase, comprehensiveRateSet) : bracket.tax;
  const share = combinedValue > 0 ? calculateProration(tax, ownValue, combinedValue) : 0;
  return {
    ownValue,
    otherValue,
    combinedValue,
    combinedTaxBase,
    combinedGrossTax: tax,
    share,
    appliedRate: rate,
    progressiveDeduction: deduction,
    ownTaxBase: applyFairMarketRatio(ownValue, fairMarketRatio),
  };
}

// ============================================================
// 세부담상한
// ============================================================

export type LandSplitCapInput =
  | { mode: "direct"; previousYearTax?: number }
  | { mode: "recompute"; previousYearTaxBase: number; priorYear: number };

export interface LandSplitCapOutcome {
  applied: boolean;
  capRate: number;
  /** 직전 세액상당액(기준) — 상한을 계산하지 않았으면 undefined */
  basisTax?: number;
  basisTaxSeparate?: number;
  basisTaxComprehensive?: number;
  notices: string[];
  taxAfterCap: number;
}

/**
 * 이 필지 합계(별도합산분 몫 + 이관분 몫)에 150% 상한(§122)을 적용한다(Q-15).
 * - recompute: 직전 과세표준을 분류 가액 비율로 나눠 **분류별 직전 연도 세율**로 재산정(영 §118①1호 다목 — 해당 연도 구분을 직전에도 적용).
 * - direct: 직전 실제 세액. 단 별도합산 선택에서 이관분이 있으면 구분이 직전과 달라질 수 있어 상한 미적용 + 고지.
 */
function applyLandSplitCap(
  total: number,
  parts: { separate: PropertyLandSplitClass; comprehensive: PropertyLandSplitClass },
  cap: LandSplitCapInput | undefined,
  transferredFromSeparate: boolean,
  hasOther: boolean,
): LandSplitCapOutcome {
  const base = { applied: false, capRate: 1, taxAfterCap: total, notices: [] as string[] };
  if (!cap) return base;
  let basisTax: number | undefined;
  let basisSep: number | undefined;
  let basisComp: number | undefined;
  if (cap.mode === "recompute") {
    if (!(cap.previousYearTaxBase > 0)) return base;
    const rs = getPropertyRateSet(cap.priorYear);
    const sepOwn = parts.separate.ownValue;
    const sumOwn = sepOwn + parts.comprehensive.ownValue;
    const priorSep = sumOwn > 0 ? calculateProration(cap.previousYearTaxBase, sepOwn, sumOwn) : 0;
    const priorComp = cap.previousYearTaxBase - priorSep;
    basisSep = applyLandBrackets(priorSep, rs.landSeparateAggregate).tax;
    basisComp = applyLandBrackets(priorComp, rs.landComprehensive).tax;
    basisTax = basisSep + basisComp;
    // 분류가 둘이거나 타 토지 합산이 있을 때만 — 단일 분류·단독 계산은 종전 종합합산 recompute와 같아 추가 고지가 없다
    if ((sepOwn > 0 && parts.comprehensive.ownValue > 0) || hasOther) {
      base.notices.push(PROPERTY_LAND_SPLIT_RECOMPUTE_NOTICE);
    }
  } else {
    if (!(cap.previousYearTax != null && cap.previousYearTax > 0)) return base;
    if (transferredFromSeparate) {
      base.notices.push(PROPERTY_LAND_SPLIT_DIRECT_CAP_NOTICE);
      return base;
    }
    basisTax = cap.previousYearTax;
  }
  const { taxAfterCap, appliedCapRate } = applyBurdenCap(total, basisTax);
  return {
    applied: appliedCapRate !== undefined,
    capRate: appliedCapRate ?? 1,
    basisTax,
    basisTaxSeparate: basisSep,
    basisTaxComprehensive: basisComp,
    notices: base.notices,
    taxAfterCap,
  };
}

// ============================================================
// 메인 — 이 필지의 분류별 세액
// ============================================================

export interface LandClassTaxInput {
  taxYear: number;
  /** 토지 공정시장가액비율 — DB `tax_rates` 우선·상수 fallback(`calcTaxBase`가 구한 값)을 두 분류에 같이 쓴다 */
  fairMarketRatio: number;
  /** 이 필지의 별도합산 인정 공시가액(원) */
  separateOwnValue: number;
  /** 이 필지의 종합합산 공시가액(원) — 이관분 또는 직접 선택 */
  comprehensiveOwnValue: number;
  /** 같은 관할구역 타 별도합산 공시가액 합계 — 요구 술어가 연 경우에만 전달(없으면 0 취급 + 고지) */
  otherSeparateValue?: number;
  otherComprehensiveValue?: number;
  /** 요구 술어 결과 — 요구됐는데 값이 없으면 단독 계산 고지를 낸다 */
  required: PropertyLandSplitRequired;
  cap?: LandSplitCapInput;
  /** 별도합산 선택에서 종합합산 이관분이 생겼는가(direct 상한 미적용 판단) */
  transferredFromSeparate: boolean;
  transferReasons: PropertyLandSplitTransferReason[];
}

export interface LandClassTaxResult {
  /** 이 필지 합계 — 상한 전 */
  taxBeforeCap: number;
  /** 이 필지 합계 — 상한 후(= 결정 본세) */
  determinedTax: number;
  /** 이 필지 자기 과세표준(별도합산분 + 종합합산분) — 도시지역분 기준 */
  ownTaxBase: number;
  cap: LandSplitCapOutcome;
  landSplit: PropertyLandSplitResult;
  warnings: string[];
  legalBasis: string[];
}

export function calculateLandClassTax(i: LandClassTaxInput): LandClassTaxResult {
  const warnings: string[] = [];
  const rs = getPropertyRateSet(i.taxYear);
  const wantsSep = i.required.otherSeparate && i.separateOwnValue > 0;
  const wantsComp = i.required.otherComprehensive;
  const otherSep = i.required.otherSeparate ? i.otherSeparateValue ?? 0 : 0;
  const otherComp = i.required.otherComprehensive ? i.otherComprehensiveValue ?? 0 : 0;
  if ((wantsSep && i.otherSeparateValue == null) || (wantsComp && i.otherComprehensiveValue == null)) {
    warnings.push(PROPERTY_LAND_SPLIT_NO_OTHER_NOTICE);
  }

  const separate = calcClass(i.separateOwnValue, otherSep, i.fairMarketRatio, rs.landSeparateAggregate);
  const comprehensive = calcClass(i.comprehensiveOwnValue, otherComp, i.fairMarketRatio, rs.landComprehensive, rs);
  const hasSep = i.separateOwnValue > 0;
  const hasComp = i.comprehensiveOwnValue > 0;
  const hasOther = otherSep > 0 || otherComp > 0;
  if (hasOther) warnings.push(PROPERTY_LAND_SPLIT_COMBINED_NOTICE);
  if (hasComp && i.transferReasons.length > 0 && i.transferredFromSeparate) {
    warnings.push(
      `이 필지 중 종합합산으로 넘어간 부분(${i.transferReasons.map((r) => TRANSFER_REASON_NOTICE[r]).join(" · ")})은 종합합산 세율로 과세했습니다.`,
    );
  }

  const taxBeforeCap = (hasSep ? separate.share : 0) + (hasComp ? comprehensive.share : 0);
  const cap = applyLandSplitCap(
    taxBeforeCap,
    { separate, comprehensive },
    i.cap,
    i.transferredFromSeparate && hasComp,
    hasOther,
  );
  warnings.push(...cap.notices);
  if (cap.applied) {
    warnings.push(
      `세부담상한(150%) 적용: 산출세액 ${taxBeforeCap.toLocaleString()} → ${cap.taxAfterCap.toLocaleString()}`,
    );
  }

  const legalBasis: string[] = [];
  if (hasSep) legalBasis.push(PROPERTY_LAND_SPLIT.AGGREGATION_SEPARATE);
  if (hasComp) legalBasis.push(PROPERTY_LAND_SPLIT.AGGREGATION_COMPREHENSIVE, PROPERTY_CAL.RATE_COMPREHENSIVE);
  if (cap.basisTaxSeparate !== undefined) legalBasis.push(PROPERTY_LAND_SPLIT.CAP_BASIS);
  if (cap.applied) legalBasis.push(PROPERTY_CAL.BURDEN_CAP);

  return {
    taxBeforeCap,
    determinedTax: cap.taxAfterCap,
    ownTaxBase: (hasSep ? separate.ownTaxBase : 0) + (hasComp ? comprehensive.ownTaxBase : 0),
    cap,
    landSplit: {
      ...(hasSep && { separate }),
      ...(hasComp && { comprehensive: { ...comprehensive, transferReasons: i.transferReasons } }),
      taxBeforeCap,
      ...(cap.basisTax !== undefined && {
        cap: {
          applied: cap.applied,
          capRate: PROPERTY_CONST.TAX_CAP_RATE_LAND,
          basisTax: cap.basisTax,
          ...(cap.basisTaxSeparate !== undefined && { basisTaxSeparate: cap.basisTaxSeparate }),
          ...(cap.basisTaxComprehensive !== undefined && { basisTaxComprehensive: cap.basisTaxComprehensive }),
        },
      }),
      jurisdictionBasis: PROPERTY_LAND_SPLIT_JURISDICTION_LABEL,
    },
    warnings,
    legalBasis,
  };
}
