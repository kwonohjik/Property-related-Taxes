/**
 * NBL-STATE-HISTORY-E1 — 기타토지 소유기간 중 상태 이력: 사건 → **일 단위 상태 구간** 변환 leaf (순수 · DB·Date 직접 생성 없음).
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.plan.md (통합 v3.1) · engine.plan.md §3.5 · §3.6 · §4.2 · §7.4
 * 결정(2026-11-22 사용자): V-1 **일 단위**(영 §168조의6 «기간의 계산은 일수로 한다» — 과세기준일(6.1.) 단위 «접기»는 재제안·재구현 금지) ·
 *   Q-15 **(가′)** — 사업용 구간 = 이력상 사업 구간 ∪ ((이전 구간 ∪ 꼬리 구간) ∩ core 자체 사업기간) · 「모름」 = 혜택 불성립 + 확인 필요 · 자동 안분 fallback 금지.
 *
 * ## 배선(E2)
 * E1에서는 어디에도 연결하지 않았고, **E2가** `applyStateHistory`(`other-land-state-history-apply.ts` — 판정) · ⑫ Zod refine(`transfer-tax-schema-nbl-refines.ts`) ·
 * ⑭ 매퍼(`form-mapper-helpers.ts`)에 연결했다. 배선 확인 가드: `__tests__/lib/nbl-state-history-leaf-unreachable.test.ts`(이름은 E1 유래 — 이제 «도달 가능 + 허용 목록» 가드다).
 *
 * ## 이 파일이 소유하는 것 (⑤ 미리보기 · ⑦ 구간표 · ⑧ · ⑫ · ⑭ · 판정이 모두 같은 함수를 쓴다 — 3중 패턴)
 *   1. `deriveOtherLandStateIntervals` — 사건 → 소유기간을 빈틈·겹침 없이 덮는 일 단위 구간. 마지막 원소 = 꼬리(양도일 현재 상태).
 *   2. `stateEventRowIssue` · `stateEventSequenceIssue` — ⑧·⑫ 공용 issue leaf(같은 판정·같은 문구).
 *   3. `isStateIntervalBusiness` · `stateHistoryBusinessIntervals` — 구간의 사업용 여부(§4.2 ① ② · Q-15 (가′)).
 *   4. 라벨 표 — 재산세 구분은 `PROPERTY_TAX_TYPE_LABEL` 단일 소스를 재사용한다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { TaxCalculationError } from "../tax-errors";
import { TaxErrorCode } from "../tax-errors";
import { houseKindOnlyOnRemovedMessage } from "./nbl-validation-messages";
import { houseKindTaxChangeInsideMessage } from "./nbl-validation-messages";
import { houseLastEventRemovedMessage } from "./nbl-validation-messages";
import { houseTaxTypeChangedMessage } from "./nbl-validation-messages";
import { stateEventAtOrAfterTransferMessage } from "./nbl-validation-messages";
import { stateEventAtOrBeforeFloorMessage } from "./nbl-validation-messages";
import { stateEventDateEmptyMessage } from "./nbl-validation-messages";
import { stateEventDateInvalidMessage } from "./nbl-validation-messages";
import { stateEventKindRequiredMessage } from "./nbl-validation-messages";
import { stateEventReversedMessage } from "./nbl-validation-messages";
import { stateEventSameDayMessage } from "./nbl-validation-messages";
import { stateEventSameKindMessage } from "./nbl-validation-messages";
import { stateEventsRequiredMessage } from "./nbl-validation-messages";
import { resolveHouseInterval } from "./housing-limit";
import { consumesHousingStateHistory } from "./land-category";
import { demolishedStatusWindow } from "./demolished-temp-status";
import { isUsableBasis } from "./property-tax-basis";
import { propertyTaxBasisOptions } from "./property-tax-basis";
import { resolvePropertyTaxBasis } from "./property-tax-basis";
import { PROPERTY_TAX_TYPE_LABEL } from "./property-tax-type-label";
import { getOverlappingPeriods } from "./utils/period-math";
import type { DemolishedRemovedKind } from "./demolished-temp-status";
import type { BareFoldReason } from "./land-usage.types";
import type { LandStateInterval } from "./land-usage.types";
import type { PropertyTaxType } from "./land-usage.types";
import type { StateEvent } from "./land-usage.types";
import type { StateBuildingKind } from "./land-usage.types";
import type { StateEventKind } from "./land-usage.types";
import type { StateEventSubject } from "./nbl-validation-messages";
import type { HouseIntervalCtx } from "./housing-limit";
import type { LandType } from "./types";
import type { PropertyTaxBasis } from "./property-tax-basis";
import type { DateInterval } from "./types";

// ── 라벨 ─────────────────────────────────────────────────────

/** 사건 종류 라벨 — 유예 사유 9호 라벨(`GRACE_REASON_SPECS.demolition.label` = 「건축물 멸실·철거·붕괴 (9호)」)과 같은 표기. */
export const STATE_EVENT_KIND_LABEL = {
  building_built: "건축물 신축",
  building_removed: "건축물 멸실·철거·붕괴",
  tax_type_changed: "재산세 과세 구분 변경",
} as const satisfies Record<StateEventKind, string>;

/** 건축물 사건 종류 — 건축물 유무를 바꾸는 사건(신축·멸실). 재산세 과세 구분 변경은 건축물 유무를 바꾸지 않는다. */
export type BuildingEventKind = Exclude<StateEventKind, "tax_type_changed">;

/** 사건 직후의 건축물 유무 라벨 — 같은 종류 연속 오류 문구용(건축물 사건만). */
const STATE_AFTER_EVENT_LABEL = {
  building_built: "건축물 있음",
  building_removed: "건축물 없음",
} as const satisfies Record<BuildingEventKind, string>;

/** E3-③ — 주택부수토지 카드의 사건 종류 라벨(주택 신축 / 주택 멸실·철거·붕괴 — R-3). 재산세 과세 구분 변경은 주택 카드가 받지 않는다(D-2). */
export const STATE_EVENT_KIND_LABEL_HOUSE = {
  building_built: "주택 신축",
  building_removed: "주택 멸실·철거·붕괴",
  tax_type_changed: STATE_EVENT_KIND_LABEL.tax_type_changed,
} as const satisfies Record<StateEventKind, string>;

const STATE_AFTER_EVENT_LABEL_HOUSE = {
  building_built: "주택 있음",
  building_removed: "주택 없음",
} as const satisfies Record<BuildingEventKind, string>;

/** 지목 → 사건 주체 — 주택부수토지 카드는 `house`(검증 문구 «주택 사건 N번째 행»), 그 밖은 `building`. ⑧·⑫가 **같은 함수**를 쓴다(UI R-3). */
export function stateEventSubjectOf(landType: LandType | "" | undefined): StateEventSubject {
  return consumesHousingStateHistory(landType) ? "house" : "building";
}

