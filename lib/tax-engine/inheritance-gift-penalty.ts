/**
 * 상속·증여 신고불성실가산세 — 「국세기본법」 §47의2·§47의3 (🔴 G-07 B1)
 *
 * ## 왜 국세기본법인가
 *
 * 「상속세 및 증여세법」 §78①②는 **삭제**됐다(현행 §78③~⑮는 공익법인 축). 상속·증여의
 * 신고불성실은 「국세기본법」 §47의2(무신고)·§47의3(과소신고)이 **유일 근거**다.
 * §47의2① 괄호가 제외하는 것은 교육세·농특세·종부세뿐 — 상속·증여는 대상이다.
 *
 * ## 이 파일이 하는 일
 *
 * 산식 자체는 **부동산 정본을 그대로 재사용**한다(`transfer-tax-penalty.ts`의
 * `calculateFilingPenalty` — 세목 중립이고 주식 엔진도 같은 함수를 쓴다). 이 파일은
 * **상속·증여에만 있는 두 가지 층**을 그 위에 얹는다:
 *
 * 1. **§48②2호 기한후신고 감면** — 1개월 50% · 3개월 30% · 6개월 20%.
 *    §47조의2 무신고가산세**만** 대상이고, 「결정할 것을 미리 알고」 제출하면 배제된다.
 * 2. **§47의3④1호 적용제외 4사유** — 상속·증여 **전용**이다. 특히 「다」목(§60②③·§66
 *    보충적 평가액으로 과세표준을 결정한 경우)은 이 앱이 정면으로 다루는 국면이라,
 *    이 게이트 없이 과소신고를 켜면 **없는 가산세가 붙는다**.
 *
 * ## 범위 (B1)
 *
 * · 일반율만 — 무신고 20%(§47의2①2호) · 과소신고 10%(§47의3①2호).
 *   **부정행위 40%·역외 60%는 B2**다(입력 축 미도입).
 * · **납부지연(§47의4)은 B3**다. 이 파일은 신고불성실만 낸다.
 *
 * @see docs/00-pm/inheritance-gift-penalty-g07.plan.md §8
 */

import {
  calculateDelayedPaymentPenalty,
  calculateFilingPenalty,
  type DelayedPaymentRateSegment,
  type FraudPortionSplit,
  type PenaltyReason,
  type PenaltyStep,
} from "./transfer-tax-penalty";
import { resolveLateFilingReduction } from "./late-filing-reduction";
import { parseISO } from "date-fns";

/** 신고 상태 — 「기한까지 신고했는가·언제」 축 */
export type InheritanceGiftFilingStatus =
  | "on_time" // 법정기한 내 신고
  | "late" // 기한후신고 (국세기본법 §45의3)
  | "none"; // 무신고

/**
 * §47의3④1호 — 상속·증여 **전용** 과소신고가산세 적용제외 사유.
 *
 * 「다음 각 목의 어느 하나에 해당하는 사유로 상속세ㆍ증여세 과세표준을 과소신고한 경우」
 */
export type UnderReportExclusion =
  /** 가. 신고 당시 소유권 소송 등으로 상속·증여재산이 확정되지 아니하였던 경우 */
  | "ownership_dispute"
  /** 나. 상증법 §18~§24·§53·§53의2·§54 공제의 적용에 착오가 있었던 경우 */
  | "deduction_error"
  /** 다. 상증법 §60②③·§66에 따라 평가한 가액으로 과세표준을 결정한 경우 */
  | "supplementary_valuation"
  /** 라. 법인세법 §66 경정으로 상증법 §45의3~§45의5 증여의제이익이 변경되는 경우 */
  | "corporate_adjustment";

export const UNDER_REPORT_EXCLUSION_LABELS: Record<UnderReportExclusion, string> = {
  ownership_dispute: "소유권 소송 등으로 재산 미확정 (가목)",
  deduction_error: "공제 적용 착오 (나목)",
  supplementary_valuation: "보충적 평가액으로 과세표준 결정 (다목)",
  corporate_adjustment: "법인세 경정에 따른 증여의제이익 변경 (라목)",
};

