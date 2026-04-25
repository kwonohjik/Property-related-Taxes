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
} from "./types";

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

export interface GracePeriodInput {
  type: string;
  startDate: string;
  endDate: string;
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
    asBool(a.nblExemptUrbanFarmlandJongjoong);
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
  };
}

export function buildFarmlandDeeming(a: Record<string, unknown>): FarmlandDeemingInput | undefined {
  const has =
    asBool(a.nblFarmlandIsWeekendFarm) || asBool(a.nblFarmlandIsConversionApproved) ||
    asBool(a.nblFarmlandIsMarginalFarm) || asBool(a.nblFarmlandIsReclaimedLand) ||
    asBool(a.nblFarmlandIsPublicProjectUse) || asBool(a.nblFarmlandIsSickElderlyRental);
  if (!has) return undefined;
  return {
    isWeekendFarm:            asBool(a.nblFarmlandIsWeekendFarm),
    isFarmConversionApproved: asBool(a.nblFarmlandIsConversionApproved),
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
): VillaUsage | undefined {
  if (landType !== "villa_land") return undefined;
  return {
    villaUsePeriods: mapBusinessUsePeriods(asArray<NblBusinessUsePeriod>(a.nblVillaUsePeriods), parseDate),
    isEupMyeon:      asBool(a.nblVillaIsEupMyeon),
    isRuralHousing:  asBool(a.nblVillaIsRuralHousing),
    isAfter20150101: asBool(a.nblVillaIsAfter20150101),
  };
}

export function buildOtherLand(
  a: Record<string, unknown>,
  landType: LandType,
  parseNumber: ParseNumber,
): OtherLandUsage | undefined {
  if (landType !== "other_land" && landType !== "vacant_lot" && landType !== "miscellaneous") return undefined;
  return {
    propertyTaxType:                (asString(a.nblOtherPropertyTaxType) || "comprehensive") as OtherLandUsage["propertyTaxType"],
    hasBuilding:                    false,
    buildingStandardValue:          parseNumber(asString(a.nblOtherBuildingValue)),
    landStandardValue:              parseNumber(asString(a.nblOtherLandValue)),
    isRelatedToResidenceOrBusiness: asBool(a.nblOtherIsRelatedToResidence),
  };
}
