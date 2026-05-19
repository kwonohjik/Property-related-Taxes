/**
 * 해외주식 양도소득세 — 순수 엔진 (PR-4A)
 *
 * 법령: 소득세법 §94①3다목 + §118의2~§118의8 (2026.4.21. 시행)
 * 시행령: §157의3, §178의3, §178의5, §178의7
 *
 * 계산 흐름:
 *   STEP 1: 납세의무 확인 (§118의2 — 5년 이상 거주자)
 *   STEP 2: 양도가액 원화 환산 (§178의5)
 *   STEP 3: 취득가액 원화 환산 (§178의5)
 *   STEP 4: 필요경비 원화 환산 (§118의4)
 *   STEP 5: 외국납부세액 필요경비 산입 처리 (foreignTaxMethod="expense" 시)
 *   STEP 6: 양도차익 (§118의8 §95 준용 단서 — LTHD 미적용)
 *   STEP 7: 기본공제 §118의7 250만원 (§103①·§118의10④와 별도 그룹)
 *   STEP 8: 과세표준
 *   STEP 9: §118의5 → §55① 6~45% 8구간 누진세율
 *   STEP 10: 외국납부세액공제 §118의6 (credit 선택 시)
 *   STEP 11: 지방소득세 §103의3 10원 미만 절사
 *   STEP 12: 최종 결과 조립
 */

import type { ForeignStockInput, ForeignStockResult } from "./types/foreign-stock.types";
import { BASIC_PROGRESSIVE_BRACKETS } from "./stock-rate-tables";
import {
  STOCK_FOREIGN,
  STOCK_FOREIGN_BASIC_DEDUCTION,
  STOCK_FOREIGN_RESIDENT_MIN_YEARS,
} from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 내부 상수
// ============================================================

/** §118의7 기본공제 250만원 (국내 §103①2호·국외전출세 §118의10④와 별도) */
const BASIC_DEDUCTION_AMOUNT = STOCK_FOREIGN_BASIC_DEDUCTION;

/** §118의2 납세의무 요건 — 5년 이상 거주자 */
const MIN_RESIDENT_YEARS = STOCK_FOREIGN_RESIDENT_MIN_YEARS;

// ============================================================
// 내부 유틸: 누진세율 적용 (§55① 8구간)
// ============================================================

/**
 * §118의5 → §55① 준용 누진세율 적용
 * BASIC_PROGRESSIVE_BRACKETS (6~45% 8구간) 재사용
 */
function applyBasicProgressiveTax(taxBase: number): {
  rate: number;
  progressiveDeduction: number;
  tax: number;
} {
  if (taxBase <= 0) return { rate: 0, progressiveDeduction: 0, tax: 0 };

  for (const bracket of BASIC_PROGRESSIVE_BRACKETS) {
    const max = bracket.max ?? Infinity;
    if (taxBase <= max) {
      const rawTax = Math.floor(taxBase * bracket.rate) - bracket.deduction;
      return {
        rate: bracket.rate,
        progressiveDeduction: bracket.deduction,
        tax: Math.max(0, rawTax),
      };
    }
  }

  // 최고 구간 (45%)
  const last = BASIC_PROGRESSIVE_BRACKETS[BASIC_PROGRESSIVE_BRACKETS.length - 1];
  const rawTax = Math.floor(taxBase * last.rate) - last.deduction;
  return {
    rate: last.rate,
    progressiveDeduction: last.deduction,
    tax: Math.max(0, rawTax),
  };
}

/** 10원 미만 절사 (§47③ 준용 — 지방소득세) */
function floorTen(n: number): number {
  return Math.floor(n / 10) * 10;
}

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * 해외주식 양도소득세 계산 (§118의2~§118의8)
 *
 * @param input ForeignStockInput — Date는 route handler에서 coerceDates 완료된 상태
 * @returns ForeignStockResult
 */
