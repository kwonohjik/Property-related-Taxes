/**
 * 지목별 도시지역 판정 (§168-8 ④ 농지 / §168-9 ①2호 임야 / §168-10 ④ 목장)
 *
 * PDF p.1696·p.1699·p.1700·p.1702 총괄 요약표 기준.
 */

import type { ZoneType } from "./types";

/**
 * 주거·상업·공업지역 여부 (주·상·공).
 * 농지·목장 도시지역 판정의 기본.
 */
export function isUrbanResidentialCommercialIndustrial(zoneType: ZoneType): boolean {
  return (
    zoneType === "residential" ||
    zoneType === "exclusive_residential" ||
    zoneType === "general_residential" ||
    zoneType === "semi_residential" ||
    zoneType === "commercial" ||
    zoneType === "industrial"
  );
}

/**
 * §168-8 ④ 농지의 "도시지역" = 주거·상업·공업 (녹지·개발제한 제외).
 */
export function isUrbanForFarmland(zoneType: ZoneType): boolean {
  return isUrbanResidentialCommercialIndustrial(zoneType);
}

/**
 * §168-10 ④ 목장의 "도시지역" = 주거·상업·공업 (녹지·개발제한 제외).
 * 2008.2.21 이전 양도분은 도시지역 전체 포함 (녹지도 포함).
 */
export function isUrbanForPasture(zoneType: ZoneType, transferDate: Date): boolean {
  const cutoff = new Date("2008-02-21");
  if (transferDate < cutoff) {
    // 2008.2.21 이전: 녹지까지 포함
    return isUrbanResidentialCommercialIndustrial(zoneType) || zoneType === "green";
  }
  return isUrbanResidentialCommercialIndustrial(zoneType);
}

/**
 * §168-9 ①2호 임야 "도시지역" = 주·상·공 + 녹지 (보전녹지 제외, 자연녹지·생산녹지 포함).
 * ※ 임야는 원칙 지역기준 미적용이며, 시업중 임야·특수산림사업지구만 이 판정을 적용.
 */
export function isUrbanForForest(zoneType: ZoneType): boolean {
  return isUrbanResidentialCommercialIndustrial(zoneType) || zoneType === "green";
}

/**
 * 주택부수토지 §168-12 — 도시지역 여부 (용도지역 판정).
 * 배율 판정은 getHousingMultiplier에서 수도권 여부까지 고려.
 */
export function isUrbanForHousing(zoneType: ZoneType): boolean {
  return (
    isUrbanResidentialCommercialIndustrial(zoneType) ||
    zoneType === "green" ||
    zoneType === "unplanned"
  );
}

/**
 * §168-12 주택부수토지 배율.
 * 도시지역 內:
 *   - 수도권 주·상·공: 3배
 *   - 수도권 녹지: 5배
 *   - 수도권 밖 도시: 5배
 * 그 외 (도시지역 外): 10배
 */
export function getHousingMultiplier(
  zoneType: ZoneType,
  isMetropolitan: boolean,
): { multiplier: number; detail: string } {
  const urban = isUrbanForHousing(zoneType);
  if (!urban) return { multiplier: 10, detail: "도시지역 外 10배" };

  if (isMetropolitan) {
    if (zoneType === "green") return { multiplier: 5, detail: "수도권 녹지 5배" };
    if (isUrbanResidentialCommercialIndustrial(zoneType)) {
      return { multiplier: 3, detail: "수도권 주·상·공 3배" };
    }
    // 수도권 미계획지역 등
    return { multiplier: 5, detail: "수도권 기타 도시 5배" };
  }
  // 수도권 밖
  return { multiplier: 5, detail: "수도권 밖 도시 5배" };
}
