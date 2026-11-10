/**
 * 양도소득분 개인지방소득세 가산세의 시기별 연혁 (US-29 후속 W2) — 지방세기본법 §53~§55·§57② 과거 시행본.
 *
 * 순수 leaf — `transfer-tax-local-income-penalty.ts`가 이 표로 기한 구간별 규칙을 고른다.
 * 값은 모두 KoreanLaw 원문(법·령 과거 시행본 efYd 조회 + 부칙, 2026-11-10 실독)이다. 근거 표:
 *
 * | 구간(키) | 규칙 | 원문 |
 * |---|---|---|
 * | 법정기한 2014-01-01 전 | 지방소득세(소득분)가 소득세에 붙는 부가세 체계 → 독립 가산세 미산정 | 지방세법 2013-12-26 시행본 §91④·§93⑤ · 2014-01-01 시행본 부칙 §2(과세기간이 시작되어 납세의무가 성립하는 분부터) |
 * | 국세 기한 2020-03-01 전 | 지방 신고·납부기한 = 소득세법 신고기한 그대로(+2개월 없음) | 지방세법 §103의5①·§103의7① 2014~2018 시행본 「해당 신고기한까지」 |
 * | 국세 기한 2020-03-01 이후 | 소득세 기한 + 2개월 | 지방세법 2019.12.31. 개정(2020-01-01 시행) · 부칙 §3(납세의무 성립)·§11(확정신고) |
 * | 부과일 2015-05-18 전 | 납부불성실가산세 75% 한도 없음 | 지방세기본법 2015.5.18. 개정 부칙 §3 「시행 후 납부불성실 가산세를 부과하는 경우부터」 |
 * | 사유 발생 2019-01-01 전 | 1일 1만분의 3 (10만분의 30) | 시행령 §33(2013.1.1. 개정) · 2017.3.28. 전부개정 §34 · 2018.1.1. §34(문구만) · 2018.12.31. 시행령 부칙 §2 |
 * | 감면 — 신고일 2017-03-28 전 | 수정신고 50/20/10%(6개월/1년/2년) · 기한 후 신고 1개월 50% | 구 지방세기본법 §54② |
 * | 감면 — 신고일 2017-03-28 ~ 2019-12-31 | 수정신고 50/20/10% · 기한 후 신고 1개월 50% / 6개월 20% · 4호는 확정신고기한 2018-01-01 이후만 | §57② 2017.7.26.·2018.1.1.·2019.1.1. 시행본 · 2016.12.27. 부칙 §5 · 2017.12.26. 부칙 §3 |
 * | 감면 — 신고일 2020-01-01 이후 | 수정신고 90/75/50/30/20/10% · 기한 후 신고 50/30/20% | §57② 2020-01-01 시행본 · 2019.12.31. 부칙 §5·§14 |
 *
 * ⚠️ 과거 조문은 현행 본문에 없어 `verify:legal` 매니페스트에 등록할 수 없다(검증은 현행 본문 키워드 대조).
 *    그래서 연혁 인용 문자열은 법령 상수 디렉터리(`legal-codes/`)가 아니라 이 파일에 둔다 — 개정 감시 대상이 아님을 감수한 선택.
 */

const utc = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);

