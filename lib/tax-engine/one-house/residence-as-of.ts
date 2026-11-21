/**
 * 거주 구간 → 특정 날 현재 거주 개월 (2026-11 리뷰 I-07 · D-05 2단계).
 *
 * 「소득세법 시행령」 §154⑥ 「전입일부터 전출일까지의 기간」 — 초일 산입 완성 개월(`completedMonthsInclusive`)을 구간마다 세어 더한다.
 * 화면(`residenceIntervalMonths`·`sumResidenceMonths`)과 같은 산식이다. `asOf` 뒤의 거주는 세지 않는다(그 날 양도했다면 그 날까지).
 */
import { completedMonthsInclusive } from "../civil-period";
import { addDays } from "../utc-date";

export type ResidenceInterval = { start: Date; end: Date };

export function residenceMonthsAsOf(intervals: readonly ResidenceInterval[], asOf: Date): number {
  return intervals.reduce((sum, iv) => {
    if (iv.start.getTime() > asOf.getTime()) return sum;
    const end = iv.end.getTime() > asOf.getTime() ? asOf : iv.end;
    return end.getTime() < iv.start.getTime() ? sum : sum + completedMonthsInclusive(iv.start, end);
  }, 0);
}

/**
 * 구간을 믿을 수 있는가 — 구간 합(자르지 않은)이 입력 거주 개월과 같을 때만. 다른 경로(용도변경 전 거주 제외 등)가 개월을 조정했으면 구간이
 * 그 조정을 모르므로 쓰지 않는다(호출부가 1단계 조건으로 돌아간다).
 */
export function residenceIntervalsUsable(intervals: readonly ResidenceInterval[] | undefined, months: number): intervals is readonly ResidenceInterval[] {
  if (!intervals || intervals.length === 0) return false;
  return intervals.reduce((s, iv) => s + (iv.end.getTime() < iv.start.getTime() ? 0 : completedMonthsInclusive(iv.start, iv.end)), 0) === months;
}

/**
 * 2026-11 리뷰 I-25 · 결정 Q-26 — 비연속 거주를 **날수로 이어 붙여** 센 개월(보유 통산 `excludeNonResidentHoldingPeriod`와 같은 일수 이동).
 * 현행은 구간마다 완성 개월로 내림해 더한다(화면·⑧·엔진 공통) — 다음 날 이어진 구간도 나눠 세면 짧아진다(875일: 1구간 28개월 · 6구간 23개월).
 * 두 셈법이 결론을 가를 때만 확인 필요를 낸다(`era-undetermined.ts`). 구간이 2개 미만이면 `undefined`.
 */
export function residenceMonthsDayShifted(intervals: readonly ResidenceInterval[]): number | undefined {
  const valid = intervals.filter((iv) => iv.end.getTime() >= iv.start.getTime());
  if (valid.length < 2) return undefined;
  const DAY = 86_400_000;
  const days = valid.reduce((s, iv) => s + Math.round((iv.end.getTime() - iv.start.getTime()) / DAY) + 1, 0);
  const first = valid.reduce((a, b) => (b.start.getTime() < a.start.getTime() ? b : a));
  return completedMonthsInclusive(first.start, addDays(first.start, days - 1));
}