/** 상태 구간의 재산세 구분 라벨 — `PROPERTY_TAX_TYPE_LABEL` 단일 소스 + 「모름」(철거 사건의 `""`). */
export const STATE_PROPERTY_TAX_TYPE_LABEL = {
  ...PROPERTY_TAX_TYPE_LABEL,
  unknown: "모름",
} as const satisfies Record<LandStateInterval["propertyTaxType"], string>;

const EVENT_KINDS = Object.keys(STATE_EVENT_KIND_LABEL) as StateEventKind[];

export function isEventKind(value: string): value is StateEventKind {
  return (EVENT_KINDS as string[]).includes(value);
}

/** 건축물 사건(신축·멸실)인가 — 교대 규칙·«양도일 현재 건축물 유무»·건축물 상태 replay는 이 사건만 본다. 허용값 밖은 false. */
export function isBuildingEventKind(kind: string): kind is BuildingEventKind {
  return kind === "building_built" || kind === "building_removed";
}

/**
 * E3-③ B — 이 종류의 사건 행이 «철거된 건축물 종류»(`buildingKindBefore`)를 받는가 — **철거 행뿐**이다(신축·재산세 과세 구분 변경 행에는 철거된 건축물이 없다).
 * `eventClosesHouseInterval`(주택 구간 판정) · ③ 복원 정규화 · ⑤ 종류 카드 노출이 **같은 술어**를 읽는다(`kind === "building_removed"` 리터럴 분기 금지 — E3-① 게이트).
 */
export function eventCarriesBuildingKind(kind: string): boolean {
  return kind === "building_removed";
}

/**
 * 이 종류의 사건이 `propertyTaxTypeBefore`(그 사건이 닫는 구간의 재산세 구분)를 **건축물 있는 구간에서** 운반하는가 — 철거·재산세 과세 구분 변경(E3-①).
 * ④ 와이어 정규화 · ③ 복원 정규화 · ⑤ 미리보기가 읽는다. **E3-1b**: 신축 행도 나대지 구간을 닫으므로 Before를 운반할 수 있다 — 그 판정은 종류만으로 못 하고
 * 사건 순서 replay가 필요해 `eventClosesBareInterval`이 맡는다(⑭는 둘을 함께 읽는다). 이 술어의 의미는 E3-①과 같다(UI가 두 술어로 교체한다).
 */
export function eventCarriesTaxTypeBefore(kind: string): boolean {
  return isEventKind(kind) && kind !== "building_built";
}

/**
 * `index`번째 사건이 **나대지 구간(건축물 없는 구간)을 닫는가** — 신축 행은 항상(신축 앞은 나대지) · 철거 행은 never(철거는 건축물 있던 구간을 닫는다) ·
 * 재산세 과세 구분 변경 행은 사건 직전 건축물 상태를 replay해 «없음»일 때. 초기 건축물 상태는 첫 건축물 사건(신축이면 «없음» · 멸실이면 «있음»)이고,
 * 건축물 사건이 하나도 없으면 `tailHasBuilding`(= 입력 토글)이다. 나대지 구간 선언(`propertyTaxBasisBefore`·`areaWithinLimitBefore`)을 **읽고 · 실어 보내고 · 보이는** 곳이
 * 모두 이 술어 하나를 쓴다(⑭ · ④ 와이어 · ③ 복원 · ⑤ 미리보기 · ⑤ 입력 카드 — 숨은 stale 값을 싣지 않기 위해).
 */
export function eventClosesBareInterval(events: ReadonlyArray<{ kind: string }>, index: number, tailHasBuilding: boolean): boolean {
  const ev = events[index];
  if (!ev) return false;
  if (ev.kind === "building_built") return true;
  if (ev.kind !== "tax_type_changed") return false;
  let hasBuilding = initialHasBuilding(events, tailHasBuilding);
  for (let i = 0; i < index; i++) {
    if (isBuildingEventKind(events[i].kind)) hasBuilding = events[i].kind === "building_built";
  }
  return !hasBuilding;
}

/**
 * E3-⑤ E3f-2 — `index`번째 사건이 **근거 «철거ㆍ멸실»을 고를 수 있는 나대지 구간을 닫는가** = 나대지 구간을 닫고(`eventClosesBareInterval`) ∧ 그 구간 **앞의 마지막 건축물 사건이 철거 행**이다
 * (사이에 신축이 없다 — 철거 → 구분 변경 → 구분 변경 …의 나대지 구간마다 같은 철거일). 취득 전 철거로 첫 구간이 나대지인 경우는 철거일 출처가 없어 아니다(계획서 V-15 — 9호 유예로 입력).
 * ⑤ 선택지 · ④ 와이어 · ⑭ 매퍼 · ⑧ · ⑫′ · 엔진이 **같은 술어**를 쓴다(`removalRowIndexFor`).
 */
export function eventOffersDemolished(events: ReadonlyArray<{ kind: string }>, index: number, tailHasBuilding: boolean): boolean {
  return eventClosesBareInterval(events, index, tailHasBuilding) && removalRowIndexFor(events, index) >= 0;
}

/**
 * 나대지 구간 선언에서 고를 수 있는 근거 선택지(「모름」 포함) — V1-A 선택지(`propertyTaxBasisOptions(declared, false)`)에서 **`demolished`는 `offersDemolished`일 때만**
 * (철거 행 뒤의 나대지 구간 — `eventOffersDemolished`. 그 밖의 구간은 종전대로 제외 — 철거일 출처가 없다). 빈 배열 = 근거를 묻지 않는다(종합합산).
 */
export function eventBasisOptions(declared: PropertyTaxType, offersDemolished = false): readonly PropertyTaxBasis[] {
  return propertyTaxBasisOptions(declared, false).filter((b) => b !== "demolished" || offersDemolished);
}

// ── 사건 행·순서 검증 (⑧·⑫ 공용) ─────────────────────────────

/** 결함 칸: `events` = 사건 컨테이너(0건) · `kind`·`date` = `nblOtherStateEvents.{index}.{field}`. */
export interface StateEventIssue {
  index: number | null;
  /** `buildingKindBefore` = E3-③ B 철거 행의 «철거된 건축물 종류»(D-8 구조 규칙의 결함 칸). */
  field: "events" | "kind" | "date" | "buildingKindBefore";
  message: string;
}

export interface StateEventRowLike {
  kind: string;
  date: string;
  /** E3-③ B — 철거 행의 «철거된 건축물 종류»(`"house"` · `""`·미전송 = 주택 아님). 구조 규칙(D-8 `houseKindEventIssue`)만 읽는다. */
  buildingKindBefore?: string;
  /** E3-⑤ E3f-2 — 나대지 구간 근거 «철거ㆍ멸실»의 와이어 칸(`demolishedRowFactIssue`가 읽는다). 순서·행 검증은 읽지 않는다. */
  propertyTaxTypeBefore?: string;
  propertyTaxBasisBefore?: string;
  demolishedPermitBefore?: string;
  demolishedOtherUseBefore?: string;
  demolishedVacantHouseBefore?: string;
  demolishedFloorAreaBefore?: string;
}

