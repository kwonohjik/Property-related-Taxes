/**
 * 조특법 §97의5①2호 — 「10년 이상 **계속하여** … 임대한 후 양도」 판정 (§97의5 전용)
 *
 * 조특령 §97의5① — 「…10년 이상 계속하여 등록하고, 그 등록한 기간 동안 **계속하여** 10년 이상 임대한
 * 경우로 한다. 이 경우 다음 각 호의 경우에는 해당 기간 동안 계속하여 임대한 것으로 본다.
 *   1. 기존 임차인의 퇴거일부터 다음 임차인의 주민등록을 이전하는 날까지의 기간으로서 6개월 이내의 기간
 *   2. 제72조제2항 각 호의 법률에 따라 협의매수 또는 수용되어 임대할 수 없는 경우의 해당 기간
 *   3. 재개발·재건축·소규모주택정비·리모델링의 사유로 임대할 수 없는 경우에는 해당 주택의 관리처분계획
 *      인가일(소규모주택정비 = 사업시행계획 인가일, 리모델링 = 허가일 또는 사업계획승인일) **전 6개월부터
 *      준공일 후 6개월까지**의 기간」
 *
 * ## 공실 — 「계속」이 끊긴다 (리뷰 2번, 2026-11-01)
 * - 국세청 서면-2020-법규재산-4965(2022.5.31): 공실이 여러 번이면 **각** 공실이 6개월 이내인지 본다(합산 아님).
 * - 6개월을 **초과**한 공실 — **기산일부터 첫 구간**으로 판정한다(Q-1 a · 사용자 결정 2026-11-14,
 *   `docs/01-plan/features/rental-97-5-vacancy-break.plan.md`). 법 §97의5①2호는 「**등록 후** 10년 이상 **계속하여**」이고
 *   6개월 이내만 계속 임대로 「본다」고 정했으므로, 그것을 넘은 공실에서 「등록 후부터의 계속」이 끊긴다.
 *   ⇒ 기산일부터 첫 초과 공실이 **시작되기 전까지**가 10년 이상이어야 한다. 끊긴 뒤 다시 10년을 임대해도 충족하지 않는다
 *   (교재 384·392·393쪽 「공실기간이 6개월을 초과한 경우에는 … 적용받을 수 없」다).
 *   10년을 채운 **뒤**의 공실(양도 직전 공실 포함)은 요건을 깨지 않는다 — 「10년 이상 계속하여 … 임대한 **후** 양도」
 *   (교재 389쪽 · 서면-2017-법령해석재산-1253).
 *   직접 해석례는 확보하지 못했다(계획서 V-1). 종전(2026-11-01 리뷰 게이트 C-3)에는 초과 공실로 나뉜 구간 중
 *   **가장 긴 구간**으로 판정했다 — 1년 공실 뒤 10년 6개월 임대가 적격이었다.
 * - 간주기간(아래)이 한 공실의 가운데를 덮으면 남은 앞뒤 조각을 **각각** 6개월로 판정한다 — 간주기간은
 *   「계속하여 임대한 것으로 본다」이므로 그 앞뒤 조각은 서로 다른 공백이 된다(가정, 해석례 미확인).
 *
 * ## 2호·3호 간주기간
 * 「해당 기간 동안 계속하여 임대한 것으로 본다」 — 공실이 아니며 기간에도 **산입**한다.
 * (§97의3②의 「임대기간 계산 시에는 실제 임대기간만 포함한다」 단서가 §97의5에는 없다.)
 * 공실 구간과 겹치면 겹친 부분을 공실에서 빼고, 남은 조각마다 6개월 판정을 한다.
 */

import { addMonths, differenceInYears, subMonths } from "../utc-date";

/** 령 §97의5①1호 — 공실 유예 6개월 (경계 「이내」 포함) */
const VACANCY_GRACE_MONTHS = 6;
/** 령 §97의5①3호 — 인가일 전 6개월 · 준공일 후 6개월 */
export const REDEVELOPMENT_MARGIN_MONTHS_97_5 = 6;