/** 상속·증여 신고불성실가산세 입력 */
export interface InheritanceGiftPenaltyInput {
  filingStatus: InheritanceGiftFilingStatus;
  /**
   * 법정신고기한 (상증법 §67① 상속 6개월 / §68① 증여 3개월).
   *
   * 🔑 **엔진이 파생하지 않고 받는다** — §68① 단서(§41의3·§41의5 정산신고, §45의3·§45의5)는
   *    기산이 다르고, §67④(외국 주소 9개월)도 있다. 파생은 UI/④가 책임진다.
   */
  statutoryDeadline?: string;
  /** 기한후신고일 `YYYY-MM-DD` — §48②2호 감면 구간 판정 (`filingStatus === "late"`에서만 의미) */
  actualFilingDate?: string;
  /** 「결정할 것을 미리 알고」 기한후신고서를 제출했는가 — §48②2호 괄호 배제사유 */
  priorAssessmentNotified?: boolean;
  /** 과소신고 여부 — `filingStatus === "on_time"`에서만 의미 */
  isUnderReported?: boolean;
  /** 당초 신고세액 — §47의3① 「과소신고한 납부세액」 산정에 쓴다 */
  originalFiledTax?: number;
  /** §47의3④1호 적용제외 사유 — 있으면 과소신고가산세 0 (단, 아래 두 단서에 걸리면 불성립) */
  underReportExclusion?: UnderReportExclusion;
  /**
   * 부정행위 유형 — 「국세기본법」 §47의2①1호(무신고 **40%**·역외거래 **60%**) ·
   * §47의3①1호 가목(과소신고 부정분 40%·역외 60%). 🔴 G-07 B2.
   *
   * 미지정이면 `"normal"` — 일반율(무신고 20% · 과소신고 10%)이다.
   */
  penaltyReason?: PenaltyReason;
  /**
   * **부정행위로 인한** 과소신고납부세액등 — §47의3①1호 **가목**의 base. 🔴 G-07 B2.
   *
   * 법문은 1호를 「다음 각 목의 금액을 **합한** 금액」으로 정한다:
   *   가. 부정행위로 인한 과소신고납부세액등 × 40%(역외 60%)
   *   나. (과소신고납부세액등 − 부정행위로 인한 분) × 10%
   *
   * ⚠️ **무신고(§47의2①)에는 이 분해가 없다** — 그 조항은 「비율을 곱한 금액」이라
   *    각 목 구조 자체가 없다. `filingStatus`가 `late`·`none`이면 무시된다.
   * ⚠️ 미입력이면 **base 전액을 부정행위분**으로 본다(부동산·주식 정본과 같은 하위 호환).
   */
  fraudulentPortion?: number;
  /**
   * 🔴 §47의3④1호 **라목 단서** — 「부정행위로 인하여 **법인세**의 과세표준 및 세액을
   * 결정·경정하는 경우는 제외한다」.
   *
   * ⚠️ **`penaltyReason`과 다른 축이다.** 라목 단서가 말하는 부정행위는 **법인세 쪽 사실**
   *    (법인세 경정의 원인)이고, `penaltyReason`은 **이 상속·증여 신고**의 부정행위다.
   *    같은 축으로 접으면 조용히 틀린다 — 호마다 단서가 다르다.
   *
   * 반면 **다목** 단서는 「부정행위로 **상속세 및 증여세**의 과세표준을 과소신고한 경우」라
   * `penaltyReason` 축 그대로다(별도 입력이 필요 없다).
   */
  corporateAdjustmentByFraud?: boolean;
  /**
   * 미납·과소납부세액 — 「국세기본법」 §47의4①1호의 base. 🔴 G-07 B3.
   *
   * ⚠️ **파생하지 않고 받는다.** 상증법 §70①은 연부연납(§71)·납부유예(§72의2)·물납(§73)
   *    **신청분을 자진납부 대상에서 뺀다**. 결정세액에서 자동으로 유도하면 그 금액까지
   *    미납으로 보아 과대 산출된다. §70② 분납(2개월)도 기한이 다르다.
   */
  unpaidTax?: number;
  /**
   * 법정납부기한 `YYYY-MM-DD` — 상증법 §70①에 따라 **신고기한과 같다**(§67·§68).
   * 분납·연부연납이 있으면 다르므로 ④가 파생하지 않고 사용자가 입력한다.
   */
  paymentDeadline?: string;
  /** 실제 납부일 `YYYY-MM-DD` — 미입력이면 계산 기준일(오늘)까지로 본다 */
  actualPaymentDate?: string;
  /**
   * 🔴 §47의4③**6호** — 「§67·§68에 따라 신고한 자가 §70에 따라 **법정신고기한까지 납부**한
   * 경우로서, 법정신고기한 이후 대통령령으로 정하는 방법에 따라 상속재산·증여재산을
   * **평가하여** 과세표준과 세액을 결정·경정한 경우」.
   *
   * ⚠️ §47의3④1호 **다목**(과소신고 적용제외)과 짝을 이루지만 **요건이 다르다** —
   *    6호는 「법정신고기한까지 **납부**」를 추가로 요구한다. 다목 입력으로 대체할 수 없다.
   */
  paidOnTimeThenRevalued?: boolean;
}

