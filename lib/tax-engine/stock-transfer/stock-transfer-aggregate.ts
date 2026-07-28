/**
 * 주식 양도소득세 — 다자산 합산 엔진 (Layer 2 — Orchestrator on Orchestrator)
 *
 * 동일 과세기간 내 2건 이상 종목을 양도할 때 §103② 기본공제 그룹별 1회 한도를 반영한다.
 * 기존 단건 엔진(`calculateStockTransferTaxInternal`)을 종목별로 재사용하며,
 * 상위에서 그룹별 기본공제 배분·합산·증권거래세 정보성 echo 합산을 수행.
 *
 * 순수 함수. DB 직접 호출 없음.
 *
 * [800줄 정책 분할 — D-1] stock-transfer-tax.ts(798줄)에서 추출.
 * 외부 import 경로는 stock-transfer-tax.ts의 re-export로 100% 보존(import 무변경).
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { calculateStockTransferTaxInternal } from "./stock-transfer-tax";
import { floorTen } from "./stock-transfer-helpers";
import { applyStockTaxRate } from "./stock-transfer-rate-calc";
import { finalizeStockTax } from "./stock-transfer-finalize";
import {
  sumSecuritiesTransactionTax,
  type SecuritiesTransactionTaxTotal,
} from "./securities-transaction-tax";

// ============================================================
// 다자산 합산 결과 타입
// ============================================================

export interface StockTransferAggregateResult {
  /** 종목별 단건 결과 배열 */
  items: StockTransferResult[];
  /** 합산 양도소득금액 */
  totalTransferIncome: number;
  /**
   * 그룹별 기본공제 합계
   * - stock: §103②2호 그룹 (주식 §94①3 가·나목)
   * - real_estate_and_other_asset: §103②1호 그룹 (기타자산 §94①4)
   */
  basicDeductionByGroup: {
    stock: number;
    real_estate_and_other_asset: number;
  };
  /** 합산 과세표준 (그룹별 기본공제 1회 적용 후) */
  totalTaxBase: number;
  /** 합산 산출세액 */
  totalCalculatedTax: number;
  /** 합산 가산세 */
  totalUnderReportPenalty: number;
  /** 합산 전자신고 공제 (전체 1회) */
  electronicFilingCredit: number;
  /** 합산 최종세액 */
  totalFinalTax: number;
  /** 합산 지방소득세 */
  totalLocalIncomeTax: number;
  /**
   * 종목별 증권거래세 정보성 echo 합산 (Phase 2 — B-E1).
   * 이미 floor된 종목별 값의 단순합 — 안분·잔액흡수 비해당.
   * 비과세 종목 echo도 포함 (증권거래세는 양도세 비과세와 독립).
   * ⚠️ 현재 aggregate UI 소비자 없음(다자산 UI 미연결) — 향후 연결 시 14지점 재점검 대상.
   */
  totalSecuritiesTransactionTax: SecuritiesTransactionTaxTotal;
}

/**
 * 다자산 합산 계산 — §103② 기본공제 그룹별 1회 한도 적용
 *
 * "aggregate" 모드:
 *   1. 각 종목 단건 계산 (realEstateGroupBasicDeductionUsed 연동)
 *   2. 그룹별 기본공제를 250만원 한도 내에서 배분
 *   3. 합산 세액은 단건 세액 합계 (그룹별 기본공제 중복 없음)
 *
 * "each_item" 모드:
 *   - 각 종목 그대로 합산 (기본공제 중복 가능 — 단건 계산 보조용)
 */
