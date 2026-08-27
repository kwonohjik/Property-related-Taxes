/**
 * 양도소득세 가산세 순수 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음, 순수 함수.
 *
 * 적용 법령:
 *   신고불성실가산세: 국세기본법 §47의2 (무신고), §47의3 (과소신고·초과환급)
 *   지연납부가산세:   국세기본법 §47의4
 *   납부세액 기준:    부칙 §12848호 제10조② (2015.7.1 이후 양도분)
 */

import { differenceInCalendarDays, addDays } from "date-fns";
import { PENALTY, PENALTY_CONST } from "./legal-codes";
import { applyRate, truncateToWon } from "./tax-utils";

// ============================================================
// 타입 정의
// ============================================================

/** 신고 유형 */
export type FilingType =
  | "none"          // 무신고
  | "under"         // 과소신고 (신고했으나 납부세액 과소)
  | "excess_refund" // 초과환급신고 (환급세액 과다 신고)
  | "correct";      // 정상 신고

/** 부정행위 유형 */
export type PenaltyReason =
  | "normal"         // 일반 (단순 착오·실수)
  | "fraudulent"     // 부정행위 (이중장부·허위증빙·재산은닉 등 — 국세기본법 §26의2 ⑪)
  | "offshore_fraud"; // 역외거래 부정행위 (2015.7.1 이후 양도분 60%)

/** 신고불성실가산세 입력 */
export interface FilingPenaltyInput {
  /** 결정세액 (세액공제·감면 적용 후, §114조의2 가산세 가산 전) */
  determinedTax: number;
  /**
   * 세액공제·감면액 합계 — **정보값. 가산세 기준금액 산정에 사용하지 않는다.**
   *
   * 국세기본법 §47의3①의 기준은 "과소신고한 **납부세액**"이고, 그 납부세액은 감면·세액공제를
   * 반영한 뒤의 금액이다(§47의2 무신고도 같은 구조). 즉 **감면은 `determinedTax`에서 이미
   * 1회 반영**되어 있으므로 여기서 다시 빼면 이중차감이 되어 가산세가 과소산정된다.
   * 조문이 기준금액에서 제외하라고 명시한 것은 **가산세와 이자 상당 가산액**뿐이다
   * (→ `interestSurcharge`).
   *
   * 2026-07-29 정정(#591 감사 백로그 R7): 종전 산식이 이 값을 재차감했다. 계약 주석은
   * `determinedTax`가 net이라고 명시하고 있었으므로 **주석과 구현이 어긋난 상태**였다
   * (memory `feedback_engine_comment_vs_impl_drift`).
   */
  reductionAmount: number;
  /** 기납부세액 (예정신고 납부액 포함) */
  priorPaidTax: number;
  /** 당초 신고세액 (과소신고 시 최초 신고한 납부세액; 무신고는 0) */
  originalFiledTax: number;
  /** 초과환급신고 환급세액 (환급 과다 수령액; 해당 없으면 0) */
  excessRefundAmount: number;
  /** 세법에 따른 이자상당액 가산액 (납부세액 산정에서 제외 — §47의3 ①) */
  interestSurcharge: number;
  /**
   * **부정행위로 인한** 과소신고납부세액등 — §47조의3①1호 **가목**의 base.
   *
   * 법문은 1호를 「다음 각 목의 금액을 **합한** 금액」으로 정한다:
   *   가. **부정행위로 인한** 과소신고납부세액등 × 40%(역외 60%)
   *   나. (과소신고납부세액등 − 부정행위로 인한 분) × 10%
   *
   * 종전 구현은 **전액에 단일 비율**을 곱해, 부정행위분이 일부인 신고에서 나머지에도 40%가
   * 붙었다 — **납세자에게 불리**한 방향이었다.
   *
   * ⚠️ **미입력이면 base 전액을 부정행위분으로 본다**(종전 동작). 이미 계산된 신고서·저장
   *    이력의 세액이 입력 없이 바뀌지 않게 하기 위한 하위 호환이다.
   * ⚠️ **무신고(§47조의2①)에는 이 분해가 없다** — 그 조항은 「비율을 곱한 금액」이라
   *    각 목 구조 자체가 없다. 과소신고·초과환급신고 전용이다.
   */
  fraudulentPortion?: number;
  /** 신고 유형 */
  filingType: FilingType;
  /** 부정행위 유형 */
  penaltyReason: PenaltyReason;
}

