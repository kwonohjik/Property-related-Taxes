/**
 * 비사업용 토지 판정 전담 순수 엔진 (Layer 2)
 *
 * DB 직접 호출 없음. 모든 판정 기준 데이터는 매개변수로 주입.
 *
 * 법적 근거:
 *   소득세법 §104조의3 (비사업용 토지의 범위)
 *   시행령 §168조의6 (판정 3기준 — 80%/5년내3년/3년내2년)
 *   시행령 §168조의7 (부득이한 사유)
 *   시행령 §168조의8 (건물 부수 토지 배율)
 */

import { differenceInDays, addYears } from "date-fns";

// ============================================================
// 타입 정의
// ============================================================

/** 토지 유형 */
export type LandType =
  | "farmland"      // 농지 (전·답·과수원)
  | "forest"        // 임야
  | "pasture"       // 목장용지
  | "vacant_lot"    // 나대지
  | "building_site" // 건물 부수 토지
  | "housing_site"  // 주택 부수 토지
  | "miscellaneous" // 잡종지
  | "other";        // 기타

/** 용도지역 */
export type ZoneType =
  | "residential"       // 주거지역
  | "commercial"        // 상업지역
  | "industrial"        // 공업지역
  | "green"             // 녹지지역
  | "management"        // 관리지역
  | "agriculture_forest"// 농림지역
  | "natural_env"       // 자연환경보전지역
  | "undesignated";     // 미지정

/** 유예기간 유형 */
export type GracePeriodType =
  | "inheritance"       // 상속 (최대 5년)
  | "legal_restriction" // 법령 사용 금지·제한 (기간 전체)
  | "sale_contract"     // 매매계약 체결 후 양도일 (최대 2년)
  | "construction"      // 건축허가 후 신축·증축 (최대 2년)
  | "unavoidable"       // 부득이한 사유 (최대 2년)
  | "preparation"       // 사업 준비기간 (최대 2년)
  | "land_replotting";  // 환지처분 전 (제한 없음)

/**
 * 부득이한 사유 유형 (시행령 §168조의7)
 * 농지 자경 불가 사유 — 해당 기간은 유예기간으로 산입
 */
export type UnavoidableReasonType =
  | "illness"        // 질병 (6개월 이상 치료)
  | "elderly"        // 고령 (만 65세 이상 자경 불가)
  | "military"       // 징집·소집
  | "emigration"     // 해외이주
  | "expropriation"  // 공익사업 수용·협의매수
  | "bankruptcy";    // 파산선고

/** 부득이한 사유 항목 */
export interface UnavoidableReason {
  type: UnavoidableReasonType;
  startDate: Date;
  endDate: Date;
  description?: string;
}

/** 사업용 사용기간 */
export interface BusinessUsePeriod {
  startDate: Date;
  endDate: Date;
  usageType: string; // 자경, 영림계획, 건물임대 등 — 표시용
}

/** 유예기간 항목 */
export interface GracePeriod {
  type: GracePeriodType;
  startDate: Date; // 사유 시작일 (상속 = 상속개시일)
  endDate: Date;   // 입력된 종료일 (최대 제한은 내부에서 적용)
}

/** 비사업용 토지 판정 입력 */
export interface NonBusinessLandInput {
  /** 토지 유형 */
  landType: LandType;
  /** 전체 면적 (㎡, 소수점 2자리까지) */
  landArea: number;
  /** 용도지역 */
  zoneType: ZoneType;
  /** 취득일 */
  acquisitionDate: Date;
  /** 양도일 */
  transferDate: Date;

  // ---- 농지 관련 ----
  /** 자경 여부 (landType === "farmland" 시 사용) */
  farmingSelf?: boolean;
  /** 농지 소재지에서 거주지까지 직선거리 (km) */
  farmerResidenceDistance?: number;

  // ---- 임야 관련 ----
  /** 영림계획 인가 여부 (landType === "forest" 시 사용) */
  forestManagementPlan?: boolean;

  // ---- 사업용 사용기간 (직접 입력) ----
  businessUsePeriods: BusinessUsePeriod[];

  // ---- 건물 부수 토지 ----
  /** 건물 바닥면적 (㎡, landType === "building_site" 시 필수) */
  buildingFootprint?: number;