export function calculateStockTransferTaxAggregate(
  inputs: StockTransferInput[],
  deductionMode: "each_item" | "aggregate" = "aggregate",
): StockTransferAggregateResult {
  const BASIC_DEDUCTION_LIMIT = 2_500_000;

  if (deductionMode === "each_item" || inputs.length === 1) {
    // 단건 또는 each_item 모드 — 개별 계산 합산
    const items = inputs.map((input) => calculateStockTransferTaxInternal(input));
    const totalTransferIncome = items.reduce((s, r) => s + r.transferIncome, 0);
    const totalCalculatedTax = items.reduce((s, r) => s + r.calculatedTax, 0);
    const totalUnderReportPenalty = items.reduce((s, r) => s + r.underReportPenalty, 0);
    const electronicFilingCredit = items.some((r) => r.electronicFilingCredit > 0)
      ? 20_000
      : 0;
    // 결정세액 10원 미만 절사 — 단건 finalizeStockTax·aggregate 분기와 대칭
    // (구성요소가 모두 10배수라 현재 실수치 불변이나, 향후 변경 대비 정합 유지)
    const totalFinalTax = Math.max(
      0,
      floorTen(totalCalculatedTax + totalUnderReportPenalty - electronicFilingCredit),
    );
    const totalLocalIncomeTax = Math.floor((totalCalculatedTax * 0.10) / 10) * 10;

    return {
      items,
      totalTransferIncome,
      basicDeductionByGroup: {
        stock: items
          .filter((r) => r.basicDeductionGroup === "stock")
          .reduce((s, r) => s + r.basicDeduction, 0),
        real_estate_and_other_asset: items
          .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
          .reduce((s, r) => s + r.basicDeduction, 0),
      },
      totalTaxBase: items.reduce((s, r) => s + r.taxBase, 0),
      totalCalculatedTax,
      totalUnderReportPenalty,
      electronicFilingCredit,
      totalFinalTax,
      totalLocalIncomeTax,
      totalSecuritiesTransactionTax: sumSecuritiesTransactionTax(items),
    };
  }

  // "aggregate" 모드 — §103② 그룹별 기본공제 1회 한도 배분
  // STEP 1: 각 종목 기본공제 최대 소진으로 단건 계산 (순수 소득금액 파악)
  const rawItems = inputs.map((input) =>
    calculateStockTransferTaxInternal({
      ...input,
      // 부동산 그룹은 이미 소진됨으로 처리 → 실질적 기본공제 0
      realEstateGroupBasicDeductionUsed: BASIC_DEDUCTION_LIMIT,
    }),
  );

  // STEP 2: 그룹별 소득금액 합산
  const stockGroupIncome = rawItems
    .filter((r) => r.basicDeductionGroup === "stock")
    .reduce((s, r) => s + r.transferIncome, 0);

  const otherAssetGroupIncome = rawItems
    .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
    .reduce((s, r) => s + r.transferIncome, 0);

  const stockBasicDeduction = Math.min(Math.max(0, stockGroupIncome), BASIC_DEDUCTION_LIMIT);
  const otherAssetBasicDeduction = Math.min(
    Math.max(0, otherAssetGroupIncome),
    BASIC_DEDUCTION_LIMIT,
  );

  // STEP 3: 종목별 기본공제 순차 배분 후 재계산
  //
  // §103② 기본공제는 그룹별 연간 1회 250만원.
  // 입력 순서 기준 앞 종목부터 최대 소진.
  //
  // 주식 그룹(그룹2):
  //   - 엔진 내부 calcBasicDeduction은 "stock" 그룹을 항상 min(income, 250만) 적용
  //   - realEstateGroupBasicDeductionUsed로 제어 불가 (별도 그룹)
  //   - 해결: 첫 종목은 input 그대로(기본공제 full), 나머지는 transferIncome을
  //     "이전 소진량만큼 빼서" 과표를 조정한 결과를 rawItems[i] 기반으로 패치
  //
  // 기타자산 그룹(그룹1):
  //   - realEstateGroupBasicDeductionUsed로 직접 제어 가능

  let stockUsed = 0;        // 주식 그룹 기본공제 누적 사용량
  let otherAssetUsed = 0;   // 기타자산 그룹 누적 사용량

  const processedItems = inputs.map((input, i) => {
    const r = rawItems[i];
    if (r.isExempt) return r;

    const income = r.transferIncome;

    if (r.basicDeductionGroup === "stock") {
      // 이 종목에서 실제 적용할 기본공제
      const remaining = Math.max(0, BASIC_DEDUCTION_LIMIT - stockUsed);
      const deductThis = Math.min(Math.max(0, income), remaining);
      stockUsed += deductThis;

      // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 종전에는 `deductThis > 0`이면 무조건
      // 엔진 전량 재계산으로 보냈는데, 순수 엔진 `calcBasicDeduction`은 주식 그룹에 **항상**
      // `min(income, 2,500,000)`을 적용한다. 그래서 앞 종목이 한도를 일부만 쓴 경우
      // 뒤 종목이 **250만원 전액을 다시 공제**받아 그룹 한도(§103②2호)를 넘겼다.
      //   실측: 종목A가 1,000,000 사용 → 종목B가 잔여 1,500,000이 아니라 2,500,000 공제
      //        → 그룹 합계 3,500,000 (한도 초과) → 과세표준·산출세액 과소.
      //
      // 0/전액 두 갈래를 없애고 **항상 정확한 잔여액(deductThis)으로 패치**한다.
      // (전액 케이스는 deductThis == min(income, 250만)이라 종전 엔진 경로와 결과가 같다.)
      const taxBaseAfterDeduction = Math.floor(Math.max(0, income - deductThis));
      const rateResult = applyStockTaxRate(
        taxBaseAfterDeduction,
        r.taxCategory,
        input.isSmallMediumEnterprise,
        r.isShortTermHolding,
        r.isExempt, // 비과세 분기 산식 echo
      );
      const newCalculatedTax = floorTen(rateResult.calculatedTax);
      const newFinalize = finalizeStockTax(newCalculatedTax, input);
      return {
        ...r,
        basicDeduction: deductThis,
        taxBase: taxBaseAfterDeduction,
        appliedRate: rateResult.appliedRate,
        progressiveDeduction: rateResult.progressiveDeduction,
        calculatedTax: newCalculatedTax,
        underReportPenalty: newFinalize.underReportPenalty,
        latePaymentPenalty: newFinalize.latePaymentPenalty,
        electronicFilingCredit: newFinalize.electronicFilingCredit,
        finalTax: newFinalize.finalTax,
        localIncomeTax: newFinalize.localIncomeTax,
      };
    } else {
      // 기타자산 그룹: realEstateGroupBasicDeductionUsed로 직접 제어
      const adjustedInput: StockTransferInput = {
        ...input,
        realEstateGroupBasicDeductionUsed: otherAssetUsed,
      };
      const recalc = calculateStockTransferTaxInternal(adjustedInput);
      otherAssetUsed += recalc.basicDeduction;
      return recalc;
    }
  });

  const totalTransferIncome = processedItems.reduce((s, r) => s + r.transferIncome, 0);
  const totalCalculatedTax = processedItems.reduce((s, r) => s + r.calculatedTax, 0);
  const totalUnderReportPenalty = processedItems.reduce((s, r) => s + r.underReportPenalty, 0);

  // 전자신고 공제는 합산 1회
  const anyElectronic = inputs.some((inp) => inp.isElectronicFiling);
  const electronicFilingCredit = anyElectronic && totalCalculatedTax > 0 ? 20_000 : 0;

  const totalFinalTax = Math.max(
    0,
    floorTen(totalCalculatedTax + totalUnderReportPenalty - electronicFilingCredit),
  );
  const totalLocalIncomeTax = Math.floor((totalCalculatedTax * 0.10) / 10) * 10;

  return {
    items: processedItems,
    totalTransferIncome,
    basicDeductionByGroup: {
      stock: stockBasicDeduction,
      real_estate_and_other_asset: otherAssetBasicDeduction,
    },
    totalTaxBase: processedItems.reduce((s, r) => s + r.taxBase, 0),
    totalCalculatedTax,
    totalUnderReportPenalty,
    electronicFilingCredit,
    totalFinalTax,
    totalLocalIncomeTax,
    totalSecuritiesTransactionTax: sumSecuritiesTransactionTax(processedItems),
  };
}
