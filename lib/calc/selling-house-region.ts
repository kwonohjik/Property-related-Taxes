/**
 * selling-house-region.ts — 양도 주택 소재지(수도권·광역시 등 / 지방) 자동 파생 단일 소스.
 *
 * 양도 물건(assets[0])의 법정동코드(regionCode)에서 §167의3① 주택 수 산정 지역기준을
 * 엔진 단일 소스 헬퍼(classifyRegionCriteriaByCode)로 파생한다. 사용자 수동 선택 폐지 —
 * UI 표시·단건/다건 API 페이로드가 모두 이 함수로 동일 판정(drift 0).
 */

import { classifyRegionCriteriaByCode } from "@/lib/tax-engine/multi-house-surcharge-count";

/**
 * regionCode → "capital"(REGION: 수도권·광역시(군 제외)·세종) | "non_capital"(VALUE: 지방·군 지역).
 * regionCode 미입력(양도 물건 주소 미검색) 시 REGION(capital) 기본값 — 종전 기본값 유지·과소산정 회피.
 */
export function deriveSellingHouseRegion(regionCode?: string): "capital" | "non_capital" {
  if (!regionCode) return "capital";
  return classifyRegionCriteriaByCode(regionCode) === "REGION" ? "capital" : "non_capital";
}