/**
 * 사건 한 행의 결함(종류 미선택·허용값 밖 · 날짜 빈 칸·해석 불가). 이상 없으면 null. 날짜는 `YYYY-MM-DD`(ISO)를 전제한다.
 * `propertyTaxTypeBefore`는 규칙이 없다 — 선택 칸이고 `""` = 모름이다(⑫ enum이 허용값 밖만 막는다).
 */
export function stateEventRowIssue(row: StateEventRowLike, index: number, subject: StateEventSubject = "building"): StateEventIssue | null {
  if (!isEventKind(row.kind)) return { index, field: "kind", message: stateEventKindRequiredMessage(index, subject) };
  if (!row.date) return { index, field: "date", message: stateEventDateEmptyMessage(index, row.kind, subject) };
  if (!toOptionalDate(row.date)) return { index, field: "date", message: stateEventDateInvalidMessage(index, row.date, row.kind, subject) };
  return null;
}

export interface StateEventSequenceOptions {
  /** 양도일(ISO). 사건일 ≥ 양도일이면 꼬리 구간이 1일 미만이라 차단한다. 해석 불가·빈 값이면 이 규칙은 건너뛴다(앞 단계 검증 몫). */
  transferDate: string;
  /**
   * 하한일(ISO) — **⑧만** 넘긴다(이월과세는 증여자 취득일 · 일반은 취득일 · 축 B 번들은 가장 이른 취득일).
   * 사건일 ≤ 하한일(당일 포함)이면 소유 시작 전이라 차단한다. ⑫는 넘기지 않는다 — 지분별 raw가 다른 취득일을 가져 늦은 지분이 400이 되는 것을 막는다.
   */
  floorDate?: string;
  /**
   * E3-③ — 사건 주체(기본 `building` = 종전과 바이트 동일). `house`이면 문구가 «주택 사건»으로 바뀌고 **주택 구조 규칙**(`housingStateEventIssue` — D-1 마지막 건축물 사건 = 신축 · D-2 구분 변경 금지)이
   * 순서 검증 뒤에 같은 호출 안에서 함께 적용된다 — ⑧·⑫가 한 호출로 같은 결과를 받는다(Anchor 5).
   */
  subject?: StateEventSubject;
}

/** 소유 첫날의 건축물 상태 — 첫 건축물 사건이 신축이면 «없음»·멸실이면 «있음», 건축물 사건이 하나도 없으면 `fallback`(입력 토글). */
function initialHasBuilding(events: ReadonlyArray<{ kind: string }>, fallback: boolean): boolean {
  const first = events.find((e) => isBuildingEventKind(e.kind));
  return first ? first.kind === "building_removed" : fallback;
}

/**
 * `changed`일 때의 **사건 목록 전체**를 화면 순서(행 순서 · 행 안에서는 종류 → 날짜 → 순서·경계)대로 훑어 첫 결함을 돌려준다. 호출자는 `mode === "changed"`일 때만 부른다.
 *
 *   · 0건 → `events` (이력 없음을 `changed`로 위장한 입력 — 통합 §1)
 *   · 행 결함 → `stateEventRowIssue`
 *   · 앞 사건보다 빠름 · 같은 날 (자동 정렬하지 않는다 — 침묵 보정 금지)
 *   · 하한일 이하(`floorDate`가 있을 때만) · 양도일 이후(당일 포함)
 *   · 같은 종류 연속(신축 뒤 신축 · 멸실 뒤 멸실) — **직전 «건축물 사건»과만** 비교한다(재산세 과세 구분 변경은 교대에 참여하지 않는다)
 *   · (E3-1b 삭제 — `tailHasBuilding` 인자도 함께 제거) 건축물 없는 구간의 재산세 과세 구분 변경 차단 — 이제 나대지 구간을 닫는 구분 변경은 «나대지 선언»을 말하는 정상 입력이다(근거 미선택·모름은 막지 않고 접은 뒤 고지한다).
 */
export function stateEventSequenceIssue(events: ReadonlyArray<StateEventRowLike>, opts: StateEventSequenceOptions): StateEventIssue | null {
  const subject = opts.subject ?? "building";
  const afterLabel = subject === "house" ? STATE_AFTER_EVENT_LABEL_HOUSE : STATE_AFTER_EVENT_LABEL;
  const kindLabel = subject === "house" ? STATE_EVENT_KIND_LABEL_HOUSE : STATE_EVENT_KIND_LABEL;
  if (events.length === 0) return { index: null, field: "events", message: stateEventsRequiredMessage(subject) };
  const transfer = toOptionalDate(opts.transferDate);
  const floor = opts.floorDate ? toOptionalDate(opts.floorDate) : undefined;
  let prevBuildingKind: BuildingEventKind | null = null;
  for (let i = 0; i < events.length; i++) {
    const row = events[i];
    const rowIssue = stateEventRowIssue(row, i, subject);
    if (rowIssue) return rowIssue;
    const t = toOptionalDate(row.date)!.getTime(); // 행 검증 통과 → 해석 가능
    if (i > 0) {
      const prev = events[i - 1];
      const prevT = toOptionalDate(prev.date)!.getTime(); // 앞 행도 이미 통과했다
      // 역순·같은 날은 종류와 무관한 «앞 사건» 기준이다 — 건축물 사건과 구분 변경이 같은 날이면 같은 구간을 두 사건이 닫는다.
      if (t < prevT) return { index: i, field: "date", message: stateEventReversedMessage(i, row.date, prev.date, row.kind, subject) };
      if (t === prevT) return { index: i, field: "date", message: stateEventSameDayMessage(i, row.date, row.kind, subject) };
    }
    if (floor && t <= floor.getTime()) return { index: i, field: "date", message: stateEventAtOrBeforeFloorMessage(i, row.date, opts.floorDate!, row.kind, subject) };
    if (transfer && t >= transfer.getTime()) return { index: i, field: "date", message: stateEventAtOrAfterTransferMessage(i, row.date, opts.transferDate, row.kind, subject) };
    if (!isBuildingEventKind(row.kind)) continue;
    if (prevBuildingKind === row.kind) {
      const missingKind: BuildingEventKind = row.kind === "building_built" ? "building_removed" : "building_built";
      return { index: i, field: "kind", message: stateEventSameKindMessage(i, afterLabel[row.kind], kindLabel[missingKind], subject) };
    }
    prevBuildingKind = row.kind;
  }
  return subject === "house" ? housingStateEventIssue(events) : houseKindEventIssue(events);
}

