/**
 * 지목별 도시지역 판정 (§168-8 ④ 농지 / §168-9 ①2호 임야 / §168-10 ④ 목장)
 *
 * PDF p.1696·p.1699·p.1700·p.1702 총괄 요약표 기준.
 */

import type { ZoneType } from "./types";
import {
  LOCAL_TAX_ZONE_AREA_MULTIPLIER as LOCAL_TAX_ZONE_AREA_MULTIPLIER_CANON,
  getZoneAreaMultiplier,
} from "../local-tax-zone-multiplier";

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
    // 2008.2.21 이전: 녹지까지 포함 — 이 조문에는 보전녹지 세분이 없다.
    return isUrbanResidentialCommercialIndustrial(zoneType) || isGreenZone(zoneType);
  }
  return isUrbanResidentialCommercialIndustrial(zoneType);
}

/** 녹지지역 계열(보전·생산·자연) — 녹지 세분이 없는 조문에서 함께 취급. */
export function isGreenZone(zoneType: ZoneType): boolean {
  return zoneType === "green" || zoneType === "conservation_green";
}

/**
 * §168-9 ①2호 임야 "도시지역" = 주·상·공 + 녹지.
 *
 * 단서 본문이 「도시지역(같은 법 시행령 제30조의 규정에 따른 **보전녹지지역을 제외한다**.
 * 이하 이 호에서 같다)」이므로 보전녹지는 제외하고 생산·자연녹지(`green`)만 포함한다.
 *
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
  // §168의12에는 녹지 세분이 없다 — 보전녹지도 녹지로 본다.
  return (
    isUrbanResidentialCommercialIndustrial(zoneType) ||
    isGreenZone(zoneType) ||
    zoneType === "unplanned"
  );
}

/**
 * 주택부수토지 배율 세분(도시지역 일률 5배 → 3/5/5) **시행일**.
 *
 * 2020.2.11. 대통령령 제30395호 부칙 §1 3호 — 「제154조제7항제1호, 제160조제1항,
 * 제167조의5제1호 및 제168조의12제1호의 개정규정: **2022년 1월 1일**」
 * 같은 부칙 §39(경과조치) — 「**2022년 1월 1일 전에 양도한 자산**에 대해서는 … 개정규정에도
 * 불구하고 **종전의 규정**에 따른다」. 부칙 §2②도 "시행 이후 **양도하는 분**부터" 적용 →
 * 기준은 **양도일**이다.
 *
 * 3축(비과세 영 §154⑦ / 세율 영 §167의5 / 비사토 영 §168의12)이 같은 부칙 호로 함께 움직이므로
 * 세율 축(`appurtenantLandMultiplier`)도 이 상수를 공유한다 — 날짜 중복 정의 금지.
 */
export const HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE = new Date("2022-01-01");

/**
 * §168-12 주택부수토지 배율.
 *
 * **2022.1.1. 이후 양도분** (현행):
 *   도시지역 內 — 수도권 주·상·공 3배 / 수도권 녹지 5배 / 수도권 밖 도시 5배
 *   도시지역 外 — 10배
 *
 * **2022.1.1. 전 양도분** (종전 — 부칙 §39):
 *   도시지역 內 **일률 5배** / 그 밖의 토지 10배
 *   (2020.2.11. 대통령령 제30395호로 개정되기 전의 영 §168의12·§154⑦ 원문.
 *    조심 2021광2410(2021.7.16.) 별지·조심 2024서2826(2025.5.13.) 관련법령 인용으로 확인.)
 *
 * @param transferDate 양도일. **미제공 시 현행 배율**(기존 호출부 호환) — 신규 호출부는 반드시 전달할 것.
 */
export function getHousingMultiplier(
  zoneType: ZoneType,
  isMetropolitan: boolean,
  transferDate?: Date,
): { multiplier: number; detail: string } {
  const urban = isUrbanForHousing(zoneType);

  // 종전 규정 — 도시지역 여부만으로 결정(수도권 축 없음). 2호(그 밖 10배)는 미개정이라 동일.
  if (transferDate && transferDate < HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE) {
    return urban
      ? { multiplier: 5, detail: "도시지역 內 5배 (2022.1.1. 전 양도 — 종전 규정)" }
      : { multiplier: 10, detail: "도시지역 外 10배" };
  }

  if (!urban) return { multiplier: 10, detail: "도시지역 外 10배" };

  if (isMetropolitan) {
    if (isGreenZone(zoneType)) return { multiplier: 5, detail: "수도권 녹지 5배" };
    if (isUrbanResidentialCommercialIndustrial(zoneType)) {
      return { multiplier: 3, detail: "수도권 주·상·공 3배" };
    }
    // 수도권 미계획지역 등
    return { multiplier: 5, detail: "수도권 기타 도시 5배" };
  }
  // 수도권 밖
  return { multiplier: 5, detail: "수도권 밖 도시 5배" };
}

/**
 * 「지방세법 시행령」 제101조 제2항 용도지역별 적용배율 — 정본 재수출.
 *
 * **정본은 `lib/tax-engine/local-tax-zone-multiplier.ts`**다(재산세 별도합산과 공유).
 * 여기서 재선언하지 말 것 — 이 파일은 「소득세법 시행령」 계열 `ZoneType`으로
 * 좁혀 쓰기 위한 얇은 재수출만 담당한다.
 *
 * 「소득세법」 제104조의3 제1항 제4호 나목이 「지방세법」 제106조 제1항 제2호(별도합산)를
 * 비사업용에서 제외하므로, **건축물(비주택) 부속토지**의 기준면적은
 * 「지방세법 시행령」 제101조 제1항 제2호(= 바닥면적 × 제2항 적용배율)로 결정된다.
 *
 * ⚠️ **수도권 축이 없다** — 용도지역만으로 결정된다. 「소득세법 시행령」 제168조의12
 * (주택부수토지 배율)와 결정적으로 다른 점이며, 두 표는 22개 조합 중 19개가 어긋난다.
 */
export const LOCAL_TAX_ZONE_AREA_MULTIPLIER: Partial<Record<ZoneType, number>> =
  LOCAL_TAX_ZONE_AREA_MULTIPLIER_CANON;

/**
 * 건축물(비주택) 부속토지 기준면적 배율 —
 * 「지방세법 시행령」 제101조 제1항 제2호·제2항.
 *
 * 근거 체인: 「소득세법」 제104조의3 제1항 제4호 나목 →
 *   「지방세법」 제106조 제1항 제2호(별도합산과세대상) →
 *   「지방세법 시행령」 제101조 제1항 제2호(바닥면적 × 제2항 적용배율)
 *
 * 주택 부수토지(「소득세법」 제104조의3 제1항 제5호 → 「소득세법 시행령」 제168조의12)와
 * **다른 조문·다른 배율표**다. 주택은 `getHousingMultiplier`를 쓴다.
 *
 * @returns 표에 없는 용도지역(`residential` 등)은 `undefined` — 호출부가 차단해야 한다.
 */
export function getBuildingSiteMultiplier(
  zoneType: ZoneType,
): { multiplier: number; detail: string } | undefined {
  const resolved = getZoneAreaMultiplier(zoneType);
  if (!resolved) return undefined;
  return { multiplier: resolved.multiplier, detail: resolved.detail };
}
