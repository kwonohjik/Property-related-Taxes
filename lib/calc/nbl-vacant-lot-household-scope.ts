/**
 * NBL-STATE-HISTORY-E3-④ — 13호(무주택 1세대 1필지 나지)의 「세대 주택 소유 기간」 질문·행 — **④ 전송 · ⑤ 렌더 · ⑧ 검증이 같이 읽는 술어** (단일 소스).
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §5 · §6
 *
 * 엔진이 행을 읽는 조건은 엔진 술어 `vacantLotHousePeriodsRead`(R-1)가 정한다 — 13호 ∧ (꼬리 나지 ∨ (이력 `changed` ∧ ¬의제 ∧ 660㎡ 이내)).
 * 이 파일은 그 술어에 **폼 값에서 인자만 공급하는 래퍼 1개**다(자체 조건 금지 — E3-②의 «⑧이 엔진이 안 읽는 칸을 요구» 결함 재발 방지).
 * 인자: 호(`nblOtherRelatedBusinessType`) · 양도일 현재 건축물(`effectiveOtherHasBuildingOf` — ⑫′·⑭와 같은 파생) · 이력 `changed`(`nblOtherStateEventsInUse`) ·
 * 양도일 의제(`stateHistoryDeemedBlocksOf`) · 토지 면적(`acquisitionArea` — 엔진 `landArea`와 같은 값).
 *
 * `useEffect → store` 미러링은 쓰지 않는다 — 화면은 파생을 읽기만 한다. 이 파일은 서버 모듈(`non-business-land-request.ts`)이 import하므로 React를 import하지 않는다.
 */
import { parseDecimal } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { vacantLotHousePeriodsRead } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { effectiveOtherHasBuildingOf } from "./nbl-other-state-history-scope";
import { nblOtherStateEventsInUse } from "./nbl-other-state-history-scope";
import { stateHistoryDeemedBlocksOf } from "./nbl-other-state-history-scope";

/** 엔진이 이 자산의 「세대 주택 소유 기간」 행을 읽는가 — 정밀판정 ON · 기타토지 · 13호 + 엔진 술어. 연접 다필지(`nblOtherUseParcels`)는 엔진 술어가 읽지 않는 축이라 여기서도 보지 않는다. */
export function vacantLotHousePeriodsReadOf(asset: AssetForm): boolean {
  if (!asset.nblUseDetailedJudgment || asset.nblLandType !== "other_land") return false;
  return vacantLotHousePeriodsRead({
    relatedBusinessType: asset.nblOtherRelatedBusinessType,
    tailHasBuilding: effectiveOtherHasBuildingOf(asset),
    historyChanged: nblOtherStateEventsInUse(asset),
    historyDeemedBlocked: stateHistoryDeemedBlocksOf(asset),
    landArea: parseDecimal(asset.acquisitionArea),
  });
}

/** 와이어 행 — 종료일 비움(`""`)은 키 생략(= 양도일까지). 시작일은 그대로(빈·잘못된 값은 ⑧ HH-3이 막는다). */
export interface HouseholdHouseWireRow {
  startDate: string;
  endDate?: string;
}

/**
 * ④가 와이어에 싣는 행 — 술어가 거짓이거나 질문이 `owned`가 아니면 `[]`(숨은 stale 행이 ⑫′ 구조 검사로 400을 만드는 막다른 길 방지 · 질문 `none`은 «소유한 적 없음»이라 행을 안 싣는다).
 * 질문 상태(`nblOtherHouseholdHouseStatus`)는 UI 전용이라 싣지 않는다 — 서버·엔진은 행 없음 = 현행(Q-4 (가)).
 */
export function householdHouseWireFields(asset: AssetForm): { nblOtherHouseholdHousePeriods: HouseholdHouseWireRow[] } {
  if (asset.nblOtherHouseholdHouseStatus !== "owned" || !vacantLotHousePeriodsReadOf(asset)) return { nblOtherHouseholdHousePeriods: [] };
  return {
    nblOtherHouseholdHousePeriods: (asset.nblOtherHouseholdHousePeriods ?? []).map((r) => ({ startDate: r.startDate, ...(r.endDate ? { endDate: r.endDate } : {}) })),
  };
}