/** §47의4③ 납부지연가산세 적용제외 사유 — 상속·증여에 걸리는 두 호 */
export type LatePaymentExclusion =
  /** 4호. 법인세 경정으로 §45의3~§45의5 증여의제이익 변경 (부정행위로 인한 경정은 제외) */
  | "corporate_adjustment"
  /** 6호. 기한 내 신고·납부 후 평가로 과세표준·세액이 결정·경정된 경우 */
  | "revalued_after_timely_filing";

export const LATE_PAYMENT_EXCLUSION_LABELS: Record<LatePaymentExclusion, string> = {
  corporate_adjustment: "법인세 경정에 따른 증여의제이익 변경 (§47의4③4호)",
  revalued_after_timely_filing: "기한 내 신고·납부 후 평가 경정 (§47의4③6호)",
};

/** 상속·증여 납부지연가산세 결과 (🔴 G-07 B3) */
export interface InheritanceGiftLatePaymentResult {
  /** 납부지연가산세액 */
  penalty: number;
  /** 미납세액 */
  unpaidTax: number;
  /** 산정일수 — 「법정납부기한의 다음 날부터 납부일의 **전날**까지」(§47의4①1호) */
  elapsedDays: number;
  /** 이자율 구간별 내역 — 개정 시행일을 걸치면 2개 이상이 된다 */
  breakdown: DelayedPaymentRateSegment[];
  /** §47의4③으로 0이 된 경우 그 호 */
  exclusionApplied?: LatePaymentExclusion;
  steps: PenaltyStep[];
}

/** 상속·증여 신고불성실가산세 결과 */
export interface InheritanceGiftPenaltyResult {
  /** 감면 후 신고불성실가산세 */
  filingPenalty: number;
  /** 기준금액 — 무신고는 결정세액 전액, 과소신고는 결정세액 − 당초 신고세액 */
  penaltyBase: number;
  /** 적용 가산세율 (일반율만 — 부정행위는 B2) */
  penaltyRate: number;
  /** 감면 전 가산세 */
  grossPenalty: number;
  /** §48②2호 감면율 (0 · 0.2 · 0.3 · 0.5) */
  reductionRate: number;
  /** 감면액 */
  reductionAmount: number;
  /** 적용 조문 — 가산세가 0이면 빈 문자열 */
  ruleRef: string;
  /** §47의3④1호로 0이 된 경우 그 사유 */
  exclusionApplied?: UnderReportExclusion;
  /**
   * 적용제외 사유를 **골랐으나 단서로 배제된** 경우 그 사유 (🔴 G-07 B2).
   * 화면이 「왜 제외가 안 됐는지」를 말할 수 있게 남긴다 — 금액만 보이면 입력이
   * 무시된 것처럼 읽힌다.
   */
  exclusionOverriddenByFraud?: UnderReportExclusion;
  /** §47의3①1호 가목·나목 분해 — 부정행위분을 **입력했을 때만** (🔴 G-07 B2) */
  fraudSplit?: FraudPortionSplit;
  steps: PenaltyStep[];
}

