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
 *   계속 임대로 「본다」고 정했으므로, 그것을 넘은 공실은 계속성을 끊는다.
 *   ⇒ 초과 공실로 나뉜 **연속 구간 중 가장 긴 구간**이 10년 이상이면 충족한다. 법 §97의5①2호는 「10년 이상
 *   계속하여 … 임대한 **후** 양도」이므로 10년 연속 임대를 마친 뒤의 공실(양도 직전 공실 포함)은 요건을 깨지 않는다.
 *   (리뷰 게이트 C-3 — 「마지막 단절 이후만 센다」는 모델은 선행 10년 구간을 버려 적격을 부적격으로 뒤집었다.)
 *   종전 구현(`calculateEffectiveRentalPeriod`)은 초과 공실 구간만 빼고 나머지를 합산했다 — 「통산」 모델이다.
 * - 간주기간(아래)이 한 공실의 가운데를 덮으면 남은 앞뒤 조각을 **각각** 6개월로 판정한다 — 간주기간은
 *   「계속하여 임대한 것으로 본다」이므로 그 앞뒤 조각은 서로 다른 공백이 된다(가정, 해석례 미확인).
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
  /** 가장 긴 계속 임대 구간의 연수 (만 년) */
  years: number;
  /** 그 구간 — 단절이 없으면 [start, end] */
  longestSegment?: Span;
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

  // 단절 공실 사이의 연속 구간 — [start, 첫 공실 시작], [공실 끝, 다음 공실 시작], …, [마지막 공실 끝, end]
  let best: { span: Span; years: number } | undefined;
  let cursor = start;
  const segments: Span[] = [];
  for (const b of breaks) {
    if (b.start.getTime() > cursor.getTime()) segments.push({ start: cursor, end: b.start });
    if (b.end.getTime() > cursor.getTime()) cursor = b.end;
  }
  if (end.getTime() > cursor.getTime()) segments.push({ start: cursor, end });
  for (const span of segments) {
    const years = differenceInYears(span.end, span.start);
    if (!best || years > best.years) best = { span, years };
  }
  return { years: best?.years ?? 0, ...(best ? { longestSegment: best.span } : {}), breaks };
}
