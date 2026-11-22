/**
 * NBL-STATE-HISTORY-E1 — 기타토지 소유기간 중 상태 이력: 사건 → **일 단위 상태 구간** 변환 leaf (순수 · DB·Date 직접 생성 없음).
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.plan.md (통합 v3.1) · engine.plan.md §3.5 · §3.6 · §4.2 · §7.4
 * 결정(2026-11-22 사용자): V-1 **일 단위**(영 §168조의6 «기간의 계산은 일수로 한다» — 과세기준일(6.1.) 단위 «접기»는 재제안·재구현 금지) ·
 *   Q-15 **(가′)** — 사업용 구간 = 이력상 사업 구간 ∪ ((이전 구간 ∪ 꼬리 구간) ∩ core 자체 사업기간) · 「모름」 = 혜택 불성립 + 확인 필요 · 자동 안분 fallback 금지.
 *
 * ## 🔴 E1에서는 판정 경로에 연결하지 않는다
 * `judgeOtherLand`·⑫ Zod·⑭ 매퍼·⑧ 어디서도 이 파일을 import하지 않는다(세액 불변 — E0 골든 스냅샷이 증명).
 * 연결(`applyStateHistory` 후처리 · `CategoryJudgeResult.businessPeriodsUsed` · echo · ⑫ · ⑭)은 E2다.
 * 도달 불가 가드: `__tests__/lib/nbl-state-history-leaf-unreachable.test.ts` — E2가 배선하면 그 테스트가 빨개지는 것이 정상이며, E2가 그 가드를 갱신한다.
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
import { PROPERTY_TAX_TYPE_LABEL } from "./property-tax-type-label";
import { getOverlappingPeriods } from "./utils/period-math";
import type { LandStateInterval } from "./land-usage.types";
import type { PropertyTaxType } from "./land-usage.types";
import type { StateEvent } from "./land-usage.types";
import type { StateEventKind } from "./land-usage.types";
import type { DateInterval } from "./types";

// ── 라벨 ─────────────────────────────────────────────────────

/** 사건 종류 라벨 — 유예 사유 9호 라벨(`GRACE_REASON_SPECS.demolition.label` = 「건축물 멸실·철거·붕괴 (9호)」)과 같은 표기. */
export const STATE_EVENT_KIND_LABEL = {
  building_built: "건축물 신축",
  building_removed: "건축물 멸실·철거·붕괴",
} as const satisfies Record<StateEventKind, string>;

/** 사건 직후의 건축물 유무 라벨 — 같은 종류 연속 오류 문구용. */
const STATE_AFTER_EVENT_LABEL = {
  building_built: "건축물 있음",
  building_removed: "건축물 없음",
} as const satisfies Record<StateEventKind, string>;

/** 상태 구간의 재산세 구분 라벨 — `PROPERTY_TAX_TYPE_LABEL` 단일 소스 + 「모름」(철거 사건의 `""`). */
export const STATE_PROPERTY_TAX_TYPE_LABEL = {
  ...PROPERTY_TAX_TYPE_LABEL,
  unknown: "모름",
} as const satisfies Record<LandStateInterval["propertyTaxType"], string>;

const EVENT_KINDS = Object.keys(STATE_EVENT_KIND_LABEL) as StateEventKind[];