/**
 * E3-③ 주택부수토지 카드의 **구조 규칙**(⑧·⑫ 공용 — 행·순서 검증을 통과한 `changed` 사건에만 부른다):
 *   · D-2 `tax_type_changed` 금지 — 주택 구간에는 토지 재산세 구분이 없다(지방세법 §106②). 나대지 구간의 구분은 신축 행의 나대지 선언(E3-1b)으로 말한다.
 *   · D-1 마지막 건축물 사건 = 신축 — 양도일 현재 주택이 있는 토지가 주택부수토지 카드다(철거로 끝나면 나대지 → 기타토지 카드).
 * 건축물 사건이 하나도 없는 입력은 D-2가 먼저 막는다(구분 변경만 있는 입력) · 0건은 `stateEventSequenceIssue`가 막는다.
 */
export function housingStateEventIssue(events: ReadonlyArray<StateEventRowLike>): StateEventIssue | null {
  const taxIdx = events.findIndex((e) => e.kind === "tax_type_changed");
  if (taxIdx >= 0) return { index: taxIdx, field: "kind", message: houseTaxTypeChangedMessage(taxIdx) };
  for (let i = events.length - 1; i >= 0; i--) {
    if (!isBuildingEventKind(events[i].kind)) continue;
    return events[i].kind === "building_removed" ? { index: i, field: "kind", message: houseLastEventRemovedMessage(i) } : null;
  }
  return null;
}

/**
 * E3-③ B 기타토지 철거 행의 «철거된 건축물 종류 = 주택» **구조 규칙 D-8**(⑧·⑫ 공용 — 행·순서 검증을 통과한 `changed` 사건에만 부른다. `stateEventSequenceIssue`가 `subject: "building"`일 때 같은 호출 안에서 적용):
 *   ① `buildingKindBefore = house`는 `building_removed` 행에서만 — 신축·구분 변경 행에서는 차단.
 *   ② 주택 구간 안에 `tax_type_changed`가 없다 — 그 철거 행이 닫는 건축물 구간(직전 건축물 사건 또는 소유 첫날 이후)에 구분 변경이 있으면 차단(이미 구분이 바뀐 건축물은 «주택 아닌 건축물»이다 — 주택에는 토지 재산세 구분이 없다).
 * 정착면적·수도권 규칙은 여기 없다 — ⑧만 가진다(직접 API는 400 없이 엔진이 접는다 — D-16).
 */
export function houseKindEventIssue(events: ReadonlyArray<StateEventRowLike>): StateEventIssue | null {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.buildingKindBefore !== "house") continue;
    if (e.kind !== "building_removed") return { index: i, field: "buildingKindBefore", message: houseKindOnlyOnRemovedMessage(i, e.kind) };
    for (let j = i - 1; j >= 0 && !isBuildingEventKind(events[j].kind); j--) {
      if (events[j].kind === "tax_type_changed") return { index: i, field: "buildingKindBefore", message: houseKindTaxChangeInsideMessage(i, j) };
    }
  }
  return null;
}

/**
 * `index`번째 사건이 **주택 구간(건축물 있는 구간)을 닫는가** — ① 주택부수토지 카드(`tailKind === "house"`)에서는 철거 행 전부다(모든 건축물 구간이 주택). ② 기타토지 카드(B)에서는 «철거된 건축물 종류 = 주택»
 * (`buildingKindBefore === "house"`)을 고른 철거 행이다. 철거 행의 «철거 직전 정착면적»(`houseFootprintBefore`)을 **읽고 · 싣고 · 보이는** 곳(⑭ · ④ 와이어 · ⑤ 미리보기 · ⑤ 입력 카드 · ⑧)이 모두 이 술어 하나를 쓴다
 * (숨은 stale 값을 싣지 않기 위해 — 주택 구간을 닫는 철거 행은 `propertyTaxTypeBefore`도 싣지 않는다 · T-5). 사건 목록은 **와이어 사건**(`buildingKindBefore` 포함)이어야 한다.
 */
export function eventClosesHouseInterval(events: ReadonlyArray<{ kind: string; buildingKindBefore?: string }>, index: number, tailKind: StateBuildingKind | undefined): boolean {
  const ev = events[index];
  if (!ev || !eventCarriesBuildingKind(ev.kind)) return false;
  return tailKind === "house" || ev.buildingKindBefore === "house";
}

// ── 사건 → 일 단위 구간 ───────────────────────────────────────

/**
 * 양도일 현재 건축물 유무 = **마지막 «건축물 사건»** 종류(재산세 과세 구분 변경은 건축물 유무를 바꾸지 않으므로 건너뛴다).
 * 건축물 사건이 하나도 없으면 `undefined`(호출자가 현행 입력 토글을 쓴다). `changed`일 때 `hasBuilding` 파생의 단일 소스(UI R5·R8).
 */
export function hasBuildingAtTransfer(events: ReadonlyArray<{ kind: string }>): boolean | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (isBuildingEventKind(events[i].kind)) return events[i].kind === "building_built";
  }
  return undefined;
}

/**
 * E3-⑤ D-3 — `index`번째 사건 **앞**의 마지막 «건축물 사건»이 **철거 행**이면 그 행의 인덱스(사이에 신축이 없을 때). 없으면 `-1`(앞 건축물 사건이 신축이거나 하나도 없다 = 취득 전 철거 포함).
 * `removalDateFor`·`eventOffersDemolished`·철거된 건축물 종류(`demolishedRemovedKindOf`)가 **같은 replay** 하나를 쓴다 — 자체 replay 금지(`eventClosesBareInterval` 선례).
 */
export function removalRowIndexFor(events: ReadonlyArray<{ kind: string }>, index: number): number {
  for (let i = Math.min(index, events.length) - 1; i >= 0; i--) {
    if (!isBuildingEventKind(events[i].kind)) continue;
    return events[i].kind === "building_removed" ? i : -1;
  }
  return -1;
}

/**
 * E3-⑤ D-3 — `index`번째 사건 **앞**의 마지막 «건축물 사건»이 **철거 행**이면 그 행의 날짜(사이에 신축이 없을 때). 없으면 `undefined`.
 * 나대지 구간 선언(E3f-2)의 철거일 출처·꼬리 철거일(`tailRemovalDateOf`)이 **같은 replay** 하나를 쓴다 — ⑤ 미리보기·⑧·⑫′·④·⑭가 자체 replay를 하지 않는다.
 * 날짜는 칸 그대로 돌려준다(빈 문자열이어도) — 유효성은 호출자가 본다(`toOptionalDate`).
 */
export function removalDateFor<E extends { kind: string; date: unknown }>(events: ReadonlyArray<E>, index: number): E["date"] | undefined {
  const at = removalRowIndexFor(events, index);
  return at >= 0 ? events[at].date : undefined;
}

/**
 * E3-⑤ E3f-2 — 이 나대지 구간 앞 **철거 행이 철거한 건축물 종류**: 주택(`house` — 주택부수토지 카드의 모든 철거 행 · 기타토지 카드의 «철거된 건축물 = 주택» 행) 또는 비주택 `building`.
 * 철거 행이 없으면 `undefined`. 한시 창(빈집정비 3년 · 면적 한도 칸)은 이 종류가 가른다(`demolishedRequiredFacts`).
 */
