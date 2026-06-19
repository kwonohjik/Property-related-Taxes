/**
 * form-mapper 내부 헬퍼 타입·함수
 *
 * form-mapper.ts 가 200줄 이내를 유지할 수 있도록 raw 타입 정의와
 * 반복 유틸을 이 파일에 분리한다.
 */

import type {
  BusinessUsePeriod,
  UnconditionalExemptionInput,
  FarmlandDeemingInput,
  ForestUsageDetail,
  PastureUsage,
  VillaUsage,
  OtherLandUsage,
  LandType,
  RevenueTestInput,
} from "./types";
import type { NblRevenueBusinessType } from "../legal-codes";

// ============================================================
// Raw 입력 타입 (store 필드 그대로)
// ============================================================

export interface NblBusinessUsePeriod {
  startDate: string;
  endDate: string;
  usageType?: string;
}

export interface ResidenceHistoryInput {
  sigunguCode?: string;
  sigunguName: string;
  startDate: string;
  endDate: string;
  hasResidentRegistration: boolean;
}

/** 유예기간 raw 항목 (§168의14①·§83의5①) — 종료일은 사유별 법정기간으로 자동산정 */
export interface GracePeriodInput {
  reasonCode: string;
  /** 기산일 (멸실일·건축가능일·사유발생일 등). 6호·5호는 취득일 자동(미입력 허용). */
  anchorDate?: string;
  /** event_window/4호 종료일. fixed 호는 자동산정(미사용). */
  endDate?: string;
  /** 5호 착공일 */
  secondaryDate?: string;
  /** 5호 건설진행종료일(선택) */
  secondaryEndDate?: string;
  description?: string;
}

// ============================================================
// 유틸 헬퍼
// ============================================================

export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function asBool(v: unknown): boolean {
  return v === true;
}

export function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function mapBusinessUsePeriods(
  raw: NblBusinessUsePeriod[],
  parseDate: (s: string) => Date | undefined,
): BusinessUsePeriod[] {
  return raw
    .filter((p) => p.startDate && p.endDate)
    .flatMap((p): BusinessUsePeriod[] => {
      const start = parseDate(p.startDate);
      const end = parseDate(p.endDate);
      if (!start || !end) return [];
      return [{ startDate: start, endDate: end, usageType: p.usageType ?? "" }];
    });
}

// ============================================================
// 지목별 서브 입력 빌더
// ============================================================

type ParseDate   = (s: string) => Date | undefined;
type ParseNumber = (s: string) => number | undefined;

export function buildUnconditionalExemption(
  a: Record<string, unknown>,
  parseDate: ParseDate,
): UnconditionalExemptionInput | undefined {
  const has =
    asBool(a.nblExemptInheritBefore2007) || asBool(a.nblExemptLongOwned20y) ||
    asBool(a.nblExemptAncestor8YearFarming) || asBool(a.nblExemptPublicExpropriation) ||
    asBool(a.nblExemptFactoryAdjacent) || asBool(a.nblExemptJongjoongOwned) ||
    asBool(a.nblExemptUrbanFarmlandJongjoong) || asBool(a.nblExemptInong);
  if (!has) return undefined;
  return {
    isInheritedBefore2007:               asBool(a.nblExemptInheritBefore2007),
    inheritanceDate:                     parseDate(asString(a.nblExemptInheritDate)),
    ownedOver20YearsBefore2007:          asBool(a.nblExemptLongOwned20y),
    isAncestor8YearFarming:              asBool(a.nblExemptAncestor8YearFarming),
    isPublicExpropriation:               asBool(a.nblExemptPublicExpropriation),
    publicNoticeDate:                    parseDate(asString(a.nblExemptPublicNoticeDate)),
    isFactoryAdjacent:                   asBool(a.nblExemptFactoryAdjacent),
    isJongjoongOwned:                    asBool(a.nblExemptJongjoongOwned),
    jongjoongAcquisitionDate:            parseDate(asString(a.nblExemptJongjoongAcqDate)),
    isUrbanFarmlandJongjoongOrInherited: asBool(a.nblExemptUrbanFarmlandJongjoong),
    isInong:                             asBool(a.nblExemptInong),
    inongDate:                           parseDate(asString(a.nblExemptInongDate)),
  };
}

