/**
 * 기간 산술 유틸 (v2)
 *
 * 반열린 구간 [start, end) 기준. 재촌·자경·유예·별장 비사용 등
 * 모든 기간 계산에 사용.
 */

import { differenceInDays } from "date-fns";
import type { DateInterval } from "../types";

/**
 * 겹치는 구간을 합산·중복 제거 (interval merge).
 * [1~5], [5~10] 같은 인접 구간도 합병 (반열린 구간이므로 5일 이중 카운트 없음).
 */
export function mergeOverlappingPeriods(periods: DateInterval[]): DateInterval[] {
  const valid = periods.filter((p) => p.end > p.start);
  if (valid.length === 0) return [];

  const sorted = [...valid].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: DateInterval[] = [{ start: new Date(sorted[0].start), end: new Date(sorted[0].end) }];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end) {
      if (cur.end > last.end) last.end = new Date(cur.end);
    } else {
      merged.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return merged;
}

/**
 * periods(이미 merge된 상태 가정)의 총 일수를 [windowStart, windowEnd]에 클립해 합산.
 */
export function sumDaysInWindow(
  periods: DateInterval[],
  windowStart: Date,
  windowEnd: Date,
): number {
  let total = 0;
  for (const p of periods) {
    const s = p.start < windowStart ? windowStart : p.start;
    const e = p.end > windowEnd ? windowEnd : p.end;
    const days = differenceInDays(e, s);
    if (days > 0) total += days;
  }
  return total;
}

/**
 * 두 기간 배열의 교집합 (AND).
 * 농지: 재촌기간 × 자경기간 = 실질 재촌자경 기간.
 */
export function getOverlappingPeriods(a: DateInterval[], b: DateInterval[]): DateInterval[] {
  const result: DateInterval[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = x.start > y.start ? x.start : y.start;
      const end = x.end < y.end ? x.end : y.end;
      if (start < end) result.push({ start: new Date(start), end: new Date(end) });
    }
  }
  return mergeOverlappingPeriods(result);
}

/**
 * 기간의 반대 구간 계산 — 별장 "비사용기간" 산출용.
 * boundingStart ~ boundingEnd 구간 중 usePeriods에 포함되지 않은 부분 반환.
 */
export function invertPeriods(
  usePeriods: DateInterval[],
  boundingStart: Date,
  boundingEnd: Date,
): DateInterval[] {
  if (boundingEnd <= boundingStart) return [];
  const merged = mergeOverlappingPeriods(
    usePeriods
      .map((p) => ({
        start: p.start < boundingStart ? boundingStart : p.start,
        end: p.end > boundingEnd ? boundingEnd : p.end,
      }))
      .filter((p) => p.end > p.start),
  );
  if (merged.length === 0) return [{ start: new Date(boundingStart), end: new Date(boundingEnd) }];

  const out: DateInterval[] = [];
  let cursor = new Date(boundingStart);
  for (const p of merged) {
    if (cursor < p.start) out.push({ start: new Date(cursor), end: new Date(p.start) });
    cursor = p.end > cursor ? new Date(p.end) : cursor;
  }
  if (cursor < boundingEnd) out.push({ start: cursor, end: new Date(boundingEnd) });
  return out;
}

/**
 * 소유기간 시작일 = 취득일 다음날 (초일불산입 원칙).
 */
export function getOwnershipStart(acquisitionDate: Date): Date {
  const d = new Date(acquisitionDate);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * `base`에서 `remove` 구간을 뺀 나머지를 반환한다 (반열린 구간 차집합).
 *
 * 「조특령 §66⑭ 결격 과세기간을 자경기간에서 제외」처럼 **특정 달력 구간을 통째로 빼야 하는**
 * 판정에 쓴다. `invertPeriods`(경계 지정 반전)와 달리 경계를 밖에서 정할 필요가 없다 —
 * `base` 자신이 경계다.
 */
export function subtractPeriods(base: DateInterval[], remove: DateInterval[]): DateInterval[] {
  const mergedBase = mergeOverlappingPeriods(base);
  if (mergedBase.length === 0) return [];
  const mergedRemove = mergeOverlappingPeriods(remove);
  if (mergedRemove.length === 0) return mergedBase;

  const out: DateInterval[] = [];
  for (const b of mergedBase) {
    let cursor = new Date(b.start);
    for (const r of mergedRemove) {
      if (r.end <= cursor) continue;      // 이미 지난 구간
      if (r.start >= b.end) break;        // 이 base 구간보다 뒤 — 정렬돼 있으므로 종료
      if (r.start > cursor) out.push({ start: new Date(cursor), end: new Date(r.start) });
      if (r.end > cursor) cursor = new Date(r.end);
      if (cursor >= b.end) break;
    }
    if (cursor < b.end) out.push({ start: cursor, end: new Date(b.end) });
  }
  return mergeOverlappingPeriods(out);
}