export const LOCAL_PENALTY_ERA = {
  /** 독립세(구 지방세기본법 §53의2~§53의4) 체계 시작 — 지방 법정기한이 이 날 전이면 소득세 부가세 체계 */
  INDEPENDENT_FROM: utc(2014, 1, 1),
  /** 2013년 양도분의 확정신고기한(2014-05-31)까지는 구 체계 사안이 섞일 수 있는 구간의 끝(미포함) */
  AMBIGUOUS_2013_UNTIL: utc(2014, 6, 1),
  /** 국세 기한에 2개월을 더하는 지방 기한 규정이 적용되는 국세 기한의 시작 */
  PLUS_TWO_MONTHS_FROM: utc(2020, 3, 1),
  /** 납부불성실가산세 75% 한도 — 부과일이 이 날 이후일 때만 */
  CAP_FROM: utc(2015, 5, 18),
  /** 구 지방세기본법(§53의2~§53의4·§54②) 인용 구간의 끝(미포함) — 2017.3.28. 전부개정 시행 */
  OLD_STATUTE_UNTIL: utc(2017, 3, 28),
  /** 무신고·과소신고 가산세 기준이 산출세액→납부세액(2016-01-01 이후 성립분)으로 바뀐 것을 기한만으로 가를 수 없는 구간의 끝(미포함) */
  BASE_UNCERTAIN_UNTIL: utc(2017, 1, 1),
  /** 수정·기한 후 신고 감면이 동시 납부를 요건으로 하던(구 §54③) 구간의 끝(미포함) — 2015.12.29. 삭제, 2016-01-01 시행 */
  SIMULTANEOUS_PAYMENT_UNTIL: utc(2016, 1, 1),
  /** 감면 계단 2단계(기한 후 신고 6개월 20% 추가) 시작 — 신고일 기준 */
  LADDER_2017_FROM: utc(2017, 3, 28),
  /** 감면 계단 3단계(90/75/50/30/20/10 · 50/30/20) 시작 — 신고일 기준 */
  LADDER_2020_FROM: utc(2020, 1, 1),
  /** §57②4호는 이 날 이후 도래하는 확정신고기한까지 신고·수정신고하는 경우부터 */
  PRELIM_TO_FINAL_FROM: utc(2018, 1, 1),
  /** 이 날 이후 사유가 발생한 납부지연은 10만분의 25(2019.1.1. 시행령 개정) */
  RATE_25_FROM: utc(2019, 1, 1),
  /** 시행령 §34① 2022-06-07 이후 기간분은 10만분의 22 */
  RATE_22_FROM: utc(2022, 6, 7),
} as const;

/** 연혁 인용 — 구 지방세기본법(2017.3.28. 전부개정 전) */
export const LOCAL_PENALTY_OLD_CITES = {
  NON_FILING: "구 지방세기본법 §53의2",
  UNDER_FILING: "구 지방세기본법 §53의3",
  DELAYED_PAYMENT: "구 지방세기본법 §53의4",
  DAILY_RATE: "구 지방세기본법 시행령 §33",
} as const;

export type LocalPenaltyUnsupportedReason = "pre_2014_surtax";

/** 지방 법정기한이 2014.1.1. 전일 때 결과에 싣는 고지 */
export const LOCAL_PENALTY_PRE_2014_NOTICE =
  "지방 법정기한이 2014년 1월 1일 전이라 구 지방세법상 소득세 부가세 체계(지방소득세 소득분)에 해당합니다 — 독립 가산세(지방세기본법 §53~§55) 미산정, 확인 필요.";

/** 2014년 상반기 기한은 2013년 양도분(구 체계)일 수 있다 */
export const LOCAL_PENALTY_2013_BOUNDARY_NOTICE =
  "지방 법정기한이 2014년 6월 1일 전입니다. 2013년에 양도한 분(납세의무 성립 2013년)은 구 지방세법상 소득세 부가세 체계라 독립 가산세 대상이 아닙니다 — 양도일 확인 필요.";

export const LOCAL_PENALTY_BASE_NOTICE =
  "법정기한이 2017년 전인 무신고·과소신고 가산세는 2016년 1월 1일 전에 납세의무가 성립한 분이면 기준이 납부세액이 아니라 산출세액(구 §53의2·§53의3, 2014.1.1. 개정)이라 금액이 다를 수 있습니다 — 확인 필요.";

export const LOCAL_PENALTY_SIMULTANEOUS_NOTICE =
  "2016년 1월 1일 전 신고분의 수정신고·기한 후 신고 감면은 추가 세액을 신고와 동시에 납부해야 적용됩니다(구 지방세기본법 §54③) — 동시 납부했다고 보고 감면했습니다. 확인 필요.";

export const LOCAL_PENALTY_NO_CAP_NOTICE =
  "납부(부과)일이 2015년 5월 18일 전이라 납부불성실가산세 75% 한도(2015.5.18. 개정, 시행 후 부과분부터)를 적용하지 않았습니다.";