export function demolishedRemovedKindOf(
  events: ReadonlyArray<{ kind: string; buildingKindBefore?: string }>,
  index: number,
  tailKind: StateBuildingKind | undefined,
): DemolishedRemovedKind | undefined {
  const at = removalRowIndexFor(events, index);
  if (at < 0) return undefined;
  return eventClosesHouseInterval(events, at, tailKind) ? "house" : "building";
}

/**
 * E3-⑤ D-3 — 꼬리(양도일 현재) 근거 «철거ㆍ멸실»의 철거일 출처 ① — **꼬리에 건축물이 없고**(`tailHasBuilding` 거짓) 마지막 건축물 사건이 철거 행일 때 그 행의 날짜. 아니면 `undefined`.
 * `tailHasBuilding`은 `effectiveOtherHasBuilding`으로 파생한 값(마지막 건축물 사건 = 신축이면 참 → 철거 행이 마지막일 수 없다)이라 건축물 사건이 있으면 사건이 정한다.
 */
export function tailRemovalDateOf<E extends { kind: string; date: unknown }>(events: ReadonlyArray<E>, tailHasBuilding: boolean): E["date"] | undefined {
  return tailHasBuilding ? undefined : removalDateFor(events, events.length);
}

/**
 * 양도일 현재 「건축물 있음」 — `changed`이면 **사건에서 파생**한 값이 이긴다(직접 API가 숨은 토글을 모순되게 보내도 사건이 이긴다 · 엔진 V-19 · P-15).
 * 아니면 입력 토글 그대로다. ⑫ refine · ⑭ 매퍼가 같은 함수를 쓴다(⑤⑧ 술어는 U0가 같은 함수를 재사용).
 */
export function effectiveOtherHasBuilding(raw: boolean, mode: string | undefined, events: ReadonlyArray<{ kind: string }>): boolean {
  return mode === "changed" ? (hasBuildingAtTransfer(events) ?? raw) : raw;
}

export interface StateTail {
  /**
   * E3-③ — `house`이면 주택부수토지 카드: 모든 건축물 구간이 주택 구간이고(`buildingKind = "house"` · 재산세 구분을 읽지 않는다 — 조심 2018서0295), 철거 행의 정착면적(`houseFootprintBefore`)으로
   * 과거 주택 구간의 배율 이내 여부를 가린다(`houseCtx` 필수). 양도일 현재 상태는 «주택 있음»이라 `hasBuilding`은 쓰이지 않는다(⑭는 `true`로 넘긴다 — T-4). 없으면 종전(기타토지)과 바이트 동일.
   */
  buildingKind?: StateBuildingKind;
  /** `buildingKind = "house"`(A)일 때 필수 · 기타토지 카드(B)는 «철거된 건축물 종류 = 주택» 행이 있을 때 필수 — 배율·토지 면적·양도일(⑤·⑧·apply가 같은 값을 넘긴다). 주택 행이 없으면 읽지 않는다. */
  houseCtx?: HouseIntervalCtx;
  /** **건축물 사건이 없을 때만** 쓴다 — 건축물 사건이 있으면 마지막 건축물 사건 종류가 정한다(raw 토글과 모순돼도 사건이 이긴다 · V-19). 이 값이 초기 건축물 상태도 된다. */
  hasBuilding: boolean;
  /** 양도일 현재 재산세 구분(현행 입력 그대로 — 꼬리 구간은 core가 판정한다). */
  propertyTaxType: LandStateInterval["propertyTaxType"];
}

interface Segment extends Omit<LandStateInterval, "start" | "end"> {
  /** 이 구간을 닫는 사건일. `null` = 꼬리(양도일까지). */
  end: Date | null;
}

/** 나대지 구간 선언의 해석 — 구간의 `propertyTaxType`과 (비종합합산 선언이 있을 때만) 근거 echo 필드. */
type BareDeclaration = Pick<
  LandStateInterval,
  "propertyTaxType" | "basisOutcome" | "basis" | "declaredPropertyTaxType" | "foldReason" | "temporaryStatusWindow" | "temporaryStatusMonths" | "temporaryStatusRemovedKind" | "vacantHouseExtensionUnconfirmed"
>;

/**
 * E3-⑤ E3f-2 — 근거 «철거ㆍ멸실»을 해석하는 데 필요한 구간 맥락(`deriveOtherLandStateIntervals`가 구간마다 만든다). 없으면 `demolished`는 종전처럼 `demolished_unsupported`로 접힌다
 * (철거 행 앞·없는 구간 — 직접 API 호환, 계획서 V-7).
 */
export interface BareDeclarationCtx {
  /** 이 나대지 구간 앞 철거 행의 날짜(`eventOffersDemolished` 참일 때만 값이 있다). */
  removedOn: Date | undefined;
  removedKind: DemolishedRemovedKind;
  /** 선언한 나대지 구간의 시작(앞 사건일 또는 소유 첫날 — 소유 시작 전 클립 반영) · 끝 = 닫는 사건일. */
  intervalStart: Date;
  intervalEnd: Date;
  /** 종전 바닥면적 × 영 §101② 배율 판정에 쓰는 카드의 토지 면적·용도지역(비주택 철거 행 + 2024.6.1.~ 시행본). */
  landArea: number;
  zoneType: string;
}

/**
 * **나대지 구간을 닫는 사건**(`eventClosesBareInterval`)의 선언 3칸을 해석한다 — 구간마다 V1-A 해석기 `resolvePropertyTaxBasis`(hasBuilding=false)를 그대로 호출한다.
 *   · 구분 없음(`""`·미전송): 신축 행 = 선언 없음 → 종합합산(고지 없음 · 종전과 바이트 동일) · 구분 변경 행 = **모름** → `"unknown"`(종합합산 + 확인 필요 — E3-① 같은 정책).
 *   · `comprehensive`: 종합합산(근거를 묻지 않는다).
 *   · 비종합합산 + 근거: `accepted`이면 선언한 구분 그대로 · `unconfirmed`(미선택·모름·호환 불가)이면 종합합산으로 접는다.
 *     **E3f-2** — `demolished`는 **철거 행 뒤 나대지 구간**(`ctx.removedOn`이 있을 때 — `eventOffersDemolished`)에서만 받는다: 한시 창(`demolishedStatusWindow`)이 성립하면 `accepted` + `temporaryStatusWindow`(구간 전체가 아니라 창만 사업용),
 *     성립하지 못하면 사유(`demolished_never_period` · `demolished_permit` · …)와 함께 종합합산으로 접는다. 그 밖(맥락 없음 · 철거일 출처 없음 — 직접 API)은 종전처럼 `demolished_unsupported`로 접는다(V-7).
 *   · 근거 `vacant_state`는 면적한도: `within`만 인정 — `exceeded`·`unknown`·`""`는 그 구간 **전체**를 종합합산으로 접는다(부분 면적 자동 안분 없음 · 「일부 초과」가 「모름」보다 유리하지 않다).
 */
