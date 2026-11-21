/**
 * 겸용주택 배율 초과 면적의 **후보 판정** — ⑤ 노출 · ④ 전송 · ⑧ 검증이 «초과분이 있을 수 있는가»를 같은 술어로 읽는다 (NBL2611-C5).
 *
 * 엔진은 초과분을 두 기준으로 잰다(`mixed-use-metro-required.ts`와 같은 두 기준) —
 *  · 단서 경로: 주택 부수토지 × 주택 정착면적 한도 (`calcExcessLandRatio`)
 *  · OH-17(§154③ 본문 — 주택 연면적 > 주택 외 연면적): 전체 토지 × 건물 전체 정착면적 한도 (`calcWholeBuildingExcessLand`). 비과세·12억 이하 여부는 여기서 알 수 없어 연면적 우열만 본다.
 * 어느 쪽이든 초과가 있으면 «있을 수 있다»(상위집합)다 — 입력 칸이 화면에 보이는데 엔진이 초과분을 만들지 않으면 입력은 읽히지 않을 뿐 세액에 닿지 않는다.
 * 반대로 칸을 숨겼는데 엔진이 초과분을 만들면 유예를 못 받는 막다른 길이라 상위집합으로 둔다.
 *
 * 수도권 여부 미선택은 엔진(`?? true`)과 같게 읽는다 — 배율이 실제로 갈리면 ⑧(`validateMixedUseAreas`)이 먼저 막는다.
 */
import { areaTimes, judgeAreaLimit } from "./area-limit";
import { computeDerivedAreas } from "./mixed-use-derived-areas";
import type { MixedMetroSource } from "./mixed-use-metro-required";
import { getHousingMultiplier } from "./non-business-land/urban-area";
import type { ZoneType } from "./non-business-land/types";

export function mixedExcessAreaCandidate(a: MixedMetroSource, transferDate?: Date): number {
  const zone = (a.zoneType ?? "residential") as ZoneType;
  const multiplier = getHousingMultiplier(zone, a.isMetropolitanArea ?? true, transferDate).multiplier;
  const derived = computeDerivedAreas({
    residentialFloorArea: a.residentialFloorArea,
    nonResidentialFloorArea: a.nonResidentialFloorArea,
    buildingFootprintArea: a.buildingFootprintArea,
    totalLandArea: a.totalLandArea,
    ...(a.residentialLandAreaOverride !== undefined ? { residentialLandAreaOverride: a.residentialLandAreaOverride } : {}),
    ...(a.commercialLandAreaOverride !== undefined ? { commercialLandAreaOverride: a.commercialLandAreaOverride } : {}),
    ...(a.residentialFootprintOverride !== undefined ? { residentialFootprintOverride: a.residentialFootprintOverride } : {}),
  });
  const housing = judgeAreaLimit(derived.residentialLandArea, areaTimes(derived.residentialFootprintArea, multiplier)).excess;
  const whole =
    a.residentialFloorArea > a.nonResidentialFloorArea
      ? judgeAreaLimit(a.totalLandArea, areaTimes(a.buildingFootprintArea, multiplier)).excess
      : 0;
  return Math.max(housing, whole);
}
