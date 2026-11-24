/**
 * NBL-STATE-HISTORY-E3-④ — 13호(무주택 1세대 1필지 나지)의 「세대 주택 소유 기간」 질문·행 — ④ 전송 조립(이 파일) · ⑤ 렌더 · ⑧ 검증이 같이 읽는 술어의 **순수 입력 부분**.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §5 · §6 · §18(M-1)
 *
 * «엔진이 행을 읽는가»는 두 층이다:
 *   ① 이 파일의 `vacantLotHousePeriodsPrecondition` — 엔진 순수 술어 `vacantLotHousePeriodsRead`(13호 ∧ (꼬리 나지 ∨ (이력 `changed` ∧ ¬의제 ∧ ≤660㎡)))에 폼 값만 공급하는 **필요조건**. 싸고 raw가 필요 없다.
 *   ② 엔진 core 실측(`otherLandReadsHouseholdHousePeriods`) — 나목 Step 3-1·수입금액비율·부분 면적이 13호보다 먼저 끝나는 경로를 걸러 **정확한** 답을 낸다(M-1). 이 파일은 ④ raw를 만들지 않으므로
 *      실측은 호출자가 넘긴다: ④ 조립(`non-business-land-request.ts`)은 자기 base raw로, ⑤⑧은 `nbl-vacant-lot-household-read.ts`의 `vacantLotHousePeriodsReadOf`가 같은 함수로.
 * 이 파일은 서버 모듈(`non-business-land-request.ts`)이 import하므로 React·request를 import하지 않는다(순환 방지).
 */
import { parseDecimal } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { vacantLotHousePeriodsRead } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { effectiveOtherHasBuildingOf } from "./nbl-other-state-history-scope";
import { nblOtherStateEventsInUse } from "./nbl-other-state-history-scope";
import { stateHistoryDeemedBlocksOf } from "./nbl-other-state-history-scope";

/** 엔진이 행을 읽을 **수 있는가**(필요조건) — 정밀판정 ON · 기타토지 · 13호 + 엔진 순수 술어. 연접 다필지(`nblOtherUseParcels`)는 엔진 술어가 읽지 않는 축이라 여기서도 보지 않는다. */
export function vacantLotHousePeriodsPrecondition(asset: AssetForm): boolean {
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
 * ④가 와이어에 싣는 행 — 술어(필요조건 ∧ 엔진 실측 `engineReads`)가 거짓이거나 질문이 `owned`가 아니면 `[]`(숨은 stale 행이 ⑫′ 구조 검사로 400을 만드는 막다른 길 방지 · 질문 `none`은 «소유한 적 없음»이라 행을 안 싣는다).
 * 질문 상태(`nblOtherHouseholdHouseStatus`)는 UI 전용이라 싣지 않는다 — 서버·엔진은 행 없음 = 현행(Q-4 (가)).
 */
export function householdHouseWireFields(asset: AssetForm, engineReads: () => boolean): { nblOtherHouseholdHousePeriods: HouseholdHouseWireRow[] } {
  if (asset.nblOtherHouseholdHouseStatus !== "owned" || !vacantLotHousePeriodsPrecondition(asset) || !engineReads()) return { nblOtherHouseholdHousePeriods: [] };
  return {
    nblOtherHouseholdHousePeriods: (asset.nblOtherHouseholdHousePeriods ?? []).map((r) => ({ startDate: r.startDate, ...(r.endDate ? { endDate: r.endDate } : {}) })),
  };
}
