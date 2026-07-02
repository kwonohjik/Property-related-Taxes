/**
 * 종합부동산세 과세연도별 세법 파라미터 (정적 상수 테이블)
 *
 * 종합부동산세는 연도별로 기본공제·세율·공정시장가액비율·세부담상한이 크게 개정됨.
 * `assessmentYear`로 해당 연도 파라미터를 조회 → 엔진이 소비.
 *
 * 출처 (KoreanLaw MCP + 국세청 「2022 귀속 종합부동산세 계산 사례」 실측 교차검증):
 *   - 기본공제 §8①: 2022 일반 6억/1세대1주택 11억 → 2023~ 9억/12억 (사례1·4 실측)
 *   - 공정시장가액비율 시행령 §2의4: 2021 95% / 2022~ 주택 60%·토지 100% (사례집 pdf36 표)
 *   - 주택 세율 §9①: 구간 3/6/12/50/94억 (사례집 pdf38 국세청 공식표 300dpi 실측)
 *       · 2021·2022 일반 0.6~3.0% / 다주택 1.2~6.0%
 *       · 2023~ §9①1호(2주택↓) 0.5~2.7% / §9①2호(3주택↑) 12억 초과 중과 2.0~5.0%
 *   - 세부담상한 §10: 2022 이하 일반 150%·조정다주택/3주택+ 300% / 2023~ 단일 150%
 *
 * 정적 데이터 정책: memory feedback_historical_tax_tables (개정 없는 역사 확정값은 정적 상수).
 */

import type { ComprehensiveBracket } from "../types/comprehensive.types";
import { PROPERTY_CONST } from "../legal-codes";

export interface ComprehensiveYearParams {
  /** 과세귀속연도 (assessmentYear). "default" = 2023 이상 현행 */
  year: number | "default";

  // ── 기본공제 (§8①) ──
  basicDeductionGeneral: number;     // 일반
  basicDeductionOneHouse: number;    // 1세대1주택자

  // ── 공정시장가액비율 (시행령 §2의4) ──
  fairMarketRatioHousing: number;    // 주택분 (0~1)
  fairMarketRatioLand: number;       // 토지분 (0~1)

  // ── 주택분 세율 (§9①) ──
  /** 일반(2주택 이하, §9①1호) */
  housingBracketsGeneral: ComprehensiveBracket[];
  /**
   * 다주택 세율. 연도별 의미 상이:
   *   ≤2022: 조정대상지역 2주택 OR 3주택 이상 (구 §9①3호)
   *   2023+: 3주택 이상 (§9①2호 — 12억 초과 구간부터 중과)
   */
  housingBracketsMulti: ComprehensiveBracket[];

  // ── 세부담 상한 (§10) ──
  taxCapRateGeneral: number;                   // 1.5
  /** 조정다주택/3주택+ 상한율. 2023+ undefined (구 §10② 삭제 — 단일 150%) */
  taxCapRateMultiHouseAdjusted?: number;       // 3.0 (≤2022)

  // ── 법인 단일세율 (§9②3호 — corporate_special) ──
  /**
   * §9②3호 가목: 2주택 이하 법인 단일세율.
   *   2021·2022 구법 §9②: 1천분의 30 (3.0%)
   *   2023~   현행 §9②3호 가목: 1천분의 27 (2.7%)
   *
   * 나목(3주택+ 또는 ≤2022 조정 2주택) 판정은 isMultiHouseRate() 재사용.
   * 출처: KoreanLaw MCP 구법·현행 §9② 축자 + 국세청 2022 사례집 pdf38 법인 열 실측
   */
  corporateRate2HouseOrLess: number;   // 0.030 (≤2022) / 0.027 (2023~)
  /**
   * §9②3호 나목: 3주택 이상(또는 ≤2022 조정대상지역 2주택) 법인 단일세율.
   *   2021·2022 구법 §9②: 1천분의 60 (6.0%)
   *   2023~   현행 §9②3호 나목: 1천분의 50 (5.0%)
   */
  corporateRate3HouseOrMore: number;   // 0.060 (≤2022) / 0.050 (2023~)
}

// ============================================================
// 세율 구간 — 국세청 공식표(사례집 pdf38) + KoreanLaw §9① 실측
// ============================================================

/** 2021·2022 일반(2주택 이하) — 사례1(0.6%)·사례13 21년분(0.8%−60만)·사례4(1.2%−300만) 실측 + 경계검산 */
const BRACKETS_PRE2023_GENERAL: ComprehensiveBracket[] = [
  { limit: 300_000_000,   rate: 0.006, deduction: 0 },
  { limit: 600_000_000,   rate: 0.008, deduction: 600_000 },
  { limit: 1_200_000_000, rate: 0.012, deduction: 3_000_000 },
  { limit: 5_000_000_000, rate: 0.016, deduction: 7_800_000 },
  { limit: 9_400_000_000, rate: 0.022, deduction: 37_800_000 },
  { limit: Infinity,      rate: 0.030, deduction: 113_000_000 },
];

