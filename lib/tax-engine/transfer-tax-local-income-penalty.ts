/**
 * 양도소득분 개인지방소득세의 가산세 (US-29) — 지방세기본법 §53 무신고 · §54 과소신고 · §55 납부지연 · §57② 감면.
 *
 * 지방세법 §103의2 3호는 지방소득세 총결정세액에 「지방세기본법 제53조부터 제55조까지에 따른 가산세」를
 * 더하게 한다. 국세 가산세(국세기본법 §47의2~§47의4)는 지방소득세 base가 아니고(그 열거에 없다), 지방소득세는
 * **자기 법정기한으로 따로** 가산세를 산정한다. 이 파일이 그 산정의 **단일 소스**다 — 단건 finalize · 재개발 ·
 * 임대주택 특례 · 다필지 · 양도차손 · 겸용 · 다건 집계 · 수정신고가 모두 이 leaf를 쓴다.
 *
 * ## 설계 가정 (결과 화면에 고지한다 — 모두 「확인 필요」)
 *  1. 지방소득세를 **국세와 같은 날** 신고·납부한 것으로 본다. 국세 신고를 지방소득세 신고로 보는 의제 규정은
 *     없다(지방세법 §103의5④⑤·§103의7⑨⑩은 지방자치단체가 보낸 납부서를 납부한 경우만 의제).
 *  2. 지방 법정신고·납부기한 = **입력한 국세 기한 + 2개월**(지방세법 §103의5①·§103의7①, 민법 §160 월 단위 —
 *     해당 일이 없으면 말일)에 지방세기본법 §24①(토·일·공휴일이면 다음 날)을 적용한다. 입력한 국세 기한을
 *     그대로 쓰므로 국세기본법 §5 연장 전·후 어느 쪽을 입력했는지에 따라 일수가 달라질 수 있다(리뷰 사례 304일 vs 301일).
 *  3. 지방 기납부·미납세액 = 국세 기준 금액의 10%(지방세법 §103의3 세율).
 *  4. 끝수는 원 미만 절사 — 지방세기본법 §59가 「국고금 관리법」 §47(10원 미만 끝수 불계산)을 준용하나, 본세
 *     (`localIncomeTax`)도 원 단위라 같은 축을 유지한다(10원 미만 절사 적용 여부 — 확인 필요).
 *  5. §103의8(소득세법 §115 기장불성실 × 10%)은 엔진에 소득세법 §115 산정이 없어 범위 밖이다.
 *
 * ## 날짜 축
 * 모든 날짜는 UTC 달력일로 다룬다(`date-coerce` 운영 경로 = UTC 자정). 결과의 날짜는 ISO `YYYY-MM-DD` 문자열이다(JSON 안전).
 */
import { LOCAL_PENALTY } from "./legal-codes";
import { deadlineEnd } from "./civil-period";
import { applyRate, applyRateFraction, coerceOptionalDate, safeMultiply } from "./tax-utils";
import type { FilingPenaltyInput, PenaltyReason, TransferTaxPenaltyResult } from "./transfer-tax-penalty";
import type { LateFilingReductionInput } from "./late-filing-reduction";
import type { CalculationStep } from "./types/transfer.types";

// ============================================================
// 타입
// ============================================================

/** 무신고(§53)·과소신고(§54) 가산세 상세 */
export interface LocalFilingPenaltyDetail {
  kind: "non_filing" | "under_filing";
  /** 지방 기준세액 — 무신고납부세액 / 과소신고납부세액등 (= 국세 기준 × 10%) */
  base: number;
  /** 가목 부정분 base — §54② 1호 분해가 있을 때만 */
  fraudBase?: number;
  /** 나목 그 밖의 분 base — §54② 2호 */
  normalBase?: number;
  /** 법정 가산세율(0.1·0.2·0.4). 부정분이 섞이면 실효세율이 아니라 일반율 0.1을 싣는다(분해는 fraudBase 참조) */
  rate: number;
  /** 감면 전 가산세 */
  grossPenalty: number;
  /** 지방세기본법 §57② 감면율(0 · 0.1 ~ 0.9) */
  reductionRate: number;
  reductionAmount: number;
  /** 적용 감면 조문. 감면이 없으면 빈 문자열 */
  reductionBasis: string;
  /** 감면 후 가산세 */
  penalty: number;
  basis: string;
}

