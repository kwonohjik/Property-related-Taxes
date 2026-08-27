/**
 * 주식 양도소득세 — 산출세액 이후 finalize 모듈
 *
 * STEP 10: 신고불성실 가산세 (국세기본법 §47조의2 무신고 / §47조의3 과소신고)
 * STEP 10.5: 납부지연 가산세 (국세기본법 §47조의4 · 국기령 §27조의4① 1일 10만분의 22)
 * STEP 11: 전자신고 공제 §52의2
 * STEP 12: 지방소득세 §103의3 + 10원 미만 절사 (국고금 관리법 §47③)
 *
 * ## 계산 엔진은 부동산 정본을 재사용한다
 *
 * 가산세는 **국세기본법** 규정이라 세목을 가리지 않는다. 부동산 양도소득세가 이미
 * `lib/tax-engine/transfer-tax-penalty.ts` 에 법문 그대로의 모듈을 갖고 있으므로 —
 * 「과소신고납부세액등」 base 산식 · 부정/역외 세율 · 납부지연 이자율 **개정 시행일 straddle**
 * 분할까지 — 주식이 그것을 호출한다. 종전에는 이 파일이 `calculatedTax × 비율` 이라는
 * **축약판**을 따로 갖고 있었고, 그래서 두 가지가 어긋나 있었다:
 *
 *   ① base 가 **산출세액 전액**이었다 — 법문은 「과소신고한 **납부세액**」(§47조의3①)이라
 *      당초 신고세액·기납부세액·이자상당가산액을 뺀 금액이다. 그만큼 **납세자에게 불리**했다.
 *   ② `latePaymentPenalty` 가 **0 placeholder** 였다 — §47조의4 가 아예 계산되지 않았다.
 *
 * ⚠️ **절사 규칙만 주식 것을 쓴다** — 부동산 모듈은 원 미만 절사(`truncateToWon`)인데
 *    주식은 10원 미만 절사(`floorTen`, 국고금 관리법 §47①)가 정본이다.
 *
 * ⚠️ **적용 단위는 신고 1건**이다. 다종목 합산에서는 이 파일을 종목마다 부르지 않고
 *    `stock-transfer-aggregate.ts` 가 **신고 단위 결정세액에 1회** 산정한다.
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import {
  calculateFilingPenalty,
  calculateDelayedPaymentPenalty,
  type FilingType,
  type PenaltyReason,
} from "@/lib/tax-engine/transfer-tax-penalty";
import { floorTen, floorLocalTax, calcElectronicFilingCredit } from "./stock-transfer-helpers";

export interface FinalizeStockResult {
  underReportPenalty: number;
  latePaymentPenalty: number;
  electronicFilingCredit: number;
  finalTax: number;
  localIncomeTax: number;
  appliedRules: string[];
  /** 가산세 기준금액 — 「과소신고납부세액등」(§47조의3①). 결과 화면 산식 표시용 echo */
  penaltyBase?: number;
}

/** 주식 `filingViolation` → 부동산 정본 `FilingType` */
function toFilingType(v: StockTransferInput["filingViolation"]): FilingType {
  if (v === "non_report") return "none";
  if (v === "under_report") return "under";
  return "correct";
}

/**
 * 부정행위 축 → 부동산 정본 `PenaltyReason`
 *
 * 법문은 「역외거래에서 발생한 **부정행위**」(§47조의2①1호 괄호 · §47조의3①1호 가목 괄호)라
 * 역외는 **부정행위를 전제로 한 가중**이다. 역외만 켜고 부정이 꺼져 있으면 일반율이다.
 */
function toPenaltyReason(isFraudulent: boolean, isOffshore: boolean): PenaltyReason {
  if (isFraudulent && isOffshore) return "offshore_fraud";
  if (isFraudulent) return "fraudulent";
  return "normal";
}

/** 적용 조문 — 무신고/과소 × 부정/역외 매트릭스 (부동산 모듈의 legalBasis 대신 주식 상수를 쓴다) */
function resolvePenaltyRule(
  filingViolation: StockTransferInput["filingViolation"],
  isFraudulent: boolean,
  isOffshore: boolean,
): string {
  const nonReport = filingViolation === "non_report";
  if (isFraudulent && isOffshore) {
    return nonReport
      ? STOCK.SECTION_47_2_NO_REPORT_INTERNATIONAL_FRAUD
      : STOCK.SECTION_47_2_2_1_INTERNATIONAL_FRAUD;
  }
  if (isFraudulent) {
    return nonReport
      ? STOCK.SECTION_47_2_NO_REPORT_FRAUDULENT
      : STOCK.SECTION_47_2_2_1_FRAUDULENT;
  }
  return nonReport ? STOCK.SECTION_47_2_1_1_NO_REPORT : STOCK.SECTION_47_2_1_2_UNDER_REPORT;
}

/**
 * 가산세 적용 조문 전체 — 다종목에서 **종목별 표시를 걷어낼 때** 대조 집합으로 쓴다.
 * 가산세는 신고 단위 1회라 종목 카드에 조문만 남으면 「가산세 0인데 40% 배지」가 된다.
 */
export const STOCK_PENALTY_RULE_REFS: readonly string[] = [
  STOCK.SECTION_47_2_1_1_NO_REPORT,
  STOCK.SECTION_47_2_1_2_UNDER_REPORT,
  STOCK.SECTION_47_2_2_1_FRAUDULENT,
  STOCK.SECTION_47_2_2_1_INTERNATIONAL_FRAUD,
  STOCK.SECTION_47_2_NO_REPORT_FRAUDULENT,
  STOCK.SECTION_47_2_NO_REPORT_INTERNATIONAL_FRAUD,
  STOCK.SECTION_47_4_LATE_PAYMENT,
];

