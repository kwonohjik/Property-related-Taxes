/**
 * 조특령 §66⑭ 결격 과세기간 — 자경기간에서 제외 (E2-09)
 *
 * ## 근거 체인
 *
 * 「소득세법 시행령」 §168의8② 후단(mst=286211, 본문 실측):
 * > 이 경우 자경한 기간의 판정에 관하여는 「조세특례제한법 시행령」 제66조제14항을 준용한다.
 *
 * 「조세특례제한법 시행령」 §66⑭(mst=287181, 본문 실측):
 * > 제4항ㆍ제6항ㆍ제11항 및 제12항에 따른 경작한 기간 중 해당 피상속인(그 배우자를 포함한다)
 * > 또는 거주자 각각에 대하여 다음 각 호의 어느 하나에 해당하는 **과세기간이 있는 경우 그 기간은
 * > … 경작한 기간에서 제외한다**.
 * > 1. …사업소득금액(농업ㆍ임업에서 발생하는 소득, …부동산임대업에서 발생하는 소득과 …농가부업소득은
 * >    제외하며…)과 …총급여액의 합계액이 **3천700만원 이상**인 과세기간이 있는 경우. 이 경우
 * >    사업소득금액이 음수인 경우에는 해당 금액을 0으로 본다.
 * > 2. …사업소득 총수입금액(같은 제외)이 「소득세법 시행령」 제208조제5항제2호 각 목의 금액 이상인
 * >    과세기간이 있는 경우
 *
 * 「소득세법」 §5①: 「소득세의 과세기간은 **1월 1일부터 12월 31일까지** 1년으로 한다.」
 * ⇒ 결격 과세기간 하나 = 달력연도 하나. 반열린 구간으로는 `[YYYY-01-01, (YYYY+1)-01-01)`.
 *
 * ## 왜 「연도 목록」이지 「연수(count)」가 아닌가
 *
 * 같은 §66⑭를 §69 자경농지 감면 경로(`self-farming-reduction.ts`)는 **연수 차감**으로 구현한다
 * (`farmingYears - disqualifiedTaxPeriodsSelf`). 그쪽은 자경기간 자체가 스칼라(년)이므로 그것으로 족하다.
 *
 * 비사업용 토지 판정은 다르다 — §168의6 기간기준은 「소유기간의 100분의 60 이상」·「양도일 직전
 * **5년 중 3년**」·「직전 **3년 중 2년**」을 **구간 연산**으로 본다. 어느 해가 빠지는지가 판정을
 * 가르므로 **연수만으로는 계산할 수 없다**. 예컨대 10년 자경 중 3년이 결격일 때, 그 3년이
 * 양도 직전 3년이면 「3년 중 2년」 기준이 무너지지만 10년 전이면 무너지지 않는다.
 * ⇒ 이 경로는 **결격 연도 자체**를 받는다.
 *
 * ⚠️ **§69 감면의 입력과 별개 칸이다.** 같은 사실(어느 과세기간이 결격인가)을 두 단위로 받는
 *    셈이지만, 두 경로는 애초에 자경기간을 다른 표현으로 들고 있다(감면 = 스칼라 연수 직접입력 /
 *    NBL = `businessUsePeriods` 구간 배열). 통합하려면 감면 쪽 자경기간까지 구간으로 바꿔야 하므로
 *    별건이다. 두 칸의 hint가 서로를 지목한다.
 *
 * ⚠️ 소득세법 §5②③(사망·출국)은 과세기간을 1월 1일~그 날로 **단축**한다. 이 모델은 연 단위라
 *    그 단축을 표현하지 못한다 — 해당 과세기간 전체를 결격으로 보는 쪽(납세자 불리)이 되므로,
 *    실무상 문제가 되면 그때 구간 입력으로 넓힌다. 현재 입력 채널은 연도뿐이다.
 */

import type { DateInterval } from "./types";
import { subtractPeriods } from "./utils/period-math";

/** 과세기간 1개(달력연도) → 반열린 구간 `[YYYY-01-01, (YYYY+1)-01-01)` (「소득세법」 §5①) */
export function taxPeriodInterval(year: number): DateInterval {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

export interface DisqualifiedTaxPeriodResult {
  /** 결격 과세기간을 제외한 자경 기간 */
  periods: DateInterval[];
  /** 실제로 자경 기간을 잘라낸 연도 (입력했으나 겹치지 않은 연도는 제외) */
  appliedYears: number[];
  /** 제외로 사라진 일수 */
  removedDays: number;
}

/**
 * 자경 기간에서 결격 과세기간(달력연도)을 제외한다.
 *
 * @param selfFarmingPeriods 자경 기간 (재촌 교집합 **전** — §66⑭이 제외하는 것은 「경작한 기간」이다)
 * @param disqualifiedYears  결격 과세기간의 연도 목록. 중복·순서 무관.
 */
export function excludeDisqualifiedTaxPeriods(
  selfFarmingPeriods: DateInterval[],
  disqualifiedYears: number[] | undefined,
): DisqualifiedTaxPeriodResult {
  const years = [...new Set(disqualifiedYears ?? [])].sort((a, b) => a - b);
  if (years.length === 0 || selfFarmingPeriods.length === 0) {
    return { periods: selfFarmingPeriods, appliedYears: [], removedDays: 0 };
  }

  const removeAll = years.map(taxPeriodInterval);
  const periods = subtractPeriods(selfFarmingPeriods, removeAll);

  // 어느 연도가 실제로 잘라냈는지 — 입력했으나 자경 기간과 겹치지 않는 연도는 표시에서 뺀다.
  // (「입력했는데 아무 일도 없었다」를 사용자가 알 수 있어야 한다)
  const baseDays = totalDays(selfFarmingPeriods);
  const appliedYears = years.filter(
    (y) => totalDays(subtractPeriods(selfFarmingPeriods, [taxPeriodInterval(y)])) < baseDays,
  );

  return {
    periods,
    appliedYears,
    removedDays: baseDays - totalDays(periods),
  };
}

function totalDays(periods: DateInterval[]): number {
  return periods.reduce(
    (sum, p) => sum + Math.max(0, (p.end.getTime() - p.start.getTime()) / 86_400_000),
    0,
  );
}

/**
 * 「2019, 2020 2021」처럼 쉼표·공백으로 구분된 연도 문자열을 파싱한다.
 *
 * ⚠️ **관대하게 파싱하지 않는다** — 4자리 정수가 아닌 토큰은 **버리지 않고** `invalid`로 돌려준다.
 *    ⑧ validate가 그것을 근거로 차단한다. 조용히 버리면 「입력했는데 반영이 안 된 것」이
 *    사용자에게 보이지 않는다(자동 fallback 금지).
 */
export function parseTaxPeriodYears(raw: string | undefined): {
  years: number[];
  invalid: string[];
} {
  const tokens = (raw ?? "").split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
  const years: number[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (!/^\d{4}$/.test(t)) {
      invalid.push(t);
      continue;
    }
    years.push(Number(t));
  }
  return { years: [...new Set(years)].sort((a, b) => a - b), invalid };
}
