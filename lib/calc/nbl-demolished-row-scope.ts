/**
 * 나대지 구간 근거 «철거ㆍ멸실»의 사실 칸 4개 — **⑤ 렌더가 읽는 술어**(NBL-STATE-HISTORY-E3-⑤ E3f-2 · U-3 · 계획서 `…e3-5-demolition-temp-status.ui.plan.md` §4.3 · §5).
 *
 * ④ 와이어(`stateEventWireRow`) · ⑧(`demolishedRowFactIssue`) · ⑫′ · ⑭가 쓰는 엔진 술어를 그대로 부르고 UI가 날짜·시행본을 비교하지 않는다:
 *  · 이 행이 철거 행 뒤 나대지 구간을 닫고 근거가 «철거ㆍ멸실»인가 — 와이어 근거(`stateEventWireRow`가 엔진 `eventOffersDemolished`·`eventBasisOptions`에 없는 stale 근거를 비운다).
 *  · 어느 칸이 필요한가 — `demolishedRequiredFacts`(후보 과세기준일 시행본별 · 철거 행 종류별). 노출 ≡ 필수.
 *  · 비어 있는 칸 — `firstBlankDemolishedFact`(⑧·⑫′와 같은 함수).
 * 「엔진이 이력을 읽는가」(`nblStateHistoryIsRead`)는 raw를 요구해(엔진을 돌린다) 호출자가 한 번 계산해 넘긴다 — 거짓이면 4칸 모두 그리지 않는다(UQ-8 (가)).
 *
 * 순수 파생이다 — `useEffect → store` 미러링 없음. 이 파일은 React를 import하지 않는다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { DemolishedRemovedKind, DemolishedRequiredFacts } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { demolishedRequiredFacts } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { firstBlankDemolishedFact } from "@/lib/tax-engine/non-business-land/demolished-row-facts";
import { demolishedRemovedKindOf } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { removalDateFor } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { nblHousingStateHistoryApplies } from "./nbl-other-state-history-scope";
import { stateHistoryWireFields } from "./nbl-other-state-history-scope";

export interface DemolishedRowView {
  /** 철거 행 날짜(칸 그대로 — 빈 문자열일 수 있다). */
  removedOn: string;
  /** 철거된 건축물 종류 — 주택(빈집정비 칸 · 바닥면적 칸 없음) 또는 비주택 건축물(바닥면적 칸). */
  kind: DemolishedRemovedKind;
  /** 철거일·닫는 행 날짜를 읽을 수 있는가 — 거짓이면 `need`는 전부 거짓이다(행 결함이 먼저 막는다). */
  datesReadable: boolean;
  /** 이 구간에서 필요한 사실 칸(`historyRead`와 무관한 구조 집합 — 호출자가 «엔진이 읽는가»를 따로 건다). */
  need: DemolishedRequiredFacts;
}

/**
 * `i`번째 사건 행이 **근거 «철거ㆍ멸실»을 고른 철거 행 뒤 나대지 구간 닫는 행**(④ 와이어가 그 근거를 싣는 행 = 엔진 `eventOffersDemolished`)이면 그 사실 칸 뷰, 아니면 null.
 * 이 자산에 이력 질문이 적용되지 않거나 모드가 `changed`가 아니면 null(와이어가 비어 있다).
 */
export function demolishedRowViewOf(asset: AssetForm, i: number): DemolishedRowView | null {
  const wire = stateHistoryWireFields(asset).nblOtherStateEvents;
  const w = wire[i];
  if (!w || w.propertyTaxBasisBefore !== "demolished" || w.propertyTaxTypeBefore !== "separate") return null;
  const house = nblHousingStateHistoryApplies(asset);
  const tailKind = house ? ("house" as const) : undefined;
  // 와이어 근거가 `demolished`이면 이 행은 이미 «철거 행 뒤 나대지 구간을 닫는 행»이다 — ④ `stateEventWireRow`가 `eventOffersDemolished`일 때만 그 근거를 싣는다(여기서 다시 묻지 않는다).
  const kind = demolishedRemovedKindOf(wire, i, tailKind);
  if (!kind) return null;
  const removedRaw = removalDateFor(wire, i) ?? "";
  const removedOn = toOptionalDate(removedRaw);
  const end = toOptionalDate(w.date);
  const need = demolishedRequiredFacts({ removedOn, intervalStart: toOptionalDate(wire[i - 1]?.date), end, kind, historyRead: true });
  return { removedOn: removedRaw, kind, datesReadable: !!removedOn && !!end, need };
}

/** 이 행의 사실 칸 중 아직 답하지 않은 첫 칸(⑧·⑫′와 같은 함수) — 모두 답했으면 null. 저장 행(`stored`)의 값을 읽는다. */
export function demolishedRowUnansweredField(stored: Parameters<typeof firstBlankDemolishedFact>[0], view: DemolishedRowView) {
  return firstBlankDemolishedFact(stored, view.need);
}

/** 사실 칸이 하나라도 필요한가. */
export const demolishedRowNeedsAnyFact = (view: DemolishedRowView): boolean => view.need.permit || view.need.otherUse || view.need.vacantHouse || view.need.floorArea;
