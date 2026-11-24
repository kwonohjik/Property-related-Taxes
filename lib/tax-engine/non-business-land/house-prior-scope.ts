/**
 * NBL-STATE-HISTORY-E3-③ B — 기타토지 철거 행 «철거된 건축물 = 주택» 입력의 **적용 범위 술어**(⑤ 렌더 · ④ 전송 · ⑧ 검증 · ⑭ 매퍼 · 엔진이 같은 함수를 쓴다 — 단일 소스).
 *
 *   · `housePriorNeedsMetropolitan` — 수도권 칸을 여는 조건부 술어(D-13 · T-7). 소비표 `other_land.metropolitanArea`는 false 그대로 둔다(기타토지 전 입력의 ⑧·④·⑭ 파급 방지).
 *   · `stateHistoryDeemedBlocks` — 양도일 의제 사유가 선택돼 엔진이 이력을 읽지 않는 조건(UQ-12 (가) · R-10). ⑧은 B 새 규칙(정착면적·수도권)을 건너뛰고, 엔진 `applyStateHistory`도 같은 술어로 이력을 접는다.
 */
import { consumesHousingStateHistory } from "./land-category";
import { consumesPeriodJudgmentDate } from "./land-category";
import { consumesStateHistory } from "./land-category";
import { eventClosesHouseInterval } from "./other-land-state-history";
import { getHousingMultiplier } from "./urban-area";
import { HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE } from "./urban-area";
import type { LandType } from "./types";
import type { ZoneType } from "./types";

/**
 * 이 용도지역에서 **수도권 여부가 배율을 가르는가** — 영 §168의12 배율표(`getHousingMultiplier`)의 두 호출(수도권 · 수도권 밖)이 다른 값을 내는가로 **표에서 파생**한다(V-22 — 향후 개정에도 표와 자동 일치).
 * 현행(2022.1.1. 이후 양도) 표에서는 도시지역 주·상·공(수도권 3배 · 수도권 밖 5배)뿐이다. 녹지·그 밖의 도시·도시지역 밖은 수도권 안팎이 같다.
 *
 * `transferDate`를 생략하면 현행 표(경과조치 시행일 이후)로 본다 — 칸을 여는 술어(`housePriorNeedsMetropolitan`)는 양도일 입력 순서와 무관하게 용도지역만으로 정한다.
 * 판정 쪽(수도권 미제공 보수 기본값 경고)은 실제 양도일을 넘긴다 — 2022.1.1. 전 양도는 수도권 여부가 배율을 가르지 않아 경고가 소음이다.
 */
export function metropolitanChangesHousingMultiplier(zoneType: ZoneType | string | undefined, transferDate: Date = HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE): boolean {
  const zone = (zoneType ?? "") as ZoneType;
  return getHousingMultiplier(zone, true, transferDate).multiplier !== getHousingMultiplier(zone, false, transferDate).multiplier;
}

/**
 * B 수도권 칸을 읽는가 — 「기타토지 ∧ 주택으로 고른 철거 행이 있음 ∧ 수도권이 배율을 가르는 용도지역」.
 *
 * `events`는 **와이어 사건**이다(`buildingKindBefore` 포함 · R-11) — 폼 저장 사건을 그대로 넘기지 않는다(`unchanged`·`unknown` 뒤에 남은 stale 행이 막다른 길을 만든다). ④는 `stateHistoryWireFields` 결과를,
 * ⑭는 `changed`일 때의 raw 사건(아니면 `[]`)을 넘긴다. 주택부수토지·별장은 소비표(`consumesMetropolitanArea`)가 이미 연다 — 이 술어는 **기타토지만** 본다.
 */
export function housePriorNeedsMetropolitan(
  landType: LandType | "" | undefined,
  zoneType: ZoneType | string | undefined,
  events: ReadonlyArray<{ kind: string; buildingKindBefore?: string }> | undefined,
): boolean {
  if (!consumesStateHistory(landType) || consumesHousingStateHistory(landType)) return false;
  if (!(events ?? []).some((_, i) => eventClosesHouseInterval(events!, i, undefined))) return false;
  return metropolitanChangesHousingMultiplier(zoneType);
}

/**
 * 양도일 의제(영 §168의14②) 사유가 선택돼 **엔진이 상태 이력을 읽지 않는가** — 의제를 소비하는 지목(`consumesPeriodJudgmentDate`) ∧ 사유가 «없음»이 아님.
 * ④·⑭ 매퍼(`deemedTransferReason: consumesPeriodJudgmentDate(landType) ? reason || "none" : "none"`)·엔진 `applyStateHistory`·⑧(UQ-12 (가) — B 정착면적·수도권 규칙 건너뜀)이 같은 조건을 쓴다.
 */
export function stateHistoryDeemedBlocks(input: { landType: LandType | "" | undefined; deemedReason: string | undefined }): boolean {
  return consumesPeriodJudgmentDate(input.landType) && !!input.deemedReason && input.deemedReason !== "none";
}