export function resolveBareDeclaration(
  ev: Pick<
    StateEvent,
    "kind" | "propertyTaxTypeBefore" | "propertyTaxBasisBefore" | "areaWithinLimitBefore" | "demolishedPermitBefore" | "demolishedOtherUseBefore" | "demolishedVacantHouseBefore" | "demolishedFloorAreaBefore"
  >,
  ctx?: BareDeclarationCtx,
): BareDeclaration {
  const declared = ev.propertyTaxTypeBefore;
  if (!declared) return { propertyTaxType: ev.kind === "building_built" ? "comprehensive" : "unknown" };
  if (declared === "comprehensive") return { propertyTaxType: "comprehensive" };
  const basis = ev.propertyTaxBasisBefore || undefined;
  const echo = { ...(basis ? { basis } : {}), declaredPropertyTaxType: declared };
  const fold = (foldReason: BareFoldReason): BareDeclaration => ({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", ...echo, foldReason });
  if (basis === "demolished") {
    // 철거 행 뒤 나대지 구간이 아니면(맥락 없음 · 철거일 출처 없음) 종전과 같다 — 근거로 받지 않는다(직접 API 호환 · V-7).
    if (!ctx?.removedOn) return fold("demolished_unsupported");
    // 선언 구분과 호환되지 않는 근거(별도합산 아님)는 V1-A와 같은 술어로 접는다(`resolvePropertyTaxBasis`는 바닥면적·철거일을 꼬리 기준으로 읽어 여기서 쓰지 않는다).
    if (!isUsableBasis(declared, false, basis)) return fold("incompatible");
    const win = demolishedStatusWindow({
      removedOn: ctx.removedOn,
      intervalStart: ctx.intervalStart,
      end: ctx.intervalEnd,
      kind: ctx.removedKind,
      facts: { permit: ev.demolishedPermitBefore, otherUse: ev.demolishedOtherUseBefore, vacantHouse: ev.demolishedVacantHouseBefore, floorArea: ev.demolishedFloorAreaBefore },
      landArea: ctx.landArea,
      zoneType: ctx.zoneType,
    });
    if (win.kind === "fold") return fold(win.reason);
    return {
      propertyTaxType: declared,
      basisOutcome: "accepted",
      ...echo,
      temporaryStatusWindow: win.window,
      temporaryStatusMonths: win.months,
      temporaryStatusRemovedKind: ctx.removedKind,
      ...(win.vacantHouseExtensionUnconfirmed ? { vacantHouseExtensionUnconfirmed: true as const } : {}),
    };
  }
  const res = resolvePropertyTaxBasis({ propertyTaxType: declared, hasBuilding: false, propertyTaxBasis: basis });
  if (res.kind !== "accepted") return fold(res.kind === "unconfirmed" ? res.reason : "incompatible");
  if (res.basis === "vacant_state" && ev.areaWithinLimitBefore !== "within") return fold(ev.areaWithinLimitBefore === "exceeded" ? "area_exceeded" : "area_unknown");
  return { propertyTaxType: declared, basisOutcome: "accepted", ...echo };
}

/** 나대지 구간 근거의 표 안 짧은 라벨 — 입력 미리보기(⑤)와 결과 구간표(⑦)가 같은 표를 읽는다(근거 선택지의 긴 법 인용 라벨은 입력 화면 전용). */
export const BARE_BASIS_SHORT_LABEL = {
  statutory_exempt: "비과세·면제 토지 근거",
  separate_taxation: "분리과세대상 근거",
  vacant_state: "공지상태 근거",
  demolished: "철거·멸실 근거",
  unknown: "근거 모름",
} as const satisfies Record<PropertyTaxBasis, string>;

/** 나대지 선언을 종합합산으로 접은 사유의 표 안 문구. */
export const BARE_FOLD_REASON_TEXT = {
  unselected: "근거 미선택",
  unknown: "근거 모름",
  incompatible: "구분과 맞지 않는 근거",
  demolished_area_missing: "근거 미확인",
  // E3f-1b — 꼬리 근거 «철거ㆍ멸실»의 접힘 사유(나대지 구간 선언은 이 해석기를 철거ㆍ멸실일 없이 부르므로 도달하지 않는다 — Record 완결성용 문구)
  demolished_date_missing: "철거ㆍ멸실일 미입력",
  demolished_period_elapsed: "철거 후 한시 기간 경과",
  demolished_unsupported: "철거 후 한시 지위 — 유예기간으로 입력",
  // E3f-2 — 나대지 구간 근거 «철거ㆍ멸실»의 접힘 사유(한시 창 판정)
  demolished_never_period: "철거 후 한시 기간 안에 과세기준일 없음",
  demolished_permit: "허가·사용승인 미확인",
  demolished_other_use: "건축 외 용도 사용 또는 미확인",
  demolished_area_exceeded: "철거 전 바닥면적 배율 범위 초과",
  area_exceeded: "면적한도 일부 초과",
  area_unknown: "면적한도 모름",
} as const satisfies Record<BareFoldReason, string>;

/**
 * 나대지 구간(`hasBuilding=false`) 중 **비종합합산 선언이 있는 구간**의 «재산세 구분» 표 문구 — 선언이 없으면 `undefined`(호출자가 종전 문구를 쓴다).
 * 받아들인 구간 = 「별도합산(나대지 — 공지상태 근거)」 · 접힌 구간 = 「종합합산(나대지 — {사유} · 확인 필요)」. ⑤ 미리보기 · ⑦ 결과 구간표가 같은 함수를 쓴다.
 */
export function bareIntervalTaxTypeText(iv: Pick<LandStateInterval, "hasBuilding" | "propertyTaxType" | "basisOutcome" | "basis" | "foldReason" | "temporaryStatusWindow">): string | undefined {
  if (iv.hasBuilding || !iv.basisOutcome) return undefined;
  // E3f-2 — 근거 «철거ㆍ멸실»을 받아들인 구간은 구간 전체가 아니라 한시 창만 별도합산으로 센다(창 날짜는 echo `temporaryStatusWindow`가 말한다).
  if (iv.basisOutcome === "accepted" && iv.temporaryStatusWindow) return `${PROPERTY_TAX_TYPE_LABEL[iv.propertyTaxType as PropertyTaxType]}(나대지 — ${BARE_BASIS_SHORT_LABEL.demolished} · 한시 기간만)`;
  if (iv.basisOutcome === "accepted") {
    return `${PROPERTY_TAX_TYPE_LABEL[iv.propertyTaxType as PropertyTaxType]}(나대지 — ${BARE_BASIS_SHORT_LABEL[iv.basis ?? "unknown"]})`;
  }
  return `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(나대지 — ${BARE_FOLD_REASON_TEXT[iv.foldReason ?? "unselected"]} · 확인 필요)`;
}

/**
 * 사건 → 일 단위 상태 구간 `[start, end)`. 첫 구간은 소유 첫날(`ownershipStart` = 취득일 다음날)에서 시작해 양도일(`endDate`)에서 끝나고,
 * 구간은 빈틈·겹침 없이 이어진다 → **Σ 구간 일수 = 소유일수**. 마지막 원소 = 꼬리(양도일 현재 상태 — 기존 입력).
 *
 * **Before 사슬**: 각 사건은 직전 사건(또는 소유 첫날)부터 그 사건까지의 구간을 닫고, 그 구간의 재산세 구분은 **그 사건의 `propertyTaxTypeBefore`**(`""` → `"unknown"`)다.
 * 꼬리 구분은 사건이 아니라 기존 입력(`tail.propertyTaxType`)이 말한다.
 *   · 건축물 상태는 따로 추적(replay)한다 — 첫 건축물 사건이 신축이면 그 전은 나대지, 멸실이면 건축물 있음. 건축물 사건이 없으면 `tail.hasBuilding`이 초기 상태다.
 *   · 멸실이 닫는 구간 = 건축물 있음 + 그 사건의 Before · 신축이 닫는 구간 = 나대지 + **나대지 선언**(E3-1b — 선언이 없으면 종합합산 고정이라 종전과 같다 · V-6 «고정»은 선언 없는 경우로 좁아졌다).
 *   · 재산세 과세 구분 변경은 건축물 유무를 바꾸지 않는다 — 닫는 구간이 건축물 있음이면 그 Before, 나대지이면 나대지 선언(`resolveBareDeclaration`)이다. 건축물 없는 구간 위 구분 변경은 더 이상 오류가 아니다.
 *   · 사건일 ≤ `ownershipStart`는 **클립**한다(축 B 늦은 지분 · 사건일 = 소유 첫날): 앞 구간이 0일이라 버려지고 그 사건 이후 상태가 소유 첫날 상태가 된다.
 *   · 소유 0일 이하(`endDate ≤ ownershipStart`)면 구간이 없다.
 *
 * 사전 조건(⑧·⑫가 이미 막는다 — 어기면 침묵 보정하지 않고 오류): 사건일이 엄격 증가 · 건축물 사건이 번갈아 옴 · 마지막 사건일 < 양도일.
 */
export function deriveOtherLandStateIntervals(
  events: ReadonlyArray<StateEvent>,
  ownershipStart: Date,
  endDate: Date,
  tail: StateTail,
): LandStateInterval[] {
  if (endDate.getTime() <= ownershipStart.getTime()) return [];

  // E3-③ A — 주택부수토지 카드: 양도일 현재 «주택 있음»(마지막 건축물 사건 = 신축 · D-1)이고 재산세 구분 변경은 없다(D-2). ⑧·⑫가 먼저 막는다 — 직접 호출의 마지막 안전망(침묵 보정 금지).
  const houseCard = tail.buildingKind === "house";
  const houseCtx = tail.houseCtx;
  if (houseCard) {
    if (!houseCtx) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "주택 구간 판정에는 배율·토지 면적·양도일(houseCtx)이 필요합니다.");
    const structural = housingStateEventIssue(events.map((e) => ({ kind: e.kind, date: "" })));
    if (structural) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, structural.message, { index: structural.index });
  } else if (events.some((e) => e.buildingKindBefore)) {
    // E3-③ B — 기타토지 철거 행의 종류 칸(D-8). 같은 마지막 안전망.
    const structural = houseKindEventIssue(events.map((e) => ({ kind: e.kind, date: "", buildingKindBefore: e.buildingKindBefore })));
    if (structural) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, structural.message, { index: structural.index });
  }

  const segments: Segment[] = [];
  let hasBuilding = initialHasBuilding(events, tail.hasBuilding);
  let prevBuildingKind: BuildingEventKind | null = null;
  // E3f-2 — 나대지 구간 선언(근거 «철거ㆍ멸실»)의 한시 창 맥락: 철거 행 날짜 · 철거된 건축물 종류 · 구간 `[시작, 끝)`(소유 시작 전은 클립) · 카드의 토지 면적·용도지역(`houseCtx`가 같은 값을 싣는다).
  const bareCtxOf = (i: number): BareDeclarationCtx => ({
    removedOn: removalDateFor(events, i),
    removedKind: demolishedRemovedKindOf(events, i, tail.buildingKind) ?? "building",
    intervalStart: i > 0 && events[i - 1].date.getTime() > ownershipStart.getTime() ? events[i - 1].date : ownershipStart,
    intervalEnd: events[i].date,
    landArea: houseCtx?.landArea ?? Number.NaN,
    zoneType: houseCtx?.zoneType ?? "",
  });
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const prev = i > 0 ? events[i - 1] : undefined;
    if (prev && ev.date.getTime() <= prev.date.getTime()) {
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "건축물 사건은 날짜가 엄격하게 증가해야 합니다(같은 날·역순 불가).", { index: i });
    }
    if (ev.kind !== "tax_type_changed" && prevBuildingKind === ev.kind) {
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "건축물 신축과 멸실은 번갈아 와야 합니다(같은 종류 연속 불가).", { index: i });
    }
    if (ev.date.getTime() >= endDate.getTime()) {
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "사건일은 양도일보다 앞이어야 합니다(양도일 현재 상태 구간이 1일 이상이어야 함).", { index: i });
    }
    if (ev.kind === "tax_type_changed") {
      // 건축물 있는 구간 = 구분만 가른다(E3-①) · 건축물 없는 구간(나대지) = 선언 3칸을 해석한다(E3-1b — 종전 «차단» 규칙 삭제).
      segments.push(
        hasBuilding
          ? { end: ev.date, hasBuilding, propertyTaxType: ev.propertyTaxTypeBefore ? ev.propertyTaxTypeBefore : "unknown" }
          : { end: ev.date, hasBuilding: false, ...resolveBareDeclaration(ev, bareCtxOf(i)) },
      );
      continue;
    }
    prevBuildingKind = ev.kind;
    const closesHouse = eventClosesHouseInterval(events, i, tail.buildingKind);
    if (closesHouse && !houseCtx) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "주택 구간 판정에는 배율·토지 면적·양도일(houseCtx)이 필요합니다.", { index: i });
    segments.push(
      ev.kind === "building_built"
        ? { end: ev.date, hasBuilding: false, ...resolveBareDeclaration(ev, bareCtxOf(i)) }
        : closesHouse
          ? // 주택 구간 — 재산세 구분은 읽지 않는다(`"unknown"` 고정 · 조심 2018서0295). 배율 이내 여부는 철거 직전 정착면적이 정한다(`resolveHouseInterval`).
            { end: ev.date, hasBuilding: true, propertyTaxType: "unknown", buildingKind: "house", ...resolveHouseInterval(ev.houseFootprintBefore, houseCtx!) }
          : { end: ev.date, hasBuilding: true, propertyTaxType: ev.propertyTaxTypeBefore ? ev.propertyTaxTypeBefore : "unknown" },
    );
    hasBuilding = ev.kind === "building_built";
  }
  segments.push(
    houseCard
      ? { end: null, hasBuilding: true, propertyTaxType: tail.propertyTaxType, buildingKind: "house" } // 꼬리 = 양도일 현재 주택 — core(`judgeHousingLand` 이내 분기)가 판정한다
      : { end: null, hasBuilding: hasBuildingAtTransfer(events) ?? tail.hasBuilding, propertyTaxType: tail.propertyTaxType },
  );

  const intervals: LandStateInterval[] = [];
  let cursor = ownershipStart;
  for (const { end: segEnd, ...fields } of segments) {
    const end = segEnd ?? endDate;
    // 소유 시작 전(≤ cursor)에 끝나는 구간은 0일이라 버려진다(클립) — 그 사건 이후 상태가 소유 첫날 상태가 된다.
    if (end.getTime() > cursor.getTime()) {
      intervals.push({ start: cursor, end, ...fields });
      cursor = end;
    }
  }
  return intervals;
}