const ZERO: InheritanceGiftPenaltyResult = {
  filingPenalty: 0,
  penaltyBase: 0,
  penaltyRate: 0,
  grossPenalty: 0,
  reductionRate: 0,
  reductionAmount: 0,
  ruleRef: "",
  steps: [],
};

/**
 * §48②2호 감면율 — 「법정신고기한이 지난 후 N개월 이내」.
 *
 * ⚠️ §48②**1호**(수정신고 90/75/50/30/20/10%)와 **표가 다르다**. 혼용하면 기한후신고에
 *    90%가 붙는다. 기한·신고일이 없으면 0(방어적 — ⑧ validate가 사전 차단한다).
 *
 * 🔑 산식은 세목 중립 leaf `late-filing-reduction.ts` **단일 소스**다(G-05에서 양도세와
 *    공용으로 뽑았다). 상속·증여는 예정신고 제도가 없으므로 §48②3호라목 축인
 *    `finalReturnDeadline` 을 **넘기지 않는다** — 넘기면 일률 50%가 잘못 붙는다.
 */
export function resolveLateFilingReductionRate(
  deadline: string | undefined,
  filingDate: string | undefined,
  notified: boolean | undefined,
): number {
  return resolveLateFilingReduction({
    statutoryDeadline: deadline,
    actualFilingDate: filingDate,
    priorAssessmentNotified: notified,
  }).rate;
}

/**
 * 상속·증여 신고불성실가산세 — **신고 단위 1회** 산정.
 *
 * @param determinedTax 결정세액(세액공제·감면 반영 후). 국세기본법 §47의2①·§47의3①의
 *   「납부하여야 할 세액」은 세액공제를 반영한 뒤의 금액이다 — 주식 정본과 같은 근거.
 *   🔑 무신고면 §69 신고세액공제가 애초에 0이라 이중차감 우려가 없다.
 */