export function buildFarmlandDeeming(a: Record<string, unknown>): FarmlandDeemingInput | undefined {
  const has =
    asBool(a.nblFarmlandIsWeekendFarm) || asBool(a.nblFarmlandIsConversionApproved) ||
    asBool(a.nblFarmlandIsFarmDevZone) || asBool(a.nblFarmlandIsMarginalFarm) || asBool(a.nblFarmlandIsReclaimedLand) ||
    asBool(a.nblFarmlandIsPublicProjectUse) || asBool(a.nblFarmlandIsSickElderlyRental);
  if (!has) return undefined;
  return {
    isWeekendFarm:            asBool(a.nblFarmlandIsWeekendFarm),
    isFarmConversionApproved: asBool(a.nblFarmlandIsConversionApproved),
    isFarmDevZone:            asBool(a.nblFarmlandIsFarmDevZone),
    isMarginalFarmProject:    asBool(a.nblFarmlandIsMarginalFarm),
    isReclaimed:              asBool(a.nblFarmlandIsReclaimedLand),
    isPublicProjectUse:       asBool(a.nblFarmlandIsPublicProjectUse),
    isSickElderlyRental:      asBool(a.nblFarmlandIsSickElderlyRental),
  };
}

export function buildForestDetail(
  a: Record<string, unknown>,
  landType: LandType,
  parseDate?: ParseDate,
): ForestUsageDetail | undefined {
  if (landType !== "forest") return undefined;
  return {
    hasForestPlan:               asBool(a.nblForestHasPlan),
    isPublicInterest:            asBool(a.nblForestIsPublicInterest),
    isSpecialForestZone:         asBool(a.nblForestIsProtected),
    isForestSuccessor:           asBool(a.nblForestIsSuccessor),
    inheritedForestWithin3Years: asBool(a.nblForestInheritedWithin3Years),
    forestInheritanceDate:       parseDate?.(asString(a.nblForestInheritanceDate)),
  };
}

export function buildPasture(
  a: Record<string, unknown>,
  landType: LandType,
  parseDate: ParseDate,
  parseNumber: ParseNumber,
): PastureUsage | undefined {
  if (landType !== "pasture") return undefined;
  return {
    isLivestockOperator: asBool(a.nblPastureIsLivestockOperator),
    livestockType:       asString(a.nblPastureLivestockType) || undefined,
    livestockCount:      parseNumber(asString(a.nblPastureLivestockCount)),
    livestockPeriods:    mapBusinessUsePeriods(asArray<NblBusinessUsePeriod>(a.nblPastureLivestockPeriods), parseDate),
    inheritanceDate:     parseDate(asString(a.nblPastureInheritanceDate)),
    isSpecialOrgUse:     asBool(a.nblPastureIsSpecialOrgUse),
  };
}

export function buildVilla(
  a: Record<string, unknown>,
  landType: LandType,
  parseDate: ParseDate,
  parseNumber: ParseNumber,
): VillaUsage | undefined {
  if (landType !== "villa_land") return undefined;
  return {
    villaUsePeriods: mapBusinessUsePeriods(asArray<NblBusinessUsePeriod>(a.nblVillaUsePeriods), parseDate),
    isEupMyeon:        asBool(a.nblVillaIsEupMyeon),
    isRuralHousing:    asBool(a.nblVillaIsRuralHousing),
    buildingFloorArea: parseNumber(asString(a.nblVillaBuildingFloorArea)),
    attachedLandArea:  parseNumber(asString(a.nblVillaAttachedLandArea)),
    combinedStdValue:  parseNumber(asString(a.nblVillaCombinedStdValue)),
    isInRestrictedArea: asBool(a.nblVillaIsInRestrictedArea),
    isAfter20150101:   asBool(a.nblVillaIsAfter20150101),
  };
}

