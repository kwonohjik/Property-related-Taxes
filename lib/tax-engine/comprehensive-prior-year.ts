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

import { truncateToTenThousand, safeMulDivRound } from "./tax-utils";
import { PROPERTY_CONST } from "./legal-codes";
import { getComprehensiveParams } from "./data/comprehensive-historical";
import { getPropertyFmrForProration } from "./data/comprehensive-historical";
import { isMultiHouseRate } from "./data/comprehensive-historical";
import { calcHousingTax } from "./property-tax";
import { calcHousingTaxAmount } from "./comprehensive-tax";
import { getSeniorRate, getLongTermRate, applyEffectiveFactor } from "./comprehensive-tax-helpers";
import { COMPREHENSIVE_CONST } from "./legal-codes";
import type {
  PreviousYearAutoInput,
  PreviousYearEquivalentResult,
} from "./types/comprehensive.types";

/**
 * 직전연도 종합부동산세상당액 계산.
 *
 * @param auto        직전연도 자동계산 입력 (공시가격·1주택 여부·연령·취득일·감면율)
 * @param currentYear 당해 과세귀속연도 (직전연도 = currentYear − 1)
 *
 * 법령 원칙3: 세부담상한 직전연도 상당액 계산 시, 직전연도 감면 여부와 무관하게
 * "해당연도 감면비율"을 적용한다 (교재 사례2 ④나① 1,530,000 × (1−25%) = 1,147,500).
 * → auto.reductionRate에 해당연도 감면율을 전달할 것 (PreviousYearAutoInput.reductionRate).
 */
export function calcPreviousYearEquivalent(
  auto: PreviousYearAutoInput,
  currentYear: number,
): PreviousYearEquivalentResult {
  const py = currentYear - 1;
  const p = getComprehensiveParams(py);
  // 직전연도 과세기준일 = 직전연도 6월 1일 (연령·보유기간 재판정)
  const priorAssessmentDate = new Date(py, 5, 1);

  // D-4 (D 지점): 감면율·지분율 결합 effectiveFactor 적용
  // 직전연도 공시가격에 해당연도 감면율+지분율을 effectiveFactor로 결합 (종부세 과표·②ⓒ분모용)
  const rate = auto.reductionRate ?? 0;
  const ratio = auto.ownershipRatio;
  // 직전 주택군 — priorHouseValues 우선, 미입력 시 [assessedValue] 단일(하위호환).
  // priorSum = 종부세 과표·ⓑ분모용 합산(단일 원천 — assessedValue와의 이중 입력 불일치 차단).
  const priorHouses =
    auto.priorHouseValues && auto.priorHouseValues.length > 0
      ? auto.priorHouseValues
      : [auto.assessedValue];
  const priorSum = priorHouses.reduce((a, b) => a + b, 0);
  const effectiveAssessedValue = applyEffectiveFactor(priorSum, rate, ratio);

  // ── (1) 재산세 공제 전 종부세액 ──
  // ② 공제금액 (1주택 시 추가공제 포함 합계)
  const basicDeduction = auto.isOneHouseOwner
    ? p.basicDeductionOneHouse
    : p.basicDeductionGeneral;
  // ③ 공정시장가액비율 (2021 = 0.95)
  const fairMarketRatio = p.fairMarketRatioHousing;
  // ④ 종부세 과세표준 = trunc10k(floor((감면후 ① − ②) × ③))
  // D 지점: effectiveAssessedValue 기준으로 taxBase 산정
  const afterDeduction = Math.max(effectiveAssessedValue - basicDeduction, 0);
  const taxBase = truncateToTenThousand(Math.floor(afterDeduction * fairMarketRatio));
  // ⑤⑥ 누진세율 — 직전연도 다주택 중과 분기 (시행령 §5② 직전연도 세법 적용)
  //   조정 2주택(≤2022) 또는 3주택 이상 → housingBracketsMulti. 미입력 = 일반(하위호환).
  const houseCount =
    auto.taxableHouseCount ?? auto.priorHouseValues?.length ?? 1;
  const useMulti = isMultiHouseRate(
    py,
    houseCount,
    auto.isMultiHouseInAdjustedArea ?? false,
  );
  const { calculatedTax, appliedRate } = calcHousingTaxAmount(
    taxBase,
    useMulti ? p.housingBracketsMulti : p.housingBracketsGeneral,
  );

  // ── (2) 종합부동산세 상당액 ──
  // 직전연도 재산세 FMR (2021 1주택 특례 없음 → 60%, getPropertyFmrForProration이 분기)
  const propertyFMR = getPropertyFmrForProration(py, auto.isOneHouseOwner);
  // ⑦ 재산세상당액 = 직전연도 표준세율 재산세 (감면전 원공시 기준으로 먼저 산출)
  //   ★ 주택별 합산 — 누진세율이므로 합산 단일(priorSum) ≠ 주택별 합산. 교재 사례4 나① 4,740,000
  //     = 12억(2,250,000) + 13억(2,490,000). 단일 25억(5,370,000) 아님.
  //   C 지점: 표준세율 산출 후 × factor = 감면후 재산세상당액 (교재 1,530,000 × 0.75 = 1,147,500)
  const propertyTaxEquivRaw = priorHouses.reduce((sum, v) => {
    const base = Math.floor((v * Math.round(propertyFMR * 100)) / 100);
    return sum + calcHousingTax(base, v, false).tax; // 표준세율 강제
  }, 0);
  // D-5 (C 지점): 지분·감면 결합 effectiveFactor 후 곱 (④나① = 표준세율 재산세 × factor)
  const propertyTaxEquiv = applyEffectiveFactor(propertyTaxEquivRaw, rate, ratio);

  // ②ⓒ 분모(총표준세율재산세액)도 감면후 유효 공시가격 기준 (D 지점 연쇄)
  // 교재 ④나②ⓑ 분모 = 990,000 = 6.75억 × 60% × 표준세율 (9억×(1−25%))
  const propertyTaxBase = Math.floor(
    (effectiveAssessedValue * Math.round(propertyFMR * 100)) / 100,
  );
  // ⑧ 과세표준 표준세율 재산세액 = 과표(종부세 과표) × FMR × 0.4% (분수 정수)
  const stdTaxNumerator = Math.floor(
    (taxBase * Math.round(propertyFMR * 100) * 4) / 100_000,
  );
  // ⑨ 총표준세율 재산세액 = 감면후 유효 공시기준 표준세율 재산세 (D 지점: effectiveAssessedValue 기준)
  const stdTaxDenominator = calcHousingTax(
    propertyTaxBase,
    effectiveAssessedValue,
    false, // 표준세율 강제
  ).tax;
  // ⑩ 공제할 재산세액 = round-half-up(propertyTaxEquiv × ⑧ / ⑨), ⑥ 상한 (§4의3 교재·실무 반올림)
  const creditRaw =
    stdTaxDenominator > 0
      ? safeMulDivRound(propertyTaxEquiv, stdTaxNumerator, stdTaxDenominator)
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
      assessedValue: priorSum,  // echo = 직전 공시 합산 (priorHouseValues 입력 시도 정확)
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
      propertyFairMarketRatio: propertyFMR,     // 교재 ⑤나 "× 60%" echo
      propertyTaxBaseAmount: propertyTaxBase,   // 교재 ⑤나 감면후 재산세 과세표준 echo
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
