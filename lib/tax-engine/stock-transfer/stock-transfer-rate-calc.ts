/**
 * 주식 양도소득세 — 세율 적용 모듈
 *
 * §104①11 가목·나목 분기 + §55 기타자산 누진
 * 단기 30% / 대주주 누진 / 비대주주 단일 / §55 누진 8단계
 */

import type { StockTransferResult } from "./types/stock-transfer.types";
import {
  STOCK_MAJOR_PROGRESSIVE_BRACKETS,
  BASIC_PROGRESSIVE_BRACKETS,
} from "./stock-rate-tables";
import {
  STOCK_SHORT_TERM_RATE,
  STOCK_NON_MAJOR_SME_RATE,
  STOCK_NON_MAJOR_NON_SME_RATE,
  STOCK,
} from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 세율 적용 결과 타입
// ============================================================

export interface RateCalcResult {
  appliedRate: number;
  progressiveDeduction?: number;
  calculatedTax: number;
  appliedRuleRef: string;
  isShortTermRate: boolean;
}

// ============================================================
// 내부 유틸: 누진세율 계산 (brackets 기반)
// ============================================================

function calcProgressiveTaxFromBrackets(
  taxBase: number,
  brackets: readonly { max?: number; rate: number; deduction: number }[],
): { rate: number; deduction: number; tax: number } {
  if (taxBase <= 0) return { rate: 0, deduction: 0, tax: 0 };

  for (const bracket of brackets) {
    const max = bracket.max ?? Infinity;
    if (taxBase <= max) {
      const tax = Math.floor(taxBase * bracket.rate) - bracket.deduction;
      return { rate: bracket.rate, deduction: bracket.deduction, tax: Math.max(0, tax) };
    }
  }

  // 최고 구간
  const last = brackets[brackets.length - 1];
  const tax = Math.floor(taxBase * last.rate) - last.deduction;
  return { rate: last.rate, deduction: last.deduction, tax: Math.max(0, tax) };
}

// ============================================================
// 메인: 세율 분기 적용
// ============================================================

/**
 * 과세표준에 세율 적용 — taxCategory 기반 분기
 *
 * PR-1 범위:
 *   listed_major / unlisted_major → 대주주 세율 (가목 1) 단기 30% / 가목 2) 누진)
 *   listed_otc_non_major / unlisted_non_major → 나목 (중소 10% / 비중소 20%)
 *   other_asset_* → §55 누진 8단계
 *   비과세 → 산출세액 0
 */
export function applyStockTaxRate(
  taxBase: number,
  taxCategory: StockTransferResult["taxCategory"],
  isSmallMediumEnterprise: boolean,
  isShortTermHolding: boolean,
  /**
   * 비과세 분기에서도 "가상의 적용 세율·산출세액"을 계산하기 위한 매핑.
   * - listed_non_major_in_market → listed_off_market_non_major (장외 비대주주 세율 동일)
   * - kotc_sme_mid_exempt / kotc_venture_exempt → listed_otc_non_major (나목 세율)
   * 최종 finalTax는 applyExemptZeroing에서 0으로 강제되지만, calculatedTax·appliedRate는 echo.
   */
  treatExemptAsTaxable: boolean = false,
): RateCalcResult {
  if (taxBase <= 0) {
    return {
      appliedRate: 0,
      calculatedTax: 0,
      appliedRuleRef: "과세표준 0 이하",
      isShortTermRate: false,
    };
  }

  // 비과세 → 과세 동등 카테고리 매핑 (산식 echo용)
  if (treatExemptAsTaxable) {
    if (taxCategory === "listed_non_major_in_market") {
      taxCategory = "listed_off_market_non_major";
    } else if (taxCategory === "kotc_sme_mid_exempt" || taxCategory === "kotc_venture_exempt") {
      taxCategory = "listed_otc_non_major";
    }
  }

  switch (taxCategory) {
    // --------------------------------------------------------
    // 비과세
    // --------------------------------------------------------
    case "listed_non_major_in_market":
    case "kotc_sme_mid_exempt":
    case "kotc_venture_exempt":
      return {
        appliedRate: 0,
        calculatedTax: 0,
        appliedRuleRef: "비과세",
        isShortTermRate: false,
      };

    // --------------------------------------------------------
    // 기타자산 §55 누진 8단계
    // --------------------------------------------------------
    case "other_asset_block_shareholder":
    case "other_asset_heavy_re": {
      const { rate, deduction, tax } = calcProgressiveTaxFromBrackets(
        taxBase,
        BASIC_PROGRESSIVE_BRACKETS,
      );
      return {
        appliedRate: rate,
        progressiveDeduction: deduction,
        calculatedTax: tax,
        appliedRuleRef: "소득세법 §55 누진세율 8단계",
        isShortTermRate: false,
      };
    }

    // --------------------------------------------------------
    // 상장 비대주주 장외 + 비상장 비대주주 → 나목 단일세율
    // --------------------------------------------------------
    case "listed_otc_non_major":
    case "listed_off_market_non_major":
    case "unlisted_non_major": {
      const rate = isSmallMediumEnterprise
        ? STOCK_NON_MAJOR_SME_RATE     // 중소기업 10%
        : STOCK_NON_MAJOR_NON_SME_RATE; // 비중소기업 20%
      const ruleRef = isSmallMediumEnterprise
        ? STOCK.SECTION_104_1_11_NA_1_SME
        : STOCK.SECTION_104_1_11_NA_2_NON_SME;
      return {
        appliedRate: rate,
        calculatedTax: Math.floor(taxBase * rate),
        appliedRuleRef: ruleRef,
        isShortTermRate: false,
      };
    }

    // --------------------------------------------------------
    // 대주주 (상장·비상장) — 가목 1) 단기 30% / 가목 2) 누진
    // --------------------------------------------------------
    case "listed_major":
    case "unlisted_major": {
      // §104①11 가목 1): 비중소기업 대주주 + 1년 미만 → 30%
      if (!isSmallMediumEnterprise && isShortTermHolding) {
        return {
          appliedRate: STOCK_SHORT_TERM_RATE,
          calculatedTax: Math.floor(taxBase * STOCK_SHORT_TERM_RATE),
          appliedRuleRef: STOCK.SECTION_104_1_11_GA_1_SHORT_TERM,
          isShortTermRate: true,
        };
      }
      // §104①11 가목 2): 그 외 대주주 → 누진 (3억 이하 20% / 초과 25%)
      const { rate, deduction, tax } = calcProgressiveTaxFromBrackets(
        taxBase,
        STOCK_MAJOR_PROGRESSIVE_BRACKETS,
      );
      return {
        appliedRate: rate,
        progressiveDeduction: deduction,
        calculatedTax: tax,
        appliedRuleRef: STOCK.SECTION_104_1_11_GA_2_PROGRESSIVE,
        isShortTermRate: false,
      };
    }

    // --------------------------------------------------------
    // 스코프 외 (외국법인 등) — validate에서 차단되어야 함
    // --------------------------------------------------------
    case "out_of_scope_foreign":
    default:
      return {
        appliedRate: 0,
        calculatedTax: 0,
        appliedRuleRef: "스코프 외 — validate에서 차단 필요",
        isShortTermRate: false,
      };
  }
}
