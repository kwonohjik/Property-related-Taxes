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
import { consumesHousingStateHistory } from "@/lib/tax-engine/non-business-land/land-category";
import { consumesStateHistory } from "@/lib/tax-engine/non-business-land/land-category";
import type { StateBuildingKind, StateHistoryMode } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { HouseFootprintIssue } from "@/lib/tax-engine/non-business-land/housing-limit";
import { houseFootprintIssue } from "@/lib/tax-engine/non-business-land/housing-limit";
import { eventClosesHouseInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { effectiveOtherHasBuilding } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventBasisOptions } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventCarriesTaxTypeBefore } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventClosesBareInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isBuildingEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";

/**
 * 「건축물 유무 이력」 질문이 이 자산에 적용되는가 — 지목(소비표) · 정밀판정 ON · 연접 다필지 꺼짐.
 * **기타토지 전용**이다(E3-③ A-1): 소비표 `stateHistory` 열이 주택부수토지에도 열려 있어(엔진이 주택 이력을 읽는다) 주택은 이 술어에서 **명시적으로 뺀다** — 주택 카드의 질문은 `nblHousingStateHistoryApplies`가 따로 받고, ④⑤⑧은 둘을 합친 `nblStateHistoryApplies`를 읽는다.
 * 의제(§168의14③ 무조건 사업용) 성립은 ⑧ `validateNblDetailedJudgment`가 앞에서 `return`하고 ⑫가 앞에서 `return`하므로 여기서 다시 보지 않는다.
 * 연접 다필지는 필지별 `hasBuilding`이 이미 있어 v1에서 배타다(통합 Q-13).
 */
export function nblOtherStateHistoryApplies(asset: Pick<AssetForm, "nblLandType" | "nblUseDetailedJudgment" | "nblOtherUseParcels">): boolean {
  return !!asset.nblUseDetailedJudgment && consumesStateHistory(asset.nblLandType) && !consumesHousingStateHistory(asset.nblLandType) && !asset.nblOtherUseParcels;
}

/**
 * E3-③ A — 주택부수토지 카드의 「주택 신축·멸실 이력」 질문이 이 자산에 적용되는가 — 지목(소비표 `consumesHousingStateHistory`) · 정밀판정 ON.
 * **기타토지 전용 칸(`nblOtherUseParcels` · `nblOtherHasBuilding`)을 읽지 않는다**(계획서 §1.3 D5 — stale 연접 다필지가 주택 질문의 존재 여부를 바꾸면 안 된다).
 * 무조건 의제(`nblExempt`)·양도일 의제 사유도 읽지 않는다 — ⑧이 앞에서 return하고 주택은 의제 비적용 지목이다(§1.3 의제 교차).
 * 배율 이내 여부도 게이트가 아니다 — 엔진 안의 런타임 분기이고 ⑫′도 배율을 모른다(UQ-7 (다)): 게이트가 갈라지면 ⑧↔⑫가 어긋난다.
 */
export function nblHousingStateHistoryApplies(asset: Pick<AssetForm, "nblLandType" | "nblUseDetailedJudgment">): boolean {
  return !!asset.nblUseDetailedJudgment && consumesHousingStateHistory(asset.nblLandType);
}

/**
 * ④ 전송 · ⑤ 렌더 · ⑧ 검증이 **같이 읽는 지목 축 단일 술어**(E3-③) — 기타토지 질문 ∨ 주택부수토지 질문.
 * 각 호출처가 자체 지목 조건(`=== "housing_site"` 등)을 쓰지 않는다 — 소비표 술어(`consumes*`)를 직접 부르는 두 술어만 합친다(E3-② «⑧이 엔진 술어를 안 불러» 결함 방지).
 */
export function nblStateHistoryApplies(asset: Pick<AssetForm, "nblLandType" | "nblUseDetailedJudgment" | "nblOtherUseParcels">): boolean {
  return nblOtherStateHistoryApplies(asset) || nblHousingStateHistoryApplies(asset);
}

/** 이 자산에서 «이력 질문이 적용되고 답이 `changed`»인가 — 기타토지·주택 공용(사건 목록이 판정에 쓰이는 상태). 기타토지 토글 파생은 `nblOtherStateEventsInUse`가 따로 읽는다. */
export function nblStateEventsInUse(asset: AssetForm): boolean {
  return nblStateHistoryApplies(asset) && asset.nblOtherStateHistoryMode === "changed";
}

