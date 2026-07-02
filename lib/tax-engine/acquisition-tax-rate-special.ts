/**
 * 취득세 세율특례 모듈 — 지방세법 §15①
 *
 * 7종 세율특례 적용 순수 함수 (지방세법 §15①1호~7호).
 * DB 직접 호출 없음 — 매개변수로 basicRate 수신.
 *
 * § 15 세율특례 구조:
 *   "표준세율 - 중과기준세율(2%)" 을 기본으로,
 *   §13①(본점·공장 중과) 대상 시 §15 적용 배제,
 *   §13②(대도시 법인 중과) 동시 적용 시 "(표준세율 - 2%) × 3" 산식 적용.
 *
 * [v4 D8] §13①(본점·공장)와 §13②(대도시 법인)는 별개:
 *   §13① 대상 → §15 배제 (본문)
 *   §13② 대상 + §15 동시 → (표준세율 - 2%) × 3 (단서)
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";

// ============================================================
// 세율특례 타입 정의 (9종 enum)
// ============================================================

/**
 * 세율특례 사유 유형 (지방세법 §15①)
 *
 * - redemption:            §15①1호 — 환매등기 병행 부동산 매매의 환매
 * - inheritance_one_house: §15①2호 — 상속으로 인한 1가구 1주택·감면농지 취득
 * - corp_merger:           §15①3호 — 법인세법 §44②③ 적격합병으로 인한 취득
 * - co_ownership_split:    §15①4호 — 공유물·합유물 분할·공유권 해소 지분이전
 * - building_relocation:   §15①5호 — 건축물의 이전으로 인한 취득
 * - divorce_division:      §15①6호 — 민법상 재산분할로 인한 취득
 * - timber:                §15①7호 — 그 밖의 형식적 취득(시행령 §30①: 벌채용 입목)
 */
export type SpecialRateType =
  | "redemption"
  | "inheritance_one_house"
  | "corp_merger"
  | "co_ownership_split"
  | "building_relocation"
  | "divorce_division"
  | "timber";

// ============================================================
// 세율특례 적용 결과 타입
// ============================================================

export interface SpecialRateResult {
  /** 세율특례 적용 여부 */
  isApplied: boolean;
  /** 최종 적용 세율 (적용 후) */
  appliedRate: number;
  /** 특례 전 기본세율 */
  basicRate: number;
  /** 세율 결정 방식 */
  rateMode:
    | "no_special_rate"          // 세율특례 미적용 (특례 사유 없음)
    | "hq_surcharge_excluded"    // §13① 본점·공장 중과 대상 → §15 배제
    | "special_rate_solo"        // §15 단독 적용: basicRate - 2%
    | "special_rate_with_metro"; // §15 + §13② 동시: (basicRate - 2%) × 3
  /** 법적 근거 */
  legalBasis: string;
  /** 안내 메시지 */
  message: string;
}

// ============================================================
// 세율특례 적용 컨텍스트 (surchargeContext)
// ============================================================

export interface SpecialRateSurchargeContext {
  /**
   * §13②(대도시 법인 중과) 적용 여부
   * true이면 §15와 §13② 동시 적용 → (basicRate - 2%) × 3
   */
  isCorpMetro: boolean;
  /**
   * §13①(본점·공장 중과) 적용 여부
   * true이면 §15 적용 배제 → basicRate 그대로 유지
   */
  isHeadquarterOrFactorySurcharge: boolean;
  /**
   * §11①8에 따른 유상거래 주택 여부.
   * true이면 §15① 본문 단서에 따라 (basicRate − 2%)가 아니라 해당 세율 × 50%를 적용한다.
   * (예: §15①1호 환매로 취득한 유상거래 주택)
   */
  isOnerousHousing?: boolean;
}

// ============================================================
// §15 세율특례 법적 근거 매핑
// ============================================================

const SPECIAL_RATE_LEGAL_BASIS: Record<SpecialRateType, string> = {
  redemption:            ACQUISITION.SPECIAL_RATE_REDEMPTION,
  inheritance_one_house: ACQUISITION.SPECIAL_RATE_INHERITANCE_1HOUSE,
  corp_merger:           ACQUISITION.SPECIAL_RATE_CORP_MERGER,
  co_ownership_split:    ACQUISITION.SPECIAL_RATE_CO_OWNERSHIP_SPLIT,
  building_relocation:   ACQUISITION.SPECIAL_RATE_BUILDING_RELOCATION,
  divorce_division:      ACQUISITION.SPECIAL_RATE_DIVORCE_DIVISION,
  timber:                ACQUISITION.SPECIAL_RATE_TIMBER,
};

const SPECIAL_RATE_LABEL: Record<SpecialRateType, string> = {
  redemption:            "환매권 행사에 따른 취득",
  inheritance_one_house: "상속 1가구 1주택 취득",
  corp_merger:           "법인 합병에 따른 취득",
  co_ownership_split:    "공유물·합유물 분할에 따른 취득",
  building_relocation:   "건축물 이전에 따른 취득",
  divorce_division:      "이혼 재산분할에 따른 취득",
  timber:                "입목 취득(벌채용 원목)",
};

// ============================================================
// 메인 함수: applySpecialRate
// ============================================================

