/**
 * 기타토지 소유기간 중 상태 이력(NBL-STATE-HISTORY) — **④ 전송 · ⑤ 렌더 · ⑧ 검증이 같이 읽는 술어** (단일 소스).
 *
 * 따로 쓰면 한쪽만 바뀌어 막다른 길이 된다 — 연접 다필지로 질문이 숨은 뒤에도 store에 남은 `changed`·잘못된 사건 행이 그대로 전송되면
 * ⑧은 건너뛰는데 ⑫ refine은 400으로 막는다(화면에 없는 칸 막다른 길). 그래서 **전송·렌더·검증이 같은 전체 술어**를 쓴다
 * (계획서 `docs/01-plan/features/nbl-other-land-state-history.ui.plan.md` §2.2 · §6 ④ · §6.1).
 *
 * 건축물 유무 파생(`effectiveOtherHasBuildingOf`)은 엔진 leaf(`effectiveOtherHasBuilding`)에 위임한다 — ⑫ refine·⑭ 매퍼가 같은 함수를 쓴다(3중 패턴).
 * `useEffect → store` 미러링은 쓰지 않는다 — 화면은 이 파생을 읽기만 하고, 모드 전환 시 토글 저장값은 onChange 핸들러가 쓴다.
 *
 * 이 파일은 서버 모듈(`non-business-land-request.ts`)도 import하므로 React 컴포넌트를 import하지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { consumesStateHistory } from "@/lib/tax-engine/non-business-land/land-category";
import type { StateHistoryMode } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { effectiveOtherHasBuilding } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventCarriesTaxTypeBefore } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isBuildingEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";

/**
 * 「건축물 유무 이력」 질문이 이 자산에 적용되는가 — 지목(소비표) · 정밀판정 ON · 연접 다필지 꺼짐.
 * 의제(§168의14③ 무조건 사업용) 성립은 ⑧ `validateNblDetailedJudgment`가 앞에서 `return`하고 ⑫가 앞에서 `return`하므로 여기서 다시 보지 않는다.
 * 연접 다필지는 필지별 `hasBuilding`이 이미 있어 v1에서 배타다(통합 Q-13).
 */
export function nblOtherStateHistoryApplies(asset: Pick<AssetForm, "nblLandType" | "nblUseDetailedJudgment" | "nblOtherUseParcels">): boolean {
  return !!asset.nblUseDetailedJudgment && consumesStateHistory(asset.nblLandType) && !asset.nblOtherUseParcels;
}

/** 사건 행의 종류가 모두 선택됐는가(0건은 아님). 파생 `hasBuilding`은 이때만 사건이 정한다 — 미완성 행이 있으면 저장 토글값을 읽는다. */
function eventKindsComplete(events: ReadonlyArray<Pick<NblOtherStateEventInput, "kind">>): boolean {
  return events.length > 0 && events.every((e) => isEventKind(e.kind));
}

/** 이 자산에서 사건 목록이 판정에 쓰이는 상태인가 — 질문이 적용되고 답이 `changed`다. */
export function nblOtherStateEventsInUse(asset: AssetForm): boolean {
  return nblOtherStateHistoryApplies(asset) && asset.nblOtherStateHistoryMode === "changed";
}

/**
 * 「건축물 있음」 토글을 숨기는가 — 사건 목록이 판정에 쓰이고 **건축물 사건(신축·멸실)이 1건 이상**일 때만이다(E3-① · 사용자 결정 2026-11-23).
 * 건축물 사건이 0건이면(재산세 과세 구분 변경만 입력했거나 아직 행이 없음) 양도일 현재 건축물 유무를 받을 곳이 이 토글뿐이라 그대로 보인다 —
 * 숨기면 엔진이 «건축물 없음»으로 읽어 건물 있는 토지의 이력이 틀어지거나 ⑧이 영구 차단하는 막다른 길이 된다.
 */
export function nblOtherBuildingToggleHidden(asset: AssetForm): boolean {
  return nblOtherStateEventsInUse(asset) && (asset.nblOtherStateEvents ?? []).some((e) => isBuildingEventKind(e.kind));
}

/**
 * 양도일 현재 「건축물 있음」 — 화면 ⑤ 6곳 · ⑧ 2곳이 **모두 이 함수**를 읽는다.
 * 질문이 적용되고 `changed`이며 사건 종류가 모두 선택됐으면 마지막 사건 종류(= 신축이면 true), 아니면 저장된 토글값.
 */
export function effectiveOtherHasBuildingOf(asset: AssetForm): boolean {
  if (!nblOtherStateEventsInUse(asset)) return asset.nblOtherHasBuilding;
  const events = asset.nblOtherStateEvents ?? [];
  if (!eventKindsComplete(events)) return asset.nblOtherHasBuilding;
  return effectiveOtherHasBuilding(asset.nblOtherHasBuilding, "changed", events);
}

/** ④가 와이어에 싣는 이력 필드 — 술어가 거짓이면 비워 보낸다(`""` · `[]`). 참이고 `changed`가 아니면 모드는 유지하고 사건만 비운다(엔진이 `unchanged`·`unknown` 고지를 모드로 가른다). */
export function stateHistoryWireFields(asset: AssetForm): {
  nblOtherStateHistoryMode: StateHistoryMode;
  nblOtherStateEvents: NblOtherStateEventInput[];
} {
  if (!nblOtherStateHistoryApplies(asset)) return { nblOtherStateHistoryMode: "", nblOtherStateEvents: [] };
  const mode = asset.nblOtherStateHistoryMode;
  if (mode !== "changed") return { nblOtherStateHistoryMode: mode, nblOtherStateEvents: [] };
  return {
    nblOtherStateHistoryMode: "changed",
    // 신축 행의 «직전 재산세 구분»은 뜻이 없다 — 와이어에는 `""`로 정규화한다(onChange가 이미 리셋하지만 복원 값 방어). 운반 여부는 leaf 단일 술어(철거·구분 변경 = 운반).
    nblOtherStateEvents: (asset.nblOtherStateEvents ?? []).map((e) => ({
      kind: e.kind,
      date: e.date,
      propertyTaxTypeBefore: eventCarriesTaxTypeBefore(e.kind) ? e.propertyTaxTypeBefore : "",
    })),
  };
}