/** 주택부수토지 카드 사건 행의 «철거 직전 정착면적» 입력 결함 — ⑧ H9 · ⑤ 칸 오류 표시가 **같은 함수**(엔진 leaf `houseFootprintIssue` 직접 호출 · 자체 비교 금지). 주택 구간을 닫는 철거 행이 아니면 null. */
export function housePriorFootprintIssueOf(asset: AssetForm, i: number): HouseFootprintIssue | null {
  const events = asset.nblOtherStateEvents ?? [];
  if (!nblHousingStateHistoryApplies(asset) || !eventClosesHouseInterval(events, i, "house")) return null;
  return houseFootprintIssue(events[i].houseFootprintBefore, i, asset.acquisitionArea);
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

/**
 * 사건 `i`번째 행의 **전송형** — ④ 와이어 · ⑤ 미리보기가 같이 읽는다(⑭ 매퍼 `buildLandStateHistory`와 같은 규칙 — 3중 패턴). E3-1b.
 *
 * 나대지 구간을 닫는 행(leaf `eventClosesBareInterval` — 신축 행 · 직전 건축물이 없는 구분 변경 행)에서만 선언 칸 2개를 싣는다. 건축물 있는 구간을 닫는 행(멸실 · 건축물 위 구분 변경)의
 * 숨은 stale 값은 싣지 않는다. 키는 값이 있을 때만 만든다 — 신축 행의 `""`·미선택은 키 없음 = 종전 와이어와 byte-identical.
 *  · 근거: 선언이 비종합합산이고 그 선언의 나대지 선택지(`eventBasisOptions` — `demolished` 제외 · 「모름」 포함)에 있을 때만(구분을 바꿔 맞지 않게 된 값은 «미선택»으로 보이고 보내지 않는다).
 *  · 면적한도: 근거가 `vacant_state`일 때만.
 * `tailHasBuilding`은 건축물 사건이 0건일 때만 초기 건축물 상태로 쓰인다 — ⑧·⑫·⑭와 같은 값(입력 토글 저장값).
 */
export function stateEventWireRow(events: ReadonlyArray<NblOtherStateEventInput>, i: number, tailHasBuilding: boolean, tailKind?: StateBuildingKind): NblOtherStateEventInput {
  const e = events[i];
  const closesBare = eventClosesBareInterval(events, i, tailHasBuilding);
  // E3-③ — 주택 구간을 닫는 철거 행(주택부수토지 카드의 모든 철거 행)은 재산세 구분을 싣지 않고(숨은 stale 별도합산 등 — 엔진이 읽지 않는다 · 조심 2018서0295) 정착면적만 싣는다.
  const closesHouse = eventClosesHouseInterval(events, i, tailKind);
  const before = !closesHouse && (eventCarriesTaxTypeBefore(e.kind) || closesBare) ? (e.propertyTaxTypeBefore ?? "") : "";
  const basis = closesBare && before ? (eventBasisOptions(before).find((b) => b === e.propertyTaxBasisBefore) ?? "") : "";
  const limit = basis === "vacant_state" ? (e.areaWithinLimitBefore ?? "") : "";
  const footprint = closesHouse ? (e.houseFootprintBefore ?? "").trim() : "";
  return {
    kind: e.kind,
    date: e.date,
    propertyTaxTypeBefore: before,
    ...(basis ? { propertyTaxBasisBefore: basis } : {}),
    ...(limit ? { areaWithinLimitBefore: limit } : {}),
    ...(footprint ? { houseFootprintBefore: footprint } : {}),
  };
}

/** ④가 와이어에 싣는 이력 필드 — 술어가 거짓이면 비워 보낸다(`""` · `[]`). 참이고 `changed`가 아니면 모드는 유지하고 사건만 비운다(엔진이 `unchanged`·`unknown` 고지를 모드로 가른다). */
export function stateHistoryWireFields(asset: AssetForm): {
  nblOtherStateHistoryMode: StateHistoryMode;
  nblOtherStateEvents: NblOtherStateEventInput[];
} {
  if (!nblStateHistoryApplies(asset)) return { nblOtherStateHistoryMode: "", nblOtherStateEvents: [] };
  const mode = asset.nblOtherStateHistoryMode;
  if (mode !== "changed") return { nblOtherStateHistoryMode: mode, nblOtherStateEvents: [] };
  const events = asset.nblOtherStateEvents ?? [];
  // E3-③ — 주택부수토지 카드는 «건축물 있음» 토글이 없다: 양도일 현재 주택이 전제라 `true` · 주택 꼬리로 읽는다(⑭ `tailHasBuilding = true`와 같은 값).
  const house = nblHousingStateHistoryApplies(asset);
  return {
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: events.map((_, i) => stateEventWireRow(events, i, house || asset.nblOtherHasBuilding, house ? "house" : undefined)),
  };
}