  // ---- 주택 부수 토지 ----
  /** 주택 정착면적 (㎡, landType === "housing_site" 시 필수) */
  housingFootprint?: number;
  /** 도시지역 여부 (주택 부수 토지 배율 결정) */
  isUrbanArea?: boolean;

  // ---- 유예기간 ----
  gracePeriods: GracePeriod[];
  /**
   * 부득이한 사유 목록 (시행령 §168조의7)
   * 내부에서 GracePeriod type="unavoidable"로 변환하여 처리.
   * gracePeriods와 중복 없이 병합됨.
   */
  unavoidableReasons?: UnavoidableReason[];
}

/** 면적 안분 결과 */
export interface AreaProportioning {
  totalArea: number;
  businessArea: number;
  nonBusinessArea: number;
  /** 비사업용 면적 비율 (소수, 소수점 4자리) */
  nonBusinessRatio: number;
  /** 적용 배율 (건물/주택 부수 토지) */
  buildingMultiplier: number;
}

/** 비사업용 토지 판정 결과 */
export interface NonBusinessLandJudgment {
  /** 비사업용 토지 여부 */
  isNonBusinessLand: boolean;
  /** 판정 사유 설명 */
  judgmentReason: string;

  // ---- 기간 분석 ----
  /** 전체 소유일수 (취득일 다음날 ~ 양도일) */
  totalOwnershipDays: number;
  /** 사업용 사용일수 (중복 제거) */
  businessUseDays: number;
  /** 유예기간 일수 (중복 제거) */
  gracePeriodDays: number;
  /** 유효 사업용 일수 = 사업용 + 유예기간 (합산 후 중복 제거) */
  effectiveBusinessDays: number;
  /** 사업용 사용 비율 (소수점 4자리) */
  businessUseRatio: number;

  // ---- 3가지 판정 기준 ----
  criteria: {
    /** ① 소유기간의 80% 이상 사업용 */
    rule80Percent: boolean;
    /** ② 소유기간 5년 이상 + 직전 5년 중 3년(1095일) 이상 사업용 */
    rule5Years: boolean;
    /** ③ 소유기간 3년 이상 + 직전 3년 중 2년(730일) 이상 사업용 */
    rule2of3Years: boolean;
  };

  // ---- 면적 안분 (건물/주택 부수 토지) ----
  areaProportioning?: AreaProportioning;

  // ---- 중과세 정보 ----
  surcharge: {
    surchargeType: "non_business_land";
    /** 가산세율 (+10%p) */
    additionalRate: number;
    /** 장기보유특별공제 배제 여부 (항상 true) */
    longTermDeductionExcluded: boolean;
    /** 기본공제 적용 여부 (항상 true — 미등기와 구별) */
    basicDeductionApplied: boolean;
  };

  appliedLawArticles: string[];
  warnings: string[];
}

// ============================================================
// DB 판정 기준 타입 (transfer:special:non_business_land_judgment)
// ============================================================

/** DB에서 파싱된 비사업용 토지 판정 기준 규칙 */
export interface NonBusinessLandJudgmentRules {
  type: "non_business_land_judgment";
  /** 건물 부수 토지 용도지역별 배율 */
  buildingAreaMultipliers: {
    residential: number;
    commercial: number;
    industrial: number;
    green: number;
    management: number;
    agriculture_forest: number;
    natural_env: number;
    undesignated: number;
  };
  /** 농지 자경 거리 요건 (km) */
  farmlandDistanceKm: number;
  /** 유예기간 최대 기간 (년) */
  exemptionPeriods: {
    inheritance: number;   // 5
    construction: number;  // 2
    unavoidable: number;   // 2
    preparation: number;   // 2
    sale_contract: number; // 2
  };
}

/** 기본 판정 기준 (DB 미로드 시 fallback, 테스트용) */
export const DEFAULT_NON_BUSINESS_LAND_RULES: NonBusinessLandJudgmentRules = {
  type: "non_business_land_judgment",
  buildingAreaMultipliers: {
    residential: 5,
    commercial: 5,
    industrial: 7,
    green: 10,
    management: 10,
    agriculture_forest: 10,
    natural_env: 10,
    undesignated: 7,
  },
  farmlandDistanceKm: 30,
  exemptionPeriods: {
    inheritance: 5,
    construction: 2,
    unavoidable: 2,
    preparation: 2,
    sale_contract: 2,
  },
};

