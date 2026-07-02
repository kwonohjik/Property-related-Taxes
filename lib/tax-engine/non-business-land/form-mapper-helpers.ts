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
  NblParcel,
  LandType,
  RevenueTestInput,
} from "./types";
import type { NblRevenueBusinessType } from "../legal-codes";
import { deriveCurrentBusinessDays } from "./revenue-test";
import { resolveDeemedRentRate } from "../data/nbl-deemed-rent-rate";

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
  // 양도원인=공익수용 단일 선택도 §168의14③3호 의제 판정을 트리거 (섹션 토글 미설정 방어)
  const isExpropriation =
    asBool(a.nblExemptPublicExpropriation) || asString(a.transferCause) === "public_expropriation";
  const has =
    asBool(a.nblExemptInheritBefore2007) || asBool(a.nblExemptLongOwned20y) ||
    asBool(a.nblExemptAncestor8YearFarming) || isExpropriation ||
    asBool(a.nblExemptFactoryAdjacent) || asBool(a.nblExemptJongjoongOwned) ||
    asBool(a.nblExemptUrbanFarmlandJongjoong) || asBool(a.nblExemptInong);
  if (!has) return undefined;
  return {
    isInheritedBefore2007:               asBool(a.nblExemptInheritBefore2007),
    inheritanceDate:                     parseDate(asString(a.nblExemptInheritDate)),
    ownedOver20YearsBefore2007:          asBool(a.nblExemptLongOwned20y),
    isAncestor8YearFarming:              asBool(a.nblExemptAncestor8YearFarming),
    isPublicExpropriation:               isExpropriation,
    // 고시일 fallback: NBL 섹션 미입력 시 Step1 단일 소스(expropriationNoticeDate)
    publicNoticeDate:                    parseDate(asString(a.nblExemptPublicNoticeDate) || asString(a.expropriationNoticeDate)),
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

/** §168의11⑤ 연접 다필지 raw → NblParcel[]. nblOtherUseParcels=false면 undefined(단일 필지). 면적·취득일 미충족 항목은 제외. */
function buildNblParcels(
  a: Record<string, unknown>,
  parseDate: ParseDate,
  parseNumber: ParseNumber,
): NblParcel[] | undefined {
  if (!asBool(a.nblOtherUseParcels)) return undefined;
  type RawParcel = { id?: string; landArea?: string; acquisitionDate?: string; hasBuilding?: boolean; buildingFootprintArea?: string };
  const raw = asArray<RawParcel>(a.nblOtherParcels);
  const parcels = raw.flatMap((p, i): NblParcel[] => {
    const landArea = parseNumber(asString(p.landArea));
    const acquisitionDate = parseDate(asString(p.acquisitionDate));
    if (landArea === undefined || landArea <= 0 || !acquisitionDate) return [];
    return [{
      id: asString(p.id) || `parcel-${i}`,
      landArea,
      acquisitionDate,
      hasBuilding: asBool(p.hasBuilding),
      buildingFootprintArea: parseNumber(asString(p.buildingFootprintArea)),
    }];
  });
  return parcels.length > 0 ? parcels : undefined;
}

export function buildOtherLand(
  a: Record<string, unknown>,
  landType: LandType,
  parseNumber: ParseNumber,
  parseDate: ParseDate,
): OtherLandUsage | undefined {
  if (landType !== "other_land" && landType !== "vacant_lot" && landType !== "miscellaneous") return undefined;
  const relatedBusinessType = asString(a.nblOtherRelatedBusinessType) || undefined;
  return {
    propertyTaxType:                (asString(a.nblOtherPropertyTaxType) || "comprehensive") as OtherLandUsage["propertyTaxType"],
    hasBuilding:                    asBool(a.nblOtherHasBuilding),
    buildingFloorArea:              parseNumber(asString(a.nblOtherBuildingFloorArea)),
    // §168의11⑥ 복합용도 건축물 부속토지 안분 (B)
    mixedUseBuildingMode:           (asString(a.nblOtherMixedUseMode) || undefined) as OtherLandUsage["mixedUseBuildingMode"],
    specificUseFloorArea:           parseNumber(asString(a.nblOtherMixedUseSpecificFloorArea)),
    totalFloorArea:                 parseNumber(asString(a.nblOtherMixedUseTotalFloorArea)),
    specificUseFootprint:           parseNumber(asString(a.nblOtherMixedUseSpecificFootprint)),
    totalFootprint:                 parseNumber(asString(a.nblOtherMixedUseTotalFootprint)),
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
    // §168의11⑤ 연접 다필지 (C·D)
    parcels:                        buildNblParcels(a, parseDate, parseNumber),
  };
}

/**
 * §168의11② 수입금액비율 입력 (기타토지 + 업종 선택 시). 미선택/none이면 undefined.
 * §168의11③3호 연환산용 당해 영위일수·과세연도를 양도일·취득일·사업개시일에서 도출.
 */
export function buildRevenueTest(
  a: Record<string, unknown>,
  landType: LandType,
  parseNumber: ParseNumber,
  parseDate: ParseDate,
  transferDate: Date,
  acquisitionDate: Date,
): RevenueTestInput | undefined {
  if (landType !== "other_land" && landType !== "vacant_lot" && landType !== "miscellaneous") return undefined;
  const bt = asString(a.nblRevenueBusinessType);
  if (!bt || bt === "none") return undefined;

  // 당해 영위일수·과세연도 (공유 헬퍼 — UI preview와 단일 진실)
  const startOverride = parseDate(asString(a.nblRevenueCurrentBusinessStartDate));
  const { days: currentBusinessDays, taxYear: currentTaxYear } = deriveCurrentBusinessDays(
    transferDate,
    acquisitionDate,
    startOverride,
  );

  // 직전 과세기간 영위일수 — 직접 입력(직전연도 중 개시·폐업 시). 미입력 시 직전 환산 안 함.
  const priorBusinessDays = parseNumber(asString(a.nblRevenuePriorBusinessDays));
  const priorTaxYear = currentTaxYear - 1;

  // §168의11③1호 간주임대료율 — 연도별 테이블에서 해소(미검증 연도면 undefined → 엔진 경고)
  const curRate = resolveDeemedRentRate(transferDate);
  const priorRate = resolveDeemedRentRate(priorTaxYear);

  // §168의11③2호 공통수입 안분 — 토글 ON 시에만 매핑
  const commonOn = asBool(a.nblRevenueCommonApportion);

  return {
    businessType:     bt as NblRevenueBusinessType,
    currentRevenue:   parseNumber(asString(a.nblRevenueCurrentRevenue)) ?? 0,
    currentLandValue: parseNumber(asString(a.nblRevenueCurrentLandValue)) ?? 0,
    currentBusinessDays,
    currentTaxYear,
    priorRevenue:     parseNumber(asString(a.nblRevenuePriorRevenue)),
    priorLandValue:   parseNumber(asString(a.nblRevenuePriorLandValue)),
    priorBusinessDays,
    priorTaxYear,
    // §168의11③1호 간주임대료
    currentDeposit:   parseNumber(asString(a.nblRevenueCurrentDeposit)),
    currentRentDays:  parseNumber(asString(a.nblRevenueCurrentRentDays)),
    currentDeemedRate: curRate ? { num: curRate.rateNum, den: curRate.rateDen } : undefined,
    priorDeposit:     parseNumber(asString(a.nblRevenuePriorDeposit)),
    priorRentDays:    parseNumber(asString(a.nblRevenuePriorRentDays)),
    priorDeemedRate:  priorRate ? { num: priorRate.rateNum, den: priorRate.rateDen } : undefined,
    // §168의11③2호 공통수입 안분 (토글 ON)
    commonRevenue:      commonOn ? parseNumber(asString(a.nblRevenueCommonRevenue)) : undefined,
    otherLandValue:     commonOn ? parseNumber(asString(a.nblRevenueOtherLandValue)) : undefined,
    priorCommonRevenue: commonOn ? parseNumber(asString(a.nblRevenuePriorCommonRevenue)) : undefined,
    priorOtherLandValue: commonOn ? parseNumber(asString(a.nblRevenuePriorOtherLandValue)) : undefined,
  };
}
