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

/**
 * §168의11⑥ 복합용도 건축물 부속토지 안분.
 *
 * 특정용도분(거주·특정사업 사용분) 부속토지 = 전체 부속토지 × (특정용도분 면적 ÷ 전체 건축물 면적).
 * - ⑥1호(하나의 건축물 복합용도): 연면적비 (specificUseArea=특정용도분 연면적, totalBuildingArea=건축물 연면적)
 * - ⑥2호(동일경계 다수 건축물): 바닥면적비 (specificUseArea=특정용도분 바닥면적, totalBuildingArea=전체 바닥면적)
 *
 * businessArea = 특정용도분 부속토지(사업용), 나머지는 비사업용(종합합산).
 * 분자/분모는 클램프하지 않음(분자≤분모는 validate에서 차단). 면적 비율이므로 buildingMultiplier=1.
 */
export function computeMixedUseProportioning(
  totalArea: number,
  specificUseArea: number,
  totalBuildingArea: number,
): AreaProportioning {
  const businessRatio = totalBuildingArea > 0 ? specificUseArea / totalBuildingArea : 0;
  const businessArea = totalArea * businessRatio;
  const nonBusinessArea = Math.max(0, totalArea - businessArea);
  const nonBusinessRatio = totalArea > 0 ? Math.round((nonBusinessArea / totalArea) * 10000) / 10000 : 0;
  return {
    totalArea,
    businessArea,
    nonBusinessArea,
    nonBusinessRatio,
    buildingMultiplier: 1,
    mixedUseBuildingRatio: Math.round(businessRatio * 10000) / 10000,
  };
}