// ============================================================
// 내부 유틸 타입
// ============================================================

interface DateInterval {
  start: Date;
  end: Date;
}

// ============================================================
// Step 1: 기간 계산 유틸
// ============================================================

/**
 * 소유기간 시작일 = 취득일 다음날 (초일불산입 원칙)
 */
function getOwnershipStart(acquisitionDate: Date): Date {
  const d = new Date(acquisitionDate);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * 겹치는 기간을 합산·중복 제거하여 반환 (interval merge 알고리즘).
 * start === end 인 길이 0 기간은 무시.
 */
export function mergeOverlappingPeriods(periods: DateInterval[]): DateInterval[] {
  const valid = periods.filter((p) => p.end > p.start);
  if (valid.length === 0) return [];

  const sorted = [...valid].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: DateInterval[] = [{ start: new Date(sorted[0].start), end: new Date(sorted[0].end) }];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];

    if (cur.start <= last.end) {
      // 겹침 또는 연접 → end 확장
      if (cur.end > last.end) {
        last.end = new Date(cur.end);
      }
    } else {
      merged.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return merged;
}

/**
 * 기간 목록의 총 일수를 [windowStart, windowEnd] 범위로 클립하여 합산.
 * periods는 이미 merge된 상태를 가정.
 */
function sumDaysInWindow(
  periods: DateInterval[],
  windowStart: Date,
  windowEnd: Date,
): number {
  let total = 0;
  for (const p of periods) {
    const s = p.start < windowStart ? windowStart : p.start;
    const e = p.end > windowEnd ? windowEnd : p.end;
    const days = differenceInDays(e, s);
    if (days > 0) total += days;
  }
  return total;
}

// ============================================================
// Step 2: 유예기간 계산
// ============================================================

/**
 * 유예기간 목록을 `DateInterval[]`로 변환하되, 유형별 최대 기간을 적용.
 * legal_restriction / land_replotting은 최대 제한 없음.
 */
function buildGraceIntervals(
  gracePeriods: GracePeriod[],
  rules: NonBusinessLandJudgmentRules,
): DateInterval[] {
  const intervals: DateInterval[] = [];

  for (const gp of gracePeriods) {
    let effectiveEnd = gp.endDate;

    const maxYears: number | undefined = (() => {
      switch (gp.type) {
        case "inheritance":       return rules.exemptionPeriods.inheritance;
        case "construction":      return rules.exemptionPeriods.construction;
        case "unavoidable":       return rules.exemptionPeriods.unavoidable;
        case "preparation":       return rules.exemptionPeriods.preparation;
        case "sale_contract":     return rules.exemptionPeriods.sale_contract;
        case "legal_restriction": return undefined; // 제한 없음
        case "land_replotting":   return undefined; // 환지공고일까지
        default:                  return undefined;
      }
    })();

    if (maxYears !== undefined) {
      const maxEnd = addYears(gp.startDate, maxYears);
      if (effectiveEnd > maxEnd) effectiveEnd = maxEnd;
    }

    if (effectiveEnd > gp.startDate) {
      intervals.push({ start: gp.startDate, end: effectiveEnd });
    }
  }

  return intervals;
}

// ============================================================
// Step 3: 사업용 사용일수 집계
// ============================================================

interface EffectiveDaysResult {
  /** 사업용 사용일수 (중복 제거, 소유기간 클립) */
  businessUseDays: number;
  /** 유예기간 일수 (중복 제거, 소유기간 클립) */
  gracePeriodDays: number;
  /** 유효 사업용 일수 = 사업용 + 유예기간 합산 후 중복 제거 */
  effectiveDays: number;
}

function calculateEffectiveDays(
  businessUsePeriods: BusinessUsePeriod[],
  gracePeriods: GracePeriod[],
  ownershipStart: Date,
  transferDate: Date,
  rules: NonBusinessLandJudgmentRules,
): EffectiveDaysResult {
  const bizIntervals: DateInterval[] = businessUsePeriods.map((p) => ({
    start: p.startDate,
    end: p.endDate,
  }));
  const graceIntervals = buildGraceIntervals(gracePeriods, rules);

  const mergedBiz   = mergeOverlappingPeriods(bizIntervals);
  const mergedGrace = mergeOverlappingPeriods(graceIntervals);
  const mergedAll   = mergeOverlappingPeriods([...bizIntervals, ...graceIntervals]);

  const businessUseDays = sumDaysInWindow(mergedBiz,   ownershipStart, transferDate);
  const gracePeriodDays = sumDaysInWindow(mergedGrace, ownershipStart, transferDate);
  const effectiveDays   = sumDaysInWindow(mergedAll,   ownershipStart, transferDate);

  return { businessUseDays, gracePeriodDays, effectiveDays };
}

// ============================================================
// Step 4: 최근 N년 중 M년 이상 사업용 판정
// ============================================================

/**
 * 양도일 직전 windowYears년 기간 중 사업용(유예 포함) 일수가 requiredYears×365일 이상인지 판정.
 * 판정 창의 하한은 소유 시작일로 클립.
 */
function checkRecentYearsRule(
  transferDate: Date,
  businessUsePeriods: BusinessUsePeriod[],
  gracePeriods: GracePeriod[],
  acquisitionDate: Date,
  windowYears: number,
  requiredYears: number,
  rules: NonBusinessLandJudgmentRules,
): boolean {
  const ownershipStart = getOwnershipStart(acquisitionDate);
  const windowStart = addYears(transferDate, -windowYears);
  // 판정 창 시작 = max(소유시작일, 직전 N년 시작)
  const effectiveWindowStart = windowStart > ownershipStart ? windowStart : ownershipStart;

  const bizIntervals: DateInterval[] = businessUsePeriods.map((p) => ({
    start: p.startDate,
    end: p.endDate,
  }));
  const graceIntervals = buildGraceIntervals(gracePeriods, rules);
  const mergedAll = mergeOverlappingPeriods([...bizIntervals, ...graceIntervals]);

  const daysInWindow = sumDaysInWindow(mergedAll, effectiveWindowStart, transferDate);
  return daysInWindow >= requiredYears * 365;
}

// ============================================================
// Step 5: 면적 안분 계산 (건물/주택 부수 토지)
// ============================================================

/**
 * 건물 부수 토지 용도지역별 배율 (시행령 §168조의8)
 */
function getBuildingMultiplier(
  zoneType: ZoneType,
  rules: NonBusinessLandJudgmentRules,
): number {
  return rules.buildingAreaMultipliers[zoneType] ?? rules.buildingAreaMultipliers.undesignated;
}

function calcBuildingLandArea(
  totalArea: number,
  buildingFootprint: number,
  zoneType: ZoneType,
  rules: NonBusinessLandJudgmentRules,
): AreaProportioning {
  const multiplier = getBuildingMultiplier(zoneType, rules);
  const allowedArea = buildingFootprint * multiplier;
  const businessArea = Math.min(totalArea, allowedArea);
  const nonBusinessArea = Math.max(0, totalArea - allowedArea);
  const nonBusinessRatio =
    totalArea > 0 ? Math.round((nonBusinessArea / totalArea) * 10000) / 10000 : 0;
  return { totalArea, businessArea, nonBusinessArea, nonBusinessRatio, buildingMultiplier: multiplier };
}

function calcHousingLandArea(
  totalArea: number,
  housingFootprint: number,
  isUrbanArea: boolean,
): AreaProportioning {
  const multiplier = isUrbanArea ? 5 : 10;
  const allowedArea = housingFootprint * multiplier;
  const businessArea = Math.min(totalArea, allowedArea);
  const nonBusinessArea = Math.max(0, totalArea - allowedArea);
  const nonBusinessRatio =
    totalArea > 0 ? Math.round((nonBusinessArea / totalArea) * 10000) / 10000 : 0;
  return { totalArea, businessArea, nonBusinessArea, nonBusinessRatio, buildingMultiplier: multiplier };
}

// ============================================================
// 메인 함수: judgeNonBusinessLand
// ============================================================

/**
 * 비사업용 토지 판정 메인 함수 (순수 함수).
 *
 * @param input  토지 정보 + 사업용 사용기간 + 유예기간
 * @param rules  판정 기준 규칙 (DB: transfer:special:non_business_land_judgment)
 */
export function judgeNonBusinessLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules = DEFAULT_NON_BUSINESS_LAND_RULES,
): NonBusinessLandJudgment {
  const warnings: string[] = [];
  const appliedLawArticles: string[] = [
    "소득세법 §104조의3",
    "시행령 §168조의6",
  ];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(
    0,
    differenceInDays(input.transferDate, ownershipStart),
  );

  // ── 면적 안분 케이스: 건물/주택 부수 토지 ──────────────────────────
  if (input.landType === "building_site" && input.buildingFootprint !== undefined) {
    appliedLawArticles.push("시행령 §168조의8");
    const area = calcBuildingLandArea(
      input.landArea,
      input.buildingFootprint,
      input.zoneType,
      rules,
    );

    if (area.nonBusinessArea <= 0) {
      // 배율 이내 → 전체 사업용
      return makeSurchargeResult(false, "건물 부수 토지 배율 이내 — 전체 사업용", {
        totalOwnershipDays,
        businessUseDays: totalOwnershipDays,
        gracePeriodDays: 0,
        effectiveBusinessDays: totalOwnershipDays,
        businessUseRatio: 1,
        criteria: { rule80Percent: true, rule5Years: false, rule2of3Years: false },
        areaProportioning: area,
        appliedLawArticles,
        warnings,
      });
    }

    // 배율 초과 → 면적 안분 과세 (초과분은 비사업용)
    return makeSurchargeResult(true, `건물 부수 토지 배율(${area.buildingMultiplier}배) 초과 — 면적 안분 과세`, {
      totalOwnershipDays,
      businessUseDays: totalOwnershipDays,
      gracePeriodDays: 0,
      effectiveBusinessDays: totalOwnershipDays,
      businessUseRatio: area.nonBusinessRatio,
      criteria: { rule80Percent: false, rule5Years: false, rule2of3Years: false },
      areaProportioning: area,
      appliedLawArticles,
      warnings,
    });
  }

  if (input.landType === "housing_site" && input.housingFootprint !== undefined) {
    appliedLawArticles.push("시행령 §168조의8");
    const isUrban = input.isUrbanArea ?? true;
    const area = calcHousingLandArea(input.landArea, input.housingFootprint, isUrban);

    if (area.nonBusinessArea <= 0) {
      return makeSurchargeResult(false, "주택 부수 토지 배율 이내 — 전체 사업용", {
        totalOwnershipDays,
        businessUseDays: totalOwnershipDays,
        gracePeriodDays: 0,
        effectiveBusinessDays: totalOwnershipDays,
        businessUseRatio: 1,
        criteria: { rule80Percent: true, rule5Years: false, rule2of3Years: false },
        areaProportioning: area,
        appliedLawArticles,
        warnings,
      });
    }

    return makeSurchargeResult(true, `주택 부수 토지 배율(${area.buildingMultiplier}배) 초과 — 면적 안분 과세`, {
      totalOwnershipDays,
      businessUseDays: totalOwnershipDays,
      gracePeriodDays: 0,
      effectiveBusinessDays: totalOwnershipDays,
      businessUseRatio: area.nonBusinessRatio,
      criteria: { rule80Percent: false, rule5Years: false, rule2of3Years: false },
      areaProportioning: area,
      appliedLawArticles,
      warnings,
    });
  }

  // ── 기간 기반 판정: 농지/임야/나대지/기타 ─────────────────────────

  // 농지 자경 요건 확인
  let effectiveBusinessPeriods = [...input.businessUsePeriods];

  if (input.landType === "farmland") {
    if (!input.farmingSelf) {
      warnings.push("농지 자경 여부=false — 임대 농지는 원칙 비사업용");
      effectiveBusinessPeriods = [];
    } else if (
      input.farmerResidenceDistance !== undefined &&
      input.farmerResidenceDistance > rules.farmlandDistanceKm
    ) {
      warnings.push(
        `농지 소재지에서 거주지까지 ${input.farmerResidenceDistance}km — 자경 거리 요건(${rules.farmlandDistanceKm}km) 초과`,
      );
      effectiveBusinessPeriods = [];
    }
  }

  // 임야 영림계획 확인
  if (input.landType === "forest") {
    if (!input.forestManagementPlan) {
      warnings.push("임야 영림계획 인가 없음 — 사업용 사용기간 미인정");
      effectiveBusinessPeriods = [];
    }
  }

  // unavoidableReasons → GracePeriod[] 변환 후 gracePeriods에 병합
  const mergedGracePeriods: GracePeriod[] = [
    ...input.gracePeriods,
    ...(input.unavoidableReasons ?? []).map((u) => ({
      type: "unavoidable" as GracePeriodType,
      startDate: u.startDate,
      endDate: u.endDate,
    })),
  ];

  // 유효 사업용 일수 계산
  const { businessUseDays, gracePeriodDays, effectiveDays } = calculateEffectiveDays(
    effectiveBusinessPeriods,
    mergedGracePeriods,
    ownershipStart,
    input.transferDate,
    rules,
  );

  const effectiveBusinessDays = Math.min(effectiveDays, totalOwnershipDays);
  const businessUseRatio =
    totalOwnershipDays > 0
      ? Math.round((effectiveBusinessDays / totalOwnershipDays) * 10000) / 10000
      : 0;

  // 3가지 기준 판정 (소득세법 시행령 §168조의6 ①②③)
  const FIVE_YEARS_DAYS = 5 * 365;   // 1825일
  const THREE_YEARS_MANDATORY = 3 * 365; // 1095일 (rule② 사업용 최소일수)
  const TWO_YEARS_IN_LAST_THREE = 2 * 365; // 730일

  // ① 소유기간의 80% 이상 사업용
  const rule80Percent = businessUseRatio >= 0.8;

  // ② 소유기간 5년(1825일) 이상 AND 소유기간 중 사업용 사용일수 1095일(3년) 이상
  //    (창(window) 방식이 아닌 소유 전체 기간의 사업용 합계로 판정 — §168조의6 ① 2호)
  const rule5Years =
    totalOwnershipDays >= FIVE_YEARS_DAYS &&
    effectiveBusinessDays >= THREE_YEARS_MANDATORY;

  // ③ 양도일 직전 1095일(3년) 중 사업용 사용일수 730일(2년) 이상
  //    소유기간 최소 요건 없음 — 소유기간이 3년 미만이면 창이 소유시작일로 클립됨
  const rule2of3Years = checkRecentYearsRule(
    input.transferDate,
    effectiveBusinessPeriods,
    mergedGracePeriods,
    input.acquisitionDate,
    3,
    2,
    rules,
  );

  const isBusiness = rule80Percent || rule5Years || rule2of3Years;
  const isNonBusinessLand = !isBusiness;

  const judgmentReason = buildJudgmentReason(
    isNonBusinessLand,
    businessUseRatio,
    rule80Percent,
    rule5Years,
    rule2of3Years,
  );

  return makeSurchargeResult(isNonBusinessLand, judgmentReason, {
    totalOwnershipDays,
    businessUseDays,
    gracePeriodDays,
    effectiveBusinessDays,
    businessUseRatio,
    criteria: { rule80Percent, rule5Years, rule2of3Years },
    areaProportioning: undefined,
    appliedLawArticles,
    warnings,
  });
}

