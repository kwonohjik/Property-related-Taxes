/**
 * 직전연도 종합부동산세상당액 계산 (세부담상한 — 종합부동산세법 시행령 §5②)
 *
 * 별지 제5호서식 부표("직전연도 종합부동산세상당액 계산서") 재현 모듈.
 * 직전연도 공시가격으로부터 직전연도 세법(공정시장가액비율·세율·기본공제)을 적용해
 * 재산세상당액 + 종합부동산세상당액을 산출한다.
 *
 * 시행령 §5② 축자 (KoreanLaw 2026-06-12):
 *   - 직전 연도 「지방세법」(§110③·§111③·§112①2호 제외)을 적용한 재산세액상당액
 *   - 직전 연도 종부세법(§10 제외)을 적용한 종부세액상당액
 *   - 1세대1주택자는 "직전 연도 과세기준일 현재 연령 및 주택 보유기간"을 적용 (재판정)
 *
 * G-5 (Min): 종부세법 §9③ 괄호 + 구 지방세법 §122 단서 — 당해연도 ⓐ(부과 재산세)의 상한.
 *   ⓐ = min(당해 표준세율 재산세, 직전 재산세상당액 × §122 구간 상한율).
 *
 * v1 범위: 직전연도 단일 주택군(일반/1세대1주택). 다주택 중과 직전연도는 직접입력 모드 사용.
 */

import { truncateToTenThousand } from "./tax-utils";
import { PROPERTY_CONST } from "./legal-codes";
import { getComprehensiveParams } from "./data/comprehensive-historical";
import { getPropertyFmrForProration } from "./data/comprehensive-historical";
import { calcHousingTax } from "./property-tax";
import { calcHousingTaxAmount } from "./comprehensive-tax";
import { getSeniorRate, getLongTermRate } from "./comprehensive-tax-helpers";
import { COMPREHENSIVE_CONST } from "./legal-codes";
import type {
  PreviousYearAutoInput,
  PreviousYearEquivalentResult,
} from "./types/comprehensive.types";

/**
 * 직전연도 종합부동산세상당액 계산.
 *
 * @param auto        직전연도 자동계산 입력 (공시가격·1주택 여부·연령·취득일)
 * @param currentYear 당해 과세귀속연도 (직전연도 = currentYear − 1)
 */