function isEventKind(value: string): value is StateEventKind {
  return (EVENT_KINDS as string[]).includes(value);
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
  if (!row.date) return { index, field: "date", message: stateEventDateEmptyMessage(index) };
  if (!toOptionalDate(row.date)) return { index, field: "date", message: stateEventDateInvalidMessage(index, row.date) };
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

/**
 * `changed`일 때의 **사건 목록 전체**를 화면 순서(행 순서 · 행 안에서는 종류 → 날짜 → 순서·경계)대로 훑어 첫 결함을 돌려준다. 호출자는 `mode === "changed"`일 때만 부른다.
 *
 *   · 0건 → `events` (이력 없음을 `changed`로 위장한 입력 — 통합 §1)
 *   · 행 결함 → `stateEventRowIssue`
 *   · 앞 사건보다 빠름 · 같은 날 (자동 정렬하지 않는다 — 침묵 보정 금지)
 *   · 하한일 이하(`floorDate`가 있을 때만) · 양도일 이후(당일 포함)
 *   · 같은 종류 연속(신축 뒤 신축 · 멸실 뒤 멸실)
 */
export function stateEventSequenceIssue(events: ReadonlyArray<StateEventRowLike>, opts: StateEventSequenceOptions): StateEventIssue | null {
  if (events.length === 0) return { index: null, field: "events", message: STATE_EVENTS_REQUIRED_MESSAGE };
  const transfer = toOptionalDate(opts.transferDate);
  const floor = opts.floorDate ? toOptionalDate(opts.floorDate) : undefined;
  for (let i = 0; i < events.length; i++) {
    const row = events[i];
    const rowIssue = stateEventRowIssue(row, i);
    if (rowIssue) return rowIssue;
    const t = toOptionalDate(row.date)!.getTime(); // 행 검증 통과 → 해석 가능
    if (i > 0) {
      const prev = events[i - 1];
      const prevT = toOptionalDate(prev.date)!.getTime(); // 앞 행도 이미 통과했다
      if (t < prevT) return { index: i, field: "date", message: stateEventReversedMessage(i, row.date, prev.date) };
      if (t === prevT) return { index: i, field: "date", message: stateEventSameDayMessage(i, row.date) };
    }
    if (floor && t <= floor.getTime()) return { index: i, field: "date", message: stateEventAtOrBeforeFloorMessage(i, row.date, opts.floorDate!) };
    if (transfer && t >= transfer.getTime()) return { index: i, field: "date", message: stateEventAtOrAfterTransferMessage(i, row.date, opts.transferDate) };
    if (i > 0 && row.kind === events[i - 1].kind) {
      const prevKind = row.kind as StateEventKind;
      const missingKind: StateEventKind = prevKind === "building_built" ? "building_removed" : "building_built";
      return { index: i, field: "kind", message: stateEventSameKindMessage(i, STATE_AFTER_EVENT_LABEL[prevKind], STATE_EVENT_KIND_LABEL[missingKind]) };
    }
  }
  return null;
}

// ── 사건 → 일 단위 구간 ───────────────────────────────────────

/** 양도일 현재 건축물 유무 = 마지막 사건 종류. 사건이 없으면 `undefined`(호출자가 현행 입력을 쓴다). `changed`일 때 `hasBuilding` 파생의 단일 소스(UI R5·R8). */
export function hasBuildingAtTransfer(events: ReadonlyArray<{ kind: string }>): boolean | undefined {
  if (events.length === 0) return undefined;
  return events[events.length - 1].kind === "building_built";
}

export interface StateTail {
  /** 사건이 없을 때만 쓴다 — 사건이 있으면 마지막 사건 종류가 정한다(raw 토글과 모순돼도 사건이 이긴다 · V-19). */
  hasBuilding: boolean;
  /** 양도일 현재 재산세 구분(현행 입력 그대로 — 꼬리 구간은 core가 판정한다). */
  propertyTaxType: LandStateInterval["propertyTaxType"];
}

interface Segment {
  /** 이 구간을 닫는 사건일. `null` = 꼬리(양도일까지). */
  end: Date | null;
  hasBuilding: boolean;
  propertyTaxType: LandStateInterval["propertyTaxType"];
}

/**
 * 사건 → 일 단위 상태 구간 `[start, end)`. 첫 구간은 소유 첫날(`ownershipStart` = 취득일 다음날)에서 시작해 양도일(`endDate`)에서 끝나고,
 * 구간은 빈틈·겹침 없이 이어진다 → **Σ 구간 일수 = 소유일수**. 마지막 원소 = 꼬리(양도일 현재 상태 — 기존 입력).
 *
 *   · 첫 사건 종류가 취득 당시 상태를 정한다 — 신축이면 그 전은 나대지(재산세 구분 «종합합산» 고정 · V-6), 멸실이면 그 전은 건축물 있음(그 철거 사건의 `propertyTaxTypeBefore`).
 *   · 건축물 구간의 재산세 구분 = **그 구간을 닫는 철거 사건의 `propertyTaxTypeBefore`**(`""` → `"unknown"`).
 *   · 사건일 ≤ `ownershipStart`는 **클립**한다(축 B 늦은 지분 · 사건일 = 소유 첫날): 앞 구간이 0일이라 버려지고 그 사건 이후 상태가 소유 첫날 상태가 된다.
 *   · 소유 0일 이하(`endDate ≤ ownershipStart`)면 구간이 없다.
 *
 * 사전 조건(⑧·⑫가 이미 막는다 — 어기면 침묵 보정하지 않고 오류): 사건일이 엄격 증가 · 종류가 번갈아 옴 · 마지막 사건일 < 양도일.
 */
export function deriveOtherLandStateIntervals(
  events: ReadonlyArray<StateEvent>,
  ownershipStart: Date,
  endDate: Date,
  tail: StateTail,
): LandStateInterval[] {
  if (endDate.getTime() <= ownershipStart.getTime()) return [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const prev = i > 0 ? events[i - 1] : undefined;
    if (prev && ev.date.getTime() <= prev.date.getTime()) {
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "건축물 사건은 날짜가 엄격하게 증가해야 합니다(같은 날·역순 불가).", { index: i });
    }
    if (prev && ev.kind === prev.kind) {
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "건축물 신축과 멸실은 번갈아 와야 합니다(같은 종류 연속 불가).", { index: i });
    }
    if (ev.date.getTime() >= endDate.getTime()) {
      throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "사건일은 양도일보다 앞이어야 합니다(양도일 현재 상태 구간이 1일 이상이어야 함).", { index: i });
    }
  }

  const segments: Segment[] = events.map((ev) =>
    ev.kind === "building_built"
      ? { end: ev.date, hasBuilding: false, propertyTaxType: "comprehensive" }
      : { end: ev.date, hasBuilding: true, propertyTaxType: ev.propertyTaxTypeBefore ? ev.propertyTaxTypeBefore : "unknown" },
  );
  segments.push({ end: null, hasBuilding: hasBuildingAtTransfer(events) ?? tail.hasBuilding, propertyTaxType: tail.propertyTaxType });

  const intervals: LandStateInterval[] = [];
  let cursor = ownershipStart;
  for (const seg of segments) {
    const end = seg.end ?? endDate;
    // 소유 시작 전(≤ cursor)에 끝나는 구간은 0일이라 버려진다(클립) — 그 사건 이후 상태가 소유 첫날 상태가 된다.
    if (end.getTime() > cursor.getTime()) {
      intervals.push({ start: cursor, end, hasBuilding: seg.hasBuilding, propertyTaxType: seg.propertyTaxType });
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
 * **이전 구간**(꼬리 제외)의 사업용 확정 — 법 §104의3①4호 가·나목: 건축물이 있고 재산세 구분이 비과세·면제·분리과세·별도합산인 구간.
 * 나대지(`hasBuilding=false`) · 종합합산 · 모름(`"unknown"`)은 비사업용이다(「모름」 = 혜택 불성립 — 2026-10-04 원칙).
 * 건축물 구간의 배율·2% 요건은 구간별로 재판정하지 않는다(건축물 바닥면적·시가표준액 이력이 없다 — 엔진 V-5, 고지 대상).
 * 꼬리는 core가 판정하므로 이 함수를 쓰지 않는다(`stateHistoryBusinessIntervals`).
 */
export function isStateIntervalBusiness(interval: Pick<LandStateInterval, "hasBuilding" | "propertyTaxType">): boolean {
  return interval.hasBuilding && BUSINESS_PROPERTY_TAX_TYPES.has(interval.propertyTaxType);
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