export function calcInheritanceGiftFilingPenalty(
  determinedTax: number,
  input: InheritanceGiftPenaltyInput,
): InheritanceGiftPenaltyResult {
  const base = Math.max(0, determinedTax);
  if (base <= 0) return ZERO;

  const penaltyReason: PenaltyReason = input.penaltyReason ?? "normal";
  const isFraud = penaltyReason !== "normal";

  // ── 정기신고 ────────────────────────────────────────────────────────
  if (input.filingStatus === "on_time") {
    if (!input.isUnderReported) return ZERO;

    // 🔴 §47의3④1호 — 상속·증여 전용 적용제외. 「다」목이 특히 넓다.
    //
    // ⚠️ **네 목이 같지 않다.** 다목·라목에는 각각 「부정행위인 경우는 제외한다」 단서가
    //    붙어 있고, 그 두 단서가 **가리키는 부정행위조차 서로 다르다**:
    //      · 다목 — 「부정행위로 **상속세 및 증여세**의 과세표준을 과소신고한 경우」
    //               ⇒ 이 신고의 `penaltyReason` 축 그대로다.
    //      · 라목 — 「부정행위로 인하여 **법인세**의 과세표준 및 세액을 결정·경정하는 경우」
    //               ⇒ **법인세 쪽 사실**이라 별도 입력(`corporateAdjustmentByFraud`)이다.
    //    가목·나목에는 단서가 없다 — 부정행위여도 적용제외가 성립한다.
    //    (memory `project_inheritance_remaining_gaps_code_verified` — 한 호를 복사하면 틀린다)
    const exclusion = input.underReportExclusion;
    const exclusionOverridden =
      !!exclusion &&
      ((exclusion === "supplementary_valuation" && isFraud) ||
        (exclusion === "corporate_adjustment" && !!input.corporateAdjustmentByFraud));

    if (exclusion && !exclusionOverridden) {
      return {
        ...ZERO,
        exclusionApplied: exclusion,
        steps: [
          {
            label: "과소신고가산세 적용제외",
            formula: UNDER_REPORT_EXCLUSION_LABELS[exclusion],
            amount: 0,
            legalBasis: "국세기본법 §47의3④1호",
          },
        ],
      };
    }

    const r = calculateFilingPenalty({
      determinedTax: base,
      // 감면은 `determinedTax`에 이미 1회 반영돼 있다 — 재차감하면 이중차감이다.
      reductionAmount: 0,
      priorPaidTax: 0,
      originalFiledTax: Math.max(0, input.originalFiledTax ?? 0),
      excessRefundAmount: 0,
      interestSurcharge: 0,
      filingType: "under",
      penaltyReason,
      // §47의3①1호 가목·나목 분해 — 미입력이면 전액 부정(정본과 같은 하위 호환)
      fraudulentPortion: input.fraudulentPortion,
    });

    const steps: PenaltyStep[] = [...r.steps];
    if (exclusionOverridden && exclusion) {
      steps.unshift({
        label: "적용제외 불성립",
        formula:
          `${UNDER_REPORT_EXCLUSION_LABELS[exclusion]} — ` +
          (exclusion === "supplementary_valuation"
            ? "부정행위로 과세표준을 과소신고해 단서에 걸린다"
            : "법인세 경정이 부정행위에 기인해 단서에 걸린다"),
        amount: 0,
        legalBasis: "국세기본법 §47의3④1호",
      });
    }

    return {
      filingPenalty: r.filingPenalty,
      penaltyBase: r.penaltyBase,
      penaltyRate: r.penaltyRate,
      grossPenalty: r.filingPenalty,
      reductionRate: 0,
      reductionAmount: 0,
      ruleRef: r.filingPenalty > 0 ? r.legalBasis : "",
      ...(exclusionOverridden && exclusion
        ? { exclusionOverriddenByFraud: exclusion }
        : {}),
      ...(r.fraudSplit ? { fraudSplit: r.fraudSplit } : {}),
      steps,
    };
  }

  // ── 무신고 · 기한후신고 (§47의2① — 1호 부정 40%·역외 60% / 2호 그 밖 20%) ──
  //
  // 🔑 기한후신고가 **과소**였는지는 base 를 바꾸지 않는다 — §47의2①의 base 는 「그 신고로
  //    납부하여야 할 세액」 **전액**이다. 두 조문은 「기한까지 신고했는가」로 배타다.
  const r = calculateFilingPenalty({
    determinedTax: base,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "none",
    // §47의2①1호 — 부정행위 무신고 40%(역외거래 60%). 1호·2호는 「비율을 곱한 금액」이라
    // 가목·나목 분해가 **없다** — `fraudulentPortion` 은 여기서 의미가 없다.
    penaltyReason,
    // 🔑 §48②2호 감면은 **기한후신고(§45의3)** 에만 붙는다 — 순수 무신고(`"none"`)는
    //    기한 후 신고를 한 것이 아니므로 축 자체를 넘기지 않는다.
    //    `finalReturnDeadline` 도 넘기지 않는다 — 상속·증여에는 예정신고가 없어
    //    §48②3호라목이 성립하지 않는다(공용 leaf 계약).
    lateFiling:
      input.filingStatus === "late"
        ? {
            statutoryDeadline: input.statutoryDeadline,
            actualFilingDate: input.actualFilingDate,
            priorAssessmentNotified: input.priorAssessmentNotified,
          }
        : undefined,
  });

  return {
    filingPenalty: r.filingPenalty,
    penaltyBase: r.penaltyBase,
    penaltyRate: r.penaltyRate,
    grossPenalty: r.grossFilingPenalty,
    reductionRate: r.lateFilingReductionRate,
    reductionAmount: r.lateFilingReductionAmount,
    ruleRef: r.filingPenalty > 0 ? r.legalBasis : "",
    steps: r.steps,
  };
}

