/**
 * 유예기간 일수 계산 (「소득세법 시행령」 §168조의14 ①)
 *
 * @deprecated 🔴 **폐기된 모델 — 새 코드에서 부르지 말 것** (E5-06, 2026-09-02 코드리뷰).
 *
 * `calculateGraceDaysInWindow`는 저장소 어디에서도 호출되지 않고 barrel(`index.ts`)에서도
 * 수출되지 않는다. 유예기간은 현재 `meetsPeriodCriteria`(`period-criteria.ts`) 안에서
 * **사업용 사용기간과의 합집합**으로 처리되며, 그것이 조문에 부합한다 —
 * §168의14①은 「해당 각 호에서 규정한 기간동안 … 해당하지 않는 토지로 **보아** … 판정한다」는
 * **의제**이므로 일수 가산이 아니라 합집합이다(본문 실측 mst=286211).
 *
 * ⚠️ **일수 합산 금지.** §83의5①5호·6호처럼 기산일이 취득일인 유예구간은 구조적으로
 *    사업용 사용기간과 겹치므로, 이 파일의 「일수 합산」 방식으로 되돌리면 그 구간이
 *    **두 번 계산되어 사업용 일수가 과대**해진다(`period-criteria.ts:148-152`가 명시적으로
 *    경고하는 바로 그 회귀).
 *
 * 파일을 남긴 이유는 CLAUDE.md Surgical Changes 원칙(기존 dead code는 요청 없이 삭제하지 않는다)이다.
 * 이름이 「유예기간 일수 계산」이라 후속 작업자가 새 지목·새 판정에서 부르기 쉬워 경고를 남긴다.
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
