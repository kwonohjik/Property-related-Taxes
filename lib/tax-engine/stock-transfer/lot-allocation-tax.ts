/**
 * 주식 양도세 split 모드 sub-lot 세율 적용 헬퍼 (stock-transfer-tax.ts 800줄 정책 분리)
 *
 * basicDeduction 안분 산식: subLotTaxBase = floor(taxBase × subLotGain / totalGain)
 * - 음수 sub-lot 제외 (taxBase 안분 시 0)
 * - 대주주+비SME: 단기 30% / 누진 (§104①11호 가목 1)·2))
 * - 비대주주: 단일 세율 (§104①11호 나목)
 */

import type { LotMatchingDetail, StockTransferResult } from "./types/stock-transfer.types";
import {
  STOCK_SHORT_TERM_RATE,
  STOCK_NON_MAJOR_SME_RATE,
  STOCK_NON_MAJOR_NON_SME_RATE,
} from "@/lib/tax-engine/legal-codes/stock";
import { STOCK_MAJOR_PROGRESSIVE_BRACKETS } from "./stock-rate-tables";

export interface SplitModeTaxResult {
  calculatedTax: number;
  isMixedRate: boolean;
  mixedNote?: string;
}

/**
 * 비대주주 단일세율 적용 대상 taxCategory (§104①11호 나목)
 * - listed_otc_non_major: 코스닥 외 비대주주 (K-OTC 등)
 * - listed_off_market_non_major: 상장 장외 비대주주
 * - unlisted_non_major: 비상장 비대주주
 *
 * 정상 경로 applyStockTaxRate(stock-transfer-rate-calc.ts:135-137)와 동일한 3개 범주.
 * exact 비교 — substring/.includes 금지 ([[feedback_enum_substring_match_forbidden]]).
 */
const NON_MAJOR_SINGLE_RATE_CATEGORIES = new Set<StockTransferResult["taxCategory"]>([
  "listed_otc_non_major",
  "listed_off_market_non_major",
  "unlisted_non_major",
]);

export function calcSplitModeTax(
  taxBase: number,
  lotDetail: LotMatchingDetail,
  taxCategory: StockTransferResult["taxCategory"],
  isSME: boolean,
): SplitModeTaxResult {
  if (taxBase <= 0 || lotDetail.totalGain <= 0) {
    return { calculatedTax: 0, isMixedRate: false };
  }
  const isMajorAndNonSME =
    !isSME && (taxCategory === "listed_major" || taxCategory === "unlisted_major");

  if (!isMajorAndNonSME) {
    // 비대주주 — 단일 세율 (sub-lot 분기 무관, §104①11호 나목)
    // 3개 비대주주 범주(listed_otc/listed_off_market/unlisted) + 중소기업 → 나목 1) 10%
    // (정상 경로 applyStockTaxRate와 동일 — 범주 일부만 10% 적용하던 버그 수정)
    const rate =
      NON_MAJOR_SINGLE_RATE_CATEGORIES.has(taxCategory) && isSME
        ? STOCK_NON_MAJOR_SME_RATE // 나목 1) 중소기업 10%
        : STOCK_NON_MAJOR_NON_SME_RATE; // 나목 2) 비중소기업 20%
    return {
      calculatedTax: Math.floor(taxBase * rate),
      isMixedRate: false,
    };
  }

  // 대주주 + 비SME — sub-lot별 taxBase 안분 + 세율 적용
  let totalTax = 0;
  const ratesUsed = new Set<number>();
  for (const sub of lotDetail.matched) {
    if (sub.perLotGain <= 0) continue;
    const subTaxBase = Math.floor((taxBase * sub.perLotGain) / lotDetail.totalGain);
    if (sub.isShortTerm) {
      // §104①11호 가목 1) 단기 30%
      totalTax += Math.floor(subTaxBase * STOCK_SHORT_TERM_RATE);
      ratesUsed.add(STOCK_SHORT_TERM_RATE);
    } else {
      // §104①11호 가목 2) 누진 (3억 이하 20% / 초과 25%)
      for (const bracket of STOCK_MAJOR_PROGRESSIVE_BRACKETS) {
        if (bracket.max === undefined || subTaxBase <= bracket.max) {
          const subTax = Math.max(0, Math.floor(subTaxBase * bracket.rate - bracket.deduction));
          totalTax += subTax;
          ratesUsed.add(bracket.rate);
          break;
        }
      }
    }
  }
  return {
    calculatedTax: totalTax,
    isMixedRate: ratesUsed.size > 1,
    mixedNote: ratesUsed.size > 1 ? "sub-lot별 세율 상이 (lotMatchingDetail 참조)" : undefined,
  };
}
