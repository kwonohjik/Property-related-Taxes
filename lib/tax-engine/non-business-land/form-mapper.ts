/**
 * 폼 데이터(AssetForm 평면 구조) → NonBusinessLandInput(중첩 구조) 변환
 *
 * AssetForm을 직접 import하면 store↔엔진 순환 의존이 발생하므로
 * `Record<string, unknown>` 으로 수신 후 내부에서 캐스팅한다.
 * 지목별 서브 빌더는 form-mapper-helpers.ts 에 위임한다.
 */

import type {
  NonBusinessLandInput,
  GracePeriod,
  GracePeriodType,
  OwnerResidenceHistory,
  LandType,
  ZoneType,
} from "./types";
import {
  asString, asBool, asArray,
  mapBusinessUsePeriods,
  buildUnconditionalExemption,
  buildFarmlandDeeming,
  buildForestDetail,
  buildPasture,
  buildVilla,
  buildOtherLand,
  type NblBusinessUsePeriod,
  type ResidenceHistoryInput,
  type GracePeriodInput,
} from "./form-mapper-helpers";

// ============================================================
// 컨텍스트 타입
// ============================================================

export interface MapAssetContext {
  acquisitionDate: Date;
  transferDate: Date;
  parseDate: (s: string) => Date | undefined;
  parseNumber: (s: string) => number | undefined;
}

// ============================================================
// 메인 변환 함수
// ============================================================

/**
 * 폼 자산 데이터를 비사업용 토지 엔진 입력 구조로 변환한다.
 *
 * @param asset   - AssetForm 레코드 (Record 캐스팅으로 순환 의존 방지)
 * @param context - 날짜·숫자 파서 및 취득·양도일
 * @returns NonBusinessLandInput, 또는 상세판정 불필요 시 null
 */
export function mapAssetToNblInput(
  asset: Record<string, unknown>,
  context: MapAssetContext,
): NonBusinessLandInput | null {
  if (!asset.nblUseDetailedJudgment || !asset.nblLandType) return null;

  const { acquisitionDate, transferDate, parseDate, parseNumber } = context;
  const landType = asString(asset.nblLandType) as LandType;
  const zoneType = (asString(asset.nblZoneType) || "undesignated") as ZoneType;
  const landArea  = parseNumber(asString(asset.acquisitionArea)) ?? 0;

  // 사업용 사용기간
  const businessUsePeriods = mapBusinessUsePeriods(
    asArray<NblBusinessUsePeriod>(asset.nblBusinessUsePeriods),
    parseDate,
  );

  // 유예기간
  const rawGrace = asArray<GracePeriodInput>(asset.nblGracePeriods);
  const gracePeriods: GracePeriod[] = rawGrace.length > 0
    ? rawGrace.flatMap((p): GracePeriod[] => {
        const s = parseDate(p.startDate);
        const e = parseDate(p.endDate);
        if (!s || !e) return [];
        return [{ type: p.type as GracePeriodType, startDate: s, endDate: e }];
      })
    : [];

  // 소유자 주거 이력
  const rawRes = asArray<ResidenceHistoryInput>(asset.nblResidenceHistories);
  const residenceHistories: OwnerResidenceHistory[] = rawRes.flatMap((r): OwnerResidenceHistory[] => {
    const s = parseDate(r.startDate);
    const e = parseDate(r.endDate);
    if (!s || !e) return [];
    return [{
      sigunguCode: r.sigunguCode,
      sigunguName: r.sigunguName,
      sidoName: "",
      startDate: s,
      endDate: e,
      hasResidentRegistration: r.hasResidentRegistration,
    }];
  });

  // 도시편입일 / 수도권 여부
  const urbanIncorporationDate = parseDate(asString(asset.nblUrbanIncorporationDate));
  const metroRaw = asString(asset.nblIsMetropolitanArea);
  const isMetropolitanArea: boolean | undefined =
    metroRaw === "yes" ? true : metroRaw === "no" ? false : undefined;

  return {
    landType, landArea, zoneType, acquisitionDate, transferDate,
    farmingSelf:             asBool(asset.nblFarmingSelf),
    farmerResidenceDistance: parseNumber(asString(asset.nblFarmerResidenceDistance)),
    farmlandDeeming:         buildFarmlandDeeming(asset),
    forestDetail:            buildForestDetail(asset, landType),
    pasture:                 buildPasture(asset, landType, parseDate, parseNumber),
    villa:                   buildVilla(asset, landType, parseDate),
    otherLand:               buildOtherLand(asset, landType, parseNumber),
    unconditionalExemption:  buildUnconditionalExemption(asset, parseDate),
    urbanIncorporationDate,
    isMetropolitanArea,
    ...(residenceHistories.length > 0 ? { ownerProfile: { residenceHistories } } : {}),
    businessUsePeriods,
    gracePeriods,
    housingFootprint: parseNumber(asString(asset.nblHousingFootprint)),
  };
}

/**
 * nblOwnershipRatio 파싱 헬퍼.
 * Orchestrator 에서 applyCoOwnershipRatio() 호출 시 사용.
 *
 * @returns 0 < ratio < 1 이면 해당 값, 그 외 1 반환.
 */
export function parseOwnershipRatio(
  asset: Record<string, unknown>,
  parseNumber: (s: string) => number | undefined,
): number {
  const raw = parseNumber(asString(asset.nblOwnershipRatio));
  if (raw === undefined || raw <= 0 || raw >= 1) return 1;
  return raw;
}