/** 지연납부가산세 입력 */
export interface DelayedPaymentInput {
  /** 미납·미달납부세액 */
  unpaidTax: number;
  /** 납부기한 (이 날까지 납부해야 함) */
  paymentDeadline: Date;
  /** 실제 납부일 (미제공 시 계산 기준일 사용) */
  actualPaymentDate?: Date;
  /** 계산 기준일 (actualPaymentDate 미제공 시 사용; 기본: 오늘) */
  calculationDate?: Date;
}

/** 계산 단계 */
export interface PenaltyStep {
  label: string;
  formula: string;
  amount: number;
  legalBasis?: string;
}

/** §47조의3①1호 가목·나목 분해 내역 — 혼합 적용 시에만 존재 */
export interface FraudPortionSplit {
  /** 가목 base — 부정행위로 인한 과소신고납부세액등 */
  fraudBase: number;
  /** 가목 세율 — 40% 또는 역외 60% */
  fraudRate: number;
  /** 나목 base — 과소신고납부세액등 − 부정행위분 */
  normalBase: number;
  /** 나목 세율 — 10% */
  normalRate: number;
}

/** 신고불성실가산세 결과 */
export interface FilingPenaltyResult {
  /** 무신고·과소신고 납부세액 (가산세 산정 기준금액) */
  penaltyBase: number;
  /**
   * 적용 가산세율. 가목·나목이 **혼합**되면 단일 세율이 아니므로 **실효세율**
   * (가산세 ÷ 기준금액)을 싣는다 — 표시 산식은 `fraudSplit` 으로 분해해 쓴다.
   */
  penaltyRate: number;
  /** 가목·나목 분해 — 혼합 적용 시에만. 미입력(전액 부정)·무신고·일반은 undefined */
  fraudSplit?: FraudPortionSplit;
  /** 신고불성실가산세액 */
  filingPenalty: number;
  /** 적용 법령 */
  legalBasis: string;
  steps: PenaltyStep[];
}

/** 지연납부가산세 결과 */
export interface DelayedPaymentResult {
  /** 미납세액 */
  unpaidTax: number;
  /** 경과일수 (납부기한 다음날 ~ 납부일) */
  elapsedDays: number;
  /** 적용 일 이자율 */
  dailyRate: number;
  /** 지연납부가산세액 */
  delayedPaymentPenalty: number;
  /** 납부기한 */
  paymentDeadline: Date;
  /** 계산기준일 */
  calculationDate: Date;
  /**
   * 이자율 구간별 내역 — 경과기간이 이자율 개정 시행일을 straddle하면 2개 이상이 된다.
   * 국세기본법 시행령 §27의4 이자율은 개정마다 시행일이 있고, 경과조치는 **시행일 이후 기간분에
   * 신율**을 적용한다. 종전에는 납부일 시점 이자율 하나를 전 기간에 곱해 경계 케이스가 틀렸다.
   */
  breakdown: DelayedPaymentRateSegment[];
  steps: PenaltyStep[];
}

/** 납부지연가산세 이자율 구간 1개 */
export interface DelayedPaymentRateSegment {
  /** 이 이자율의 시행일 (YYYY-MM-DD). 최초 구간은 개정 이전이라 시행일 미상 → "~2019-02-11" */
  effectiveFrom: string;
  /** 1일 이자율 */
  dailyRate: number;
  /** 이 구간에 속한 경과일수 */
  days: number;
  /** 구간 가산세 = 미납세액 × days × dailyRate (원 미만 절사) */
  amount: number;
}

/** 통합 가산세 입력 */
export interface TransferTaxPenaltyInput {
  filing?: FilingPenaltyInput;
  delayedPayment?: DelayedPaymentInput;
}

/** 통합 가산세 결과 */
export interface TransferTaxPenaltyResult {
  filingPenalty: FilingPenaltyResult | null;
  delayedPaymentPenalty: DelayedPaymentResult | null;
  /** 가산세 합계 */
  totalPenalty: number;
}

// ============================================================
// 내부 유틸
// ============================================================

/** 납부기한 기준 일 이자율 결정 (국세기본법 시행령 §27의4 이력 적용) */
/**
 * 납부지연가산세 이자율 시행 구간 (국세기본법 시행령 §27의4).
 * `resolveDailyRate`가 쓰던 컷오프와 **동일 값**을 구간 형태로 재표현한 것이다 —
 * 두 곳이 갈리지 않도록 `resolveDailyRate`도 이 배열을 참조한다.
 * 현행 ①항 "1일 10만분의 22"는 KoreanLaw 원문 확인(2026-07-29).
 */
