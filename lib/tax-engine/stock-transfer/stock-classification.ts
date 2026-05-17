/**
 * 주식 양도소득세 — 시장·대주주·기타자산 분류 모듈
 *
 * STEP 1: 과세대상 판정 (§94①3·§94①4·§94②)
 * - 시장 분류
 * - 대주주 판정 (시기별 임계 §157)
 * - 비과세 분기
 * - §94② 우선순위
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { getMajorShareholderThreshold } from "./stock-rate-tables";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 분류 결과 타입
// ============================================================

export interface ClassificationResult {
  taxCategory: StockTransferResult["taxCategory"];
  appliedSection94: StockTransferResult["appliedSection94"];
  section94_2Applied: boolean;
  isExempt: boolean;
  exemptReason?: StockTransferResult["exemptReason"];
  basicDeductionGroup: StockTransferResult["basicDeductionGroup"];
  appliedRules: StockTransferResult["appliedRules"];
  warnings: string[];
  /** §157 적용된 임계 (대주주 판정 결과 표시용) */
  appliedThreshold?: { shareRatio: number; marketCap: number };
}

// ============================================================
// 대주주 판정 (시행령 §157)
// ============================================================

/**
 * 대주주 판정 — 시기별 임계 자동 적용
 * OR 조건: 지분율 임계 OR 시총 임계 중 하나라도 충족 시 대주주
 * 판정 기준일 = priorYearEndDate (직전 사업연도 종료일)
 */
function judgeIsMajorShareholder(input: StockTransferInput): {
  isMajor: boolean;
  threshold: { shareRatio: number; marketCap: number };
} {
  const { marketType, priorYearEndDate } = input;

  // 비상장·기타자산은 대주주 임계 무관 (전원 과세 또는 §94①4 기준)
  if (marketType === "unlisted" || marketType === "other_asset") {
    return {
      isMajor: input.isMajorShareholder,
      threshold: { shareRatio: 0, marketCap: 0 },
    };
  }

  const threshold = getMajorShareholderThreshold(
    marketType as "kospi" | "kosdaq" | "konex",
    priorYearEndDate,
  );

  // 적용 지분율·시총 결정 (2-step 판정)
  // 본인 단독 임계 우선, 미달 시 합산 적용
  const effectiveShareRatio = input.isLargestShareholderGroup
    ? Math.max(input.selfShareRatio, input.combinedShareRatio)
    : input.selfShareRatio;
  const effectiveMarketCap = input.isLargestShareholderGroup
    ? Math.max(input.selfMarketCap, input.combinedMarketCap)
    : input.selfMarketCap;

  const byRatio = effectiveShareRatio >= threshold.shareRatioThreshold;
  const byCap = effectiveMarketCap >= threshold.marketCapThreshold;

  return {
    isMajor: byRatio || byCap,
    threshold: {
      shareRatio: threshold.shareRatioThreshold,
      marketCap: threshold.marketCapThreshold,
    },
  };
}

// ============================================================
// 비과세 분기
// ============================================================

/**
 * 비과세 여부 판정
 * 1. 상장 비대주주 장내거래 (§94①3 가목 1) — 주된 비과세)
 * 2. K-OTC 중소·중견 소액주주 (§94①3 나목 단서)
 * 3. K-OTC 벤처기업 비대주주 (조특법 §14①7호)
 */
function judgeExemption(
  input: StockTransferInput,
  isMajor: boolean,
): { isExempt: boolean; reason?: StockTransferResult["exemptReason"] } {
  const { marketType, isKOTCTrading, isVentureCompany, isSmallMediumEnterprise, isMidsizeEnterprise, isListedSmallShareholder } = input;

  // 1. 상장 비대주주 장내거래 → 비과세
  if (
    (marketType === "kospi" || marketType === "kosdaq" || marketType === "konex") &&
    !isMajor &&
    !isKOTCTrading
  ) {
    return { isExempt: true, reason: "non_major_in_market" };
  }

  // 2. K-OTC + 중소·중견 소액주주 → §94①3 나목 단서 비과세
  if (
    isKOTCTrading &&
    (isSmallMediumEnterprise || isMidsizeEnterprise) &&
    isListedSmallShareholder
  ) {
    return { isExempt: true, reason: "kotc_sme_mid" };
  }

  // 3. K-OTC + 벤처기업 + 비대주주 → 조특법 §14①7호 비과세
  if (isKOTCTrading && isVentureCompany && !isMajor) {
    return { isExempt: true, reason: "kotc_venture" };
  }

  return { isExempt: false };
}

// ============================================================
// §94① 3호+4호 분류 + §94② 우선순위
// ============================================================

