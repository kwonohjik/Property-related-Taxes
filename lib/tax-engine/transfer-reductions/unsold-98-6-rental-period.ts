/**
 * §98의6①2호 임대기간 계산 — 조특령 §98의5⑤ (US-24·US-25·US-60, 리뷰 Q-22 (a) 2026-11-08)
 *
 * - 기산일: 「임대인이 … 사업자등록과 … 임대사업자등록을 한 후 임대를 개시하는 날부터 기산」(령 §98의5⑤1호) →
 *   기산일 = max(사업자등록일, 임대사업자등록일, 실제 임대개시일). 등록일이 실제 개시일보다 늦으면 등록일부터 센다.
 * - 초일 산입(Q-22 (a)): 「임대를 개시하는 날부터 기산」이므로 개시일 당일을 임대기간에 넣는다.
 *   정본 헬퍼는 `civil-period.ts`의 `completedMonthsInclusive`(D 유형 — 양 끝 포함 만 개월)다. 새 달력 계산을 만들지 않는다.
 *   §98의6에만 적용한다 — §97 계열(`calculateEffectiveRentalPeriod`)·§98의8(`fullMonthsBetween`)은 별도 확인 필요로 남겼다.
 * - 공실: 령 §98의5⑤에는 §97⑤5호 같은 공실 산입 규정이 없다 → 임대하지 않은 기간은 임대기간에서 뺀다.
 *   「3월 이내 공실 산입」은 §97 계열 규정이므로 빌려 오지 않는다.
 * - 여러 구간의 합산: 공실로 갈라진 임대 구간마다 만 개월을 세어 더한다. 법령에 합산 방식(구간별 만 개월 합산 vs
 *   일수 합산 후 환산)이 정해져 있지 않다 — **확인 필요**(구간별 합산은 일수 합산 후 환산보다 같거나 작다).
 * - 양도일 상한: 양도 후의 임대는 양도인의 임대가 아니므로 임대종료일은 양도일을 넘길 수 없다(화면 ⑧은 차단, 엔진은 상한 처리).
 */

import { completedMonthsInclusive } from "../civil-period";

const DAY_MS = 86_400_000;
const dayKey = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const fromKey = (k: number) => new Date(k);

/** 공실 구간 (양 끝 포함) */
export interface Unsold986VacancyDates {
  startDate: Date;
  endDate: Date;
}

/** 령 §98의5⑤1호 기산일 = max(사업자등록일, 임대사업자등록일, 실제 임대개시일) */
export function unsold986RentalBasisDate(actualStart: Date, businessRegistrationDate: Date, rentalRegistrationDate: Date): Date {
  return fromKey(Math.max(dayKey(actualStart), dayKey(businessRegistrationDate), dayKey(rentalRegistrationDate)));
}

/** [start, end]에서 공실(양 끝 포함)을 뺀 임대 구간들. start > end이면 빈 배열. */
export function unsold986RentalSegments(start: Date, end: Date, vacancies: readonly Unsold986VacancyDates[]): Array<[Date, Date]> {
  const s = dayKey(start);
  const e = dayKey(end);
  if (e < s) return [];
  const sorted = vacancies
    .map((v) => [dayKey(v.startDate), dayKey(v.endDate)] as const)
    .filter(([vs, ve]) => ve >= vs && ve >= s && vs <= e)
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[Date, Date]> = [];
  let cursor = s;
  for (const [vs, ve] of sorted) {
    if (vs > cursor) out.push([fromKey(cursor), fromKey(Math.min(vs - DAY_MS, e))]);
    cursor = Math.max(cursor, ve + DAY_MS);
    if (cursor > e) break;
  }
  if (cursor <= e) out.push([fromKey(cursor), fromKey(e)]);
  return out;
}

/** 공실을 뺀 임대 구간별 만 개월(초일 산입)의 합 */
export function unsold986RentalMonthsExcludingVacancy(start: Date, end: Date, vacancies: readonly Unsold986VacancyDates[]): number {
  return unsold986RentalSegments(start, end, vacancies).reduce((sum, [a, b]) => sum + completedMonthsInclusive(a, b), 0);
}