const DELAYED_RATE_PERIODS: ReadonlyArray<{ from: Date | null; label: string; rate: number }> = [
  { from: null, label: "~2019-02-11", rate: PENALTY_CONST.DAILY_PENALTY_RATE_2016 },
  { from: new Date("2019-02-12"), label: "2019-02-12", rate: PENALTY_CONST.DAILY_PENALTY_RATE_2019 },
  { from: new Date("2022-02-15"), label: "2022-02-15", rate: PENALTY_CONST.DAILY_PENALTY_RATE },
];

/**
 * 경과기간 [start, end](양끝 포함)을 이자율 시행 구간으로 분할한다.
 * 구간 일수 합 = 전체 경과일수 불변식을 지킨다.
 */
function splitByRatePeriods(
  unpaidTax: number,
  start: Date,
  end: Date,
): DelayedPaymentRateSegment[] {
  const out: DelayedPaymentRateSegment[] = [];
  for (let i = 0; i < DELAYED_RATE_PERIODS.length; i++) {
    const p = DELAYED_RATE_PERIODS[i];
    const next = DELAYED_RATE_PERIODS[i + 1];
    // 이 구간의 유효 범위 [pStart, pEnd] — 다음 구간 시행일 전날까지
    const pStart = p.from ?? start;
    const pEnd = next?.from ? addDays(next.from, -1) : end;
    const segStart = pStart > start ? pStart : start;
    const segEnd = pEnd < end ? pEnd : end;
    if (segEnd < segStart) continue;
    const days = differenceInCalendarDays(segEnd, segStart) + 1;
    if (days <= 0) continue;
    out.push({
      effectiveFrom: p.label,
      dailyRate: p.rate,
      days,
      amount: truncateToWon(unpaidTax * days * p.rate),
    });
  }
  return out;
}

function resolveDailyRate(referenceDate: Date): number {
  const d = referenceDate;
  if (d >= new Date("2022-02-15")) return PENALTY_CONST.DAILY_PENALTY_RATE;
  if (d >= new Date("2019-02-12")) return PENALTY_CONST.DAILY_PENALTY_RATE_2019;
  return PENALTY_CONST.DAILY_PENALTY_RATE_2016;
}

/** 가산세율 결정 */
function resolveFilingRate(
  filingType: FilingType,
  penaltyReason: PenaltyReason,
): number {
  if (penaltyReason === "offshore_fraud") return PENALTY_CONST.OFFSHORE_FRAUD_RATE;
  if (penaltyReason === "fraudulent")     return PENALTY_CONST.FRAUDULENT_RATE;
  if (filingType === "none")              return PENALTY_CONST.NON_FILING_RATE;
  return PENALTY_CONST.UNDER_FILING_RATE; // "under" | "excess_refund"
}

// ============================================================
// 신고불성실가산세 계산 (국세기본법 §47의2·§47의3)
// ============================================================

/**
 * 신고불성실가산세 계산
 *
 * 납부세액 = 결정세액 − 세액공제·감면 − 기납부세액 − 당초 신고세액
 *           − 이자상당액 가산액 + 초과환급세액
 * 가산세 = 납부세액 × 가산세율
 *
 * 부칙 §12848호 §10② 기준 (2015.7.1 이후 양도분)
 */