export interface DeemedRentalPeriod975 {
  /**
   * - `expropriation` — 2호: 협의매수·수용되어 임대할 수 없는 기간 (startDate~endDate 그대로)
   * - `redevelopment` — 3호: startDate = 관리처분계획 인가일(소규모정비 사업시행계획 인가일 · 리모델링 허가일
   *   또는 사업계획승인일), endDate = 준공일. 엔진이 앞뒤 6개월을 붙인다.
   */
  reason: "expropriation" | "redevelopment";
  startDate: Date;
  endDate: Date;
}

interface Span {
  start: Date;
  end: Date;
}

/** 간주기간 → 실제 계속 임대 간주 구간 (3호는 인가일 −6개월 ~ 준공일 +6개월) */
export function expandDeemedPeriod(p: DeemedRentalPeriod975): Span {
  return p.reason === "redevelopment"
    ? {
        start: subMonths(p.startDate, REDEVELOPMENT_MARGIN_MONTHS_97_5),
        end: addMonths(p.endDate, REDEVELOPMENT_MARGIN_MONTHS_97_5),
      }
    : { start: p.startDate, end: p.endDate };
}

/** span에서 windows를 뺀 나머지 조각 (시간순) */
function subtractWindows(span: Span, windows: Span[]): Span[] {
  let parts: Span[] = [span];
  for (const w of windows) {
    const next: Span[] = [];
    for (const p of parts) {
      if (w.end.getTime() <= p.start.getTime() || w.start.getTime() >= p.end.getTime()) {
        next.push(p);
        continue;
      }
      if (w.start.getTime() > p.start.getTime()) next.push({ start: p.start, end: w.start });
      if (w.end.getTime() < p.end.getTime()) next.push({ start: w.end, end: p.end });
    }
    parts = next;
  }
  return parts;
}

export interface ContinuousRental975Result {
  /** 기산일부터 첫 단절까지 계속 임대한 연수 (만 년) — 10년 판정에 쓰는 값 */
  years: number;
  /** 그 구간 — [start, 첫 6개월 초과 공실 시작] · 단절이 없으면 [start, end] */
  countedSegment?: Span;
  /** 계속성을 끊은 6개월 초과 공실 조각 (시간순) */
  breaks: Span[];
}

/**
 * @param start 계속 임대 기산일 — 등록일·임대개시일·사업자등록일 중 늦은 날 (령 §97의5③)
 * @param end   종점 — 양도일, 또는 양도 전 임대 종료 시 임대 종료일
 * @param vacancyPeriods 공실 구간 (종료일 = 다음 임차인 주민등록 이전일)
 */
export function evaluateContinuousRental975(args: {
  start: Date;
  end: Date;
  vacancyPeriods: { startDate: Date; endDate: Date }[];
  deemedRentalPeriods: DeemedRentalPeriod975[];
}): ContinuousRental975Result {
  const { start, end } = args;
  if (end.getTime() <= start.getTime()) return { years: 0, breaks: [] };

  // 역순 구간은 무시한다 — ⑧·⑫가 막지만 엔진 단독 호출 방어(리뷰 게이트 probe I)
  const windows = args.deemedRentalPeriods
    .filter((p) => p.startDate.getTime() <= p.endDate.getTime())
    .map(expandDeemedPeriod);

  const breaks: Span[] = [];
  for (const v of args.vacancyPeriods) {
    // 기간 밖 부분은 판정 대상이 아니다
    const s = Math.max(v.startDate.getTime(), start.getTime());
    const e = Math.min(v.endDate.getTime(), end.getTime());
    if (e <= s) continue;
    for (const frag of subtractWindows({ start: new Date(s), end: new Date(e) }, windows)) {
      if (frag.end.getTime() > addMonths(frag.start, VACANCY_GRACE_MONTHS).getTime()) breaks.push(frag);
    }
  }
  breaks.sort((a, b) => a.start.getTime() - b.start.getTime());

  // 기산일부터 첫 단절 시작까지만 센다(Q-1 a) — 단절 뒤에 다시 시작한 구간은 「등록 후부터의 계속」이 아니다.
  const countedEnd = breaks.length > 0 ? breaks[0].start : end;
  if (countedEnd.getTime() <= start.getTime()) return { years: 0, breaks };
  const countedSegment = { start, end: countedEnd };
  return { years: differenceInYears(countedEnd, start), countedSegment, breaks };
}

