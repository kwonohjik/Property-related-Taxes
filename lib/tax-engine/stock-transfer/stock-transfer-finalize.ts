/**
 * 주식 양도소득세 — 산출세액 이후 finalize 모듈
 *
 * STEP 10: 가산세 §47의2
 * STEP 11: 전자신고 공제 §52의2
 * STEP 12: 지방소득세 §103의3 + 10원 미만 절사 (국고금 관리법 §47③)
 *
 * PR-1 범위: 신고불성실 가산세 (무신고/과소신고/부정) + 전자신고 공제 + 지방세
 * PR-3 범위: 납부불성실 가산세 (§47의4 일할)
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import {
  STOCK,
  STOCK_ELECTRONIC_FILING_CREDIT,
} from "@/lib/tax-engine/legal-codes/stock";
import { floorTen, floorLocalTax, calcElectronicFilingCredit } from "./stock-transfer-helpers";

export interface FinalizeStockResult {
  underReportPenalty: number;
  latePaymentPenalty: number;
  electronicFilingCredit: number;
  finalTax: number;
  localIncomeTax: number;
  appliedRules: string[];
}

/**
 * 신고불성실 가산세 (§47의2) — filingViolation 게이트 기반
 *
 * 매트릭스 (filingViolation × 부정행위 × 국제거래):
 * - none, *, *                  → 0 (정상 신고)
 * - under_report, false, *      → 10% (§47의2②2)
 * - under_report, true, false   → 40% (§47의2②1)
 * - under_report, true, true    → 60% (§47의2②1 단서)
 * - non_report,   false, *      → 20% (§47의2①1)
 * - non_report,   true, false   → 40% (§47의2②1)
 * - non_report,   true, true    → 60% (§47의2②1 단서)
 */
function calcUnderReportPenalty(
  calculatedTax: number,
  filingViolation: "none" | "under_report" | "non_report",
  isFraudulent: boolean,
  isInternationalTransaction: boolean,
): { penalty: number; ruleRef: string } {
  if (calculatedTax <= 0) return { penalty: 0, ruleRef: "" };
  if (filingViolation === "none") return { penalty: 0, ruleRef: "" };

  let penaltyRate: number;
  let ruleRef: string;

  if (isFraudulent && isInternationalTransaction) {
    // 부정행위 + 국제거래 60% (§47의2②1 단서)
    penaltyRate = 0.60;
    ruleRef = STOCK.SECTION_47_2_2_1_INTERNATIONAL_FRAUD;
  } else if (isFraudulent) {
    // 부정행위 40% (무신고·과소 공통)
    penaltyRate = 0.40;
    ruleRef = STOCK.SECTION_47_2_2_1_FRAUDULENT;
  } else if (filingViolation === "non_report") {
    // 일반 무신고 20% (§47의2①1)
    penaltyRate = 0.20;
    ruleRef = STOCK.SECTION_47_2_1_1_NO_REPORT;
  } else {
    // 일반 과소신고 10% (§47의2②2)
    penaltyRate = 0.10;
    ruleRef = STOCK.SECTION_47_2_1_2_UNDER_REPORT;
  }

  // 가산세 10원 미만 절사 (국고금 관리법 §47①)
  const penalty = floorTen(Math.floor(calculatedTax * penaltyRate));
  return { penalty, ruleRef };
}

/**
 * finalize: 가산세 → 전자신고 공제 → 최종세액 → 지방소득세
 */
export function finalizeStockTax(
  calculatedTax: number,
  input: StockTransferInput,
): FinalizeStockResult {
  const {
    filingViolation,
    isFraudulent,
    isInternationalTransaction,
    isElectronicFiling,
  } = input;
  const appliedRules: string[] = [];

  // STEP 10: 가산세
  const { penalty: underReportPenalty, ruleRef: penaltyRule } = calcUnderReportPenalty(
    calculatedTax,
    filingViolation,
    isFraudulent,
    isInternationalTransaction,
  );
  if (underReportPenalty > 0 && penaltyRule) {
    appliedRules.push(penaltyRule);
  }

  // PR-3: 납부불성실 가산세 (§47의4) — placeholder
  const latePaymentPenalty = 0;

  // STEP 11: 전자신고 세액공제 §52의2
  const electronicFilingCredit = calcElectronicFilingCredit(isElectronicFiling, calculatedTax);
  if (electronicFilingCredit > 0) {
    appliedRules.push(STOCK.SECTION_52_2_ELECTRONIC_CREDIT);
  }

  // 최종세액 = 산출세액 + 가산세 − 세액공제
  const finalTaxRaw = calculatedTax + underReportPenalty + latePaymentPenalty - electronicFilingCredit;
  // 산출세액 10원 미만 절사 (국고금 관리법 §47①)
  const finalTax = Math.max(0, floorTen(finalTaxRaw));

  // STEP 12: 지방소득세 = 산출세액 × 10% + 10원 미만 절사 (§47③ 지자체 준용)
  // 지방소득세는 산출세액(calculatedTax)에 10% 적용 (가산세 포함 여부는 지방세법 §103의3)
  const localIncomeTax = floorLocalTax(Math.floor(calculatedTax * 0.10));

  return {
    underReportPenalty,
    latePaymentPenalty,
    electronicFilingCredit,
    finalTax,
    localIncomeTax,
    appliedRules,
  };
}