/** 신고불성실가산세 결과 — 신고 단위 1회 산정용으로 aggregate 도 쓴다 */
export interface StockFilingPenaltyResult {
  penalty: number;
  penaltyBase: number;
  ruleRef: string;
}

/**
 * 신고불성실가산세 — **신고 단위 결정세액**을 받아 1회 산정한다.
 *
 * @param determinedTax 결정세액(세액공제 반영 후). 다종목이면 **신고 단위 합계**
 */
export function computeStockFilingPenalty(
  determinedTax: number,
  input: Pick<
    StockTransferInput,
    | "filingViolation"
    | "isFraudulent"
    | "isInternationalTransaction"
    | "originalFiledTax"
    | "priorPaidTax"
    | "interestSurcharge"
  >,
): StockFilingPenaltyResult {
  if (input.filingViolation === "none") {
    return { penalty: 0, penaltyBase: 0, ruleRef: "" };
  }

  const result = calculateFilingPenalty({
    determinedTax: Math.max(0, determinedTax),
    // 감면은 `determinedTax` 에 이미 1회 반영돼 있다 — 여기서 다시 빼면 이중차감
    // (부동산 정본 `FilingPenaltyInput.reductionAmount` 주석과 같은 이유).
    reductionAmount: 0,
    priorPaidTax: input.priorPaidTax ?? 0,
    originalFiledTax: input.originalFiledTax ?? 0,
    // 주식 `filingViolation` 에는 초과환급신고 축이 없다(입력 경로 부재) — 0 고정.
    excessRefundAmount: 0,
    interestSurcharge: input.interestSurcharge ?? 0,
    filingType: toFilingType(input.filingViolation),
    penaltyReason: toPenaltyReason(input.isFraudulent, input.isInternationalTransaction),
  });

  // 가산세 10원 미만 절사 (국고금 관리법 §47①) — 주식 정본 규칙
  const penalty = floorTen(result.filingPenalty);
  return {
    penalty,
    penaltyBase: result.penaltyBase,
    ruleRef:
      penalty > 0
        ? resolvePenaltyRule(
            input.filingViolation,
            input.isFraudulent,
            input.isInternationalTransaction,
          )
        : "",
  };
}

/**
 * 납부지연가산세 — 미납세액과 법정납부기한이 **둘 다** 있어야 계산한다.
 *
 * 기한만 있고 미납세액이 0이면 지연이 없는 것이고, 미납세액만 있고 기한이 없으면
 * 경과일수를 셀 수 없다. 어느 쪽이든 **조용히 0을 만들지 않고** 계산 자체를 건너뛴다.
 */
export function computeStockLatePaymentPenalty(
  input: Pick<StockTransferInput, "unpaidTax" | "paymentDeadline" | "actualPaymentDate">,
): number {
  const unpaidTax = input.unpaidTax ?? 0;
  if (unpaidTax <= 0 || !input.paymentDeadline) return 0;

  const result = calculateDelayedPaymentPenalty({
    unpaidTax,
    paymentDeadline: input.paymentDeadline,
    actualPaymentDate: input.actualPaymentDate,
  });
  return floorTen(result.delayedPaymentPenalty);
}

/**
 * finalize: 세액공제 → 결정세액 → 가산세 → 최종세액 → 지방소득세
 *
 * @param foreignTaxCredit 외국납부세액공제(§118의6①1호). 단건 국내 경로는 0
 */
export function finalizeStockTax(
  calculatedTax: number,
  input: StockTransferInput,
  foreignTaxCredit = 0,
): FinalizeStockResult {
  const appliedRules: string[] = [];

  // STEP 11: 전자신고 세액공제 (조특법 §104의8)
  const electronicFilingCredit = calcElectronicFilingCredit(input.isElectronicFiling, calculatedTax);
  if (electronicFilingCredit > 0) {
    appliedRules.push(STOCK.ELECTRONIC_FILING_CREDIT);
  }

  /**
   * 결정세액 = 산출세액 − 세액공제.
   *
   * 국세기본법 §47조의3① 의 base 는 「과소신고한 **납부세액**」이고, 그 납부세액은
   * 세액공제를 반영한 뒤의 금액이다 — 부동산 정본이 감면을 `determinedTax` 에 반영한 채
   * 넘기는 것과 같은 구조다. 따라서 전자신고 세액공제·외국납부세액공제를 **뺀 뒤** 세율을 곱한다.
   */
  const determinedTax = Math.max(0, calculatedTax - foreignTaxCredit - electronicFilingCredit);

  // STEP 10: 신고불성실 가산세
  const filing = computeStockFilingPenalty(determinedTax, input);
  if (filing.ruleRef) appliedRules.push(filing.ruleRef);

  // STEP 10.5: 납부지연 가산세
  const latePaymentPenalty = computeStockLatePaymentPenalty(input);
  if (latePaymentPenalty > 0) appliedRules.push(STOCK.SECTION_47_4_LATE_PAYMENT);

  // 최종세액 = 결정세액 + 가산세 (10원 미만 절사 — 국고금 관리법 §47①)
  const finalTax = Math.max(
    0,
    floorTen(determinedTax + filing.penalty + latePaymentPenalty),
  );

  // STEP 12: 지방소득세 = 산출세액 × 10% + 10원 미만 절사 (§47③ 지자체 준용)
  // 가산세는 지방소득세 과세표준이 아니다 (지방세법 §103의3).
  const localIncomeTax = floorLocalTax(Math.floor(calculatedTax * 0.10));

  return {
    underReportPenalty: filing.penalty,
    latePaymentPenalty,
    electronicFilingCredit,
    finalTax,
    localIncomeTax,
    appliedRules,
    penaltyBase: filing.penaltyBase,
  };
}
