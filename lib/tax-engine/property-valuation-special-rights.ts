/**
 * 재산평가 — 임대차 환산·지상권·무체재산권 (상증법 §61·§51·§64, 민법 §280·§281)
 *
 * `property-valuation.ts`에서 분리(800줄 정책). **평가 로직 무변경 — 순수 이동**이다.
 * 이 3개 도메인은 부동산·금융 평가와 공통 헬퍼를 하나도 공유하지 않아(실측 0건)
 * 가장 깨끗한 이음매였다.
 *
 * 공개 API는 `property-valuation.ts`가 그대로 re-export한다 — 기존 import 경로는 유지된다
 * (memory `feedback_800line_split_export_preservation`).
 */

import { addYears, differenceInYears } from "date-fns";
import { VALUATION } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { safeMultiply } from "./tax-utils";
import type {
  EstateItem,
  PropertyValuationResult,
  ValuationMethod,
  CalculationStep,
  SuperficiesStructureType,
  IntangibleIpType,
  IntangibleIncomeMode,
} from "./types/inheritance-gift.types";

// ============================================================
// 임대차 환산 (§61 — 임대보증금 환산가액)
// 환산율 12% (= 보증금 ÷ 0.12)
// ============================================================

export const LEASE_CONVERSION_RATE = 0.12;

/**
 * 임대보증금 → 시가 환산 (§61)
 * 환산가액 = 보증금 ÷ 12%
 */
export function convertLeaseToValue(depositAmount: number): number {
  if (depositAmount <= 0) return 0;
  return Math.floor(depositAmount / LEASE_CONVERSION_RATE);
}

// ============================================================
// 지상권 평가 (상증법 §61③·상증령 §51①·상증규 §16①②)
//   평가액 = Σ(n=1..N) floor(income × 10ⁿ / 11ⁿ), income = floor(토지가액 × 2%)
//   할인율 10% 고정(분수 11/10, 부동소수 누적 금지). 잔존연수: 민법 §280·§281 준용.
// ============================================================

const SUPERFICIES_RATE = 2; // 상증규 §16① 연 100분의 2

/** 민법 §280·§281 건물·공작물 종류별 최단존속기간(년) */
const SUPERFICIES_MIN_TENURE: Record<SuperficiesStructureType, number> = {
  solid_building: 30, // ㉠ 견고건물·수목
  other_building: 15, // ㉡ 그 외 건물
  non_building: 5, // ㉢ 공작물
  unspecified: 15, // §281② 종류미정 → ㉡ 간주
};

/**
 * 지상권 잔존연수 도출 (민법 §280·§281 준용) — 엔진 단일진실.
 * UI(useMemo 표시)·lib/calc 입력빌드·validate가 공용 import (dual-truth 금지).
 * 1년 미만 단수 = 절상.
 */
export function resolveSuperficiesTenureYears(p: {
  agreed: boolean;
  structureType: SuperficiesStructureType;
  agreedYears?: number;
  setDate: Date;
  valuationDate: Date;
}): number {
  const min = SUPERFICIES_MIN_TENURE[p.structureType];
  // §280① 약정: max(약정, 최단) — 단축 약정은 최단으로 연장 / §281① 미약정: 최단
  const tenure = p.agreed ? Math.max(p.agreedYears ?? 0, min) : min;
  const expiry = addYears(p.setDate, tenure); // 존속만료일
  if (expiry <= p.valuationDate) return 0; // 만료
  // 잔존연수 = 만료일 − 평가기준일, 1년 미만 절상
  const full = differenceInYears(expiry, p.valuationDate);
  const hasRemainder = addYears(p.valuationDate, full) < expiry;
  return full + (hasRemainder ? 1 : 0);
}

/**
 * 지상권 평가 (§61③). 토지가액(§61① 개별공시지가×면적) → 연수입(×2%) → 잔존연수 10% 현가환산.
 * 담보·임대 무관 — applyCollateralFloor 미사용. 잔존연수는 lib/calc에서 합성된 값 소비.
 */
