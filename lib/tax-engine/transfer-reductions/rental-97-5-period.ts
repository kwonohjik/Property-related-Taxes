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
 * - 6개월을 **초과**한 공실의 처리는 해석례를 찾지 못했다. 다음 가정으로 구현한다:
 *   같은 시행령이 §97의3②에는 「**통산**하여 10년」을, §97의5①에는 「**계속하여** 10년」을 쓴다. 6개월 이내만
 *   계속 임대로 「본다」고 정했으므로, 그것을 넘은 공실은 계속성을 끊는다 ⇒ **그 공실이 끝난 날(다음 임차인
 *   주민등록 이전일)부터 10년을 다시 센다.**
 *   종전 구현(`calculateEffectiveRentalPeriod`)은 초과 공실 구간만 빼고 나머지를 합산했다 — 「통산」 모델이다.
 *
 * ## 2호·3호 간주기간
 * 「해당 기간 동안 계속하여 임대한 것으로 본다」 — 공실이 아니며 기간에도 **산입**한다.
 * (§97의3②의 「임대기간 계산 시에는 실제 임대기간만 포함한다」 단서가 §97의5에는 없다.)
 * 공실 구간과 겹치면 겹친 부분을 공실에서 빼고, 남은 조각마다 6개월 판정을 한다.
 */

import { addMonths, differenceInYears, subMonths } from "date-fns";

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
  /** 계속 임대 연수 (만 년) — 마지막 단절 이후부터 종점까지 */
  years: number;
  /** 6개월 초과 공실로 다시 센 기산일 (단절이 없으면 undefined) */
  restartDate?: Date;
  /** 계속성을 끊은 마지막 공실 조각 (메시지용) */
  breakingVacancy?: Span;
}

/**
 * @param start 계속 임대 기산일 — 등록일과 임대개시일 중 늦은 날 (령 §97의5③)
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
  if (end.getTime() <= start.getTime()) return { years: 0 };

  const windows = args.deemedRentalPeriods.map(expandDeemedPeriod);
  let restart: Span | undefined;
  for (const v of args.vacancyPeriods) {
    // 기간 밖 부분은 판정 대상이 아니다
    const s = Math.max(v.startDate.getTime(), start.getTime());
    const e = Math.min(v.endDate.getTime(), end.getTime());
    if (e <= s) continue;
    for (const frag of subtractWindows({ start: new Date(s), end: new Date(e) }, windows)) {
      const overGrace = frag.end.getTime() > addMonths(frag.start, VACANCY_GRACE_MONTHS).getTime();
      if (overGrace && (!restart || frag.end.getTime() > restart.end.getTime())) restart = frag;
    }
  }

  const from = restart ? restart.end : start;
  return {
    years: end.getTime() > from.getTime() ? differenceInYears(end, from) : 0,
    ...(restart ? { restartDate: restart.end, breakingVacancy: restart } : {}),
  };
}
