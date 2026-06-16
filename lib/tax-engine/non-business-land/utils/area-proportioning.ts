/**
 * 면적 안분 — 기준면적 초과분 비사업용 산출 (목장 §168의10③ · 기타토지 §168의11① 공용)
 *
 * 사업용 면적 = min(전체면적, 기준면적), 비사업용 면적 = max(0, 전체−기준).
 * nonBusinessRatio는 소수 4자리 반올림(면적 비율, 금액 아님).
 */
import type { AreaProportioning } from "../types";

export function computeAreaProportioning(totalArea: number, standardArea: number): AreaProportioning {
  const businessArea = Math.min(totalArea, standardArea);
  const nonBusinessArea = Math.max(0, totalArea - standardArea);
  const nonBusinessRatio = totalArea > 0 ? Math.round((nonBusinessArea / totalArea) * 10000) / 10000 : 0;
  return {
    totalArea,
    businessArea,
    nonBusinessArea,
    nonBusinessRatio,
    buildingMultiplier: 1,
  };
}