export function evaluateSuperficies(item: EstateItem): PropertyValuationResult {
  if (item.category !== "superficies") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateSuperficies: 지상권 자산이 아닙니다.",
    );
  }

  const unit = item.superficiesLandStandardPrice ?? 0;
  const area = item.superficiesLandArea ?? 0; // UI에서 toFixed(2) 처리됨
  // 면적 소수 → ×100 정수화 후 BigInt 곱·/100 floor (부동소수 금지)
  const areaScaled = Math.round(area * 100);
  const landValue = Math.floor(safeMultiply(unit, areaScaled) / 100); // §61① 토지가액
  const income = Math.floor(safeMultiply(landValue, SUPERFICIES_RATE) / 100); // ×2%
  const years = Math.max(0, Math.trunc(item.superficiesRemainingYears ?? 0));

  // Σ floor(income × 10ⁿ / 11ⁿ) — BigInt 분수 (할인율 10% = 11/10)
  let sum = 0n;
  let num = 1n; // 10ⁿ
  let den = 1n; // 11ⁿ
  const incBig = BigInt(income);
  for (let n = 1; n <= years; n++) {
    num *= 10n;
    den *= 11n;
    sum += (incBig * num) / den; // 각 항 BigInt floor
  }
  const valuatedAmount = Number(sum);

  return {
    estateItemId: item.id,
    method: "standard_price",
    valuatedAmount,
    breakdown: [
      { label: "지상권 설정 토지가액 (개별공시지가 × 면적)", amount: landValue, lawRef: VALUATION.REAL_ESTATE_SUPP },
      { label: "각 연도 수입금액 (토지가액 × 2%)", amount: income, lawRef: VALUATION.SUPERFICIES },
      { label: `잔존연수 ${years}년 · 할인율 10% 현재가치 환산 합계`, amount: valuatedAmount, lawRef: VALUATION.SUPERFICIES },
      { label: "평가액", amount: valuatedAmount },
    ],
    warnings: ["지상권 보충적 평가 — 잔존연수·존속기간 약정 내용 확인 권장"],
  };
}

// ============================================================
// 무체재산권 평가 (상증법 §64·상증령 §59⑤·상증규 §19②③④)
//   평가액 = Σ(n=1..N) floor(income × 10ⁿ / 11ⁿ), 할인율 10%(분수 11/10)
//   N = min(존속만료일 − 평가기준일, 20). 잔존연수 floor(규 §19③ — 지상권 절상과 반대).
// ============================================================

/** 무체재산권 종류별 법정 존속기간(기산일·연수) — 현행법, KoreanLaw 검증 */
function resolveIntangibleDurationYears(
  type: IntangibleIpType,
  originDate?: Date,
  authorDeathDate?: Date,
): { base?: Date; years: number } {
  switch (type) {
    case "patent":        return { base: originDate, years: 20 }; // 특허법 §88①
    case "utility_model": return { base: originDate, years: 10 }; // 실용신안법 §22①
    case "trademark":     return { base: originDate, years: 10 }; // 상표법 §42①(설정등록일)
    case "design":        return { base: originDate, years: 20 }; // 디자인보호법 §91①(구법 15년 SCOPE_OUT)
    case "copyright":     return { base: authorDeathDate, years: 70 }; // 저작권법 §39①(구 50년 SCOPE_OUT)
  }
}

/**
 * 무체재산권 잔존연수 도출 (상증규 §19③) — 엔진 단일진실.
 * UI useMemo·lib/calc inject·validate 공용 import (dual-truth 금지).
 * override 우선. 잔존 = floor(만료 − 평가기준일), 20년 한도. (지상권 절상과 반대 — 규 §19③.)
 */
export function resolveIntangibleRemainingYears(p: {
  type: IntangibleIpType;
  originDate?: Date;
  authorDeathDate?: Date;
  override?: number;
  valuationDate: Date;
}): number {
  if (p.override != null) return Math.max(0, Math.min(20, Math.trunc(p.override)));
  const { base, years } = resolveIntangibleDurationYears(p.type, p.originDate, p.authorDeathDate);
  if (!base) return 0; // 미입력 — validate 차단
  const expiry = addYears(base, years); // 존속만료일
  if (expiry <= p.valuationDate) return 0; // 만료
  return Math.min(differenceInYears(expiry, p.valuationDate), 20); // floor + 20년 한도
}

const INTANGIBLE_INCOME_LABEL: Record<IntangibleIncomeMode, string> = {
  fixed: "미래 확정수입",
  avg3y: "직전 3년 평균",
  appraisal: "감정가액",
};

