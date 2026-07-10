/**
 * 주식 양도세 split 모드 sub-lot 세율 적용 헬퍼 (stock-transfer-tax.ts 800줄 정책 분리)
 *
 * 세율 적용은 정상경로(applyStockTaxRate, stock-transfer-rate-calc.ts)와 동일 분기:
 * - 대주주(listed_major/unlisted_major): §104①11 가목. 단기 30%(가목 1)는 '중소기업 외'
 *   대주주에만, 중소기업 대주주·장기분은 가목 2) 누진(집계 과세표준 1회 적용).
 * - 기타자산(other_asset_*): §55 8단계 누진 (집계 과세표준 1회 적용).
 * - 비대주주(§104①11 나목): 단일 세율 (중소 10% / 비중소 20%).
 * 단기/장기 혼합(비중소 대주주)만 taxBase를 차익비율로 두 그룹에 안분해 각 1회 적용.
 */

import type { LotMatchingDetail, StockTransferResult } from "./types/stock-transfer.types";
import {
  STOCK_SHORT_TERM_RATE,
  STOCK_NON_MAJOR_SME_RATE,
  STOCK_NON_MAJOR_NON_SME_RATE,
} from "@/lib/tax-engine/legal-codes/stock";
import { STOCK_MAJOR_PROGRESSIVE_BRACKETS, BASIC_PROGRESSIVE_BRACKETS } from "./stock-rate-tables";

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

/**
 * 누진세율 계산 (brackets 기반) — stock-transfer-rate-calc.ts calcProgressiveTaxFromBrackets와
 * 동일 산식(세율×금액 직후 floor → 누진공제 차감 → max(0)). deduction은 정수이므로
 * floor(x·rate) − d ≡ floor(x·rate − d). 집계 과세표준에 1회만 적용.
 */
function progressiveTaxFromBrackets(
  taxBase: number,
  brackets: readonly { max?: number; rate: number; deduction: number }[],
): number {
  if (taxBase <= 0) return 0;
  for (const bracket of brackets) {
    if (bracket.max === undefined || taxBase <= bracket.max) {
      return Math.max(0, Math.floor(taxBase * bracket.rate) - bracket.deduction);
    }
  }
  return 0;
}

export function calcSplitModeTax(
  taxBase: number,
  lotDetail: LotMatchingDetail,
  taxCategory: StockTransferResult["taxCategory"],
  isSME: boolean,
): SplitModeTaxResult {
  if (taxBase <= 0 || lotDetail.totalGain <= 0) {
    return { calculatedTax: 0, isMixedRate: false };
  }

  const isMajor = taxCategory === "listed_major" || taxCategory === "unlisted_major";

  // 기타자산(§94①4 다·라목) — §55 8단계 누진, 집계 과세표준 1회 적용 (보유기간 무관)
  if (taxCategory === "other_asset_block_shareholder" || taxCategory === "other_asset_heavy_re") {
    return {
      calculatedTax: progressiveTaxFromBrackets(taxBase, BASIC_PROGRESSIVE_BRACKETS),
      isMixedRate: false,
    };
  }

  if (!isMajor) {
    // 비대주주 — 단일 세율 (sub-lot 분기 무관, §104①11호 나목).
    // 3개 비대주주 범주 + 중소기업 → 나목 1) 10%. (비과세·스코프외 카테고리는 종전 echo 동작 유지)
    const rate =
      NON_MAJOR_SINGLE_RATE_CATEGORIES.has(taxCategory) && isSME
        ? STOCK_NON_MAJOR_SME_RATE // 나목 1) 중소기업 10%
        : STOCK_NON_MAJOR_NON_SME_RATE; // 나목 2) 비중소기업 20%
    return {
      calculatedTax: Math.floor(taxBase * rate),
      isMixedRate: false,
    };
  }

  // 대주주(listed_major/unlisted_major) — §104①11 가목.
  // 중소기업 대주주는 단기·장기 무관 가목 2) 누진 (가목 1) 30%은 '중소기업 외'만).
  if (isSME) {
    return {
      calculatedTax: progressiveTaxFromBrackets(taxBase, STOCK_MAJOR_PROGRESSIVE_BRACKETS),
      isMixedRate: false,
    };
  }

  // 비중소기업 대주주 — 단기 그룹 30%(가목 1) + 장기 그룹 누진(가목 2, 집계 과세표준 1회).
  // taxBase를 양수 차익 비율로 단기/장기 그룹에 안분, 잔차는 장기 흡수
  // ([[feedback_floor_residual_absorption]]). 손실 sub-lot 제외 → 양수합 분모로 0~taxBase 보장.
  let shortGain = 0;
  let longGain = 0;
  for (const sub of lotDetail.matched) {
    if (sub.perLotGain <= 0) continue;
    if (sub.isShortTerm) shortGain += sub.perLotGain;
    else longGain += sub.perLotGain;
  }
  const positiveTotal = shortGain + longGain;
  if (positiveTotal <= 0) {
    // 방어 — 양수 차익 부재 (lotDetail.totalGain > 0 이면 도달 불가)
    return {
      calculatedTax: progressiveTaxFromBrackets(taxBase, STOCK_MAJOR_PROGRESSIVE_BRACKETS),
      isMixedRate: false,
    };
  }
  const shortBase = Math.floor((taxBase * shortGain) / positiveTotal);
  const longBase = taxBase - shortBase; // 잔차 장기 흡수
  const shortTax = Math.floor(shortBase * STOCK_SHORT_TERM_RATE); // 가목 1) 단기 30%
  const longTax = progressiveTaxFromBrackets(longBase, STOCK_MAJOR_PROGRESSIVE_BRACKETS); // 가목 2)
  const isMixedRate = shortGain > 0 && longGain > 0;
  return {
    calculatedTax: shortTax + longTax,
    isMixedRate,
    mixedNote: isMixedRate ? "sub-lot별 세율 상이 (lotMatchingDetail 참조)" : undefined,
  };
}