/** 납부지연가산세(§55) 이자율 구간 1개 */
export interface LocalDelayedRateSegment {
  /** 1일 이자율 분자(분모 10만) — 22 = 10만분의 22 */
  ratePer100k: number;
  days: number;
  amount: number;
}

/** 납부지연가산세 상세 */
export interface LocalDelayedPenaltyDetail {
  /** 지방 미납세액 (= 국세 미납세액 × 10%) */
  unpaidLocalTax: number;
  /** 입력한 국세 납부기한 */
  nationalDeadline: string;
  /** 지방 법정납부기한 (국세 기한 + 2개월 → 지방세기본법 §24①) */
  localDeadline: string;
  /** 지방세기본법 §24①로 기한이 늦춰졌는가 */
  deadlineExtended: boolean;
  /** 자진납부일 (= 국세 납부일로 가정) */
  paymentDate: string;
  /** 법정납부기한의 다음 날부터 자진납부일까지(양끝 포함) 일수 */
  days: number;
  breakdown: LocalDelayedRateSegment[];
  /** 대표 이자율(마지막 구간) 분자 */
  ratePer100k: number;
  /** 75% 한도 적용 전 */
  rawPenalty: number;
  /** §55① 후단 한도 = 미납세액 × 75% */
  capAmount: number;
  capApplied: boolean;
  penalty: number;
  /** 이자율 근거가 없는 과거 기간 — 산정하지 않았다(확인 필요) */
  unsupportedPeriod?: boolean;
}

/** 양도소득분 지방소득세 가산세 결과 */
export interface LocalIncomePenaltyDetail {
  filing?: LocalFilingPenaltyDetail;
  delayed?: LocalDelayedPenaltyDetail;
  /** 가산세 합계 — 총 납부세액에 더하는 값 */
  total: number;
  /** 지방 예정신고기한(§103의5①) — 무신고 기한 후 신고 감면 판정에 쓴 경우 */
  localPreliminaryDeadline?: string;
  /** 지방 확정신고기한(§103의7①) */
  localFinalDeadline?: string;
  /** 산정에 둔 가정·확인 필요 목록(결과 화면 고지) */
  assumptions: string[];
}

// ============================================================
// 날짜 유틸 (UTC 달력일)
// ============================================================

const DAY_MS = 86_400_000;
const dayKey = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** UTC 달력일 기준 월 가감 — 해당 일이 없으면 그 달 말일(민법 §160③) */
function addMonthsUtc(d: Date, months: number): Date {
  const index = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)));
}

