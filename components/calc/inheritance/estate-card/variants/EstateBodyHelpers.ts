/**
 * EstateBodyHelpers — variant 공통 유틸 (컴포넌트 import 금지 → 순환 회피)
 *
 * Plan estate-card-followup-phase2 §4.3·I-P2-3
 */

import type {
  EstateItem,
  AssetCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { AddressValue } from "@/components/ui/address-search";

export type PropertyKind =
  | "land"
  | "building_non_residential"
  | "house_individual"
  | "house_apart";

export function resolvePropertyKind(category: AssetCategory): PropertyKind {
  if (category === "real_estate_apartment") return "house_apart";
  if (category === "real_estate_building") return "building_non_residential";
  // real_estate_land + 그 외 fallback
  return "land";
}

type FishingFarmingCategory = "fishing_vessel" | "fishing_right";

/**
 * 어선·어업권 자산 판정 — 좌표 필드를 fishingAnchorLatLng·fishingAnchorSigunguCode로 저장.
 * type guard (item is EstateItem & { farmingCategory: FishingFarmingCategory })
 */
export function isFishingAsset(
  item: EstateItem,
): item is EstateItem & { farmingCategory: FishingFarmingCategory } {
  return (
    item.farmingCategory === "fishing_vessel" ||
    item.farmingCategory === "fishing_right"
  );
}

/** EstateItem 부분 패치 헬퍼 — onUpdate 호출 wrapper */
export function makePatcher(
  item: EstateItem,
  onUpdate: (updated: EstateItem) => void,
) {
  return (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });
}

/**
 * 소재지 검색(AddressSearch) onChange → EstateItem 단일 패치 빌드 (순수 함수).
 *
 * ⚠️ stale-closure race 차단:
 *   기존엔 onChange 안에서 ① set({estateAddress,...}) 후 await resolveSigunguCode →
 *   ② set({estateSigunguCode}) 로 2번 호출했는데, makePatcher가 진입 시점 item
 *   스냅샷을 캡처하므로 ②가 stale item(estateAddress 없던 상태)을 merge해
 *   ①의 estateAddress를 undefined로 덮어쓰는 버그가 있었다(자동조회 버튼 비활성
 *   "소재지를 먼저 입력해주세요"). → 이 함수로 전체 패치를 한 번에 만들어
 *   set() 단일 호출로 적용한다.
 *
 * 동/호 자동채움(사용자 결정 2026-06-15): AddressValue에 exclusiveArea·standardPrice가
 *   실려 오면(동/호 선택 시) areaSqm·standardPrice도 함께 채운다. 보충평가 수동 조회도 유지.
 */
export function buildAddressPatch(
  v: AddressValue,
  opts: { fishing: boolean; sigunguCode?: string },
): Partial<EstateItem> {
  const hasAddress = v.road || v.jibun || v.building || v.detail || v.pnu;
  const estateAddress = hasAddress
    ? {
        road: v.road || undefined,
        jibun: v.jibun || undefined,
        building: v.building || undefined,
        detail: v.detail || undefined,
        pnu: v.pnu || undefined,
        dong: v.dong || undefined,
        ho: v.ho || undefined,
      }
    : undefined;

  const patch: Partial<EstateItem> = { estateAddress };

  const parts = [v.road || v.jibun, v.building, v.detail].filter(Boolean);
  const auto = parts.join(" ").trim();
  if (auto) patch.name = auto;

  const latNum = v.lat ? parseFloat(v.lat) : NaN;
  const lngNum = v.lng ? parseFloat(v.lng) : NaN;
  const latLng =
    Number.isFinite(latNum) && Number.isFinite(lngNum)
      ? { lat: latNum, lng: lngNum }
      : undefined;
  if (latLng) {
    if (opts.fishing) patch.fishingAnchorLatLng = latLng;
    else patch.estateLatLng = latLng;
  }

  if (opts.sigunguCode) {
    if (opts.fishing) patch.fishingAnchorSigunguCode = opts.sigunguCode;
    else patch.estateSigunguCode = opts.sigunguCode;
  }

  // 동/호 선택 시 면적·공시가격 자동채움
  if (typeof v.exclusiveArea === "number" && v.exclusiveArea > 0) {
    patch.areaSqm = v.exclusiveArea;
  }
  if (typeof v.standardPrice === "number" && v.standardPrice > 0) {
    patch.standardPrice = v.standardPrice;
  }

  return patch;
}

/** Exhaustive switch 강제용 — 신규 카테고리 추가 시 컴파일러가 차단 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled category: ${JSON.stringify(x)}`);
}
