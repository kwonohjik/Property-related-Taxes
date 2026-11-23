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
import { stateEventAtOrAfterTransferMessage } from "./nbl-validation-messages";
import { stateEventAtOrBeforeFloorMessage } from "./nbl-validation-messages";
import { stateEventDateEmptyMessage } from "./nbl-validation-messages";
import { stateEventDateInvalidMessage } from "./nbl-validation-messages";
import { stateEventKindRequiredMessage } from "./nbl-validation-messages";
import { stateEventReversedMessage } from "./nbl-validation-messages";
import { stateEventSameDayMessage } from "./nbl-validation-messages";
import { stateEventSameKindMessage } from "./nbl-validation-messages";
import { STATE_EVENTS_REQUIRED_MESSAGE } from "./nbl-validation-messages";
import { propertyTaxBasisOptions } from "./property-tax-basis";
import { resolvePropertyTaxBasis } from "./property-tax-basis";
import { PROPERTY_TAX_TYPE_LABEL } from "./property-tax-type-label";
import { getOverlappingPeriods } from "./utils/period-math";
import type { BareFoldReason } from "./land-usage.types";
import type { LandStateInterval } from "./land-usage.types";
import type { PropertyTaxType } from "./land-usage.types";
import type { StateEvent } from "./land-usage.types";
import type { StateEventKind } from "./land-usage.types";
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
 * 나대지 구간 선언에서 고를 수 있는 근거 선택지(「모름」 포함) — V1-A 선택지(`propertyTaxBasisOptions(declared, false)`)에서 **`demolished` 제외**(철거 후 한시 지위는 파생 경계가 필요한
 * E3 ⑤ 축이고, 유예기간 9호가 이미 덮는다 — 결정 2026-11-23). 빈 배열 = 근거를 묻지 않는다(종합합산).
 */
export function eventBasisOptions(declared: PropertyTaxType): readonly PropertyTaxBasis[] {
  return propertyTaxBasisOptions(declared, false).filter((b) => b !== "demolished");
}

// ── 사건 행·순서 검증 (⑧·⑫ 공용) ─────────────────────────────

/** 결함 칸: `events` = 사건 컨테이너(0건) · `kind`·`date` = `nblOtherStateEvents.{index}.{field}`. */
export interface StateEventIssue {
  index: number | null;
  field: "events" | "kind" | "date";
  message: string;
}

export interface StateEventRowLike {
  kind: string;
  date: string;
}

/**
 * 사건 한 행의 결함(종류 미선택·허용값 밖 · 날짜 빈 칸·해석 불가). 이상 없으면 null. 날짜는 `YYYY-MM-DD`(ISO)를 전제한다.
 * `propertyTaxTypeBefore`는 규칙이 없다 — 선택 칸이고 `""` = 모름이다(⑫ enum이 허용값 밖만 막는다).
 */