function isoOf(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/** 지방 법정기한 = 국세 기한 + 2개월 → 지방세기본법 §24① (토·일·공휴일이면 다음 날) */
export function localDeadlineOf(nationalDeadline: Date): { end: Date; extended: boolean } {
  const calendar = addMonthsUtc(nationalDeadline, 2);
  const r = deadlineEnd(calendar);
  return { end: r.end, extended: r.extended };
}

/** `date`가 `base`로부터 `months`개월이 지난 날(응당일)보다 늦은가 — 「N개월 이내」 판정의 부정 */
const isAfterMonths = (date: Date, base: Date, months: number): boolean =>
  dayKey(date) > dayKey(addMonthsUtc(base, months));

// ============================================================
// 지방세기본법 §57② 감면 계단
// ============================================================

/** §57②1호 수정신고 — 법정신고기한 후 N개월 이내(§54 과소신고가산세만) */
const AMENDMENT_STEPS = [
  { maxMonths: 1, rate: 0.9, ref: "지방세기본법 §57②1호가목" },
  { maxMonths: 3, rate: 0.75, ref: "지방세기본법 §57②1호나목" },
  { maxMonths: 6, rate: 0.5, ref: "지방세기본법 §57②1호다목" },
  { maxMonths: 12, rate: 0.3, ref: "지방세기본법 §57②1호라목" },
  { maxMonths: 18, rate: 0.2, ref: "지방세기본법 §57②1호마목" },
  { maxMonths: 24, rate: 0.1, ref: "지방세기본법 §57②1호바목" },
] as const;

/** §57②2호 기한 후 신고 — 법정신고기한 후 N개월 이내(§53 무신고가산세만) */
const LATE_FILING_STEPS = [
  { maxMonths: 1, rate: 0.5, ref: "지방세기본법 §57②2호가목" },
  { maxMonths: 3, rate: 0.3, ref: "지방세기본법 §57②2호나목" },
  { maxMonths: 6, rate: 0.2, ref: "지방세기본법 §57②2호다목" },
] as const;

/** §57②4호 — 예정신고기한 이후 확정신고기한까지 신고·수정신고 시 50% */
const PRELIM_TO_FINAL_RATE = 0.5;
const PRELIM_TO_FINAL_NON_FILING = "지방세기본법 §57②4호가목";

interface Reduction {
  rate: number;
  ref: string;
}
const NO_REDUCTION: Reduction = { rate: 0, ref: "" };

/**
 * 무신고(§53) 감면 — 2호 기한 후 신고 계단과 4호가목(예정신고를 못 했으나 지방 확정신고기한까지 신고) 중 큰 쪽.
 * 두 호가 겹치는 구간의 우열을 정한 문언이 없어 큰 감면율을 택한다(확인 필요).
 */
export function resolveLocalNonFilingReduction(args: {
  prelimDeadline?: Date;
  finalDeadline?: Date;
  filingDate?: Date;
  notified?: boolean;
}): Reduction {
  const { prelimDeadline, finalDeadline, filingDate } = args;
  if (args.notified || !prelimDeadline || !filingDate) return NO_REDUCTION;
  if (dayKey(filingDate) <= dayKey(prelimDeadline)) return NO_REDUCTION; // 기한 내 신고 — 무신고 아님
  let best: Reduction = NO_REDUCTION;
  if (finalDeadline && dayKey(filingDate) <= dayKey(finalDeadline)) {
    best = { rate: PRELIM_TO_FINAL_RATE, ref: PRELIM_TO_FINAL_NON_FILING };
  }
  for (const s of LATE_FILING_STEPS) {
    if (!isAfterMonths(filingDate, prelimDeadline, s.maxMonths)) {
      if (s.rate > best.rate) best = { rate: s.rate, ref: s.ref };
      break;
    }
  }
  return best;
}

/** 수정신고(§54) 감면 — 1호 계단. 경정 예고 후면 0, 2년 초과면 0. */
export function resolveLocalAmendmentReduction(args: {
  deadline?: Date;
  amendedDate?: Date;
  notified?: boolean;
}): Reduction {
  const { deadline, amendedDate } = args;
  if (args.notified || !deadline || !amendedDate) return NO_REDUCTION;
  if (dayKey(amendedDate) <= dayKey(deadline)) return NO_REDUCTION;
  for (const s of AMENDMENT_STEPS) {
    if (!isAfterMonths(amendedDate, deadline, s.maxMonths)) return { rate: s.rate, ref: s.ref };
  }
  return NO_REDUCTION;
}

// ============================================================
// 납부지연가산세 (§55)
// ============================================================

/** 시행령 §34① 개정 2022-06-07 공포·시행 — 시행일 이후 기간분부터 10만분의 22(부칙 제2조) */
const RATE_22_FROM = Date.UTC(2022, 5, 7);
/** 2019-01-01 시행 개정 — 10만분의 25(2018.12.31 개정, 시행 전 사유 발생분은 종전 규정) */
const RATE_25_FROM = Date.UTC(2019, 0, 1);
/** 2018-01-01 시행 개정 — 1만분의 3(= 10만분의 30). 그 이전 이자율은 확인하지 못했다 */
const RATE_30_FROM = Date.UTC(2018, 0, 1);

const RATE_DENOM = 100_000;

/**
 * 납부지연가산세 — `unpaidLocalTax × 일수 × 이자율`, 미납세액의 75% 한도.
 *
 * 일수 = 법정납부기한의 **다음 날부터 자진납부일까지**(§55①1호, 납부일 포함). 국세기본법 §47의4(납부일 전날까지)와 다르다.
 * 이자율은 시행령 §34① 연혁: 사유 발생일(기한 다음 날)이 2019-01-01 이후면 10만분의 25, 2018년이면 10만분의 30 —
 * 어느 쪽이든 2022-06-07 이후 기간분은 10만분의 22(2022.6.7 시행령 부칙 제2조). 2018-01-01 이전은 산정하지 않는다.
 */
export function computeLocalDelayedPenalty(args: {
  unpaidLocalTax: number;
  nationalDeadline: Date;
  paymentDate: Date;
}): LocalDelayedPenaltyDetail {
  const { unpaidLocalTax, nationalDeadline, paymentDate } = args;
  const local = localDeadlineOf(nationalDeadline);
  const startKey = dayKey(local.end) + DAY_MS; // 기한 다음 날
  const endKey = dayKey(paymentDate); // 자진납부일(포함)
  const days = Math.max(0, Math.round((endKey - startKey) / DAY_MS) + 1);
  const capAmount = applyRate(unpaidLocalTax, 0.75);
  const base: LocalDelayedPenaltyDetail = {
    unpaidLocalTax,
    nationalDeadline: isoOf(nationalDeadline),
    localDeadline: isoOf(local.end),
    deadlineExtended: local.extended,
    paymentDate: isoOf(paymentDate),
    days,
    breakdown: [],
    ratePer100k: 22,
    rawPenalty: 0,
    capAmount,
    capApplied: false,
    penalty: 0,
  };
  if (unpaidLocalTax <= 0 || days <= 0) return base;
  if (startKey < RATE_30_FROM) return { ...base, unsupportedPeriod: true };

  const oldRate = startKey >= RATE_25_FROM ? 25 : 30;
  const segments: LocalDelayedRateSegment[] = [];
  const pushSeg = (fromKey: number, toKey: number, ratePer100k: number) => {
    const segDays = Math.round((toKey - fromKey) / DAY_MS) + 1;
    if (segDays <= 0) return;
    segments.push({
      ratePer100k,
      days: segDays,
      amount: applyRateFraction(safeMultiply(unpaidLocalTax, segDays), ratePer100k, RATE_DENOM),
    });
  };
  const lastOldKey = RATE_22_FROM - DAY_MS;
  pushSeg(startKey, Math.min(endKey, lastOldKey), oldRate);
  pushSeg(Math.max(startKey, RATE_22_FROM), endKey, 22);

  const rawPenalty = segments.reduce((s, g) => s + g.amount, 0);
  const capApplied = rawPenalty > capAmount;
  return {
    ...base,
    breakdown: segments,
    ratePer100k: segments[segments.length - 1]?.ratePer100k ?? 22,
    rawPenalty,
    capApplied,
    penalty: capApplied ? capAmount : rawPenalty,
  };
}

// ============================================================
// 무신고·과소신고 가산세 (§53·§54)
// ============================================================

const FRAUD_RATE = 0.4;

function buildFilingPenalty(args: {
  kind: "non_filing" | "under_filing";
  base: number;
  reason: PenaltyReason;
  fraudBase?: number;
  normalBase?: number;
  reduction: Reduction;
}): LocalFilingPenaltyDetail {
  const { kind, base, reason, reduction } = args;
  const isFraud = reason === "fraudulent" || reason === "offshore_fraud";
  const normalRate = kind === "non_filing" ? 0.2 : 0.1;
  const basis = kind === "non_filing" ? LOCAL_PENALTY.NON_FILING : LOCAL_PENALTY.UNDER_FILING;
  let gross: number;
  let rate = normalRate;
  let fraudBase: number | undefined;
  let normalBase: number | undefined;
  if (kind === "under_filing" && args.fraudBase !== undefined && args.normalBase !== undefined) {
    // §54② 1호 부정분 40% + 2호 그 밖의 분 10%
    fraudBase = args.fraudBase;
    normalBase = args.normalBase;
    gross = applyRate(fraudBase, FRAUD_RATE) + applyRate(normalBase, normalRate);
  } else if (isFraud) {
    // §53② 무신고납부세액 40% · §54② 구분이 없으면 전액을 부정분으로 본다(국세 `calculateFilingPenalty`와 같은 규약)
    rate = FRAUD_RATE;
    gross = applyRate(base, FRAUD_RATE);
  } else {
    gross = applyRate(base, normalRate);
  }
  const reductionAmount = applyRateFraction(gross, Math.round(reduction.rate * 100), 100);
  return {
    kind,
    base,
    ...(fraudBase !== undefined ? { fraudBase, normalBase } : {}),
    rate,
    grossPenalty: gross,
    reductionRate: reduction.rate,
    reductionAmount,
    reductionBasis: reduction.ref,
    penalty: gross - reductionAmount,
    basis: reduction.ref ? `${basis} · ${reduction.ref}` : basis,
  };
}

// ============================================================
// 공개 진입점
// ============================================================

/** 결과 화면 고지 — 가정·확인 필요 (UI 단일 소스: `lib/calc/local-income-penalty-notice.ts`가 이 상수를 쓴다) */
export const LOCAL_INCOME_PENALTY_ASSUMPTIONS: readonly string[] = [
  "지방소득세를 국세와 같은 날 신고·납부한 것으로 보고 계산했습니다. 국세 신고를 지방소득세 신고로 보는 규정은 없습니다(지방자치단체가 보낸 납부서를 납부한 경우만 의제 — 지방세법 §103의5⑤·§103의7⑩). 확인 필요.",
  "지방 법정신고·납부기한은 입력한 국세 기한에 2개월을 더하고 토·일·공휴일이면 다음 날로 미룬 날입니다(지방세법 §103의5①·§103의7①, 지방세기본법 §24①). 국세 기한 연장(국세기본법 §5)을 입력에 반영했는지에 따라 일수가 달라질 수 있습니다. 확인 필요.",
  "끝수는 원 미만 절사입니다. 지방세기본법 §59가 「국고금 관리법」 §47(10원 미만 끝수 불계산)을 준용하므로 지방자치단체 고지액과 10원 미만 차이가 날 수 있습니다. 확인 필요.",
  "소득세법 §115 기장불성실가산세에 연동되는 지방세법 §103의8 가산세는 산정하지 않았습니다.",
];

function toDate(v: Date | string | undefined): Date | undefined {
  return coerceOptionalDate(v);
}

/**
 * 원 신고(예정·확정 신고) 경로의 지방소득세 가산세.
 *
 * @param filing  입력 `filingPenaltyDetails` — 신고 유형·사유·`lateFiling` 날짜
 * @param penalty 국세 가산세 결과(`calculateTransferTaxPenalty`) — 국세 기준 금액·미납세액·납부일을 여기서 읽는다
 * @returns 국세 가산세 입력이 없으면 undefined (가산세 OFF — 기존 결과 불변)
 */
export function computeLocalIncomePenalty(
  filing: FilingPenaltyInput | undefined,
  penalty: TransferTaxPenaltyResult | undefined,
): LocalIncomePenaltyDetail | undefined {
  if (!penalty) return undefined;
  const assumptions = [...LOCAL_INCOME_PENALTY_ASSUMPTIONS];
  let filingDetail: LocalFilingPenaltyDetail | undefined;
  let delayedDetail: LocalDelayedPenaltyDetail | undefined;
  let prelimIso: string | undefined;
  let finalIso: string | undefined;

  const f = penalty.filingPenalty;
  if (filing && f && filing.filingType !== "correct" && f.penaltyBase > 0) {
    const base = applyRate(f.penaltyBase, 0.1);
    const kind = filing.filingType === "none" ? "non_filing" : "under_filing";
    let reduction = NO_REDUCTION;
    let filedWithinLocalDeadline = false;
    if (kind === "non_filing" && filing.lateFiling) {
      const lf: LateFilingReductionInput = filing.lateFiling;
      const prelim = toDate(lf.statutoryDeadline);
      const final = toDate(lf.finalReturnDeadline);
      const prelimLocal = prelim ? localDeadlineOf(prelim).end : undefined;
      const finalLocal = final ? localDeadlineOf(final).end : undefined;
      if (prelimLocal) prelimIso = isoOf(prelimLocal);
      if (finalLocal) finalIso = isoOf(finalLocal);
      // 국세 예정신고기한은 넘겼어도 지방 예정신고기한(국세 기한 + 2개월) 이내에 신고했으면 지방소득세는 무신고가 아니다(§53①).
      const filedAt = toDate(lf.actualFilingDate);
      filedWithinLocalDeadline = !!(prelimLocal && filedAt && dayKey(filedAt) <= dayKey(prelimLocal));
      reduction = resolveLocalNonFilingReduction({
        prelimDeadline: prelimLocal,
        finalDeadline: finalLocal,
        filingDate: toDate(lf.actualFilingDate),
        notified: lf.priorAssessmentNotified,
      });
    } else if (kind === "non_filing") {
      assumptions.push("기한 후 신고 날짜 입력이 없어 지방세기본법 §57② 감면은 적용하지 않았습니다.");
    }
    if (!filedWithinLocalDeadline) {
      filingDetail = buildFilingPenalty({
        kind,
        base,
        reason: filing.penaltyReason,
        fraudBase: f.fraudSplit ? applyRate(f.fraudSplit.fraudBase, 0.1) : undefined,
        normalBase: f.fraudSplit ? applyRate(f.fraudSplit.normalBase, 0.1) : undefined,
        reduction,
      });
    }
  }

  const d = penalty.delayedPaymentPenalty;
  if (d && d.unpaidTax > 0) {
    delayedDetail = computeLocalDelayedPenalty({
      unpaidLocalTax: applyRate(d.unpaidTax, 0.1),
      nationalDeadline: d.paymentDeadline,
      paymentDate: d.calculationDate,
    });
    if (delayedDetail.unsupportedPeriod) {
      assumptions.push("납부지연가산세 이자율 근거를 확인하지 못한 2018년 이전 기간이라 지방소득세 납부지연가산세를 산정하지 않았습니다. 확인 필요.");
    }
  }

  if (!filingDetail && !delayedDetail) return undefined;
  return {
    ...(filingDetail ? { filing: filingDetail } : {}),
    ...(delayedDetail ? { delayed: delayedDetail } : {}),
    total: (filingDetail?.penalty ?? 0) + (delayedDetail?.penalty ?? 0),
    ...(prelimIso ? { localPreliminaryDeadline: prelimIso } : {}),
    ...(finalIso ? { localFinalDeadline: finalIso } : {}),
    assumptions,
  };
}

/** 수정신고 입력 중 지방 가산세 산정에 쓰는 부분 */
export interface LocalAmendmentPenaltyArgs {
  /** 추가 납부 본세(국세) */
  additionalTax: number;
  applyUnderReportingPenalty: boolean;
  underReportingReason: PenaltyReason;
  /** 국세 신고불성실 「정당한 사유 면제」 선택 시 지방도 부과하지 않는다(§57① — 확인 필요) */
  underExempt: boolean;
  autoReduction: boolean;
  /** 국세 법정신고기한(소득세법 §110① 확정신고기한) */
  nationalDeadline?: Date;
  amendedFilingDate?: Date;
  notified?: boolean;
  applyLatePaymentPenalty: boolean;
  /** 수정신고 납부일. 없으면 수정신고일을 쓴다 */
  paymentDate?: Date;
}

/**
 * 수정신고 경로의 지방소득세 추가 가산세 — §54 과소신고(+§57②1호 감면) · §55 납부지연.
 *
 * 수정신고일이 **지방** 법정신고기한(국세 기한 + 2개월) 이내면 지방소득세는 아직 기한 내라 과소신고가 아니다.
 */
export function computeAmendmentLocalPenalty(a: LocalAmendmentPenaltyArgs): LocalIncomePenaltyDetail | undefined {
  if (a.additionalTax <= 0 || !a.nationalDeadline) return undefined;
  const localAdditional = applyRate(a.additionalTax, 0.1);
  const assumptions = [...LOCAL_INCOME_PENALTY_ASSUMPTIONS];
  const local = localDeadlineOf(a.nationalDeadline);
  const localIso = isoOf(local.end);
  let filingDetail: LocalFilingPenaltyDetail | undefined;
  let delayedDetail: LocalDelayedPenaltyDetail | undefined;

  if (a.applyUnderReportingPenalty) {
    if (a.underExempt) {
      assumptions.push("국세 신고불성실가산세를 정당한 사유로 면제한 선택에 맞춰 지방소득세 과소신고가산세도 부과하지 않았습니다(지방세기본법 §57① — 확인 필요).");
    } else if (a.amendedFilingDate && dayKey(a.amendedFilingDate) > dayKey(local.end)) {
      const reduction = a.autoReduction
        ? resolveLocalAmendmentReduction({ deadline: local.end, amendedDate: a.amendedFilingDate, notified: a.notified })
        : NO_REDUCTION;
      filingDetail = buildFilingPenalty({
        kind: "under_filing",
        base: localAdditional,
        reason: a.underReportingReason,
        reduction,
      });
    }
  }

  if (a.applyLatePaymentPenalty) {
    const pay = a.paymentDate ?? a.amendedFilingDate;
    if (pay) {
      delayedDetail = computeLocalDelayedPenalty({
        unpaidLocalTax: localAdditional,
        nationalDeadline: a.nationalDeadline,
        paymentDate: pay,
      });
      if (delayedDetail.unsupportedPeriod) {
        assumptions.push("납부지연가산세 이자율 근거를 확인하지 못한 2018년 이전 기간이라 지방소득세 납부지연가산세를 산정하지 않았습니다. 확인 필요.");
      }
    }
  }

  if (!filingDetail && !delayedDetail && !a.applyUnderReportingPenalty && !a.applyLatePaymentPenalty) return undefined;
  return {
    ...(filingDetail ? { filing: filingDetail } : {}),
    ...(delayedDetail ? { delayed: delayedDetail } : {}),
    total: (filingDetail?.penalty ?? 0) + (delayedDetail?.penalty ?? 0),
    localFinalDeadline: localIso,
    assumptions,
  };
}

// ============================================================
// 산출근거 단계 (한국어 풀어쓰기)
// ============================================================

const won = (n: number): string => n.toLocaleString();

function filingStep(f: LocalFilingPenaltyDetail): CalculationStep {
  const label = f.kind === "non_filing" ? "지방소득세 무신고가산세" : "지방소득세 과소신고가산세";
  const baseWord = f.kind === "non_filing" ? "무신고납부세액" : "과소신고납부세액";
  const core =
    f.fraudBase !== undefined
      ? `부정행위분 ${won(f.fraudBase)} × 40% + 그 밖의 분 ${won(f.normalBase ?? 0)} × 10%`
      : `지방소득세 ${baseWord} ${won(f.base)} × ${Math.round(f.rate * 100)}%`;
  const formula =
    f.reductionRate > 0
      ? `${core} = ${won(f.grossPenalty)} − 감면 ${Math.round(f.reductionRate * 100)}% ${won(f.reductionAmount)}`
      : `${core} = ${won(f.grossPenalty)}`;
  return { label, formula, amount: f.penalty, legalBasis: f.basis, sub: true };
}

function delayedStep(d: LocalDelayedPenaltyDetail): CalculationStep {
  const rateText = (r: number) => `${(r / 1000).toFixed(3)}%`;
  const body = d.breakdown.length > 1
    ? d.breakdown.map((s) => `${s.days}일 × ${rateText(s.ratePer100k)} = ${won(s.amount)}`).join(" + ")
    : `미납 지방소득세 ${won(d.unpaidLocalTax)} × ${d.days}일 × ${rateText(d.ratePer100k)}`;
  const cap = d.capApplied ? ` → 미납세액의 75% 한도 ${won(d.capAmount)} 적용` : "";
  return {
    label: `지방소득세 납부지연가산세 (${d.days}일)`,
    formula: `${body}${cap} (지방 법정납부기한 ${d.localDeadline} 다음 날부터 자진납부일 ${d.paymentDate}까지)`,
    amount: d.penalty,
    legalBasis: `${LOCAL_PENALTY.DELAYED_PAYMENT} · ${LOCAL_PENALTY.DAILY_RATE}`,
    sub: true,
  };
}

/** 지방소득세 가산세 산출근거 — 합계 단계 하나와 세부 단계(sub). 가산세가 0이면 빈 배열 */
export function localIncomePenaltySteps(d: LocalIncomePenaltyDetail): CalculationStep[] {
  if (d.total <= 0) return [];
  const parts: CalculationStep[] = [];
  if (d.filing && d.filing.penalty > 0) parts.push(filingStep(d.filing));
  if (d.delayed && d.delayed.penalty > 0) parts.push(delayedStep(d.delayed));
  return [
    {
      label: "지방소득세 가산세",
      formula: "지방소득세를 국세와 같은 날 신고·납부한 것으로 보고 지방세기본법 가산세를 별도로 산정 (확인 필요)",
      amount: d.total,
      legalBasis: `${LOCAL_PENALTY.NON_FILING}~§55 · ${LOCAL_PENALTY.REDUCTION}`,
    },
    ...parts,
  ];
}

/** 총 납부세액 산식에 붙일 문구 */
export function localIncomePenaltyTotalSuffix(d: LocalIncomePenaltyDetail | undefined): string {
  return d && d.total > 0 ? ` + 지방소득세 가산세 ${won(d.total)}` : "";
}
