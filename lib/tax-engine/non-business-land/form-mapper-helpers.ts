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
  FactoryLandUsage,
  FactoryIndustrySegment,
  ZoneType,
  NblParcel,
  LandType,
  RevenueTestInput,
} from "./types";
import type { NblRevenueBusinessType } from "../legal-codes";
import { deriveCurrentBusinessDays } from "./revenue-test";
import { resolveDeemedRentRate } from "../data/nbl-deemed-rent-rate";
import { getZoneAreaMultiplier } from "../local-tax-zone-multiplier";
import type { FactoryEntityType } from "../factory-employee-sports-standard";

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
  /** 거주지 좌표 (직선거리 30km 재촌 판정, §153③3호) — string. form-mapper에서 number 파싱. */
  lat?: string;
  lng?: string;
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

/**
 * 「소득세법 시행령」 §168의14③1의2호 「… 해당 직계존속 또는 해당 배우자로부터 상속ㆍ증여받은 토지」 — 취득원인 게이트.
 * 이월과세 증여(§97의2 — 배우자·직계존비속 증여)도 증여다. 관계·8년 재촌·자경은 입력이 없어 선언(토글)으로 받는다.
 */
const INHERITED_OR_GIFTED_CAUSES: ReadonlySet<string> = new Set(["inheritance", "gift", "carryover_gift"]);

/**
 * 상속인이 아닌 사람(수유자)이 유증·사인증여로 받은 토지인가 — 취득원인은 상속이지만 「상속받은」 토지가 아니다.
 * 상속 특례(③1호 · ③1의2호 · ③3호 나목 소급 · ③4호 나목 · 임야·목장 상속 3년)를 모두 적용하지 않는다:
 * 서면5팀-927(③1호) · 사전-2024-법규재산-0820(③1의2호) · 부동산거래관리과-0994(③3호) · 기준-2019-법령해석재산-0324(③4호).
 * 임야·목장 3년은 직접 해석이 없어 엔진이 확인 필요로 밝힌다(계획서 `docs/00-pm/nbl-bequest-non-heir.plan.md` §4-2).
 */
export function isNonHeirBequest(a: Record<string, unknown>): boolean {
  return asString(a.acquisitionCause) === "inheritance" && asBool(a.nonHeirBequest);
}

/**
 * 선언·양도원인만으로 무조건 의제 판정에 들어가는가 — 취득원인에서 자동으로 정하는 상속 사유(③1호·③4호 나목)는 빼고 본다.
 * 지목 미선택 자산의 진입 게이트(`mapAssetToNblInput`)가 쓴다. 자동 사유는 지목(농·임·목 / 농지)이 있어야만 성립하기 때문이다.
 */
export function hasDeclaredUnconditionalExemption(a: Record<string, unknown>): boolean {
  // 양도원인=공익수용 단일 선택도 §168의14③3호 의제 판정을 트리거 (섹션 토글 미설정 방어)
  return (
    asBool(a.nblExemptLongOwned20y) || asBool(a.nblExemptAncestor8YearFarming) ||
    asBool(a.nblExemptPublicExpropriation) || asString(a.transferCause) === "public_expropriation" ||
    asBool(a.nblExemptFactoryAdjacent) || asBool(a.nblExemptJongjoongOwned) || asBool(a.nblExemptInong)
  );
}