export function calculateFilingPenalty(
  input: FilingPenaltyInput,
): FilingPenaltyResult {
  const steps: PenaltyStep[] = [];

  if (input.filingType === "correct") {
    return {
      penaltyBase: 0,
      penaltyRate: 0,
      filingPenalty: 0,
      legalBasis: PENALTY.NON_FILING,
      steps: [{ label: "정상신고", formula: "가산세 없음", amount: 0 }],
    };
  }

  // ① 납부세액 산정 (가산세 기준금액)
  //   국기법 §47의3① — "과소신고한 납부세액 … (가산세와 이자 상당 가산액은 제외)".
  //   감면은 determinedTax(net)에 이미 반영돼 있어 **재차감하지 않는다**(reductionAmount 주석 참조).
  const penaltyBase = Math.max(
    0,
    input.determinedTax
      - input.priorPaidTax
      - input.originalFiledTax
      - input.interestSurcharge
      + input.excessRefundAmount,
  );

  steps.push({
    label: "납부세액 (가산세 기준)",
    formula: [
      `결정세액 ${input.determinedTax.toLocaleString()}`,
      input.priorPaidTax      > 0 ? `− 기납부 ${input.priorPaidTax.toLocaleString()}` : null,
      input.originalFiledTax  > 0 ? `− 당초신고 ${input.originalFiledTax.toLocaleString()}` : null,
      input.interestSurcharge > 0 ? `− 이자상당액 ${input.interestSurcharge.toLocaleString()}` : null,
      input.excessRefundAmount > 0 ? `+ 초과환급 ${input.excessRefundAmount.toLocaleString()}` : null,
    ].filter(Boolean).join(" "),
    amount: penaltyBase,
    legalBasis: PENALTY.ADDENDUM_2015,
  });

  if (penaltyBase <= 0) {
    return {
      penaltyBase: 0,
      penaltyRate: 0,
      filingPenalty: 0,
      legalBasis: PENALTY.NON_FILING,
      steps: [...steps, { label: "가산세", formula: "납부세액 없음 — 가산세 0", amount: 0 }],
    };
  }

  // ② 가산세율 결정
  const fraudRate = resolveFilingRate(input.filingType, input.penaltyReason);
  const isFraud =
    input.penaltyReason === "fraudulent" || input.penaltyReason === "offshore_fraud";
  const legalBasis =
    input.filingType === "none" ? PENALTY.NON_FILING : PENALTY.UNDER_FILING;

  /**
   * §47조의3①1호 — **가목 + 나목 합산**.
   *
   *   가. **부정행위로 인한** 과소신고납부세액등 × 40%(역외 60%)
   *   나. (과소신고납부세액등 − 부정행위로 인한 분) × 10%
   *
   * ⚠️ **무신고(§47조의2①)에는 이 구조가 없다** — 그 조항은 「비율을 곱한 금액」이라
   *    각 목 자체가 없다. 그래서 `filingType === "none"` 은 분해하지 않는다.
   * ⚠️ `fraudulentPortion` **미입력이면 전액을 부정행위분으로** 본다(종전 동작 유지).
   */
  const splitApplies =
    isFraud && input.filingType !== "none" && input.fraudulentPortion !== undefined;

  if (splitApplies) {
    const fraudBase = Math.min(Math.max(0, input.fraudulentPortion as number), penaltyBase);
    const normalBase = penaltyBase - fraudBase;
    const normalRate = PENALTY_CONST.UNDER_FILING_RATE;
    const fraudPart = truncateToWon(applyRate(fraudBase, fraudRate));
    const normalPart = truncateToWon(applyRate(normalBase, normalRate));
    const filingPenalty = fraudPart + normalPart;
    const fraudRateLabel = (fraudRate * 100).toFixed(0) + "%";
    const normalRateLabel = (normalRate * 100).toFixed(0) + "%";

    steps.push({
      label: "가목 — 부정행위분",
      formula: `${fraudBase.toLocaleString()} × ${fraudRateLabel}${
        input.penaltyReason === "offshore_fraud" ? " (역외거래)" : ""
      }`,
      amount: fraudPart,
      legalBasis: PENALTY.FRAUDULENT_DEF,
    });
    steps.push({
      label: "나목 — 그 밖의 과소신고분",
      formula: `${normalBase.toLocaleString()} × ${normalRateLabel}`,
      amount: normalPart,
      legalBasis,
    });
    steps.push({
      label: "신고불성실가산세",
      formula: `가목 ${fraudPart.toLocaleString()} + 나목 ${normalPart.toLocaleString()}`,
      amount: filingPenalty,
      legalBasis,
    });

    return {
      penaltyBase,
      // 혼합이라 단일 세율이 아니다 — 실효세율을 싣는다(표시 산식은 fraudSplit 으로 분해).
      penaltyRate: penaltyBase > 0 ? filingPenalty / penaltyBase : 0,
      fraudSplit: { fraudBase, fraudRate, normalBase, normalRate },
      filingPenalty,
      legalBasis,
      steps,
    };
  }

  const penaltyRate = fraudRate;
  const rateLabel = (penaltyRate * 100).toFixed(0) + "%";

  if (isFraud) {
    steps.push({
      label: "부정행위 가산세율",
      formula: input.penaltyReason === "offshore_fraud"
        ? `역외거래 부정행위 → ${rateLabel}`
        : `부정행위 → ${rateLabel}`,
      amount: 0,
      legalBasis: PENALTY.FRAUDULENT_DEF,
    });
  }

  // ③ 가산세 계산
  const filingPenalty = truncateToWon(applyRate(penaltyBase, penaltyRate));

  steps.push({
    label: "신고불성실가산세",
    formula: `납부세액 ${penaltyBase.toLocaleString()} × ${rateLabel}`,
    amount: filingPenalty,
    legalBasis,
  });

  return { penaltyBase, penaltyRate, filingPenalty, legalBasis, steps };
}

