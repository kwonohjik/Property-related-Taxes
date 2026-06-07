/**
 * §23의2 동거주택상속공제 헬퍼 — Phase 2~3 (2026-06-07)
 *
 * 800줄 정책에 따라 inheritance-deductions.ts에서 분리.
 * inheritance-deductions.ts가 re-export → 외부 import 경로 무변경.
 *
 * 법령: 상증법 §23의2 + 소득세 시행령 §154⑦
 *   G5: 대상 상속인 범위 (2022.1.1. 개정 — 대습배우자 포함)
 *   G3: 동거연수 계산 (미성년 제외 2016.1.1.~ 시행)
 *   G4: 주택부수토지 면적한도 차감 (소득세 시행령 §154⑦ 배율)
 */

import { differenceInYears } from "date-fns";
import type { AncillaryLandRegion, Heir } from "../types/inheritance-gift.types";

// ============================================================
// G5: §23의2①1호 대상 상속인 적격성 판정
// ============================================================

/**
 * §23의2①1호 동거주택공제 대상 상속인 적격성 판정.
 *
 * 법령 근거 (KoreanLaw time_travel 20210101↔20220101 검증, 자수 755→787):
 *   ~2021.12.31.:  직계비속(child + 손자녀 legatee+isGenerationSkipBeneficiary=true)만 적격
 *   2022.1.1.~:   직계비속 + 민법§1003② 대습상속된 직계비속의 배우자도 적격
 *
 * 계약 C1: HeirRelation에 lineal_descendant 추가 금지.
 *   손자녀 = legatee + isGenerationSkipBeneficiary=true + isSubstituteInheritance≠true
 * 계약 C2: 대습상속 배우자 = relation="other" + isSubstituteInheritance=true (2022.1.1.~)
 *
 * @param heir 상속인 정보
 * @param deathDate 상속개시일 (YYYY-MM-DD). undefined 시 "9999-12-31" 가정 (2022 이후로 처리)
 * @returns 적격 여부
 */
export function isCohabitDeductionEligibleRelation(
  heir: Heir,
  deathDate: string | undefined,
): boolean {
  const d = deathDate ?? "9999-12-31";

  // 직계비속: child(자녀) + legatee 세대생략 손자녀 (대습 플래그 없는 순수 세대생략)
  // 전 기간 허용 (2009.1.1.~ §23의2 제도 도입 이후)
  const isLinealDescendant =
    heir.relation === "child" ||
    (heir.relation === "legatee" &&
      heir.isGenerationSkipBeneficiary === true &&
      heir.isSubstituteInheritance !== true);

  // 대습상속된 직계비속의 배우자: 2022.1.1.~ §23의2①1호 개정 (KoreanLaw time_travel 검증)
  // relation="other" + isSubstituteInheritance=true (계약 C2)
  // ※ "legatee" 수유자에 isSubstituteInheritance=true인 경우는 isLinealDescendant 조건에서 제외됨
  const isSubstituteDescendantSpouse =
    d >= "2022-01-01" &&
    heir.relation === "other" &&
    heir.isSubstituteInheritance === true;

  return isLinealDescendant || isSubstituteDescendantSpouse;
}

// ============================================================
// G3: §23의2①1호 동거연수 계산
// ============================================================

/**
 * §23의2①1호 동거연수 계산.
 *
 * 법령 근거:
 *   - §23의2①1호: "상속개시일부터 소급하여 10년 이상(상속인이 미성년자인 기간은 제외한다)"
 *   - 미성년 제외 규정: 2016.1.1.~ 시행 (교재 §1-2 명시)
 *   - 민법 §4: 만 19세 이상이 성인
 *   - §23의2②: 부득이한 사유(상증령 §20의2) 기간은 계속 동거로 인정하되 동거기간 산입 안 함
 *
 * 정밀 연산:
 *   - date-fns differenceInYears 사용 (생일 기념일 기반 — 프로젝트 표준)
 *   - effectiveStart = max(cohabitStartDate, adultDate) — 성인 전 동거기간은 제외
 *   - rawYears = differenceInYears(deathDate, effectiveStart) (소수점 버림)
 *   - effectiveYears = rawYears - excludedYears
 *   - birthDate 미입력 시 minorYearsDeducted=0 (자동 추정 금지)
 *   - deathDate < 2016-01-01 시 미성년 제외 규정 자체 없음 → minorYearsDeducted=0
 *
 * @param cohabitStartDate 동거 시작일 (YYYY-MM-DD)
 * @param deathDate 상속개시일 (YYYY-MM-DD)
 * @param birthDate 상속인 생년월일 (YYYY-MM-DD, optional)
 * @param excludedYears §23의2② 부득이 사유 제외 연수 (미입력 시 0)
 */