/** 2021·2022 다주택(조정 2주택 OR 3주택+) — 사례8(2.2%−480만)·사례9(3.6%−2,160만) 실측 + 경계검산 */
const BRACKETS_PRE2023_MULTI: ComprehensiveBracket[] = [
  { limit: 300_000_000,   rate: 0.012, deduction: 0 },
  { limit: 600_000_000,   rate: 0.016, deduction: 1_200_000 },
  { limit: 1_200_000_000, rate: 0.022, deduction: 4_800_000 },
  { limit: 5_000_000_000, rate: 0.036, deduction: 21_600_000 },
  { limit: 9_400_000_000, rate: 0.050, deduction: 91_600_000 },
  { limit: Infinity,      rate: 0.060, deduction: 185_600_000 },
];

/** 2023~ 현행 §9①1호 (2주택 이하) — 기존 comprehensive-tax.ts HOUSING_BRACKETS와 동일 */
const BRACKETS_2023_GENERAL: ComprehensiveBracket[] = [
  { limit: 300_000_000,   rate: 0.005, deduction: 0 },
  { limit: 600_000_000,   rate: 0.007, deduction: 600_000 },
  { limit: 1_200_000_000, rate: 0.010, deduction: 2_400_000 },
  { limit: 2_500_000_000, rate: 0.013, deduction: 6_000_000 },
  { limit: 5_000_000_000, rate: 0.015, deduction: 11_000_000 },
  { limit: 9_400_000_000, rate: 0.020, deduction: 36_000_000 },
  { limit: Infinity,      rate: 0.027, deduction: 101_800_000 },
];

/**
 * 2023~ 현행 §9①2호 (3주택 이상) — KoreanLaw §9① 실측.
 * 12억까지는 1호와 동일(0.5/0.7/1.0), 12억 초과부터 중과(2.0/3.0/4.0/5.0).
 * 누진공제는 경계 연속성으로 산출: 12억 경계값 960만 = 2.0%×12억−base → base 1,440만 (KoreanLaw §9① 별표 역산 일치).
 */
const BRACKETS_2023_MULTI: ComprehensiveBracket[] = [
  { limit: 300_000_000,   rate: 0.005, deduction: 0 },
  { limit: 600_000_000,   rate: 0.007, deduction: 600_000 },
  { limit: 1_200_000_000, rate: 0.010, deduction: 2_400_000 },
  { limit: 2_500_000_000, rate: 0.020, deduction: 14_400_000 },
  { limit: 5_000_000_000, rate: 0.030, deduction: 39_400_000 },
  { limit: 9_400_000_000, rate: 0.040, deduction: 89_400_000 },
  { limit: Infinity,      rate: 0.050, deduction: 183_400_000 },
];

// ============================================================
// 연도별 파라미터 테이블
// ============================================================

const YEAR_PARAMS: readonly ComprehensiveYearParams[] = [
  {
    year: 2021,
    basicDeductionGeneral: 600_000_000,
    basicDeductionOneHouse: 1_100_000_000,
    fairMarketRatioHousing: 0.95,
    fairMarketRatioLand: 0.95,
    housingBracketsGeneral: BRACKETS_PRE2023_GENERAL,
    housingBracketsMulti: BRACKETS_PRE2023_MULTI,
    taxCapRateGeneral: 1.5,
    taxCapRateMultiHouseAdjusted: 3.0,
    corporateRate2HouseOrLess: 0.030,
    corporateRate3HouseOrMore: 0.060,
  },
  {
    year: 2022,
    basicDeductionGeneral: 600_000_000,
    basicDeductionOneHouse: 1_100_000_000,
    fairMarketRatioHousing: 0.60,
    fairMarketRatioLand: 1.00,
    housingBracketsGeneral: BRACKETS_PRE2023_GENERAL,
    housingBracketsMulti: BRACKETS_PRE2023_MULTI,
    taxCapRateGeneral: 1.5,
    taxCapRateMultiHouseAdjusted: 3.0,
    corporateRate2HouseOrLess: 0.030,
    corporateRate3HouseOrMore: 0.060,
  },
  {
    year: "default", // 2023 이상
    basicDeductionGeneral: 900_000_000,
    basicDeductionOneHouse: 1_200_000_000,
    fairMarketRatioHousing: 0.60,
    fairMarketRatioLand: 1.00,
    housingBracketsGeneral: BRACKETS_2023_GENERAL,
    housingBracketsMulti: BRACKETS_2023_MULTI,
    taxCapRateGeneral: 1.5,
    taxCapRateMultiHouseAdjusted: undefined, // 구 §10② 삭제
    corporateRate2HouseOrLess: 0.027,
    corporateRate3HouseOrMore: 0.050,
  },
];