export function buildOtherLand(
  a: Record<string, unknown>,
  landType: LandType,
  parseNumber: ParseNumber,
): OtherLandUsage | undefined {
  if (landType !== "other_land" && landType !== "vacant_lot" && landType !== "miscellaneous") return undefined;
  const relatedBusinessType = asString(a.nblOtherRelatedBusinessType) || undefined;
  return {
    propertyTaxType:                (asString(a.nblOtherPropertyTaxType) || "comprehensive") as OtherLandUsage["propertyTaxType"],
    hasBuilding:                    asBool(a.nblOtherHasBuilding),
    buildingStandardValue:          parseNumber(asString(a.nblOtherBuildingValue)),
    landStandardValue:              parseNumber(asString(a.nblOtherLandValue)),
    isRelatedToResidenceOrBusiness: asBool(a.nblOtherIsRelatedToResidence),
    // §168의11① 호별 면적기준 (갭 3a)
    relatedBusinessType:            relatedBusinessType as OtherLandUsage["relatedBusinessType"],
    standardAreaLimit:              parseNumber(asString(a.nblOtherStandardAreaLimit)),
    maxAnnualArea:                  parseNumber(asString(a.nblOtherMaxAnnualArea)),
    youthCapacity:                  parseNumber(asString(a.nblOtherYouthCapacity)),
    minGarageArea:                  parseNumber(asString(a.nblOtherMinGarageArea)),
    // F2 Phase A — 별표3 종목·별표6 부대규모/시설 (자동 lookup)
    sportsFacilityType:             (asString(a.nblOtherSportsFacilityType) || undefined) as OtherLandUsage["sportsFacilityType"],
    reserveForcesUnitSize:          (asString(a.nblOtherReserveUnitSize) || undefined) as OtherLandUsage["reserveForcesUnitSize"],
    reserveForcesFacilities:        asArray<string>(a.nblOtherReserveFacilities) as OtherLandUsage["reserveForcesFacilities"],
    // F2 Phase B — 체육시설 유형·종업원 체육시설 (별표4·5)
    sportsCategory:                 (asString(a.nblOtherSportsCategory) || undefined) as OtherLandUsage["sportsCategory"],
    employeeCount:                  parseNumber(asString(a.nblOtherEmployeeCount)),
    employeeFacilityKinds:          asArray<string>(a.nblOtherEmployeeFacilityKinds) as OtherLandUsage["employeeFacilityKinds"],
    // F2 Phase B(B-3) — 6호 휴양 §83의4⑫ 3요소
    resortOutdoorArea:              parseNumber(asString(a.nblOtherResortOutdoorArea)),
    resortParkingStdArea:           parseNumber(asString(a.nblOtherResortParkingStdArea)),
    resortBuildingAttachedArea:     parseNumber(asString(a.nblOtherResortBuildingArea)),
    // F2 Phase B(B-2) — 선수가산·실내미설치·종목합산
    sportsPlayerCount:              parseNumber(asString(a.nblOtherSportsPlayerCount)),
    indoorNotInstalled:             asBool(a.nblOtherIndoorNotInstalled),
    sportsExtraEvents:              asArray<string>(a.nblOtherSportsExtraEvents) as OtherLandUsage["sportsExtraEvents"],
    indoorFloorArea:                parseNumber(asString(a.nblOtherIndoorFloorArea)),
    // F2 Phase B(B-3) — 6호 휴양 건축물 바닥면적(§101② 용도지역별 배율 자동)
    resortBuildingFloorArea:        parseNumber(asString(a.nblOtherResortBuildingFloorArea)),
  };
}

/** §168의11② 수입금액비율 입력 (기타토지 + 업종 선택 시). 미선택/none이면 undefined. */
export function buildRevenueTest(
  a: Record<string, unknown>,
  landType: LandType,
  parseNumber: ParseNumber,
): RevenueTestInput | undefined {
  if (landType !== "other_land" && landType !== "vacant_lot" && landType !== "miscellaneous") return undefined;
  const bt = asString(a.nblRevenueBusinessType);
  if (!bt || bt === "none") return undefined;
  return {
    businessType:     bt as NblRevenueBusinessType,
    currentRevenue:   parseNumber(asString(a.nblRevenueCurrentRevenue)) ?? 0,
    currentLandValue: parseNumber(asString(a.nblRevenueCurrentLandValue)) ?? 0,
    priorRevenue:     parseNumber(asString(a.nblRevenuePriorRevenue)),
    priorLandValue:   parseNumber(asString(a.nblRevenuePriorLandValue)),
  };
}