function classifySection94(
  input: StockTransferInput,
  isMajor: boolean,
): {
  taxCategory: StockTransferResult["taxCategory"];
  appliedSection94: StockTransferResult["appliedSection94"];
  section94_2Applied: boolean;
  basicDeductionGroup: StockTransferResult["basicDeductionGroup"];
} {
  const { marketType, isQualifyingBlockShareholder, isHeavyRealEstateForRate, isKOTCTrading } = input;

  // §94①4 해당 여부 (상장·비상장 모두 적용 가능)
  const hasSection94_4 = isQualifyingBlockShareholder || isHeavyRealEstateForRate;

  // §94①3 해당 여부
  const hasSection94_3 =
    marketType === "kospi" ||
    marketType === "kosdaq" ||
    marketType === "konex" ||
    marketType === "unlisted";

  // §94② 우선순위: 3호+4호 동시 충족 시 4호(기타자산) 강제
  if (hasSection94_3 && hasSection94_4) {
    const taxCategory: StockTransferResult["taxCategory"] = isQualifyingBlockShareholder
      ? "other_asset_block_shareholder"
      : "other_asset_heavy_re";
    const appliedSection94: StockTransferResult["appliedSection94"] = isQualifyingBlockShareholder
      ? "①4다"
      : "①4라";
    return {
      taxCategory,
      appliedSection94,
      section94_2Applied: true,
      // §94② 발동 시 기본공제 1호 그룹 (부동산 합산)
      basicDeductionGroup: "real_estate_and_other_asset",
    };
  }

  // §94①4 단독 (other_asset 직접 선택)
  if (marketType === "other_asset") {
    return {
      taxCategory: isQualifyingBlockShareholder
        ? "other_asset_block_shareholder"
        : "other_asset_heavy_re",
      appliedSection94: isQualifyingBlockShareholder ? "①4다" : "①4라",
      section94_2Applied: false,
      basicDeductionGroup: "real_estate_and_other_asset",
    };
  }

  // §94①3 분류
  if (marketType === "kospi" || marketType === "kosdaq" || marketType === "konex") {
    if (isMajor) {
      return {
        taxCategory: "listed_major",
        appliedSection94: "①3가1)",
        section94_2Applied: false,
        basicDeductionGroup: "stock",
      };
    }
    // 비대주주 — 장외(K-OTC) vs 장내
    if (isKOTCTrading) {
      return {
        taxCategory: "listed_otc_non_major",
        appliedSection94: "①3가2)",
        section94_2Applied: false,
        basicDeductionGroup: "stock",
      };
    }
    // 장내 비대주주 → 비과세 (exemption에서 처리되지만 분류는 여기서)
    return {
      taxCategory: "listed_non_major_in_market",
      appliedSection94: "①3가1)",
      section94_2Applied: false,
      basicDeductionGroup: "stock",
    };
  }

  // 비상장
  if (marketType === "unlisted") {
    return {
      taxCategory: isMajor ? "unlisted_major" : "unlisted_non_major",
      appliedSection94: "①3나_본문",
      section94_2Applied: false,
      basicDeductionGroup: "stock",
    };
  }

  // fallback (해외주식 등 스코프 외)
  return {
    taxCategory: "out_of_scope_foreign",
    appliedSection94: "①3나_본문",
    section94_2Applied: false,
    basicDeductionGroup: "stock",
  };
}

// ============================================================
// 메인 분류 함수
// ============================================================

export function classifyStockTransfer(input: StockTransferInput): ClassificationResult {
  const warnings: string[] = [];
  const appliedRules: StockTransferResult["appliedRules"] = [];

  // 해외주식 차단
  if (input.marketType === ("out_of_scope_foreign" as string)) {
    warnings.push(STOCK.SECTION_94_1_3_DA + " — 해외주식은 별도 도메인");
    return {
      taxCategory: "out_of_scope_foreign",
      appliedSection94: "①3나_본문",
      section94_2Applied: false,
      isExempt: false,
      basicDeductionGroup: "stock",
      appliedRules,
      warnings,
    };
  }

  // 대주주 판정
  const { isMajor, threshold } = judgeIsMajorShareholder(input);

  // §94① 분류
  const classResult = classifySection94(input, isMajor);

  // §94② 우선 적용 시 appliedRules에 추가
  if (classResult.section94_2Applied) {
    appliedRules.push("§94②우선");
    appliedRules.push("기타자산우선§55누진");
    if (classResult.basicDeductionGroup === "real_estate_and_other_asset") {
      appliedRules.push("기본공제부동산그룹합산");
    }
  }

  // 비과세 분기
  const exemptionResult = judgeExemption(input, isMajor);

  let taxCategory = classResult.taxCategory;
  let appliedSection94 = classResult.appliedSection94;

  if (exemptionResult.isExempt && exemptionResult.reason === "kotc_sme_mid") {
    taxCategory = "kotc_sme_mid_exempt";
    appliedSection94 = "①3나_단서";
    appliedRules.push("KOTC중소중견비과세");
  } else if (exemptionResult.isExempt && exemptionResult.reason === "kotc_venture") {
    taxCategory = "kotc_venture_exempt";
    appliedRules.push("KOTC벤처비과세");
  }

  return {
    taxCategory,
    appliedSection94,
    section94_2Applied: classResult.section94_2Applied,
    isExempt: exemptionResult.isExempt,
    exemptReason: exemptionResult.reason,
    basicDeductionGroup: classResult.basicDeductionGroup,
    appliedRules,
    warnings,
    appliedThreshold: threshold,
  };
}
