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
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { consumesHousingStateHistory } from "@/lib/tax-engine/non-business-land/land-category";
import { consumesStateHistory } from "@/lib/tax-engine/non-business-land/land-category";
import type { StateBuildingKind, StateHistoryMode } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { HouseFootprintIssue } from "@/lib/tax-engine/non-business-land/housing-limit";
import { houseFootprintIssue } from "@/lib/tax-engine/non-business-land/housing-limit";
import { housePriorNeedsMetropolitan } from "@/lib/tax-engine/non-business-land/house-prior-scope";
import { stateHistoryDeemedBlocks } from "@/lib/tax-engine/non-business-land/house-prior-scope";
import { eventClosesHouseInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { effectiveOtherHasBuilding } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { demolishedRemovedKindOf } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { demolishedRequiredFacts } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { eventBasisOptions } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventOffersDemolished } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { removalDateFor } from "@/lib/tax-engine/non-business-land/other-land-state-history";
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

/**
 * 양도일 의제(영 §168의14②) 사유가 선택돼 **엔진이 상태 이력을 읽지 않는가** — 엔진 술어 `stateHistoryDeemedBlocks`를 직접 호출한다(UQ-12 (가) — 자체 지목·사유 조건 금지).
 * ⑧은 이때 B 새 규칙(철거 행 정착면적 · 수도권)을 건너뛴다 — 엔진이 읽지 않는 칸을 요구하면 막다른 길이다. ④·⑭가 보내는 `nblDeemedTransferReason`과 같은 값(`consumesPeriodJudgmentDate`로 게이트)을 읽는다.
 */
export function stateHistoryDeemedBlocksOf(asset: Pick<AssetForm, "nblLandType" | "nblDeemedTransferReason">): boolean {
  return stateHistoryDeemedBlocks({ landType: asset.nblLandType, deemedReason: asset.nblDeemedTransferReason });
}

/**
 * 철거 행의 «철거 직전 정착면적» 입력 결함 — ⑧ H9 · ⑤ 칸 오류 표시가 **같은 함수**(엔진 leaf `houseFootprintIssue` 직접 호출 · 자체 비교 금지).
 * 주택 구간을 닫는 철거 행이 아니면 null: A(주택부수토지) = 모든 철거 행 · **B(기타토지) = «철거된 건축물 종류: 주택» 행**(엔진 `eventClosesHouseInterval`). 문구의 사건 주체는 A `house` · B `building`(행 제목과 같은 말).
 * 양도일 의제 사유가 선택됐으면 null(UQ-12 (가) — 엔진이 이력을 읽지 않는다). A의 «양도일 현재 배율 초과 → 엔진이 이력을 읽지 않음» 게이트는 양도일·배율 계산이 필요해 ⑧이 이 함수 앞에서 건다(`housingAreaLimitState`).
 */