/** 지원 연도 하한 (이 미만은 미지원 — 조용한 잘못된 계산 방지) */
export const COMPREHENSIVE_MIN_SUPPORTED_YEAR = 2021;

/** UI 연도 선택용 — 2021 ~ 현재연도 (현재연도는 호출부에서 보강 가능) */
export const COMPREHENSIVE_SUPPORTED_YEARS = [2021, 2022, 2023, 2024, 2025] as const;

/**
 * 과세귀속연도로 세법 파라미터 반환.
 * - 2021·2022: 전용 파라미터
 * - 2023 이상: "default"
 * - 2021 미만(미지원): default 적용 + isSupported=false (호출부가 경고 처리)
 */
export function getComprehensiveParams(assessmentYear: number): ComprehensiveYearParams {
  const exact = YEAR_PARAMS.find((p) => p.year === assessmentYear);
  if (exact) return exact;
  const def = YEAR_PARAMS.find((p) => p.year === "default");
  if (!def) throw new Error("종합부동산세 default 파라미터 누락");
  return def;
}

/** 지원 연도 여부 (2021 미만은 미지원 — 엔진 warnings용) */
export function isComprehensiveYearSupported(assessmentYear: number): boolean {
  return assessmentYear >= COMPREHENSIVE_MIN_SUPPORTED_YEAR;
}

/**
 * 재산세 비율 안분 공제(§9③·시행령 §4의3)의 재산세 공정시장가액비율 — 연도·1세대1주택 분기.
 *
 * 지방세법 시행령 §109①2호 단서 (KoreanLaw 행위시법 축자 확정):
 *   - 2022년도 1세대1주택(시가표준액 9억 초과 포함): 100분의 45 (제32747호, 단일 비율)
 *   - 2024·2025·2026년도 1세대1주택: 구간별 43/44/45 (calcTaxBase가 실세액에 적용).
 *     안분공제는 종부세 과세 1주택(공시 12억 초과)에서만 유효한데, 12억 초과는 필연적으로
 *     6억 초과 구간이므로 재산세 실세액 FMR은 항상 45%. 안분 factor도 45%로 일치시켜
 *     재산세 실세액(경로1, calcTaxBase)과 안분 factor(경로2, 본 함수)의 FMR 비대칭
 *     (이중과세조정 과소공제 → 결정세액 과다)을 제거한다.
 *   - 그 외 (2021·2023 또는 다주택·법인): 100분의 60 (본문)
 *
 * @param assessmentYear 과세귀속연도
 * @param isOneHouseSingle 1세대1주택자이면서 주택 수가 정확히 1채 (재산세 특례 게이트와 동일)
 */
export function getPropertyFmrForProration(
  assessmentYear: number,
  isOneHouseSingle: boolean,
): number {
  if (assessmentYear === PROPERTY_CONST.ONE_HOUSE_FMR_2022_YEAR && isOneHouseSingle) {
    return PROPERTY_CONST.ONE_HOUSE_FMR_2022_RATIO; // 0.45
  }
  if (
    isOneHouseSingle &&
    PROPERTY_CONST.ONE_HOUSE_FMR_BRACKET_YEARS.includes(assessmentYear)
  ) {
    return PROPERTY_CONST.ONE_HOUSE_FMR_RATIO_3; // 0.45 (>6억 구간 = 종부세 과세영역과 일치)
  }
  return PROPERTY_CONST.FAIR_MARKET_RATIO_HOUSING; // 0.60
}

/**
 * 다주택 중과세율 적용 여부 판정 (2축):
 *   ≤2022: 조정대상지역 2주택(isMultiHouseInAdjustedArea) OR 3주택 이상
 *   2023+: 3주택 이상 (조정지역 무관)
 *
 * @param taxableHouseCount 합산배제 제외 후 과세대상 주택 수
 */
export function isMultiHouseRate(
  assessmentYear: number,
  taxableHouseCount: number,
  isMultiHouseInAdjustedArea: boolean,
): boolean {
  if (assessmentYear <= 2022) {
    return taxableHouseCount >= 3 || isMultiHouseInAdjustedArea;
  }
  return taxableHouseCount >= 3;
}