// ============================================================
// 납부지연가산세 — 「국세기본법」 §47의4 (🔴 G-07 B3)
// ============================================================

const LATE_PAYMENT_ZERO: InheritanceGiftLatePaymentResult = {
  penalty: 0,
  unpaidTax: 0,
  elapsedDays: 0,
  breakdown: [],
  steps: [],
};

/**
 * 상속·증여 납부지연가산세 — **신고 단위 1회** 산정.
 *
 * ## 산식은 부동산 정본을 그대로 쓴다
 *
 * §47의4①1호는 세목 중립이다 — 「납부하지 아니한 세액 × **법정납부기한의 다음 날부터
 * 납부일의 전날까지**의 기간 × 대통령령으로 정하는 이자율」. `calculateDelayedPaymentPenalty`
 * 가 그 산식의 정본이고(G-03 에서 「납부일의 전날까지」로 정정됐다), 이자율 개정 시행일을
 * 걸치는 구간 분해도 거기에 있다.
 *
 * ## 상속·증여에만 있는 것 — §47의4③의 두 호
 *
 * · **4호** 법인세 경정으로 §45의3~§45의5 증여의제이익이 변경된 경우
 *   (**부정행위로 인한 경정은 제외**) — §47의3④1호 **라목과 같은 사실**이라 입력을 공유한다.
 * · **6호** 기한 내 신고·납부한 자가 그 뒤 **평가**로 결정·경정된 경우 — 라목·다목과 달리
 *   「법정신고기한까지 **납부**」를 추가 요건으로 하므로 **별도 입력**이다.
 *
 * 🔑 ③은 「제1항제1호 및 제2호의 가산세를 적용하지 **아니한다**」 — 감면(§48②)이 아니라
 *    **적용 자체가 배제**된다. 그래서 감면율이 아니라 0을 돌려준다.
 */
export function calcInheritanceGiftLatePayment(
  input: InheritanceGiftPenaltyInput,
  calculationDate?: Date,
): InheritanceGiftLatePaymentResult {
  const unpaidTax = Math.max(0, input.unpaidTax ?? 0);
  if (unpaidTax <= 0 || !input.paymentDeadline) return LATE_PAYMENT_ZERO;

  const deadline = parseISO(input.paymentDeadline);
  if (isNaN(deadline.getTime())) return LATE_PAYMENT_ZERO;

  // ── §47의4③ 적용제외 ────────────────────────────────────────────────
  //
  // ⚠️ 4호는 §47의3④1호 라목과 **같은 사실**을 가리킨다(문언이 같다) — 폼이 그 사실을
  //    한 번만 받으므로 여기서도 같은 필드를 읽는다. 부정행위로 인한 법인세 경정이면
  //    두 조문 모두 단서에 걸려 적용제외가 성립하지 않는다.
  const exclusion: LatePaymentExclusion | undefined = input.paidOnTimeThenRevalued
    ? "revalued_after_timely_filing"
    : input.underReportExclusion === "corporate_adjustment" &&
        !input.corporateAdjustmentByFraud
      ? "corporate_adjustment"
      : undefined;

  if (exclusion) {
    return {
      ...LATE_PAYMENT_ZERO,
      unpaidTax,
      exclusionApplied: exclusion,
      steps: [
        {
          label: "납부지연가산세 적용제외",
          formula: LATE_PAYMENT_EXCLUSION_LABELS[exclusion],
          amount: 0,
          legalBasis: "국세기본법 §47의4③",
        },
      ],
    };
  }

  const actual = input.actualPaymentDate ? parseISO(input.actualPaymentDate) : undefined;
  const r = calculateDelayedPaymentPenalty({
    unpaidTax,
    paymentDeadline: deadline,
    actualPaymentDate: actual && !isNaN(actual.getTime()) ? actual : undefined,
    calculationDate,
  });

  return {
    penalty: r.delayedPaymentPenalty,
    unpaidTax: r.unpaidTax,
    elapsedDays: r.elapsedDays,
    breakdown: r.breakdown,
    steps: r.steps,
  };
}
