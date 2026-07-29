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
import type { RegionType } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

/**
 * regionCode → "capital"(REGION: 수도권·광역시(군 제외)·세종) | "non_capital"(VALUE: 지방·군 지역).
 * regionCode 미입력(주소 미검색) 시 REGION(capital) 기본값 — 종전 기본값 유지·과소산정 회피.
 */
export function deriveHouseRegionFromCode(regionCode?: string): "capital" | "non_capital" {
  if (!regionCode) return "capital";
  return classifyRegionCriteriaByCode(regionCode) === "REGION" ? "capital" : "non_capital";
}

/**
 * 임대주택 소재지역(수도권/비수도권) — 수도권정비계획법 §2 기준.
 * 법정동코드 앞 2자리(시도코드) 11(서울)·28(인천)·41(경기) 전역 = 수도권(seoul-metro, 군 포함).
 * 그 외(광역시·세종·지방 도) = 비수도권(non-metro).
 * regionCode 미입력 시 seoul-metro 기본값(factory·migrate 기본값과 일치).
 *
 * ⚠️ §167의3① classifyRegionCriteriaByCode(REGION에 광역시·세종 포함, 강화·옹진·가평·연천·양평
 * 군을 carve-out)와 **의도적으로 다름** — 임대 cap의 수도권은 군 carve-out 없는 순수 시도 기준.
 * (부산·세종 = 임대 비수도권 / 인천 강화군·경기 양평군 = 임대 수도권)
 */
export function deriveRentalRegionFromCode(regionCode?: string): RegionType {
  if (!regionCode) return "seoul-metro";
  const sido = regionCode.slice(0, 2);
  return sido === "11" || sido === "28" || sido === "41" ? "seoul-metro" : "non-metro";
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