export function calcCohabitYears(
  cohabitStartDate: string,
  deathDate: string,
  birthDate: string | undefined,
  excludedYears: number,
): {
  rawYears: number;
  minorYearsDeducted: number;
  effectiveYears: number;
  meetsRequirement: boolean;
} {
  const deathD = new Date(deathDate);
  const startD = new Date(cohabitStartDate);

  // 미성년 기간 제외 (2016.1.1.~ 시행)
  let effectiveStart = startD;
  let minorYearsDeducted = 0;

  if (deathDate >= "2016-01-01" && birthDate) {
    // 만 19세 도달일 = birthDate + 19년 (date-fns: 생일 기념일 기반)
    const birthD = new Date(birthDate);
    const adultD = new Date(birthD);
    adultD.setFullYear(adultD.getFullYear() + 19);

    if (adultD > startD) {
      // 성인 도달일이 동거 시작일보다 늦으면 성인 이후부터 계산
      effectiveStart = adultD;
    }

    // minorYearsDeducted: effectiveStart가 startD보다 늦어진 경우 그 차이
    if (effectiveStart > startD) {
      minorYearsDeducted = differenceInYears(effectiveStart, startD);
    }
  }

  // rawYears: effectiveStart → deathDate 연수 (소수점 버림)
  const rawYears =
    effectiveStart <= deathD
      ? differenceInYears(deathD, effectiveStart)
      : 0;

  const effectiveYears = Math.max(0, rawYears - excludedYears);

  return {
    rawYears,
    minorYearsDeducted,
    effectiveYears,
    meetsRequirement: effectiveYears >= 10,
  };
}

// ============================================================
// G4: §23의2① 주택부수토지 면적한도 차감
// ============================================================

/** 지역별 배율 (소득세 시행령 §154⑦) */
const ANCILLARY_LAND_RATIO: Record<AncillaryLandRegion, number> = {
  metro_residential_commercial_industrial: 3, // §154⑦1호가
  metro_green: 5,                             // §154⑦1호나
  non_metro: 5,                               // §154⑦1호다
  other: 10,                                  // §154⑦2호
};

/**
 * §23의2① 주택부수토지 면적한도 초과분 차감 계산.
 *
 * 법령 근거:
 *   §23의2①: "소득세법 §89①3호에 따른 주택부수토지의 가액을 포함"
 *   소득세 시행령 §154⑦: 건물 정착 면적 × 지역별 배율 이내의 토지만 주택부수토지로 인정
 *
 * 전제 (inheritance-cohabit-ancillary-land.plan.md):
 *   아파트·공동주택가격은 부수토지 포함 → ancillaryLandArea 미입력으로 차감 없음.
 *   단독주택 대형토지를 별도 EstateItem으로 분리 입력한 경우에만 해당.
 *
 * 정밀 연산:
 *   adjustedHousePrice = floor(cohabitHouseStdPrice × limitArea / ancillaryLandArea) — 곱셈 먼저
 *
 * 미입력 안전 처리:
 *   ancillaryLandArea·buildingFootprintArea·ancillaryLandRegion 중 하나라도 미입력 시
 *   차감 없음 반환 (자동 안분 fallback 금지 정책).
 *
 * @param buildingFootprintArea 건물 정착 면적 (㎡)
 * @param ancillaryLandArea 부수토지 실제 면적 (㎡)
 * @param region 지역 구분
 * @param cohabitHouseStdPrice 동거주택 공시가격 (원)
 */
export function applyAncillaryLandLimit(
  buildingFootprintArea: number | undefined,
  ancillaryLandArea: number | undefined,
  region: AncillaryLandRegion | undefined,
  cohabitHouseStdPrice: number,
): {
  adjustedHousePrice: number;
  limitArea: number;
  excessArea: number;
  excessRatio: number;
  limitReductionAmount: number;
} {
  // 3필드 중 하나라도 미입력 시 차감 없음 (전부 또는 전무)
  if (
    ancillaryLandArea === undefined ||
    buildingFootprintArea === undefined ||
    region === undefined
  ) {
    return {
      adjustedHousePrice: cohabitHouseStdPrice,
      limitArea: 0,
      excessArea: 0,
      excessRatio: 0,
      limitReductionAmount: 0,
    };
  }

  const ratio = ANCILLARY_LAND_RATIO[region];
  const limitArea = buildingFootprintArea * ratio;
  const excessArea = Math.max(0, ancillaryLandArea - limitArea);

  if (excessArea === 0 || ancillaryLandArea === 0) {
    return {
      adjustedHousePrice: cohabitHouseStdPrice,
      limitArea,
      excessArea: 0,
      excessRatio: 0,
      limitReductionAmount: 0,
    };
  }

  // 정밀 연산: 곱셈 먼저, floor (Math.round 금지)
  // adjustedHousePrice = floor(cohabitHouseStdPrice × limitArea / ancillaryLandArea)
  const adjustedHousePrice = Math.floor(
    (cohabitHouseStdPrice * limitArea) / ancillaryLandArea,
  );
  const limitReductionAmount = cohabitHouseStdPrice - adjustedHousePrice;
  const excessRatio = excessArea / ancillaryLandArea;

  return {
    adjustedHousePrice: Math.max(0, adjustedHousePrice),
    limitArea,
    excessArea,
    excessRatio,
    limitReductionAmount,
  };
}
