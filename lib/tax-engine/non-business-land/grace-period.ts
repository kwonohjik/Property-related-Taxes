/**
 * 유예기간 일수 계산 (§168조의14 ①)
 *
 * 소유기간 중 유예기간에 해당하는 날은 사업용 사용기간에 산입한다.
 * 여러 유예기간이 겹치는 경우 중복 제거 후 합산한다.
 */

import type { GracePeriod, DateInterval } from "./types";
import {
  mergeOverlappingPeriods,
  sumDaysInWindow,
} from "./utils/period-math";

/**
 * 주어진 window(소유기간) 안에서 유예기간 총 일수를 계산한다.
 *
 * @param gracePeriods - 유예기간 배열 (§168조의14 ① 각호 사유별)
 * @param window       - 소유기간 구간 [start, end)
 * @returns 유예기간에 해당하는 일수 (window 외부는 제외, 중복 제거)
 */
export function calculateGraceDaysInWindow(
  gracePeriods: GracePeriod[],
  window: DateInterval,
): number {
  if (gracePeriods.length === 0) return 0;

  // GracePeriod[] → DateInterval[] 로 변환
  const intervals: DateInterval[] = gracePeriods.map((p) => ({
    start: p.startDate,
    end: p.endDate,
  }));

  // 중복 구간 제거
  const merged = mergeOverlappingPeriods(intervals);

  // window 내 일수 합산
  return sumDaysInWindow(merged, window.start, window.end);
}