// ── 구간의 사업용 여부 ───────────────────────────────────────

const BUSINESS_PROPERTY_TAX_TYPES: ReadonlySet<PropertyTaxType | "unknown"> = new Set<PropertyTaxType | "unknown">([
  "exempt",
  "special_sum",
  "separate",
]);

/**
 * **이전 구간**(꼬리 제외)의 사업용 확정 — 법 §104의3①4호 가·나목: 재산세 구분이 비과세·면제·분리과세·별도합산인 구간. 건축물이 있는 구간은 그 구분만으로,
 * **나대지(`hasBuilding=false`)는 나대지 선언이 근거와 함께 받아들여졌을 때만**(`basisOutcome === "accepted"` — E3-1b) 사업용이다.
 * 종합합산 · 모름(`"unknown"`) · 근거를 확인하지 못해 접힌 나대지는 비사업용이다(「모름」 = 혜택 불성립 — 2026-10-04 원칙).
 * 건축물 구간의 배율·2% 요건은 구간별로 재판정하지 않는다(건축물 바닥면적·시가표준액 이력이 없다 — 엔진 V-5, 고지 대상).
 * 꼬리는 core가 판정하므로 이 함수를 쓰지 않는다(`stateHistoryBusinessIntervals`).
 */
export function isStateIntervalBusiness(interval: Pick<LandStateInterval, "hasBuilding" | "propertyTaxType" | "basisOutcome" | "buildingKind" | "houseOutcome" | "temporaryStatusWindow">): boolean {
  // E3f-2 — 근거 «철거ㆍ멸실»을 받아들인 나대지 구간은 구간 **전체**가 사업용이 아니다: 한시 창(`temporaryStatusWindow`)만 사업용 구간에 더해진다(`stateHistoryBusinessIntervals`).
  if (interval.temporaryStatusWindow) return false;
  // E3-③ — 주택 구간은 재산세 구분을 보지 않고(조심 2018서0295) 정착면적 × 배율 이내(`within`)일 때만 사업용이다. 초과·모름은 같은 접힘(Q-5 (나) — «초과»가 «모름»보다 유리하지 않다).
  if (interval.buildingKind === "house") return interval.houseOutcome === "within";
  return (interval.hasBuilding || interval.basisOutcome === "accepted") && BUSINESS_PROPERTY_TAX_TYPES.has(interval.propertyTaxType);
}

