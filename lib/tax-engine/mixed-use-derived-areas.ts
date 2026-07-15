/**
 * 겸용주택 부수토지 면적 안분 — 순수 leaf 모듈.
 *
 * `transfer-tax-mixed-use-helpers.ts`(NBL·PHD·fourpart·progressive import)에서 분리 추출.
 * UI(`use client`)·사이드바·bridge·엔진 helpers가 이 leaf만 import → 안분 로직 단일 소스.
 * 무거운 엔진 모듈 그래프가 client 번들에 유입되는 것을 방지한다.
 *
 * 소득세법 시행령 §160① / §164⑫ (부수토지 배율).
 */

import type { MixedUseDerivedAreas } from "./types/transfer-mixed-use.types";
import { round2, residualArea } from "./area-utils";

// round2 는 `./area-utils` 로 승격됨(전 세목 공통 면적 안분 유틸).
// 기존 import 경로(UI·bridge) 호환을 위해 재수출 유지.
export { round2 };

/**
 * 면적 파생 — 주택 부수토지 override 우선, 상가는 항상 `전체 − 주택` (방식 B, 합=전체토지 불변식).
 *
 * @param input.residentialLandAreaOverride 주택 부수토지 수동 지정 (㎡).
 *   undefined=자동 안분, 0=적법(주택부수토지 0). `??`로 0 보존(three-state).
 */
export function computeDerivedAreas(input: {
  residentialFloorArea: number;
  nonResidentialFloorArea: number;
  buildingFootprintArea: number;
  totalLandArea: number;
  residentialLandAreaOverride?: number;
}): MixedUseDerivedAreas {
  const total = input.residentialFloorArea + input.nonResidentialFloorArea;
  if (total <= 0) {
    return {
      residentialRatio: 0,
      residentialLandArea: 0,
      commercialLandArea: round2(input.totalLandArea),
      residentialFootprintArea: 0,
    };
  }
  const residentialRatio = input.residentialFloorArea / total;
  const autoResidentialLand = round2(input.totalLandArea * residentialRatio);
  // ?? 로 override=0 보존 (|| 금지 — three-state: 빈값 undefined vs 적법 0)
  const residentialLandArea = input.residentialLandAreaOverride ?? autoResidentialLand;
  // 마지막 항목(상가) 잔액 흡수 — 비율 재계산 금지. 합 = 전체토지 불변식.
  const commercialLandArea = residualArea(input.totalLandArea, residentialLandArea);
  return {
    residentialRatio,
    residentialLandArea,
    commercialLandArea,
    residentialFootprintArea: round2(input.buildingFootprintArea * residentialRatio),
  };
}
