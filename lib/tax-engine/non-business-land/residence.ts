/**
 * 재촌 판정 모듈 (§168-8 농지 / §168-9 ② 임야)
 *
 * 토지 소재지 × 소유자 주거 이력 매칭으로 재촌 기간을 프로그램적으로 산출.
 *
 * 재촌 정의:
 * - 농지·목장: 동일/연접 시·군·구 OR 직선거리 30km 이내 "사실상 거주"
 * - 임야: 위 조건 + 주민등록 필수 (§168-9 ②)
 */

import type {
  DateInterval,
  LocationInfo,
  OwnerResidenceHistory,
} from "./types";
import { mergeOverlappingPeriods } from "./utils/period-math";
import { haversineKm } from "@/lib/geo/haversine";

export interface ComputeResidenceOptions {
  /** 임야 재촌 판정 시 true — 주민등록 있는 이력만 인정 */
  requireResidentRegistration?: boolean;
  /** 연접 시·군·구 코드 목록 (외부 GIS 서비스가 주입) */
  adjacentSigunguCodes?: string[];
  /** 재촌 허용 거리 (km). 기본 30 */
  distanceLimitKm?: number;
}

/**
 * 단일 주거 이력이 토지 소재지 재촌 요건을 충족하는지.
 * 우선순위: 시·군·구 코드 일치 > 연접 시·군·구 > 직선거리 30km 이내.
 */
function isHistoryWithinResidence(
  history: OwnerResidenceHistory,
  landLocation: LocationInfo | undefined,
  adjacent: string[],
  distanceLimitKm: number,
): boolean {
  if (!landLocation) return false;

  // 1. 시·군·구 코드 일치 (§153③1호)
  if (
    history.sigunguCode &&
    landLocation.sigunguCode &&
    history.sigunguCode === landLocation.sigunguCode
  ) {
    return true;
  }

  // 2. 연접 시·군·구 (§153③2호)
  if (history.sigunguCode && adjacent.includes(history.sigunguCode)) {
    return true;
  }

  // 3. 직선거리 30km 이내 (§153③3호) — 농지·거주지 좌표 모두 있을 때 haversine.
  //    좌표 결측 시 스킵(판정 축소 아님 — 1·2 유지). 알고리즘 미러: farming-residence-check.ts.
  if (
    landLocation.lat !== undefined &&
    landLocation.lng !== undefined &&
    history.lat !== undefined &&
    history.lng !== undefined
  ) {
    const dist = haversineKm(
      { lat: landLocation.lat, lng: landLocation.lng },
      { lat: history.lat, lng: history.lng },
    );
    if (dist <= distanceLimitKm) return true;
  }

  return false;
}

/**
 * 소유자 주거 이력 → 토지 재촌 기간 DateInterval[] 산출.
 *
 * 각 이력 구간을 재촌 요건으로 필터링한 뒤 `mergeOverlappingPeriods` 로 합산.
 *
 * 임야 옵션: `requireResidentRegistration: true` → 주민등록 없는 이력 제외.
 */
export function computeResidencePeriods(
  histories: OwnerResidenceHistory[] | undefined,
  landLocation: LocationInfo | undefined,
  options: ComputeResidenceOptions = {},
): DateInterval[] {
  if (!histories || histories.length === 0) return [];

  const {
    requireResidentRegistration = false,
    adjacentSigunguCodes = [],
    distanceLimitKm = 30,
  } = options;

  // 거리 fallback: landLocation.distanceKm 가 한도 이내면 전체 이력 인정 (단일 스냅샷 legacy 호환)
  const distanceFallbackOk =
    landLocation?.distanceKm !== undefined &&
    landLocation.distanceKm <= distanceLimitKm;

  const valid: DateInterval[] = [];
  for (const h of histories) {
    if (requireResidentRegistration && !h.hasResidentRegistration) continue;
    if (h.endDate <= h.startDate) continue;

    const inArea =
      isHistoryWithinResidence(h, landLocation, adjacentSigunguCodes, distanceLimitKm) ||
      distanceFallbackOk;
    if (!inArea) continue;

    valid.push({ start: new Date(h.startDate), end: new Date(h.endDate) });
  }

  return mergeOverlappingPeriods(valid);
}

/**
 * 레거시 fallback: 주거 이력이 없고 단일 거리 값만 있을 때,
 * 전체 보유기간을 1개 거주 구간으로 간주 (warning 대상).
 */
export function fallbackResidenceFromDistance(
  acquisitionDate: Date,
  transferDate: Date,
  ownerDistanceKm: number | undefined,
  distanceLimitKm = 30,
): DateInterval[] {
  if (ownerDistanceKm === undefined) return [];
  if (ownerDistanceKm > distanceLimitKm) return [];
  return [{ start: new Date(acquisitionDate), end: new Date(transferDate) }];
}
