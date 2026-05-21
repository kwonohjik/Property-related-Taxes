/**
 * 영농상속공제 거주지 자동 검증 (PR-E F-10)
 *
 * 법령: 시행령 §16②1호나 (KoreanLaw MCP 검증 2026-05-21)
 *   - 농지·초지·산림지·농업용 건축물·염전: 자산 소재 시·군·구·연접·30km 이내 거주
 *   - 어선·어업권: 선적지·어장 연안 시·군·구·연접·30km 이내 거주
 *
 * 자동화 범위:
 *   - Haversine 30km 직선거리 자동 판정 (lib/geo/haversine.ts)
 *   - 시·군·구·연접 OR 조건은 수동 boolean 우선 (행정구역 API 미통합)
 *
 * 정책 (옵션 A — 사용자 명시 우선, 2026-05-22 비판 검토 후 정정):
 *   - met (최종 boolean) = 사용자 명시값 (farming.decedentResidenceMet/heirResidenceMet)
 *   - autoMet (자동 검증 결과) = 좌표 + Haversine 30km — 안내용 별도 필드
 *   - UI는 met·autoMet 비교 차이를 사용자에게 안내 (자동이 사용자 명시를 덮어쓰지 않음)
 *
 * 미입력 좌표 자산은 자동 검증에서 무시 (사용자 boolean에 의존).
 */

import { haversineKm } from "@/lib/geo/haversine";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const LAND_BASED: ReadonlyArray<string> = [
  "farmland",
  "pasture",
  "forest_land",
  "agricultural_building",
  "salt_field",
];

const FISHING_BASED: ReadonlyArray<string> = [
  "fishing_vessel",
  "fishing_right",
];

export interface FarmingResidenceCheckResult {
  /** 피상속인 거주지 최종 충족 — 사용자 명시값(farming.decedentResidenceMet) 그대로 (옵션 A) */
  decedentMet: boolean;
  /** 상속인 거주지 최종 충족 — 사용자 명시값(farming.heirResidenceMet) 그대로 (옵션 A) */
  heirMet: boolean;
  /** 피상속인 자동 검증 결과 (Haversine 30km). 좌표 또는 자동 검증 가능 자산 없으면 null. UI 안내용 — met를 덮어쓰지 않음 */
  decedentAutoMet: boolean | null;
  /** 상속인 자동 검증 결과. null 의미는 위와 동일 */
  heirAutoMet: boolean | null;
  /** 피상속인 최소 거리 (km). 자동 검증 가능한 자산 없으면 null */
  decedentMinDistanceKm: number | null;
  /** 상속인 최소 거리 (km). 자동 검증 가능한 자산 없으면 null */
  heirMinDistanceKm: number | null;
}

/**
 * 자산 좌표 추출 — farmingCategory별 분기.
 * - 농지 그룹: estateLatLng
 * - 어선·어업권 그룹: fishingAnchorLatLng
 * - corporate_stock: 무관 (법인 영농은 거주 요건 없음)
 */
function getAssetLatLng(
  item: EstateItem,
): { lat: number; lng: number } | undefined {
  const cat = item.farmingCategory;
  if (!cat) return undefined;
  if (LAND_BASED.includes(cat)) return item.estateLatLng;
  if (FISHING_BASED.includes(cat)) return item.fishingAnchorLatLng;
  return undefined;
}

function calcMinDistance(
  estateItems: EstateItem[],
  origin: { lat: number; lng: number },
): number | null {
  let min: number | null = null;
  for (const item of estateItems) {
    const target = getAssetLatLng(item);
    if (!target) continue;
    const d = haversineKm(origin, target);
    if (min === null || d < min) min = d;
  }
  return min;
}

/**
 * 거주지 자동 검증.
 *
 * @param estateItems 자산 목록 (farmingCategory + estateLatLng/fishingAnchorLatLng)
 * @param farming     FarmingInheritanceInput (decedent/heir 좌표 + 사용자 boolean)
 *
 * 반환 — 자동 검증 결과. UI는 본 결과로 사용자 boolean 미리채움 또는 안내 노출.
 */
export function checkFarmingResidenceCompliance(
  estateItems: EstateItem[],
  farming: FarmingInheritanceInput | undefined,
): FarmingResidenceCheckResult {
  const decedentLatLng = farming?.decedentResidenceLatLng;
  const heirLatLng = farming?.heirResidenceLatLng;

  const decedentMinDistanceKm = decedentLatLng
    ? calcMinDistance(estateItems, decedentLatLng)
    : null;
  const heirMinDistanceKm = heirLatLng
    ? calcMinDistance(estateItems, heirLatLng)
    : null;

  // 자동 검증 결과 (UI 안내용) — 좌표 또는 자산 좌표 없으면 null
  const decedentAutoMet: boolean | null =
    decedentMinDistanceKm === null ? null : decedentMinDistanceKm <= 30;
  const heirAutoMet: boolean | null =
    heirMinDistanceKm === null ? null : heirMinDistanceKm <= 30;

  // 옵션 A — 최종 met는 사용자 명시값 그대로. 자동 검증은 안내용으로만 노출
  const decedentMet = farming?.decedentResidenceMet === true;
  const heirMet = farming?.heirResidenceMet === true;

  return {
    decedentMet,
    heirMet,
    decedentAutoMet,
    heirAutoMet,
    decedentMinDistanceKm,
    heirMinDistanceKm,
  };
}
