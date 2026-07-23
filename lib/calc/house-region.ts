/**
 * house-region.ts — 주택 소재지(수도권·광역시 등 / 지방) 지역기준 자동 파생 단일 소스.
 *
 * 법정동코드(regionCode)에서 §167의3① 주택 수 산정 지역기준을 엔진 단일 소스 헬퍼
 * (classifyRegionCriteriaByCode)로 파생한다. 양도 주택(assets[0])·다른 보유 주택(HouseEntry)
 * 공용 — UI 표시·단건/다건 API 페이로드가 모두 이 함수로 동일 판정(drift 0).
 */

import { classifyRegionCriteriaByCode } from "@/lib/tax-engine/multi-house-surcharge-count";
import type { AddressValue } from "@/components/ui/address-search";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

/**
 * regionCode → "capital"(REGION: 수도권·광역시(군 제외)·세종) | "non_capital"(VALUE: 지방·군 지역).
 * regionCode 미입력(주소 미검색) 시 REGION(capital) 기본값 — 종전 기본값 유지·과소산정 회피.
 */
export function deriveHouseRegionFromCode(regionCode?: string): "capital" | "non_capital" {
  if (!regionCode) return "capital";
  return classifyRegionCriteriaByCode(regionCode) === "REGION" ? "capital" : "non_capital";
}

/**
 * AddressSearch 선택 결과(AddressValue) → HouseEntry patch.
 *
 * onChange가 3회(주소·동·호) 발화하며 공시가격·전유면적은 **호(ho) 선택 시에만** 반환 →
 * partial-guard로 가격/면적 없는 발화가 기존값(수동입력·직전 조회분)을 덮지 않도록 한다.
 * regionCode(10자리)·지역 구분(region)은 매 발화 동시 갱신(useEffect 미러링 금지 — 콜백 내 set).
 */
export function buildHouseAddressPatch(v: AddressValue): Partial<HouseEntry> {
  const patch: Partial<HouseEntry> = {
    addressRoad: v.road,
    addressJibun: v.jibun,
    buildingName: v.building,
    addressDetail: v.detail,
    addressDong: v.dong ?? "",
    addressHo: v.ho ?? "",
    longitude: v.lng,
    latitude: v.lat,
  };
  if (v.pnu && v.pnu.length >= 10) {
    const code = v.pnu.slice(0, 10);
    patch.regionCode = code;
    patch.region = deriveHouseRegionFromCode(code);
  }
  if (v.pnu && v.pnu.length === 19) patch.addressPnu = v.pnu;
  if (v.standardPrice != null) {
    patch.officialPrice = String(v.standardPrice);
    patch.addressLookupFilled = true;
  }
  if (v.exclusiveArea != null) {
    patch.exclusiveArea = String(v.exclusiveArea);
    patch.addressLookupFilled = true;
  }
  return patch;
}
