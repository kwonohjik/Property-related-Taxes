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

import { addMonths, isAfter, parseISO } from "date-fns";
import {
  LATE_FILING_REDUCTION_48_2_2_TABLE,
  LATE_FILING_REDUCTION_48_2_2,
  LATE_FILING_45_3,
} from "./legal-codes/common";
import { calculateFilingPenalty, type PenaltyStep } from "./transfer-tax-penalty";
import { applyRateFraction } from "./tax-utils";

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
  /** §47의3④1호 적용제외 사유 — 있으면 과소신고가산세 0 */
  underReportExclusion?: UnderReportExclusion;
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
 */
export function resolveLateFilingReductionRate(
  deadline: string | undefined,
  filingDate: string | undefined,
  notified: boolean | undefined,
): number {
  if (notified) return 0;
  if (!deadline || !filingDate) return 0;
  const dl = parseISO(deadline);
  const fd = parseISO(filingDate);
  if (isNaN(dl.getTime()) || isNaN(fd.getTime())) return 0;
  for (const { maxMonths, rate } of LATE_FILING_REDUCTION_48_2_2_TABLE) {
    if (!isAfter(fd, addMonths(dl, maxMonths))) return rate;
  }
  return 0; // 6개월 초과
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

  // ── 정기신고 ────────────────────────────────────────────────────────
  if (input.filingStatus === "on_time") {
    if (!input.isUnderReported) return ZERO;

    // 🔴 §47의3④1호 — 상속·증여 전용 적용제외. 「다」목이 특히 넓다.
    if (input.underReportExclusion) {
      return {
        ...ZERO,
        exclusionApplied: input.underReportExclusion,
        steps: [
          {
            label: "과소신고가산세 적용제외",
            formula: UNDER_REPORT_EXCLUSION_LABELS[input.underReportExclusion],
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
      // B1은 일반율만 — 부정행위 축(40%·60%)은 B2다.
      penaltyReason: "normal",
    });
    return {
      filingPenalty: r.filingPenalty,
      penaltyBase: r.penaltyBase,
      penaltyRate: r.penaltyRate,
      grossPenalty: r.filingPenalty,
      reductionRate: 0,
      reductionAmount: 0,
      ruleRef: r.filingPenalty > 0 ? r.legalBasis : "",
      steps: r.steps,
    };
  }

  // ── 무신고 · 기한후신고 (§47의2①2호 20%) ────────────────────────────
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
    penaltyReason: "normal",
  });

  const reductionRate =
    input.filingStatus === "late"
      ? resolveLateFilingReductionRate(
          input.statutoryDeadline,
          input.actualFilingDate,
          input.priorAssessmentNotified,
        )
      : 0; // 무신고는 기한후신고가 아니므로 §48②2호 대상이 아니다

  // 정수 분수 연산 — 0.5·0.3·0.2 를 그대로 곱하면 부동소수 오차로 1원이 어긋난다.
  const reductionAmount = applyRateFraction(
    r.filingPenalty,
    Math.round(reductionRate * 100),
    100,
  );
  const filingPenalty = Math.max(0, r.filingPenalty - reductionAmount);

  const steps: PenaltyStep[] = [...r.steps];
  if (reductionRate > 0) {
    steps.push({
      label: `기한후신고 감면 (${Math.round(reductionRate * 100)}%)`,
      formula: `${r.filingPenalty.toLocaleString()} × ${Math.round(reductionRate * 100)}%`,
      amount: -reductionAmount,
      legalBasis: `${LATE_FILING_REDUCTION_48_2_2} (${LATE_FILING_45_3})`,
    });
  }

  return {
    filingPenalty,
    penaltyBase: r.penaltyBase,
    penaltyRate: r.penaltyRate,
    grossPenalty: r.filingPenalty,
    reductionRate,
    reductionAmount,
    ruleRef: filingPenalty > 0 ? r.legalBasis : "",
    steps,
  };
}
