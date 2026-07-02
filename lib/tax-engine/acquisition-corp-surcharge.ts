/**
 * 취득세 법인·공장 중과 모듈 — 지방세법 §13①②
 *
 * [P2-2] 법인 본점·주사무소 신증축, 대도시 법인 5년 이내, 비도시형 공장 중과
 *
 * 중과 구조:
 *   §13① 본점·주사무소 신증축: 표준세율 + 4%p
 *   §13② 대도시 법인 5년 이내: 표준세율 × 3 - 4%p
 *   §13① + §13② 중복 (본점·공장 + 대도시) = §13⑥: 표준세율 × 3
 *   §13⑦ 사치성(§13⑤) + 대도시 법인(§13②) 중복: (주택 외) 표준세율 × 3 + 4%p (luxury.ts에서 처리)
 *
 * [v4 D8] §13②단서 vs §13의2① 1호 단서 구분:
 *   §13② 단서: 사회기반시설·은행업·해외건설·주택건설·전기통신·첨단기술·유통·운송·국가출자20%+ 9종
 *   §13의2① 1호 단서: 시행령 §28의2 8호 나목 5종만 (주택건설사업자 등)
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";

// ============================================================
// 중과제외업종 열거 (§13②단서 — 9종)
// ============================================================

/**
 * 대도시 법인 중과 제외 업종 (지방세법 §13②단서)
 *
 * 아래 9종은 §13②(대도시 법인 5년 이내 중과)에서 제외.
 * 단, §13의2(다주택·법인 주택 중과) 단서와 혼동 금지.
 */
export type ExcludedBusinessType =
  | "infrastructure"      // 사회기반시설 사업자
  | "bank"                // 은행업
  | "overseas_construction" // 해외건설업
  | "housing_construction"  // 주택건설사업 (주택법 §4)
  | "telecom"             // 전기통신업
  | "high_tech"           // 첨단기술산업
  | "distribution"        // 유통산업
  | "transport"           // 운송사업
  | "gov_funded";         // 국가·지방자치단체 출자 20% 이상 법인

// ============================================================
// 비도시형 공장 구성요소
// ============================================================

/**
 * 비도시형 공장 취득 구성 (§13① 공장 중과 시 토지·건물 분리)
 *
 * - land:     토지 취득 (매매 4% + 4%p = 8%)
 * - building: 건물 원시취득 (신축 2.8% + 4%p = 6.8%)
 * - combined: 토지·건물 일체 취득 (실무상 분리 입력 권장)
 */
export type FactoryComponent = "land" | "building" | "combined";

// ============================================================
// 법인 중과 입력 타입
// ============================================================

export interface CorpSurchargeInput {
  /** 기본세율 (물건·취득원인별) */
  basicRate: number;
  /** 취득자 유형 */
  acquiredBy: string;
  /** 과밀억제권역 소재 여부 (수도권정비계획법 §6①1호) */
  isMetropolitanCongestion?: boolean;
  /** 본점·주사무소 신증축 용도 여부 (§13①1호) */
  isHeadquarterNewBuild?: boolean;
  /** 비도시형 공장 신증설 여부 (§13①2호 — 산업단지 외) */
  isNonUrbanFactory?: boolean;
  /** 비도시형 공장 구성요소 (토지/건물 분리 적용) */
  factoryComponent?: FactoryComponent;
  /** 법인 설립·대도시 전입 후 5년 이내 여부 (§13② 기산점) */
  isWithin5YearsOfEstablishment?: boolean;
  /** 중과제외업종 해당 여부 (§13②단서) */
  excludedBusinessType?: ExcludedBusinessType;
  /** 휴면법인 인수 여부 (과점주주 도달 시점 = 설립 시점으로 기산) */
  isDormantCorpAcquisition?: boolean;
  /** 물건 유형 (주택 여부 판단) */
  propertyType: string;
}

// ============================================================
// 법인 중과 결과 타입
// ============================================================