/**
 * §97의5 상속 합산 구간 (조특령 §97의5③ → §97⑤3호 · V-13) — 엔진(`rental-97-5.ts`)과 화면 미리보기의 단일 소스.
 *
 * - 피상속인 의제 개시일 = max(피상속인 임대개시일, 피상속인 장기일반·공공지원 등록등일) — 계속 임대의 기산일이 된다(Q-A).
 * - 상속인 분은 상속개시일 전으로 거슬러 가지 않는다 — max(상속인 의제 개시일, 상속개시일).
 * - 상속개시일 ~ 상속인 분 시작 간격은 공실로 넘긴다 — 6개월 이내면 계속, 넘으면 끊긴다(Q-D · 령 §97의5①1호 유추).
 * 날짜 순서 검증(피상속인 날짜 < 상속개시일 ≤ 양도일)은 호출부 몫이다 — 어긋난 입력은 넘기지 않는다.
 */
export function inheritanceMergeSpan975(
  effectiveStart: Date,
  inh: { inheritanceDate: Date; decedentRegistrationDate: Date; decedentRentalStartDate: Date } | undefined,
): { start: Date; heirStart: Date; decedentStart?: Date; gapVacancies: { startDate: Date; endDate: Date }[] } {
  if (!inh) return { start: effectiveStart, heirStart: effectiveStart, gapVacancies: [] };
  const decedentStart = new Date(Math.max(inh.decedentRentalStartDate.getTime(), inh.decedentRegistrationDate.getTime()));
  const heirStart = new Date(Math.max(effectiveStart.getTime(), inh.inheritanceDate.getTime()));
  const gapVacancies =
    heirStart.getTime() > inh.inheritanceDate.getTime() ? [{ startDate: inh.inheritanceDate, endDate: heirStart }] : [];
  return { start: decedentStart, heirStart, decedentStart, gapVacancies };
}

/**
 * §97의5 계속 임대 판정 — 상속 합산 포함 (엔진 `rental-97-5.ts`와 화면 미리보기의 단일 소스).
 *
 * 합산하면 기산일이 피상속인 개시일로 앞당겨진다. 상속 간격이나 피상속인 구간에 6개월 초과 공실이 있으면
 * 첫 구간이 짧아져 합산을 켜는 쪽이 끄는 쪽보다 불리해진다(계획서 H2). 그래서 합산 판정과 **상속인 단독 판정**
 * (합산하지 않은 것과 같다) 중 첫 구간이 긴 쪽을 쓴다 — 같으면 합산(Q-2 a, 사용자 결정 2026-11-14).
 * 상속인 등록도 상속개시일부터 3개월 안의 등록이라 그 자체가 「등록 후」 기산점이다.
 *
 * `merged === false`이면 호출부는 피상속인 분을 쓰지 않는다 — 임대료 증액 판정 기산일·구간 echo 모두 상속인 기준.
 */
export function evaluateRental975Continuity(args: {
  /** 상속인 본인 의제 개시일 — 등록일·임대개시일·사업자등록일 중 늦은 날(령 §97의5③) */
  ownStart: Date;
  end: Date;
  vacancyPeriods: { startDate: Date; endDate: Date }[];
  deemedRentalPeriods: DeemedRentalPeriod975[];
  /** 날짜 순서 검증을 통과한 상속 합산 입력 — 없으면 합산하지 않는다 */
  inheritance?: { inheritanceDate: Date; decedentRegistrationDate: Date; decedentRentalStartDate: Date };
}): ContinuousRental975Result & { merged: boolean; span: ReturnType<typeof inheritanceMergeSpan975> } {
  const own = inheritanceMergeSpan975(args.ownStart, undefined);
  const heirOnly = evaluateContinuousRental975({
    start: own.start,
    end: args.end,
    vacancyPeriods: args.vacancyPeriods,
    deemedRentalPeriods: args.deemedRentalPeriods,
  });
  if (!args.inheritance) return { ...heirOnly, merged: false, span: own };

  const span = inheritanceMergeSpan975(args.ownStart, args.inheritance);
  const merged = evaluateContinuousRental975({
    start: span.start,
    end: args.end,
    vacancyPeriods: [...args.vacancyPeriods, ...span.gapVacancies],
    deemedRentalPeriods: args.deemedRentalPeriods,
  });
  return merged.years >= heirOnly.years ? { ...merged, merged: true, span } : { ...heirOnly, merged: false, span: own };
}
