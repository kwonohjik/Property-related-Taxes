/**
 * 영농상속공제 거주지 자동 검증 (PR-E F-10 + v4 Phase 0-Fix)
 *
 * 법령: 상증령 §16②1호나 (KoreanLaw MCP `get_law_text` mst=283637 §16 직접 검증 2026-05-22)
 *
 * 본문 정확 인용 (v4 C1 정정):
 *   - "농지·초지·산림지(이하 농지등)" 3종 — 농업용 건축물·염전은 §16⑤1호 자산일 뿐 거주지 OR 대상 아님
 *   - 어선·어업권: "어선의 선적지 또는 어장에 가장 가까운 연안의 시·군·구" 후단
 *   - "시" = 자치구·특별자치시(세종)·제주 행정시 포함
 *   - 산림지 단서: "통상적으로 직접 경영할 수 있는 지역 포함" — 모호 개념, 사용자 boolean
 *
 * OR 조건 우선순위 (높→낮):
 *   1. same_district           — 시·군·구 코드 일치
 *   2. adjacent_district       — 연접 시·군·구 (외부 GIS 매트릭스 주입)
 *   3. within_30km             — Haversine 직선거리 ≤ 30km
 *   4. forest_manageable_area  — 산림지 단서 (farmingCategory=forest_land + 사용자 명시)
 *   5. fail                    — 모두 미충족
 *
 * 옵션 A 정책: met = 사용자 boolean. matchKind·autoMet는 안내·산식 근거(옵션 C).
 */

import { haversineKm } from "@/lib/geo/haversine";
import { resolveSigunguUnitCode, resolveAdjacentUnitCodes } from "@/lib/geo/sigungu-unit";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { SigunguMatchKind } from "@/lib/tax-engine/types/inheritance-asset-location.types";

/**
 * §16②1호나 "농지등" — 농지·초지·산림지 3종만.
 * v4 C1 정정: agricultural_building·salt_field는 §16⑤1호 영농상속재산이나
 * §16②1호나 거주지 OR 조건 대상에는 포함되지 않음 (본문 명시).
 */
const LAND_BASED: ReadonlyArray<string> = [
  "farmland",
  "pasture",
  "forest_land",
];

const FISHING_BASED: ReadonlyArray<string> = [
  "fishing_vessel",
  "fishing_right",
];

export interface FarmingResidenceCheckOptions {
  /** 연접 시·군·구 코드 매트릭스 (Phase 2 외부 주입). 자산 소재지 코드 → 인접 코드 목록 */
  adjacentSigunguCodes?: (sigunguCode: string) => string[];
  /** 거리 한도 (km). 기본 30 (§16②1호나) */
  distanceLimitKm?: number;
}

export interface FarmingResidenceCheckResult {
  /** 피상속인 거주지 최종 충족 — 사용자 명시값(farming.decedentResidenceMet) 그대로 (옵션 A) */
  decedentMet: boolean;
  /** 상속인 거주지 최종 충족 — 사용자 명시값(farming.heirResidenceMet) 그대로 (옵션 A) */
  heirMet: boolean;
  /** 피상속인 자동 검증 결과 (3가지 OR). 평가 가능한 자산이 없으면 null. UI 안내용 — met를 덮어쓰지 않음 */
  decedentAutoMet: boolean | null;
  /** 상속인 자동 검증 결과. null 의미는 위와 동일 */
  heirAutoMet: boolean | null;
  /** 피상속인 매칭 종류 (자산 단위 최선 결과 집계). 모두 미입력 시 null */
  decedentMatchKind: SigunguMatchKind | null;
  /** 상속인 매칭 종류 */
  heirMatchKind: SigunguMatchKind | null;
  /** 피상속인 최소 거리 (km). 좌표 기반 평가 가능한 자산 없으면 null */
  decedentMinDistanceKm: number | null;
  /** 상속인 최소 거리 (km) */
  heirMinDistanceKm: number | null;
}

/** 자산 좌표 추출 — farmingCategory별 분기 */
function getAssetLatLng(
  item: EstateItem,
): { lat: number; lng: number } | undefined {
  const cat = item.farmingCategory;
  if (!cat) return undefined;
  if (LAND_BASED.includes(cat)) return item.estateLatLng;
  if (FISHING_BASED.includes(cat)) return item.fishingAnchorLatLng;
  return undefined;
}

/** 자산 시·군·구 코드 추출 — farmingCategory별 분기 */
function getAssetSigunguCode(item: EstateItem): string | undefined {
  const cat = item.farmingCategory;
  if (!cat) return undefined;
  if (LAND_BASED.includes(cat)) return item.estateSigunguCode;
  if (FISHING_BASED.includes(cat)) return item.fishingAnchorSigunguCode;
  return undefined;
}

/**
 * matchKind 우선순위 비교 — 좋은 결과 우선.
 * same > adjacent > within_30km > forest_manageable > fail
 */
const MATCH_RANK: Record<SigunguMatchKind, number> = {
  same_district: 5,
  adjacent_district: 4,
  within_30km: 3,
  forest_manageable_area: 2,
  fail: 1,
};

function betterMatch(
  a: SigunguMatchKind | null,
  b: SigunguMatchKind,
): SigunguMatchKind {
  if (a === null) return b;
  return MATCH_RANK[a] >= MATCH_RANK[b] ? a : b;
}

/**
 * 단일 자산 vs 거주자 매칭 종류 판정 (`non-business-land/residence.ts` 패턴 호환).
 *
 * 우선순위:
 *   1. same_district     — residenceCode === assetCode
 *   2. adjacent_district — adjacent 매트릭스에 residenceCode 포함
 *   3. within_30km       — Haversine 거리 ≤ limit
 *   4. fail              — 모두 미충족
 */