// ============================================================
// 지연납부가산세 계산 (국세기본법 §47의4)
// ============================================================

/**
 * 지연납부가산세 계산
 *
 * 가산세 = 미납세액 × 경과일수 × 일 이자율
 * 경과일수: 납부기한 다음날 ~ 실제 납부일(또는 계산기준일)
 */
export function calculateDelayedPaymentPenalty(
  input: DelayedPaymentInput,
): DelayedPaymentResult {
  const steps: PenaltyStep[] = [];
  const calcDate = input.actualPaymentDate ?? input.calculationDate ?? new Date();

  // 경과일수: 납부기한 다음날부터 기산 (납부기한 당일 납부 → 0일)
  const elapsedDays = Math.max(
    0,
    differenceInCalendarDays(calcDate, input.paymentDeadline),
  );

  if (input.unpaidTax <= 0 || elapsedDays <= 0) {
    return {
      unpaidTax: input.unpaidTax,
      elapsedDays: 0,
      dailyRate: PENALTY_CONST.DAILY_PENALTY_RATE,
      delayedPaymentPenalty: 0,
      paymentDeadline: input.paymentDeadline,
      calculationDate: calcDate,
      breakdown: [],
      steps: [{ label: "지연납부가산세", formula: "경과일 없음 — 가산세 0", amount: 0 }],
    };
  }

  // 2026-07-29 신설(#591 감사 R7 — **세액 변경**): 이자율 개정 시행일을 straddle하는
  //   경과기간을 **구간별로 분할**해 합산한다. 종전에는 납부일 시점 이자율 하나를 전 기간에
  //   곱해, 개정 전 기간분까지 신율(더 낮은 율)로 계산되어 가산세가 과소했다.
  //   (예: 2021-12-01 기한 → 2022-06-01 납부 = 182일. 단일율 400,400 vs 구간분할 422,900)
  const breakdown = splitByRatePeriods(input.unpaidTax, addDays(input.paymentDeadline, 1), calcDate);
  // 대표 이자율 = 납부일이 속한 마지막 구간율 (표시·하위호환용)
  const dailyRate = breakdown.length > 0 ? breakdown[breakdown.length - 1].dailyRate : resolveDailyRate(calcDate);
  const rateLabel = (dailyRate * 100).toFixed(4) + "%";

  steps.push({
    label: "경과일수",
    formula: `납부기한(${input.paymentDeadline.toLocaleDateString("ko-KR")}) 다음날 ~ 납부일(${calcDate.toLocaleDateString("ko-KR")})`,
    amount: elapsedDays,
    legalBasis: PENALTY.DELAYED_PAYMENT,
  });

  // 가산세 = Σ 구간별(미납세액 × 구간일수 × 구간 이자율)
  const delayedPaymentPenalty = breakdown.reduce((sum, b) => sum + b.amount, 0);

  // 구간이 둘 이상이면 산식도 구간별로 풀어 쓴다 — 단일 이자율 표기는 자기모순이 된다.
  steps.push({
    label: "지연납부가산세",
    formula:
      breakdown.length > 1
        ? breakdown
            .map(
              (b) =>
                `${b.effectiveFrom} 시행분 ${b.days}일 × ${(b.dailyRate * 100).toFixed(4)}% = ${b.amount.toLocaleString()}`,
            )
            .join(" + ")
        : `미납세액 ${input.unpaidTax.toLocaleString()} × ${elapsedDays}일 × ${rateLabel}`,
    amount: delayedPaymentPenalty,
    legalBasis: PENALTY.DAILY_RATE,
  });

  return {
    unpaidTax: input.unpaidTax,
    elapsedDays,
    dailyRate,
    delayedPaymentPenalty,
    paymentDeadline: input.paymentDeadline,
    calculationDate: calcDate,
    breakdown,
    steps,
  };
}

// ============================================================
// 통합 가산세 계산
// ============================================================

/** 신고불성실가산세 + 지연납부가산세 통합 계산 */
export function calculateTransferTaxPenalty(
  input: TransferTaxPenaltyInput,
): TransferTaxPenaltyResult {
  const filingPenalty = input.filing
    ? calculateFilingPenalty(input.filing)
    : null;

  const delayedPaymentPenalty = input.delayedPayment
    ? calculateDelayedPaymentPenalty(input.delayedPayment)
    : null;

  const totalPenalty =
    (filingPenalty?.filingPenalty ?? 0) +
    (delayedPaymentPenalty?.delayedPaymentPenalty ?? 0);

  return { filingPenalty, delayedPaymentPenalty, totalPenalty };
}