// ============================================================
// 내부 헬퍼
// ============================================================

function buildJudgmentReason(
  isNonBusiness: boolean,
  ratio: number,
  r80: boolean,
  r5y: boolean,
  r2of3: boolean,
): string {
  if (!isNonBusiness) {
    if (r80) return `사업용 (보유기간 대비 ${Math.round(ratio * 100)}% — ① 80% 기준 충족)`;
    if (r5y) return "사업용 (직전 5년 중 3년(1095일) 이상 — ② 5년 기준 충족)";
    return "사업용 (직전 3년 중 2년(730일) 이상 — ③ 3년 기준 충족)";
  }
  return `비사업용 토지 (3가지 기준 모두 미충족 — 사업용 비율 ${Math.round(ratio * 10000) / 100}%)`;
}

type PartialJudgment = Omit<NonBusinessLandJudgment, "isNonBusinessLand" | "judgmentReason" | "surcharge">;

function makeSurchargeResult(
  isNonBusinessLand: boolean,
  judgmentReason: string,
  partial: PartialJudgment,
): NonBusinessLandJudgment {
  return {
    isNonBusinessLand,
    judgmentReason,
    ...partial,
    surcharge: {
      surchargeType: "non_business_land",
      additionalRate: 0.10,
      longTermDeductionExcluded: true, // 비사업용 → 장기보유공제 배제
      basicDeductionApplied: true,     // 기본공제 250만원은 적용 (미등기와 구별)
    },
  };
}