function classifyMatch(args: {
  residenceCode: string | undefined;
  assetCode: string | undefined;
  distanceKm: number | null;
  adjacent: string[];
  limitKm: number;
  isForestLand: boolean;
  forestManageable: boolean;
}): SigunguMatchKind {
  const { residenceCode, assetCode, distanceKm, adjacent, limitKm, isForestLand, forestManageable } = args;
  // 코드 비교는 **자치단체 단위**로 한다 — §16②1호나의 「구」는 「자치구를 말한다」이므로
  // 일반구(행정구)는 「구」가 아니고 상위 시가 판정 단위다. 양도세 미러와 같은 leaf를 쓴다.
  const residenceUnit = resolveSigunguUnitCode(residenceCode);
  const assetUnit = resolveSigunguUnitCode(assetCode);
  if (residenceUnit && assetUnit) {
    if (residenceUnit === assetUnit) return "same_district";
    if (adjacent.includes(residenceUnit)) return "adjacent_district";
  }
  if (distanceKm !== null && distanceKm <= limitKm) return "within_30km";
  // §16②1호나 산림지 단서 — "통상적으로 직접 경영할 수 있는 지역" 사용자 명시
  if (isForestLand && forestManageable) return "forest_manageable_area";
  return "fail";
}

interface PartyEval {
  autoMet: boolean | null;
  matchKind: SigunguMatchKind | null;
  minDistanceKm: number | null;
}

/** 피상속인 또는 상속인 1인 평가 */
function evaluateParty(
  estateItems: EstateItem[],
  residenceLatLng: { lat: number; lng: number } | undefined,
  residenceSigunguCode: string | undefined,
  resolveAdjacent: (code: string) => string[],
  limitKm: number,
  forestManageable: boolean,
): PartyEval {
  let minDistance: number | null = null;
  let bestKind: SigunguMatchKind | null = null;
  let evaluated = false;

  for (const item of estateItems) {
    const assetLatLng = getAssetLatLng(item);
    const assetCode = getAssetSigunguCode(item);
    if (!assetLatLng && !assetCode) {
      // 산림지 단서는 좌표·코드 없어도 사용자 명시 단독으로 적용 가능
      if (item.farmingCategory === "forest_land" && forestManageable) {
        evaluated = true;
        bestKind = betterMatch(bestKind, "forest_manageable_area");
      }
      continue;
    }

    const distanceKm =
      assetLatLng && residenceLatLng
        ? haversineKm(residenceLatLng, assetLatLng)
        : null;
    if (distanceKm !== null && (minDistance === null || distanceKm < minDistance)) {
      minDistance = distanceKm;
    }

    const hasCodePair = !!(residenceSigunguCode && assetCode);
    const hasCoordPair = distanceKm !== null;
    const isForestLand = item.farmingCategory === "forest_land";
    if (!hasCodePair && !hasCoordPair && !(isForestLand && forestManageable)) continue;
    evaluated = true;

    // 연접 매트릭스는 구 단위라 일반구가 있는 시는 형제 구 인접을 union해야 한다
    // (§16②1호나 「그와 연접한 시ㆍ군ㆍ구」의 「그」가 자치단체 단위이므로).
    const adjacent = assetCode ? resolveAdjacentUnitCodes(assetCode, resolveAdjacent) : [];
    const kind = classifyMatch({
      residenceCode: residenceSigunguCode,
      assetCode,
      distanceKm,
      adjacent,
      limitKm,
      isForestLand,
      forestManageable,
    });
    bestKind = betterMatch(bestKind, kind);
  }

  if (!evaluated) {
    return { autoMet: null, matchKind: null, minDistanceKm: minDistance };
  }
  const autoMet = bestKind !== null && bestKind !== "fail";
  return { autoMet, matchKind: bestKind, minDistanceKm: minDistance };
}

/**
 * 거주지 자동 검증.
 *
 * @param estateItems 자산 목록 (farmingCategory + estateLatLng/Sigungu/fishingAnchor*)
 * @param farming     FarmingInheritanceInput (decedent/heir 좌표·시·군·구 + 사용자 boolean)
 * @param options     adjacentSigunguCodes resolver + 거리 한도
 *
 * 반환 — 자동 검증 결과. UI는 본 결과로 사용자 boolean 미리채움 또는 안내 노출.
 */
export function checkFarmingResidenceCompliance(
  estateItems: EstateItem[],
  farming: FarmingInheritanceInput | undefined,
  options: FarmingResidenceCheckOptions = {},
): FarmingResidenceCheckResult {
  const limitKm = options.distanceLimitKm ?? 30;
  const resolveAdjacent = options.adjacentSigunguCodes ?? (() => []);

  const decedent = evaluateParty(
    estateItems,
    farming?.decedentResidenceLatLng,
    farming?.decedentResidenceSigunguCode,
    resolveAdjacent,
    limitKm,
    farming?.decedentForestManageableArea === true,
  );
  const heir = evaluateParty(
    estateItems,
    farming?.heirResidenceLatLng,
    farming?.heirResidenceSigunguCode,
    resolveAdjacent,
    limitKm,
    farming?.heirForestManageableArea === true,
  );

  // 옵션 A — 최종 met는 사용자 명시값 그대로. 자동 검증은 안내용
  const decedentMet = farming?.decedentResidenceMet === true;
  const heirMet = farming?.heirResidenceMet === true;

  return {
    decedentMet,
    heirMet,
    decedentAutoMet: decedent.autoMet,
    heirAutoMet: heir.autoMet,
    decedentMatchKind: decedent.matchKind,
    heirMatchKind: heir.matchKind,
    decedentMinDistanceKm: decedent.minDistanceKm,
    heirMinDistanceKm: heir.minDistanceKm,
  };
}