export interface CorpSurchargeResult {
  /** 중과 적용 여부 */
  isSurcharged: boolean;
  /** 적용 세율 */
  surchargeRate?: number;
  /**
   * 중과 유형 식별자
   * - headquarters_new_build: §13① 본점·주사무소 신증축
   * - metro_corp_5yr: §13② 대도시 법인 5년 이내
   * - headquarters_metro_combined: §13①+§13② 중복 (표준세율 × 3)
   * - factory_land: §13① 공장 토지 8%
   * - factory_building: §13① 공장 건물 신축 6.8%
   * - excluded: 중과제외업종 해당
   * - not_applicable: 해당 없음
   */
  surchargeType:
    | "headquarters_new_build"
    | "metro_corp_5yr"
    | "headquarters_metro_combined"
    | "factory_land"
    | "factory_building"
    | "excluded"
    | "not_applicable";
  /** 중과 추가 세율 (addRate) — surchargeRate = basicRate + addRate (또는 multiplier 적용) */
  addRate?: number;
  /** 안내 메시지 */
  reason: string;
  /** 법적 근거 */
  legalBasis: string[];
  /** 경고·안내 */
  warnings: string[];
  /**
   * §15 세율특례 적용 배제 여부
   * §13① 본점·공장 중과 대상이면 §15 특례 배제
   */
  excludesSpecialRate: boolean;
  /**
   * §13② 대도시 법인 중과 컨텍스트 여부
   * §15와 §13② 동시 적용 시 특례 산식 변경에 사용
   */
  isCorpMetroContext: boolean;
}

// ============================================================
// 메인 함수: assessCorpSurcharge
// ============================================================

/**
 * 법인 취득세 중과 판정 (§13①②)
 *
 * 순수 함수 — DB 직접 호출 없음.
 *
 * 판단 순서:
 * 1. 법인 취득자가 아닌 경우 → 해당 없음
 * 2. 중과제외업종 해당 → 배제
 * 3. 비도시형 공장 신증설 (§13①2호)
 *    - 토지: 4% + 4%p = 8%
 *    - 건물 신축: 2.8% + 4%p = 6.8%
 * 4. 본점·주사무소 신증축 + 대도시 동시 (§13①1호 + §13②)
 *    - 표준세율 × 3 (가중 중과)
 * 5. 본점·주사무소 신증축 단독 (§13①1호)
 *    - 표준세율 + 4%p
 * 6. 대도시 법인 5년 이내 (§13②)
 *    - 표준세율 × 3 - 4%p
 *    - 휴면법인: 과점주주 도달 시점을 설립 시점으로 기산
 */
