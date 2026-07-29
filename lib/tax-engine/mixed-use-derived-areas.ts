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
  /**
   * 상가 부수토지 수동 지정 (㎡). 미제공 시 `residualArea(전체, 주택)` 잔액.
   * 주택·상가 **둘 다 제공**되면 각 값을 그대로 사용(잔액 미적용) → 합계 불일치 가능 → validate 차단.
   */
  commercialLandAreaOverride?: number;
  /**
   * 주택 정착면적 수동 지정 (㎡). 미제공 시 `buildingFootprintArea × 주택연면적비율`.
   * 상가 정착면적은 항상 잔액이며 엔진 소비처가 없다(UI 표시 전용).
   */
  residentialFootprintOverride?: number;
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

  // ── 부수토지 4분기 ── (?? 로 override=0 보존 — || 금지: 빈값 undefined vs 적법 0)
  const rSet = input.residentialLandAreaOverride !== undefined;
  const cSet = input.commercialLandAreaOverride !== undefined;
  let residentialLandArea: number;
  let commercialLandArea: number;
  if (rSet && cSet) {
    // ⚠️ 잔액 흡수 의도적 미적용 — feedback_area_apportion_residual_absorption 규칙2의 **정당한 예외**.
    //    정책 목적은 "Σ안분면적 = 전체" 불변식인데, 여기서는 그 위반을 **사용자에게 보여주기 위해
    //    일부러 보존**한다(합계 검증의 유일한 발동 경로). 잔액을 적용하면 오류가 침묵 교정돼
    //    검증 자체가 죽는다. validate가 차단하므로 엔진 계산 도달 시점에는 Σ=전체가 보장된다.
    residentialLandArea = input.residentialLandAreaOverride!;
    commercialLandArea = input.commercialLandAreaOverride!;
  } else if (rSet) {
    residentialLandArea = input.residentialLandAreaOverride!;
    commercialLandArea = residualArea(input.totalLandArea, residentialLandArea);
  } else if (cSet) {
    commercialLandArea = input.commercialLandAreaOverride!;
    residentialLandArea = residualArea(input.totalLandArea, commercialLandArea);
  } else {
    residentialLandArea = round2(input.totalLandArea * residentialRatio);
    // 마지막 항목(상가) 잔액 흡수 — 비율 재계산 금지. 합 = 전체토지 불변식.
    commercialLandArea = residualArea(input.totalLandArea, residentialLandArea);
  }

  return {
    residentialRatio,
    residentialLandArea,
    commercialLandArea,
    residentialFootprintArea:
      input.residentialFootprintOverride ?? round2(input.buildingFootprintArea * residentialRatio),
  };
}