/** 국세 기한이 2020-03-01 이후면 지방 기한 = 국세 기한 + 2개월, 아니면 소득세 기한 그대로 */
export const addsTwoMonths = (nationalKey: number): boolean => nationalKey >= LOCAL_PENALTY_ERA.PLUS_TWO_MONTHS_FROM;

// ============================================================
// §57② 감면 계단 — 신고일 기준 연혁
// ============================================================

export interface LadderStep {
  maxMonths: number;
  rate: number;
  ref: string;
}

const AMENDMENT_OLD: readonly LadderStep[] = [
  { maxMonths: 6, rate: 0.5, ref: "구 지방세기본법 §54②1호" },
  { maxMonths: 12, rate: 0.2, ref: "구 지방세기본법 §54②1호" },
  { maxMonths: 24, rate: 0.1, ref: "구 지방세기본법 §54②1호" },
];
const AMENDMENT_MID: readonly LadderStep[] = [
  { maxMonths: 6, rate: 0.5, ref: "지방세기본법 §57②1호가목" },
  { maxMonths: 12, rate: 0.2, ref: "지방세기본법 §57②1호나목" },
  { maxMonths: 24, rate: 0.1, ref: "지방세기본법 §57②1호다목" },
];
const AMENDMENT_NEW: readonly LadderStep[] = [
  { maxMonths: 1, rate: 0.9, ref: "지방세기본법 §57②1호가목" },
  { maxMonths: 3, rate: 0.75, ref: "지방세기본법 §57②1호나목" },
  { maxMonths: 6, rate: 0.5, ref: "지방세기본법 §57②1호다목" },
  { maxMonths: 12, rate: 0.3, ref: "지방세기본법 §57②1호라목" },
  { maxMonths: 18, rate: 0.2, ref: "지방세기본법 §57②1호마목" },
  { maxMonths: 24, rate: 0.1, ref: "지방세기본법 §57②1호바목" },
];
const LATE_OLD: readonly LadderStep[] = [{ maxMonths: 1, rate: 0.5, ref: "구 지방세기본법 §54②2호" }];
const LATE_MID: readonly LadderStep[] = [
  { maxMonths: 1, rate: 0.5, ref: "지방세기본법 §57②2호가목" },
  { maxMonths: 6, rate: 0.2, ref: "지방세기본법 §57②2호나목" },
];
const LATE_NEW: readonly LadderStep[] = [
  { maxMonths: 1, rate: 0.5, ref: "지방세기본법 §57②2호가목" },
  { maxMonths: 3, rate: 0.3, ref: "지방세기본법 §57②2호나목" },
  { maxMonths: 6, rate: 0.2, ref: "지방세기본법 §57②2호다목" },
];

/** 수정신고(과소신고가산세) 감면 계단 — 수정신고일 기준 */
export function amendmentLadder(filingKey: number): readonly LadderStep[] {
  if (filingKey >= LOCAL_PENALTY_ERA.LADDER_2020_FROM) return AMENDMENT_NEW;
  return filingKey >= LOCAL_PENALTY_ERA.LADDER_2017_FROM ? AMENDMENT_MID : AMENDMENT_OLD;
}

/** 기한 후 신고(무신고가산세) 감면 계단 — 기한 후 신고일 기준 */
export function lateFilingLadder(filingKey: number): readonly LadderStep[] {
  if (filingKey >= LOCAL_PENALTY_ERA.LADDER_2020_FROM) return LATE_NEW;
  return filingKey >= LOCAL_PENALTY_ERA.LADDER_2017_FROM ? LATE_MID : LATE_OLD;
}

/** §57②4호(예정신고 이후 확정신고기한까지 50%)가 있는 시기인가 — 확정신고기한 기준 */
export const hasPrelimToFinalReduction = (finalDeadlineKey: number): boolean =>
  finalDeadlineKey >= LOCAL_PENALTY_ERA.PRELIM_TO_FINAL_FROM;