export function stateEventRowIssue(row: StateEventRowLike, index: number): StateEventIssue | null {
  if (!isEventKind(row.kind)) return { index, field: "kind", message: stateEventKindRequiredMessage(index) };
  if (!row.date) return { index, field: "date", message: stateEventDateEmptyMessage(index, row.kind) };
  if (!toOptionalDate(row.date)) return { index, field: "date", message: stateEventDateInvalidMessage(index, row.date, row.kind) };
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
  if (events.length === 0) return { index: null, field: "events", message: STATE_EVENTS_REQUIRED_MESSAGE };
  const transfer = toOptionalDate(opts.transferDate);
  const floor = opts.floorDate ? toOptionalDate(opts.floorDate) : undefined;
  let prevBuildingKind: BuildingEventKind | null = null;
  for (let i = 0; i < events.length; i++) {
    const row = events[i];
    const rowIssue = stateEventRowIssue(row, i);
    if (rowIssue) return rowIssue;
    const t = toOptionalDate(row.date)!.getTime(); // 행 검증 통과 → 해석 가능
    if (i > 0) {
      const prev = events[i - 1];
      const prevT = toOptionalDate(prev.date)!.getTime(); // 앞 행도 이미 통과했다
      // 역순·같은 날은 종류와 무관한 «앞 사건» 기준이다 — 건축물 사건과 구분 변경이 같은 날이면 같은 구간을 두 사건이 닫는다.
      if (t < prevT) return { index: i, field: "date", message: stateEventReversedMessage(i, row.date, prev.date, row.kind) };
      if (t === prevT) return { index: i, field: "date", message: stateEventSameDayMessage(i, row.date, row.kind) };
    }
    if (floor && t <= floor.getTime()) return { index: i, field: "date", message: stateEventAtOrBeforeFloorMessage(i, row.date, opts.floorDate!, row.kind) };
    if (transfer && t >= transfer.getTime()) return { index: i, field: "date", message: stateEventAtOrAfterTransferMessage(i, row.date, opts.transferDate, row.kind) };
    if (!isBuildingEventKind(row.kind)) continue;
    if (prevBuildingKind === row.kind) {
      const missingKind: BuildingEventKind = row.kind === "building_built" ? "building_removed" : "building_built";
      return { index: i, field: "kind", message: stateEventSameKindMessage(i, STATE_AFTER_EVENT_LABEL[row.kind], STATE_EVENT_KIND_LABEL[missingKind]) };
    }
    prevBuildingKind = row.kind;
  }
  return null;
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
 * 양도일 현재 「건축물 있음」 — `changed`이면 **사건에서 파생**한 값이 이긴다(직접 API가 숨은 토글을 모순되게 보내도 사건이 이긴다 · 엔진 V-19 · P-15).
 * 아니면 입력 토글 그대로다. ⑫ refine · ⑭ 매퍼가 같은 함수를 쓴다(⑤⑧ 술어는 U0가 같은 함수를 재사용).
 */
export function effectiveOtherHasBuilding(raw: boolean, mode: string | undefined, events: ReadonlyArray<{ kind: string }>): boolean {
  return mode === "changed" ? (hasBuildingAtTransfer(events) ?? raw) : raw;
}

export interface StateTail {
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
type BareDeclaration = Pick<LandStateInterval, "propertyTaxType" | "basisOutcome" | "basis" | "declaredPropertyTaxType" | "foldReason">;

/**
 * **나대지 구간을 닫는 사건**(`eventClosesBareInterval`)의 선언 3칸을 해석한다 — 구간마다 V1-A 해석기 `resolvePropertyTaxBasis`(hasBuilding=false)를 그대로 호출한다.
 *   · 구분 없음(`""`·미전송): 신축 행 = 선언 없음 → 종합합산(고지 없음 · 종전과 바이트 동일) · 구분 변경 행 = **모름** → `"unknown"`(종합합산 + 확인 필요 — E3-① 같은 정책).
 *   · `comprehensive`: 종합합산(근거를 묻지 않는다).
 *   · 비종합합산 + 근거: `accepted`이면 선언한 구분 그대로 · `unconfirmed`(미선택·모름·호환 불가·`demolished`)이면 종합합산으로 접는다.
 *     `demolished`는 나대지 구간 근거로 받지 않는다(철거 후 한시 = E3 ⑤ · 유예 9호가 덮음) — 바닥면적을 넘기지 않으므로 V1-A도 접지만 사유를 `demolished_unsupported`로 구별한다.
 *   · 근거 `vacant_state`는 면적한도: `within`만 인정 — `exceeded`·`unknown`·`""`는 그 구간 **전체**를 종합합산으로 접는다(부분 면적 자동 안분 없음 · 「일부 초과」가 「모름」보다 유리하지 않다).
 */
export function resolveBareDeclaration(ev: Pick<StateEvent, "kind" | "propertyTaxTypeBefore" | "propertyTaxBasisBefore" | "areaWithinLimitBefore">): BareDeclaration {
  const declared = ev.propertyTaxTypeBefore;
  if (!declared) return { propertyTaxType: ev.kind === "building_built" ? "comprehensive" : "unknown" };
  if (declared === "comprehensive") return { propertyTaxType: "comprehensive" };
  const basis = ev.propertyTaxBasisBefore || undefined;
  const echo = { ...(basis ? { basis } : {}), declaredPropertyTaxType: declared };
  const fold = (foldReason: BareFoldReason): BareDeclaration => ({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", ...echo, foldReason });
  if (basis === "demolished") return fold("demolished_unsupported");
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
  demolished_unsupported: "철거 후 한시 지위 — 유예기간으로 입력",
  area_exceeded: "면적한도 일부 초과",
  area_unknown: "면적한도 모름",
} as const satisfies Record<BareFoldReason, string>;

/**
 * 나대지 구간(`hasBuilding=false`) 중 **비종합합산 선언이 있는 구간**의 «재산세 구분» 표 문구 — 선언이 없으면 `undefined`(호출자가 종전 문구를 쓴다).
 * 받아들인 구간 = 「별도합산(나대지 — 공지상태 근거)」 · 접힌 구간 = 「종합합산(나대지 — {사유} · 확인 필요)」. ⑤ 미리보기 · ⑦ 결과 구간표가 같은 함수를 쓴다.
 */
export function bareIntervalTaxTypeText(iv: Pick<LandStateInterval, "hasBuilding" | "propertyTaxType" | "basisOutcome" | "basis" | "foldReason">): string | undefined {
  if (iv.hasBuilding || !iv.basisOutcome) return undefined;
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

  const segments: Segment[] = [];
  let hasBuilding = initialHasBuilding(events, tail.hasBuilding);
  let prevBuildingKind: BuildingEventKind | null = null;
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
          : { end: ev.date, hasBuilding: false, ...resolveBareDeclaration(ev) },
      );
      continue;
    }
    prevBuildingKind = ev.kind;
    segments.push(
      ev.kind === "building_built"
        ? { end: ev.date, hasBuilding: false, ...resolveBareDeclaration(ev) }
        : { end: ev.date, hasBuilding: true, propertyTaxType: ev.propertyTaxTypeBefore ? ev.propertyTaxTypeBefore : "unknown" },
    );
    hasBuilding = ev.kind === "building_built";
  }
  segments.push({ end: null, hasBuilding: hasBuildingAtTransfer(events) ?? tail.hasBuilding, propertyTaxType: tail.propertyTaxType });

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
export function isStateIntervalBusiness(interval: Pick<LandStateInterval, "hasBuilding" | "propertyTaxType" | "basisOutcome">): boolean {
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
  const past: DateInterval[] = intervals
    .slice(0, -1)
    .filter(isStateIntervalBusiness)
    .map(({ start, end }) => ({ start, end }));
  if (core.ownBusinessPeriods) {
    return [...past, ...getOverlappingPeriods([{ start: intervals[0].start, end: tail.end }], core.ownBusinessPeriods)];
  }
  return core.isBusiness ? [...past, { start: tail.start, end: tail.end }] : past;
}