/** core(양도일 현재 상태 판정)가 `applyStateHistory`에 넘기는 것. */
export interface StateHistoryCoreResult {
  /** core가 전량 사업용으로 결론냈는가. */
  isBusiness: boolean;
  /**
   * core가 `fullPeriod`가 아닌 **자기 사업기간**으로 판정한 경로의 구간 — DM-01(당해 사업개시일 `[개시일, 양도일)`) · 3호(조성 완료 `[완료일, +2년)`).
   * 그 경로가 적용되지 않았으면 `undefined`. **빈 배열도 «자체 구간이 있다(비어 있다)»로 읽는다.**
   */
  ownBusinessPeriods?: DateInterval[];
}

/**
 * 영 §168조의6 판정(`meetsPeriodCriteria`)에 넘길 **사업용 구간** — 엔진 계획서 §4.2 ② · **Q-15 (가′)**(2026-11-22 사용자 결정).
 *
 *   사업용 구간 = 이전 구간 중 `isStateIntervalBusiness`  ∪  (core 자체 사업기간이 있으면 `소유기간 ∩ 자체 사업기간`, 없으면 core가 사업용일 때 꼬리 전체)
 *
 * (가′)는 core 자체 사업기간을 «꼬리 ∩»가 아니라 **소유기간 전체와 교차**한다 — (이전 구간 ∪ 꼬리 구간) = 소유기간이기 때문이다. 초판 (가) 문언(꼬리 ∩ 자체 사업기간)은
 * V-21 시료에서 현행 core보다 과세를 늘렸다(3호 550 비사업용 vs 730 사업용 · DM-01 546 vs 911). 자체 사업기간이 있으면 core가 사업용·비사업용 어느 쪽이든 그 구간을 센다
 * (Q15a 시료: core는 비사업용이지만 개시일 이후 121일은 사업 구간 — 사업 850 = 건축물 729 + 121).
 *
 * `intervals`는 `deriveOtherLandStateIntervals`의 결과(소유기간을 덮고 마지막 = 꼬리)여야 한다. 반환은 병합 전 구간 목록이다(`meetsPeriodCriteria`가 유예와 함께 합집합한다).
 */
export function stateHistoryBusinessIntervals(intervals: ReadonlyArray<LandStateInterval>, core: StateHistoryCoreResult): DateInterval[] {
  if (intervals.length === 0) return [];
  const tail = intervals[intervals.length - 1];
  const pastIntervals = intervals.slice(0, -1);
  // E3f-2 — 근거 «철거ㆍ멸실»의 한시 창은 구간 안에서 사업용 구간으로 더한다(구간 전체는 `isStateIntervalBusiness`가 아니다). 겹침은 `meetsPeriodCriteria`가 합집합한다.
  const past: DateInterval[] = [
    ...pastIntervals.filter(isStateIntervalBusiness).map(({ start, end }) => ({ start, end })),
    ...pastIntervals.flatMap((iv) => (iv.temporaryStatusWindow ? [{ start: iv.temporaryStatusWindow.start, end: iv.temporaryStatusWindow.end }] : [])),
  ];
  if (core.ownBusinessPeriods) {
    return [...past, ...getOverlappingPeriods([{ start: intervals[0].start, end: tail.end }], core.ownBusinessPeriods)];
  }
  return core.isBusiness ? [...past, { start: tail.start, end: tail.end }] : past;
}