export function calculateForeignStockTax(input: ForeignStockInput): ForeignStockResult {
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  // ──────────────────────────────────────────────────────────
  // STEP 1: 납세의무 확인 (§118의2 — 거주 기간 5년 이상)
  // ──────────────────────────────────────────────────────────
  if (input.yearsResidentInKorea < MIN_RESIDENT_YEARS) {
    return {
      taxCategory: "not_liable",
      isLiable: false,
      ineligibleReason: `국내 거주기간 ${input.yearsResidentInKorea}년 — §118의2 납세의무 미충족 (5년 이상 거주자만 과세)`,
      transferPriceKrw: 0,
      acquisitionPriceKrw: 0,
      necessaryExpensesKrw: 0,
      transferGain: 0,
      basicDeduction: 0,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      incomeTax: 0,
      localIncomeTax: 0,
      finalTax: 0,
      finalLocalTax: 0,
      totalTax: 0,
      transferExchangeRate: input.transferExchangeRate,
      acquisitionExchangeRate: input.acquisitionExchangeRate,
      shareCount: input.shareCount,
      warnings: ["§118의2 납세의무 미충족 — 거주기간 5년 미만"],
      appliedRules: [STOCK_FOREIGN.SECTION_118_2_RESIDENT_REQUIREMENT],
    };
  }

  appliedRules.push(STOCK_FOREIGN.SECTION_118_2_RESIDENT_REQUIREMENT);

  // ──────────────────────────────────────────────────────────
  // STEP 2: 양도가액 원화 환산 (§178의5 — 양도일 기준환율)
  // ──────────────────────────────────────────────────────────
  let transferPriceKrw: number;
  if (input.transferPriceMode === "total") {
    // 총액 직접 입력 → 환산
    const totalForeign = input.totalTransferPriceForeign ?? 0;
    transferPriceKrw = Math.floor(totalForeign * input.transferExchangeRate);
  } else {
    // 1주당 단가 × 주식수 → 환산
    const perShare = input.perShareTransferPriceForeign ?? 0;
    transferPriceKrw = Math.floor(perShare * input.shareCount * input.transferExchangeRate);
  }
  appliedRules.push(STOCK_FOREIGN.SECTION_178_5_FX_RATE);

  // ──────────────────────────────────────────────────────────
  // STEP 3: 취득가액 원화 환산 (§178의5 — 취득일 기준환율)
  // ──────────────────────────────────────────────────────────
  let acquisitionPriceKrw: number;
  if (input.acquisitionMode === "actual") {
    const perShareAcq = input.perShareAcquisitionPriceForeign ?? 0;
    acquisitionPriceKrw = Math.floor(
      perShareAcq * input.shareCount * input.acquisitionExchangeRate,
    );
  } else {
    // market_price: §178의3 시가 산정 — v1에서는 사용자 직접 입력값으로 수신
    // (perShareAcquisitionPriceForeign에 §178의3 적용 시가를 입력)
    const perShareMkt = input.perShareAcquisitionPriceForeign ?? 0;
    acquisitionPriceKrw = Math.floor(
      perShareMkt * input.shareCount * input.acquisitionExchangeRate,
    );
    warnings.push("§178의3 시가 산정: 사용자 입력값 사용. 외국정부 평가가액 → 상증법§63 준용 시가 순위 적용 확인 필요");
    appliedRules.push(STOCK_FOREIGN.SECTION_178_3_MARKET_PRICE);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 4: 필요경비 원화 환산 (§118의4 — 지출일 환율, 근사치로 양도일 환율 사용)
  // ──────────────────────────────────────────────────────────
  // v1: 자본적지출·양도비는 양도일 기준환율로 환산 (지출일 환율 미입력 시 근사치)
  const capitalExpKrw = Math.floor(
    input.capitalExpenditureForeign * input.transferExchangeRate,
  );
  const transferCostKrw = Math.floor(
    input.transferCostForeign * input.transferExchangeRate,
  );

  // ──────────────────────────────────────────────────────────
  // STEP 5: 외국납부세액 처리 (§118의6)
  // ──────────────────────────────────────────────────────────
  let foreignTaxPaidKrw = 0;
  let foreignTaxExpenseApplied: number | undefined;

  if (input.hasForeignTax && input.foreignTaxPaidForeign != null) {
    const fxRate = input.foreignTaxExchangeRate ?? input.transferExchangeRate;
    foreignTaxPaidKrw = Math.floor(input.foreignTaxPaidForeign * fxRate);
    appliedRules.push(STOCK_FOREIGN.SECTION_178_7_FOREIGN_TAX_SCOPE);
  }

  // 필요경비 산입 선택 시 — 취득가액 계산에 앞서 필요경비에 포함
  let extraExpenseFromForeignTax = 0;
  if (input.foreignTaxMethod === "expense" && foreignTaxPaidKrw > 0) {
    extraExpenseFromForeignTax = foreignTaxPaidKrw;
    foreignTaxExpenseApplied = foreignTaxPaidKrw;
    appliedRules.push(STOCK_FOREIGN.SECTION_118_6_EXPENSE_METHOD);
  }

  const necessaryExpensesKrw = capitalExpKrw + transferCostKrw + extraExpenseFromForeignTax;

  // ──────────────────────────────────────────────────────────
  // STEP 6: 양도차익 (§118의8 §95 준용 — LTHD 미적용 명문)
  // ──────────────────────────────────────────────────────────
  const transferGain = transferPriceKrw - acquisitionPriceKrw - necessaryExpensesKrw;
  appliedRules.push(STOCK_FOREIGN.SECTION_118_8_NO_LTHD);

  if (transferGain < 0) {
    warnings.push(`양도손실 발생 (${transferGain.toLocaleString()}원) — 동일 과세기간 다른 해외주식 양도차익과 통산 가능`);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 7: 기본공제 §118의7 250만원
  // (§103①2호 국내주식 그룹·§118의10④ 국외전출세 그룹과 별도)
  // ──────────────────────────────────────────────────────────
  // 손실 시 기본공제 0 처리
  const basicDeduction = transferGain > 0
    ? Math.min(BASIC_DEDUCTION_AMOUNT, transferGain)
    : 0;
  appliedRules.push(STOCK_FOREIGN.SECTION_118_7_BASIC_DEDUCTION);

  // ──────────────────────────────────────────────────────────
  // STEP 8: 과세표준
  // ──────────────────────────────────────────────────────────
  const taxBase = Math.max(0, transferGain - basicDeduction);

  // ──────────────────────────────────────────────────────────
  // STEP 9: §118의5 → §55① 누진세율 적용 (6~45% 8구간)
  // ──────────────────────────────────────────────────────────
  const { rate, progressiveDeduction, tax: incomeTax } = applyBasicProgressiveTax(taxBase);
  appliedRules.push(STOCK_FOREIGN.SECTION_118_5_TAX_RATE);

  // ──────────────────────────────────────────────────────────
  // STEP 10: 외국납부세액공제 §118의6 (credit 선택 시)
  // ──────────────────────────────────────────────────────────
  let foreignTaxCreditLimit: number | undefined;
  let foreignTaxCreditApplied: number | undefined;

  if (input.foreignTaxMethod === "credit" && input.hasForeignTax && foreignTaxPaidKrw > 0) {
    // 단일 국외자산 → 한도 = 산출세액 전액
    // (복수 자산 합산 시: 한도 = 산출세액 × 해외원천소득 / 총소득 — v1 단건)
    foreignTaxCreditLimit = incomeTax;
    foreignTaxCreditApplied = Math.min(foreignTaxPaidKrw, foreignTaxCreditLimit);
    appliedRules.push(STOCK_FOREIGN.SECTION_118_6_CREDIT_METHOD);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 11: 지방소득세 §103의3 (10원 미만 절사)
  // ──────────────────────────────────────────────────────────
  // 지방소득세 = (산출세액 - 외국납부세액공제) × 10%
  const taxAfterCredit = incomeTax - (foreignTaxCreditApplied ?? 0);
  const localIncomeTax = floorTen(taxAfterCredit * 0.1);

  // ──────────────────────────────────────────────────────────
  // STEP 12: 최종 납부세액
  // ──────────────────────────────────────────────────────────
  const finalTax = taxAfterCredit;
  const finalLocalTax = localIncomeTax;
  const totalTax = finalTax + finalLocalTax;

  return {
    taxCategory: "foreign_stock",
    isLiable: true,

    transferPriceKrw,
    acquisitionPriceKrw,
    necessaryExpensesKrw,
    transferGain,

    basicDeduction,
    taxBase,

    appliedRate: rate,
    progressiveDeduction,
    incomeTax,
    localIncomeTax,

    foreignTaxCreditLimit,
    foreignTaxCreditApplied,
    foreignTaxPaidKrw: foreignTaxPaidKrw > 0 ? foreignTaxPaidKrw : undefined,
    foreignTaxExpenseApplied,

    finalTax,
    finalLocalTax,
    totalTax,

    // 산식 echo
    transferExchangeRate: input.transferExchangeRate,
    acquisitionExchangeRate: input.acquisitionExchangeRate,
    foreignTaxExchangeRate: input.foreignTaxExchangeRate,
    shareCount: input.shareCount,

    warnings,
    appliedRules,
  };
}