export function housePriorFootprintIssueOf(asset: AssetForm, i: number): HouseFootprintIssue | null {
  const events = asset.nblOtherStateEvents ?? [];
  const house = nblHousingStateHistoryApplies(asset);
  if (!house && !nblOtherStateHistoryApplies(asset)) return null;
  if (stateHistoryDeemedBlocksOf(asset) || !eventClosesHouseInterval(events, i, house ? "house" : undefined)) return null;
  return houseFootprintIssue(events[i].houseFootprintBefore, i, asset.acquisitionArea, house ? "house" : "building");
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
 *  · 근거: 선언이 비종합합산이고 그 선언의 나대지 선택지(`eventBasisOptions` — `demolished`는 철거 행 뒤 나대지 구간(`eventOffersDemolished`)일 때만 · 「모름」 포함)에 있을 때만(구분을 바꿔 맞지 않게 된 값은 «미선택»으로 보이고 보내지 않는다).
 *  · 면적한도: 근거가 `vacant_state`일 때만.
 *  · E3f-2 사실 칸 4개: 근거가 `demolished`이고 **`demolishedRequiredFacts`가 요구하는 칸만**(⑤ 표시 · ⑧ · ⑫′와 같은 술어 — 숨은 stale 값은 싣지 않는다). 이 술어는 «엔진이 이력을 읽는가»(`historyRead`)를 보지 않는다 —
 *    그 판정이 raw를 요구해 ④ 조립과 순환하기 때문이다(`nblStateHistoryIsRead(raw)`는 ⑧·⑫′가 요구 여부에 덧붙인다). 읽지 않을 때 실린 값은 엔진이 읽지 않는다.
 * `tailHasBuilding`은 건축물 사건이 0건일 때만 초기 건축물 상태로 쓰인다 — ⑧·⑫·⑭와 같은 값(입력 토글 저장값).
 */
export function stateEventWireRow(events: ReadonlyArray<NblOtherStateEventInput>, i: number, tailHasBuilding: boolean, tailKind?: StateBuildingKind): NblOtherStateEventInput {
  const e = events[i];
  const closesBare = eventClosesBareInterval(events, i, tailHasBuilding);
  // E3-③ — 주택 구간을 닫는 철거 행(주택부수토지 카드의 모든 철거 행)은 재산세 구분을 싣지 않고(숨은 stale 별도합산 등 — 엔진이 읽지 않는다 · 조심 2018서0295) 정착면적만 싣는다.
  const closesHouse = eventClosesHouseInterval(events, i, tailKind);
  const before = !closesHouse && (eventCarriesTaxTypeBefore(e.kind) || closesBare) ? (e.propertyTaxTypeBefore ?? "") : "";
  const offersDemolished = eventOffersDemolished(events, i, tailHasBuilding);
  const basis = closesBare && before ? (eventBasisOptions(before, offersDemolished).find((b) => b === e.propertyTaxBasisBefore) ?? "") : "";
  const limit = basis === "vacant_state" ? (e.areaWithinLimitBefore ?? "") : "";
  const facts = basis === "demolished" ? demolishedWireFacts(events, i, e, tailKind) : {};
  const footprint = closesHouse ? (e.houseFootprintBefore ?? "").trim() : "";
  return {
    kind: e.kind,
    date: e.date,
    propertyTaxTypeBefore: before,
    ...(basis ? { propertyTaxBasisBefore: basis } : {}),
    ...(limit ? { areaWithinLimitBefore: limit } : {}),
    ...(footprint ? { houseFootprintBefore: footprint } : {}),
    ...facts,
    // E3-③ B — 기타토지 철거 행의 «철거된 건축물 = 주택»은 주택 구간을 닫는 행에서만 싣는다(주택부수토지 카드는 모든 철거 행이 주택이라 종류 칸이 없다 — A와 바이트 동일 · «그 밖»·다른 종류 행의 stale 값은 싣지 않는다).
    ...(closesHouse && tailKind !== "house" ? { buildingKindBefore: "house" as const } : {}),
  };
}

/**
 * E3f-2 ④ — 근거 «철거ㆍ멸실» 나대지 구간 행의 사실 칸: **요구되는 칸만**(`demolishedRequiredFacts`) 싣고 값이 비면 키를 만들지 않는다(빈 필수 칸은 키 없음 → ⑧·⑫′가 빈칸으로 읽는다).
 * 철거일·구간 끝 날짜를 읽을 수 없으면 요구 집합이 비어 아무것도 싣지 않는다(행 결함이 먼저 막는다).
 */
function demolishedWireFacts(
  events: ReadonlyArray<NblOtherStateEventInput>,
  i: number,
  e: NblOtherStateEventInput,
  tailKind: StateBuildingKind | undefined,
): Pick<NblOtherStateEventInput, "demolishedPermitBefore" | "demolishedOtherUseBefore" | "demolishedVacantHouseBefore" | "demolishedFloorAreaBefore"> {
  const kind = demolishedRemovedKindOf(events, i, tailKind);
  if (!kind) return {};
  const need = demolishedRequiredFacts({ removedOn: toOptionalDate(removalDateFor(events, i)), intervalStart: toOptionalDate(events[i - 1]?.date), end: toOptionalDate(e.date), kind, historyRead: true });
  const area = (e.demolishedFloorAreaBefore ?? "").trim();
  return {
    ...(need.permit && e.demolishedPermitBefore ? { demolishedPermitBefore: e.demolishedPermitBefore } : {}),
    ...(need.otherUse && e.demolishedOtherUseBefore ? { demolishedOtherUseBefore: e.demolishedOtherUseBefore } : {}),
    ...(need.vacantHouse && e.demolishedVacantHouseBefore ? { demolishedVacantHouseBefore: e.demolishedVacantHouseBefore } : {}),
    ...(need.floorArea && area ? { demolishedFloorAreaBefore: area } : {}),
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

/**
 * E3-③ B — 기타토지 철거 행 «주택» 입력이 **수도권 칸을 읽게 하는가**. ④ 수도권 전송 게이트 · ⑤ 수도권 칸 노출 · ⑧ H10 · ⑤ 미리보기 판정 맥락이 **같은 함수**다(T-7 — 하나라도 자체 조건을 쓰면
 * 값이 서버에 안 닿아 보수적 3배로 계산된다). 엔진 술어 `housePriorNeedsMetropolitan`을 직접 부르고, 사건은 **와이어 사건**(`stateHistoryWireFields` 결과 — 모드·적용 술어·종류 칸이 이미 반영)을 넘긴다 —
 * 폼 저장 사건을 넘기면 `unchanged`·`unknown` 뒤에 남은 stale 주택 철거 행이 «화면에 없는 칸 요구» 막다른 길을 만든다(X27 · P16).
 *
 * `transferDate`(L1) — 양도일(`YYYY-MM-DD`). 철거 전 주택 구간의 배율은 양도일 기준 표라 2022.1.1. 전 양도(종전 영 §168의12 — 도시지역 일률 5배)는 수도권이 배율을 가르지 않는다 → 거짓.
 * 없거나 해석 불가면 현행 표로 본다(칸을 열어 묻는 쪽). ④(`buildNonBusinessLandRaw`) · ⑤ · ⑧ H10 · ⑤ 미리보기는 모두 같은 양도일을 넘기고, ⑭ 매퍼·엔진은 같은 술어에 `Date`를 넘긴다.
 */
export function housePriorNeedsMetropolitanOf(asset: AssetForm, transferDate: string | Date | undefined): boolean {
  return housePriorNeedsMetropolitan(asset.nblLandType, asset.nblZoneType, stateHistoryWireFields(asset).nblOtherStateEvents, toOptionalDate(transferDate));
}