export function buildUnconditionalExemption(
  a: Record<string, unknown>,
  parseDate: ParseDate,
): UnconditionalExemptionInput | undefined {
  /**
   * ③1호(2006.12.31. 이전 상속)·③4호 나목(도시지역 농지 상속 5년)의 「상속받은」·「상속개시일」은 취득원인·취득일에서 정한다
   * (계획서 `docs/00-pm/nbl-unconditional-inherit-cause.plan.md`). 종전에는 ③1호 토글과 그 아래 「상속일」 칸
   * (`nblExemptInheritBefore2007`·`nblExemptInheritDate`)만 읽어, 매매 자산에서 켜면 사업용, 상속 자산에서 안 켜거나
   * 날짜를 비우면 비사업용이 됐다. ③4호 나목은 자기 입력칸이 없어 ③1호 칸에 남은 값으로만 성립했다. 두 필드는 읽지 않는다.
   */
  const acquired = parseDate(asString(a.acquisitionDate));
  const inheritanceDate = acquired ? resolveInheritanceStartDate(a, acquired) : undefined;
  if (!hasDeclaredUnconditionalExemption(a) && !inheritanceDate) return undefined;
  const isExpropriation =
    asBool(a.nblExemptPublicExpropriation) || asString(a.transferCause) === "public_expropriation";
  // §168의14③3호나목 취득일 소급: 상속=피상속인 취득일 / §97의2①(carryover_gift)=증여자 취득일.
  // 그 외(직접취득·일반증여)는 undefined → 엔진이 양수인 취득일로 fallback.
  const cause = asString(a.acquisitionCause);
  const expropriationAcquisitionDate =
    cause === "inheritance" && !isNonHeirBequest(a)
      ? parseDate(asString(a.decedentAcquisitionDate))
      : cause === "carryover_gift"
        ? parseDate(asString(a.donorAcquisitionDate))
        : undefined;
  return {
    isInheritedBefore2007:               inheritanceDate !== undefined,
    inheritanceDate,
    ownedOver20YearsBefore2007:          asBool(a.nblExemptLongOwned20y),
    isAncestor8YearFarming:              asBool(a.nblExemptAncestor8YearFarming) && INHERITED_OR_GIFTED_CAUSES.has(cause) && !isNonHeirBequest(a),
    isPublicExpropriation:               isExpropriation,
    // 고시일 fallback: NBL 섹션 미입력 시 Step1 단일 소스(expropriationNoticeDate)
    publicNoticeDate:                    parseDate(asString(a.nblExemptPublicNoticeDate) || asString(a.expropriationNoticeDate)),
    expropriationAcquisitionDate,
    isFactoryAdjacent:                   asBool(a.nblExemptFactoryAdjacent),
    /*
     * 종중 소유는 선언 하나로 받고 근거 조문(③4호 가목 · §168의8③6호 · §168의9③8호 · §168의10②2호)은 엔진이 지목·도시지역으로
     * 고른다. 종중의 취득일은 자산 취득일이다 — 명의신탁 해지로 환원해도 취득시기는 종중(명의신탁자)의 취득일
     * (서면인터넷방문상담5팀-219). 종전의 별도 칸 `nblExemptJongjoongAcqDate`와 ③4호 토글 `nblExemptUrbanFarmlandJongjoong`
     * (#2282 전에는 「종중 또는 상속」)은 읽지 않는다(계획서 `docs/00-pm/nbl-jongjoong-toggle-merge.plan.md`).
     */
    isJongjoongOwned:                    asBool(a.nblExemptJongjoongOwned),
    jongjoongAcquisitionDate:            acquired,
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

/**
 * 「소득세법 시행령」 §168의9③7호·§168의10②1호 「상속받은 … 상속개시일부터 3년이 경과하지 아니한」 — 상속개시일.
 *
 * 두 요건(상속받았는가 · 상속개시일)은 자산의 취득원인·취득일이 이미 받는다(상속 자산의 취득일 칸이 상속개시일이다).
 * 종전에는 비사업용 섹션의 별도 입력(임야 토글·상속일, 목장 상속일)만 읽어, 매매 자산에서 켜면 사업용이 되고
 * 상속 자산에서 안 켜거나 날짜를 틀리면 비사업용이 됐다(계획서 `docs/00-pm/nbl-forest-pasture-inherit-3y-cause.plan.md`).
 * 그 입력은 이제 읽지 않는다 — 옛 저장값이 남아 있어도 판정에 닿지 않는다.
 *
 * 상속인이 아닌 수유자(`isNonHeirBequest`)는 「상속받은」 토지가 아니어서 undefined다.
 *
 * @returns 상속이면 취득일(상속개시일), 아니면 undefined
 */
export function resolveInheritanceStartDate(a: Record<string, unknown>, acquisitionDate: Date): Date | undefined {
  return asString(a.acquisitionCause) === "inheritance" && !isNonHeirBequest(a) ? acquisitionDate : undefined;
}

export function buildForestDetail(
  a: Record<string, unknown>,
  landType: LandType,
  inheritanceStartDate: Date | undefined,
): ForestUsageDetail | undefined {
  if (landType !== "forest") return undefined;
  return {
    hasForestPlan:               asBool(a.nblForestHasPlan),
    isPublicInterest:            asBool(a.nblForestIsPublicInterest),
    isSpecialForestZone:         asBool(a.nblForestIsProtected),
    isForestSuccessor:           asBool(a.nblForestIsSuccessor),
    inheritedForestWithin3Years: inheritanceStartDate !== undefined,
    forestInheritanceDate:       inheritanceStartDate,
  };
}

export function buildPasture(
  a: Record<string, unknown>,
  landType: LandType,
  parseDate: ParseDate,
  parseNumber: ParseNumber,
  inheritanceStartDate: Date | undefined,
): PastureUsage | undefined {
  if (landType !== "pasture") return undefined;
  return {
    isLivestockOperator: asBool(a.nblPastureIsLivestockOperator),
    livestockType:       asString(a.nblPastureLivestockType) || undefined,
    hasFacility:         asBool(a.nblPastureHasFacility),
    hasGrassland:        asBool(a.nblPastureHasGrassland),
    hasFodder:           asBool(a.nblPastureHasFodder),
    livestockCount:      parseNumber(asString(a.nblPastureLivestockCount)),
    livestockPeriods:    mapBusinessUsePeriods(asArray<NblBusinessUsePeriod>(a.nblPastureLivestockPeriods), parseDate),
    inheritanceDate:     inheritanceStartDate,
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
  zoneType?: ZoneType,
): OtherLandUsage | undefined {
  if (landType !== "other_land" && landType !== "vacant_lot" && landType !== "miscellaneous") return undefined;
  const relatedBusinessType = asString(a.nblOtherRelatedBusinessType) || undefined;
  return {
    propertyTaxType:                (asString(a.nblOtherPropertyTaxType) || "comprehensive") as OtherLandUsage["propertyTaxType"],
    hasBuilding:                    asBool(a.nblOtherHasBuilding),
    buildingFloorArea:              parseNumber(asString(a.nblOtherBuildingFloorArea)),
    /**
     * §168의11⑥ 복합용도 건축물 부속토지 안분 (B) — **「건축물 있음」 토글로 gate한다** (U2-01).
     *
     * 이 파일의 다른 선택 블록은 전부 자기 토글로 gate된다(⑤ 연접 다필지 `nblOtherUseParcels`,
     * 공장 `nblFactoryEnabled`, ③2호 공통수입 `nblRevenueCommonApportion`). **⑥ 복합용도만**
     * 무조건 매핑이라, 사용자가 「건축물 있음」을 껐다 켠 뒤 잔존한 안분 입력이 **화면에 보이지
     * 않는 채로** 판정을 뒤집었다(실측 비사업용 0㎡ → 750㎡). §168의11⑥ 본문도 건축물의 존재를
     * 전제하므로 요건상으로도 gate가 맞다.
     */
    ...(asBool(a.nblOtherHasBuilding)
      ? {
          mixedUseBuildingMode:     (asString(a.nblOtherMixedUseMode) || undefined) as OtherLandUsage["mixedUseBuildingMode"],
          specificUseFloorArea:     parseNumber(asString(a.nblOtherMixedUseSpecificFloorArea)),
          totalFloorArea:           parseNumber(asString(a.nblOtherMixedUseTotalFloorArea)),
          specificUseFootprint:     parseNumber(asString(a.nblOtherMixedUseSpecificFootprint)),
          totalFootprint:           parseNumber(asString(a.nblOtherMixedUseTotalFootprint)),
        }
      : {}),
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
    // 공장용 건축물 부속토지 기준면적 (§102①1호 별표6 / §101①1호)
    factory:                        buildFactory(a, parseNumber, zoneType),
  };
}

/**
 * 공장용 건축물 부속토지 입력 (토글 ON 시에만). 미설정이면 undefined = 공장 아님.
 *
 * **값 검증은 하지 않는다** — 누락·부정합은 엔진(`judgeFactoryLandExcess`)이 던진다.
 * 여기서 조용히 undefined로 떨어뜨리면 토글은 켜져 있는데 한도 판정만 사라져
 * 사용자가 눈치채지 못한다(침묵 미발동).
 *
 * `zoneType`은 자산의 `nblZoneType`을 그대로 쓴다 — 공장 전용 용도지역 필드를 따로 두지
 * 않는다(단일 소스). §101①1호 배율은 양도 대상 필지의 용도지역으로 정한다.
 */
export function buildFactory(
  a: Record<string, unknown>,
  parseNumber: ParseNumber,
  zoneType?: ZoneType,
): FactoryLandUsage | undefined {
  if (!asBool(a.nblFactoryEnabled)) return undefined;
  const rawSegments = asArray<{ floorArea?: string; ratePercent?: string; industryLabel?: string }>(
    a.nblFactorySegments,
  );
  const segments: FactoryIndustrySegment[] = rawSegments.map((s) => ({
    floorArea:   parseNumber(asString(s?.floorArea)) ?? 0,
    ratePercent: parseNumber(asString(s?.ratePercent)) ?? 0,
    industryLabel: asString(s?.industryLabel) || undefined,
  }));
  return {
    locationCategory:          asString(a.nblFactoryLocationCategory) as FactoryLandUsage["locationCategory"],
    totalAppurtenantLandArea:  parseNumber(asString(a.nblFactoryTotalLandArea)) ?? 0,
    segments,
    isRestrictedZone:          asBool(a.nblFactoryIsRestrictedZone),
    additionalRecognizedArea:  parseNumber(asString(a.nblFactoryAdditionalRecognizedArea)),
    /**
     * 별표6 3호바 — 종업원용 체육시설. 표(비고 2-나·다·라)는 엔진이 산출한다.
     * `indoorZoneMultiplier`는 **자산의 용도지역**에서 도출한다(단일 소스) —
     * 비고 2-라가 지목하는 것이 「지방세법 시행령」 §101②의 용도지역별 적용배율이다.
     * 배율 미상(세분 전 주거지역 등)이면 undefined로 두어 엔진이 실내분을 산입하지 않는다.
     */
    employeeSportsFacility: {
      employeeCount:      parseNumber(asString(a.nblFactorySportsEmployeeCount)),
      entityType:         (asString(a.nblFactorySportsEntityType) || undefined) as
                            FactoryEntityType | undefined,
      playgroundArea:     parseNumber(asString(a.nblFactorySportsPlaygroundArea)),
      tennisCourtArea:    parseNumber(asString(a.nblFactorySportsCourtArea)),
      indoorFloorArea:    parseNumber(asString(a.nblFactorySportsIndoorFloorArea)),
      indoorZoneMultiplier: zoneType ? getZoneAreaMultiplier(zoneType)?.multiplier : undefined,
    },
    totalFootprintArea:        parseNumber(asString(a.nblFactoryFootprintArea)),
    zoneType,
    isUnregistered:            asBool(a.nblFactoryIsUnregistered),
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
