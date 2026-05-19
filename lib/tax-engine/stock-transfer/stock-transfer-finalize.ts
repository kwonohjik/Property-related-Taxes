/**
 * 주식 양도소득세 — 산출세액 이후 finalize 모듈
 *
 * STEP 10: 신고불성실 가산세 (국세기본법 §47조의2 무신고 / §47조의3 과소신고)
 * STEP 11: 전자신고 공제 §52의2
 * STEP 12: 지방소득세 §103의3 + 10원 미만 절사 (국고금 관리법 §47③)
 *
 * PR-1 범위: 신고불성실 가산세 (무신고/과소신고/부정) + 전자신고 공제 + 지방세
 * PR-3 범위 외: 납부지연가산세 (국세기본법 §47조의4 일할) — 납부일 확정 후 별도 산정
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
 * 신고불성실 가산세 — filingViolation × 부정행위 × 역외거래 매트릭스
 *
 * v3 정정 (PR-3-c, 2026-05-19) — KoreanLaw MCP 검증:
 *   - 무신고  = 국세기본법 §47조의2 (이전: 소득세법 §47의2 — 오인용)
 *   - 과소신고 = 국세기본법 §47조의3 (이전: 소득세법 §47의2②2 — 오인용)
 *   - 본문 "역외거래" — 이전 "국제거래" 표기는 법령 본문 불일치
 *
 * 매트릭스 (filingViolation × isFraudulent × isInternationalTransaction):
 * - none,         *,     *      → 0 (정상 신고)
 * - under_report, false, *      → 10% (국세기본법 §47조의3 ①2호)
 * - under_report, true,  false  → 40% (국세기본법 §47조의3 ①1호 가목 본문)
 * - under_report, true,  true   → 60% (국세기본법 §47조의3 ①1호 가목 괄호 — 역외)
 * - non_report,   false, *      → 20% (국세기본법 §47조의2 ①2호)
 * - non_report,   true,  false  → 40% (국세기본법 §47조의2 ①1호 본문)
 * - non_report,   true,  true   → 60% (국세기본법 §47조의2 ①1호 괄호 — 역외)
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
    // 부정행위 + 역외거래 60% — 무신고/과소 분기 분리 (각 조문 본문 위치 다름)
    penaltyRate = 0.60;
    ruleRef =
      filingViolation === "non_report"
        ? STOCK.SECTION_47_2_NO_REPORT_INTERNATIONAL_FRAUD
        : STOCK.SECTION_47_2_2_1_INTERNATIONAL_FRAUD;
  } else if (isFraudulent) {
    // 부정행위 40% — 무신고/과소 분기 분리
    penaltyRate = 0.40;
    ruleRef =
      filingViolation === "non_report"
        ? STOCK.SECTION_47_2_NO_REPORT_FRAUDULENT
        : STOCK.SECTION_47_2_2_1_FRAUDULENT;
  } else if (filingViolation === "non_report") {
    // 일반 무신고 20%
    penaltyRate = 0.20;
    ruleRef = STOCK.SECTION_47_2_1_1_NO_REPORT;
  } else {
    // 일반 과소신고 10%
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

  // PR-3 범위 외: 납부지연가산세 (국세기본법 §47조의4) — placeholder
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