/**
 * 취득세 세율특례 §15 적용
 *
 * 순수 함수 — DB 직접 호출 없음. basicRate를 매개변수로 수신.
 *
 * 적용 규칙:
 * 1. specialRateType이 없으면 → 특례 미적용 (basicRate 그대로)
 * 2. §13①(본점·공장 중과) 대상 → §15 배제 (basicRate 그대로)
 * 3. §13②(대도시 법인) 동시 적용 → (basicRate - 2%) × 3
 * 4. 단독 §15 → basicRate - 2% (최소 0% 하한)
 *
 * @param basicRate     물건·취득원인별 기본세율 (0.01~0.04 등)
 * @param specialType   세율특례 사유 (undefined이면 미적용)
 * @param context       중과 컨텍스트 (§13① vs §13② 구분)
 * @returns             세율특례 적용 결과
 *
 * @example
 * // 상속 1가구1주택 단독:
 * applySpecialRate(0.028, "inheritance_one_house", { isCorpMetro: false, isHQ: false })
 * // → appliedRate: 0.008 (0.8%)
 *
 * @example
 * // 상속 1가구1주택 + §13②(대도시 법인):
 * applySpecialRate(0.028, "inheritance_one_house", { isCorpMetro: true, isHQ: false })
 * // → appliedRate: 0.024 (2.4%) — 페이지 21 인용 1,000분의 24
 *
 * @example
 * // 합병 토지(대도시 법인):
 * applySpecialRate(0.04, "corp_merger", { isCorpMetro: true, isHQ: false })
 * // → appliedRate: 0.06 (6%) — (4% - 2%) × 3
 */
export function applySpecialRate(
  basicRate: number,
  specialType: SpecialRateType | undefined,
  context: SpecialRateSurchargeContext
): SpecialRateResult {
  // 1. 세율특례 사유 없음 → 미적용
  if (!specialType) {
    return {
      isApplied: false,
      appliedRate: basicRate,
      basicRate,
      rateMode: "no_special_rate",
      legalBasis: ACQUISITION.BASIC_RATE,
      message: "세율특례 사유 없음 — 표준세율 적용",
    };
  }

  const label = SPECIAL_RATE_LABEL[specialType];
  const legalBasis = SPECIAL_RATE_LEGAL_BASIS[specialType];

  // 2. §13①(본점·공장 중과) 대상 → §15 적용 배제
  // 지방세법 §15 본문 단서: "§13① 중과세율이 적용되는 경우에는 그 중과세율 적용"
  if (context.isHeadquarterOrFactorySurcharge) {
    return {
      isApplied: false,
      appliedRate: basicRate,
      basicRate,
      rateMode: "hq_surcharge_excluded",
      legalBasis: ACQUISITION.HEADQUARTERS_SURCHARGE,
      message: `${label} — §13①(본점·공장 중과) 적용 대상이므로 §15 세율특례 배제 (지방세법 §15 단서)`,
    };
  }

  // §11①8 유상거래 주택은 §15① 본문 단서: 해당 세율 × 50% (예: 환매 주택)
  const isOnerousHousing = context.isOnerousHousing === true;

  // 3. §13②(대도시 법인 중과) 동시 적용
  // §15① 단서: 비주택 (표준세율 − 2%) × 300% / 주택 §11①8 (해당세율 × 50%) × 300%
  if (context.isCorpMetro) {
    const multiplier = ACQUISITION_CONST.SPECIAL_RATE_WITH_METRO_MULTIPLIER; // 3
    const baseSpecial = isOnerousHousing
      ? basicRate * 0.5
      : Math.max(0, basicRate - ACQUISITION_CONST.SPECIAL_RATE_REDUCTION);
    const appliedRate = baseSpecial * multiplier;

    return {
      isApplied: true,
      appliedRate,
      basicRate,
      rateMode: "special_rate_with_metro",
      legalBasis: `${legalBasis} + ${ACQUISITION.SPECIAL_RATE_WITH_METRO_CORP}`,
      message: isOnerousHousing
        ? `${label} + §13②(대도시 법인) 동시 적용: (${(basicRate * 100).toFixed(1)}% × 50%) × 3 = ${(appliedRate * 100).toFixed(4).replace(/\.?0+$/, "")}%`
        : `${label} + §13②(대도시 법인) 동시 적용: (${(basicRate * 100).toFixed(1)}% - 2%) × 3 = ${(appliedRate * 100).toFixed(4).replace(/\.?0+$/, "")}%`,
    };
  }

  // 4. §15 단독 적용: 주택 §11①8 → 해당세율 × 50% / 그 외 → basicRate − 2% (최소 0%)
  const appliedRate = isOnerousHousing
    ? basicRate * 0.5
    : Math.max(0, basicRate - ACQUISITION_CONST.SPECIAL_RATE_REDUCTION);

  return {
    isApplied: true,
    appliedRate,
    basicRate,
    rateMode: "special_rate_solo",
    legalBasis,
    message: isOnerousHousing
      ? `${label} (유상거래 주택 §11①8): ${(basicRate * 100).toFixed(1)}% × 50% = ${(appliedRate * 100).toFixed(4).replace(/\.?0+$/, "")}%`
      : `${label}: ${(basicRate * 100).toFixed(1)}% - 2% = ${(appliedRate * 100).toFixed(4).replace(/\.?0+$/, "")}%`,
  };
}

// ============================================================
// 헬퍼: SpecialRateType 문자열 유효성 검사
// ============================================================

const VALID_SPECIAL_RATE_TYPES: ReadonlySet<string> = new Set<SpecialRateType>([
  "redemption",
  "inheritance_one_house",
  "corp_merger",
  "co_ownership_split",
  "building_relocation",
  "divorce_division",
  "timber",
]);

export function isValidSpecialRateType(value: string | undefined): value is SpecialRateType {
  if (!value) return false;
  return VALID_SPECIAL_RATE_TYPES.has(value);
}