export function assessCorpSurcharge(input: CorpSurchargeInput): CorpSurchargeResult {
  const warnings: string[] = [];

  // 1. 법인 취득자 확인
  if (input.acquiredBy !== "corporation") {
    return noSurcharge("개인(individual) 취득 — §13① §13② 법인 중과 미적용", false, false);
  }

  // 2. 중과제외업종 해당 → §13② 배제
  // (단, §13①은 업종 제외 없음 — 본점/공장은 업종 무관)
  const hasExcludedBusiness = !!input.excludedBusinessType;

  // 3. 비도시형 공장 신증설 (§13①2호)
  // 과밀억제권역과 무관 (산업단지 외 비도시형 공장)
  if (input.isNonUrbanFactory) {
    const component = input.factoryComponent ?? "combined";

    if (component === "land") {
      // 공장 토지: 매매 표준세율 4% + 4%p = 8%
      const surchargeRate = input.basicRate + ACQUISITION_CONST.HEADQUARTERS_SURCHARGE_EXTRA;
      return {
        isSurcharged: true,
        surchargeRate,
        surchargeType: "factory_land",
        addRate: ACQUISITION_CONST.HEADQUARTERS_SURCHARGE_EXTRA,
        reason: `비도시형 공장 토지 취득 — §13①2호 중과: ${(input.basicRate * 100).toFixed(1)}% + 4%p = ${(surchargeRate * 100).toFixed(1)}%`,
        legalBasis: [ACQUISITION.FACTORY_SURCHARGE],
        warnings,
        excludesSpecialRate: true, // §13① 중과 대상 → §15 배제
        isCorpMetroContext: false,
      };
    }

    if (component === "building") {
      // 공장 건물 신축: 원시취득 표준세율 2.8% + 4%p = 6.8%
      const surchargeRate = input.basicRate + ACQUISITION_CONST.HEADQUARTERS_SURCHARGE_EXTRA;
      return {
        isSurcharged: true,
        surchargeRate,
        surchargeType: "factory_building",
        addRate: ACQUISITION_CONST.HEADQUARTERS_SURCHARGE_EXTRA,
        reason: `비도시형 공장 건물 원시취득 — §13①2호 중과: ${(input.basicRate * 100).toFixed(1)}% + 4%p = ${(surchargeRate * 100).toFixed(1)}%`,
        legalBasis: [ACQUISITION.FACTORY_SURCHARGE],
        warnings,
        excludesSpecialRate: true,
        isCorpMetroContext: false,
      };
    }

    // combined: 토지·건물 함께 취득 시 일반적으로 건물 원시취득 기준
    const surchargeRate = input.basicRate + ACQUISITION_CONST.HEADQUARTERS_SURCHARGE_EXTRA;
    warnings.push("공장 토지·건물 분리 입력 권장 — 현재 건물 원시취득 기준 세율 적용");
    return {
      isSurcharged: true,
      surchargeRate,
      surchargeType: "factory_building",
      addRate: ACQUISITION_CONST.HEADQUARTERS_SURCHARGE_EXTRA,
      reason: `비도시형 공장 일체 취득 — §13①2호 중과: 건물 원시취득 기준 ${(surchargeRate * 100).toFixed(1)}%`,
      legalBasis: [ACQUISITION.FACTORY_SURCHARGE],
      warnings,
      excludesSpecialRate: true,
      isCorpMetroContext: false,
    };
  }

  // 4. 본점·주사무소 신증축 확인 (§13①1호)
  // 과밀억제권역 소재 + 본점·주사무소 신증축 = §13①1호 해당
  const isHeadquarterSurcharge =
    !!input.isHeadquarterNewBuild && !!input.isMetropolitanCongestion;

  // 5. 대도시 법인 5년 이내 확인 (§13②)
  // 과밀억제권역 소재 + 5년 이내 + 중과제외업종 아님
  const isMetroCorpSurcharge =
    !!input.isMetropolitanCongestion &&
    !!input.isWithin5YearsOfEstablishment &&
    !hasExcludedBusiness;

  // 휴면법인 안내
  if (input.isDormantCorpAcquisition) {
    warnings.push(
      "휴면법인 인수: 과점주주 도달 시점이 법인 설립 시점으로 간주되어 " +
      "5년 기산이 소급 적용될 수 있습니다 (지방세법 §13② 해석)."
    );
  }

  // 중과제외업종 안내 (§13② 배제 but §13① 여전히 적용 가능)
  if (hasExcludedBusiness && input.isWithin5YearsOfEstablishment) {
    warnings.push(
      `중과제외업종(${input.excludedBusinessType}) 해당 — §13②(대도시 법인) 중과 배제 (${ACQUISITION.METRO_CORP_EXCLUSION}).`
    );
  }

  // 6. §13① + §13② 중복: 표준세율 × 3 (가장 높은 중과)
  if (isHeadquarterSurcharge && isMetroCorpSurcharge) {
    const surchargeRate = input.basicRate * ACQUISITION_CONST.METRO_CORP_HQ_MULTIPLIER;
    return {
      isSurcharged: true,
      surchargeRate,
      surchargeType: "headquarters_metro_combined",
      reason: `본점·주사무소 신증축 + 대도시 법인 동시 중과: ${(input.basicRate * 100).toFixed(1)}% × 3 = ${(surchargeRate * 100).toFixed(1)}%`,
      legalBasis: [ACQUISITION.HEADQUARTERS_SURCHARGE, ACQUISITION.METRO_CORP_SURCHARGE],
      warnings,
      excludesSpecialRate: true, // §13① 포함 → §15 배제
      isCorpMetroContext: true,
    };
  }

  // 7. §13①1호 단독: 본점·주사무소 신증축 (표준세율 + 4%p)
  if (isHeadquarterSurcharge) {
    const surchargeRate = input.basicRate + ACQUISITION_CONST.HEADQUARTERS_SURCHARGE_EXTRA;
    return {
      isSurcharged: true,
      surchargeRate,
      surchargeType: "headquarters_new_build",
      addRate: ACQUISITION_CONST.HEADQUARTERS_SURCHARGE_EXTRA,
      reason: `과밀억제권역 내 본점·주사무소 신증축 — §13①1호 중과: ${(input.basicRate * 100).toFixed(1)}% + 4%p = ${(surchargeRate * 100).toFixed(1)}%`,
      legalBasis: [ACQUISITION.HEADQUARTERS_SURCHARGE],
      warnings,
      excludesSpecialRate: true,
      isCorpMetroContext: false,
    };
  }

  // 8-0. 주택 유상취득은 §13의2①(법인 주택 중과)이 전속 적용 → §13②(대도시 법인) 미적용.
  // §13②의 (표준세율×3 − 4%p) 산식을 주택 표준세율(1~3%)에 적용하면 음수→0%로 붕괴하므로
  // 반드시 배제하고, 다주택 중과(assessSurcharge §13의2)가 최종세율을 결정하도록 넘긴다.
  if (isMetroCorpSurcharge && input.propertyType === "housing") {
    warnings.push(
      "대도시 법인의 주택 유상취득은 §13②이 아닌 §13의2①(법인 주택 중과 12%)이 적용됩니다."
    );
    // isCorpMetroContext=true 유지: 고급주택 등 §13⑦(사치성+대도시법인) 판단에 필요.
    return noSurcharge(
      "대도시 법인 주택 취득 — §13의2① 적용 (§13② 미적용)",
      false,
      true
    );
  }

  // 8. §13②: 대도시 법인 5년 이내 (표준세율 × 3 - 4%p) — 주택 외 부동산
  if (isMetroCorpSurcharge) {
    const multiplier = ACQUISITION_CONST.METRO_CORP_MULTIPLIER; // 3
    const deduction = ACQUISITION_CONST.METRO_CORP_DEDUCTION;   // 0.04
    const surchargeRate = Math.max(0, input.basicRate * multiplier - deduction);
    return {
      isSurcharged: true,
      surchargeRate,
      surchargeType: "metro_corp_5yr",
      reason: `대도시 내 법인 설립·전입 5년 이내 취득 — §13② 중과: ${(input.basicRate * 100).toFixed(1)}% × 3 - 4%p = ${(surchargeRate * 100).toFixed(1)}%`,
      legalBasis: [ACQUISITION.METRO_CORP_SURCHARGE],
      warnings,
      excludesSpecialRate: false, // §13②는 §15 배제 대상 아님
      isCorpMetroContext: true,
    };
  }

  // 해당 없음
  const reasons: string[] = [];
  if (!input.acquiredBy || input.acquiredBy !== "corporation") {
    reasons.push("법인 아님");
  } else {
    if (!input.isMetropolitanCongestion) reasons.push("과밀억제권역 미해당");
    if (!input.isHeadquarterNewBuild) reasons.push("본점·주사무소 신증축 아님");
    if (!input.isNonUrbanFactory) reasons.push("비도시형 공장 아님");
    if (!input.isWithin5YearsOfEstablishment) reasons.push("5년 이내 아님");
    if (hasExcludedBusiness) reasons.push(`중과제외업종(${input.excludedBusinessType})`);
  }

  return noSurcharge(`§13①②법인 중과 미해당 (${reasons.join(", ")})`, false, false);
}

// ============================================================
// 내부 헬퍼
// ============================================================

function noSurcharge(
  reason: string,
  excludesSpecialRate: boolean,
  isCorpMetroContext: boolean
): CorpSurchargeResult {
  return {
    isSurcharged: false,
    surchargeType: "not_applicable",
    reason,
    legalBasis: [],
    warnings: [],
    excludesSpecialRate,
    isCorpMetroContext,
  };
}