export function calcPreviousYearEquivalent(
  auto: PreviousYearAutoInput,
  currentYear: number,
): PreviousYearEquivalentResult {
  const py = currentYear - 1;
  const p = getComprehensiveParams(py);
  // 직전연도 과세기준일 = 직전연도 6월 1일 (연령·보유기간 재판정)
  const priorAssessmentDate = new Date(py, 5, 1);

  // ── (1) 재산세 공제 전 종부세액 ──
  // ② 공제금액 (1주택 시 추가공제 포함 합계)
  const basicDeduction = auto.isOneHouseOwner
    ? p.basicDeductionOneHouse
    : p.basicDeductionGeneral;
  // ③ 공정시장가액비율 (2021 = 0.95)
  const fairMarketRatio = p.fairMarketRatioHousing;
  // ④ 종부세 과세표준 = trunc10k(floor((① − ②) × ③))
  const afterDeduction = Math.max(auto.assessedValue - basicDeduction, 0);
  const taxBase = truncateToTenThousand(Math.floor(afterDeduction * fairMarketRatio));
  // ⑤⑥ 일반 누진세율 (v1: 단일 주택군 — 다주택 미지원)
  const { calculatedTax, appliedRate } = calcHousingTaxAmount(
    taxBase,
    p.housingBracketsGeneral,
  );

  // ── (2) 종합부동산세 상당액 ──
  // 직전연도 재산세 FMR (2021 1주택 특례 없음 → 60%, getPropertyFmrForProration이 분기)
  const propertyFMR = getPropertyFmrForProration(py, auto.isOneHouseOwner);
  // ⑦ 재산세상당액 = 직전연도 공시가격 표준세율 재산세 (전체)
  const propertyTaxBase = Math.floor(
    (auto.assessedValue * Math.round(propertyFMR * 100)) / 100,
  );
  const propertyTaxEquiv = calcHousingTax(
    propertyTaxBase,
    auto.assessedValue,
    false, // 표준세율 강제
  ).tax;
  // ⑧ 과세표준 표준세율 재산세액 = 과표 × FMR × 0.4% (분수 정수)
  const stdTaxNumerator = Math.floor(
    (taxBase * Math.round(propertyFMR * 100) * 4) / 100_000,
  );
  // ⑨ 총표준세율 재산세액 = ⑦ 동일 베이스
  const stdTaxDenominator = propertyTaxEquiv;
  // ⑩ 공제할 재산세액 = floor(⑦ × ⑧ / ⑨), ⑥ 상한
  const creditRaw =
    stdTaxDenominator > 0
      ? Math.floor((propertyTaxEquiv * stdTaxNumerator) / stdTaxDenominator)
      : 0;
  const creditAmount = Math.min(creditRaw, calculatedTax);
  // ⑥ − ⑩ (재산세 공제 후)
  const afterPropertyCredit = Math.max(calculatedTax - creditAmount, 0);
  // ⑪ 1세대1주택 세액공제 (직전연도 기준일 연령·보유기간 재판정)
  let oneHouseDeductionRate = 0;
  if (auto.isOneHouseOwner && auto.birthDate && auto.acquisitionDate) {
    const seniorRate = getSeniorRate(auto.birthDate, priorAssessmentDate);
    const longTermRate = getLongTermRate(auto.acquisitionDate, priorAssessmentDate);
    oneHouseDeductionRate = Math.min(
      seniorRate + longTermRate,
      COMPREHENSIVE_CONST.ONE_HOUSE_MAX_CREDIT_RATE,
    );
  }
  const oneHouseDeductionAmount = Math.floor(afterPropertyCredit * oneHouseDeductionRate);
  // ⑫ 종합부동산세 상당액 = ⑥ − ⑩ − ⑪
  const comprehensiveTaxEquiv = Math.max(afterPropertyCredit - oneHouseDeductionAmount, 0);

  return {
    propertyTaxEquiv,
    comprehensiveTaxEquiv,
    total: propertyTaxEquiv + comprehensiveTaxEquiv,
    detail: {
      assessedValue: auto.assessedValue,
      basicDeduction,
      fairMarketRatio,
      taxBase,
      appliedRate,
      calculatedTax,
      stdTaxNumerator,
      stdTaxDenominator,
      creditAmount,
      oneHouseDeductionRate,
      oneHouseDeductionAmount,
      propertyFairMarketRatio: propertyFMR, // 교재 ⑤나 "× 60%" echo
      propertyTaxBaseAmount: propertyTaxBase, // 교재 ⑤나 "= 8.4억" echo
    },
  };
}

/**
 * 당해연도 ⓐ(부과 재산세) Min 상한율 — 구 지방세법 §122 단서 (공시가격 구간).
 * 직전연도 자동계산 모드에서 ⓐ = min(표준세율 재산세, 직전 재산세상당 × pct/100)에 사용.
 *
 * @returns 상한율(%) 또는 null (2024+ 폐지 — Min 미적용)
 */
export function getHousingTaxCapPct(
  assessmentYear: number,
  assessedValue: number,
): number | null {
  if (assessmentYear >= PROPERTY_CONST.HOUSING_TAX_CAP_ABOLISHED_YEAR) return null;
  if (assessedValue <= PROPERTY_CONST.HOUSING_TAX_CAP_BRACKET_1) {
    return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_1;
  }
  if (assessedValue <= PROPERTY_CONST.HOUSING_TAX_CAP_BRACKET_2) {
    return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_2;
  }
  return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_3;
}