/**
 * 무체재산권 평가 (§64·령§59⑤·규§19). 각 연도 수입금액 → 잔존연수 10% 현가환산(BigInt Σfloor).
 * 잔존연수는 lib/calc에서 합성된 intangibleRemainingYears 소비. §64 1호 취득가액과 MAX.
 */
export function evaluateIntangibleIp(item: EstateItem): PropertyValuationResult {
  if (item.category !== "intangible_ip") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateIntangibleIp: 무체재산권 자산이 아닙니다.",
    );
  }

  // appraisal: Σ 미적용, 감정가액(규 §19④ 후단=§64 2호 하위). §64 1호 취득가액과 MAX(법 §64 본문 "큰 금액").
  if (item.intangibleIncomeMode === "appraisal") {
    const appraised = item.intangibleAppraisedValue ?? 0;
    const byCostA = item.intangibleAcquisitionCost ?? 0;
    const methodA: ValuationMethod = byCostA > appraised ? "acquisition_cost" : "appraisal";
    const valA = Math.max(appraised, byCostA);
    const bdA: CalculationStep[] = [
      { label: "감정가액 (상증규 §19④ 후단)", amount: appraised, lawRef: VALUATION.INTANGIBLE_IP },
    ];
    if (methodA === "acquisition_cost") {
      bdA.push({ label: "취득가액 − 감가상각비 (상증법 §64 1호, MAX 채택)", amount: byCostA, lawRef: VALUATION.INTANGIBLE_IP });
    }
    bdA.push({ label: "평가액", amount: valA });
    return {
      estateItemId: item.id,
      method: methodA,
      valuatedAmount: valA,
      breakdown: bdA,
      warnings: ["무체재산권 감정가액 — 2 이상 공신력 감정기관·전문가 평가 확인 권장"],
    };
  }

  // 각 연도 수입금액 (명시 분기 — silent fallback 금지)
  let income = 0;
  if (item.intangibleIncomeMode === "avg3y") {
    // prior3yYears는 validate 필수(≥1) — `?? 3` 자동 안분 금지 (no_silent_apportion_fallback)
    income = Math.floor((item.intangiblePrior3yIncomeTotal ?? 0) / (item.intangiblePrior3yYears ?? 1));
  } else if (item.intangibleIncomeMode === "fixed") {
    income = item.intangibleAnnualIncome ?? 0;
  }
  const years = Math.max(0, Math.min(20, Math.trunc(item.intangibleRemainingYears ?? 0)));

  // Σ floor(income × 10ⁿ / 11ⁿ) — 할인율 10% = 분수 11/10, 각 항 BigInt floor
  let sum = 0n;
  let num = 1n;
  let den = 1n;
  const incBig = BigInt(income);
  for (let n = 1; n <= years; n++) {
    num *= 10n;
    den *= 11n;
    sum += (incBig * num) / den;
  }
  const converted = Number(sum);

  // §64 1호 MAX (양방향) — method 라벨 일치
  const byCost = item.intangibleAcquisitionCost ?? 0;
  const method: ValuationMethod = byCost > converted ? "acquisition_cost" : "standard_price";
  const valuatedAmount = Math.max(converted, byCost);

  const modeLabel = item.intangibleIncomeMode
    ? INTANGIBLE_INCOME_LABEL[item.intangibleIncomeMode]
    : "미선택";
  const breakdown: CalculationStep[] = [
    { label: `각 연도 수입금액 (${modeLabel})`, amount: income, lawRef: VALUATION.INTANGIBLE_IP },
    {
      label: `잔존연수 ${years}년(20년 한도) · 할인율 10% 현재가치 환산 합계`,
      amount: converted,
      lawRef: VALUATION.INTANGIBLE_IP,
    },
  ];
  if (method === "acquisition_cost") {
    breakdown.push({
      label: "취득가액 − 감가상각비 (상증법 §64 1호, MAX 채택)",
      amount: byCost,
      lawRef: VALUATION.INTANGIBLE_IP,
    });
  }
  breakdown.push({ label: "평가액", amount: valuatedAmount });

  return {
    estateItemId: item.id,
    method,
    valuatedAmount,
    breakdown,
    warnings: ["무체재산권 보충적 평가 — 수입금액·존속기간·감정 여부 확인 권장"],
  };
}

