/**
 * 취득세 과세표준 결정 모듈
 *
 * 지방세법 §10 ~ §10의5
 * - §10   기본 원칙: 사실상취득가격
 * - §10의2 특수관계인 간 거래
 * - §10의3 시가표준액 적용 특례
 * - §10의4 부담부증여 과세표준
 * - §10의5 연부취득 과세표준
 *
 * 주의: 지방세법상 취득세 과세표준 절사 규정 없음 — 원 단위로 계산
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";
import { calcStandardPrice, shouldUseStandardPrice } from "./acquisition-standard-price";
import type {
  AcquisitionTaxInput,
  TaxBaseResult,
  TaxBaseMethod,
} from "./types/acquisition.types";

// ============================================================
// 과세표준 결정 메인 함수
// ============================================================

/**
 * 취득세 과세표준 결정 (지방세법 §10~§10의5)
 *
 * 결정 우선순위:
 * 1. 연부취득 → 회차별 지급액 합산
 * 2. 부담부증여 → 유상/무상 분리 계산
 * 3. 원시취득 → 공사비 또는 시가표준액
 * 4. 간주취득 → 별도 과세표준 전달
 * 5. 특수관계인 거래 → 시가인정액 vs 신고가 비교
 * 6. 무상취득 → 시가인정액 또는 시가표준액
 * 7. 일반 유상취득 → 사실상취득가격
 */
export function determineTaxBase(input: AcquisitionTaxInput): TaxBaseResult {
  const warnings: string[] = [];

  // ── 연부취득 (§10의5) ──
  if (input.installments && input.installments.length > 0) {
    const totalInstallment = input.installments.reduce((sum, p) => sum + p.amount, 0);
    return {
      method: "installment",
      taxBase: totalInstallment,
      rawTaxBase: totalInstallment,
      warnings: ["연부취득: 각 회차 지급액 합산을 과세표준으로 사용합니다."],
      legalBasis: ACQUISITION.INSTALLMENT,
    };
  }

  // ── 간주취득 (별도 과세표준 전달 필요) ──
  const isDeemedAcquisition = [
    "deemed_major_shareholder",
    "deemed_land_category",
    "deemed_renovation",
  ].includes(input.acquisitionCause);

  if (isDeemedAcquisition) {
    // 간주취득 과세표준은 acquisition-deemed.ts에서 계산된 값을 reportedPrice로 전달
    return {
      method: "deemed_difference",
      taxBase: input.reportedPrice,
      rawTaxBase: input.reportedPrice,
      warnings: ["간주취득: 전후 시가표준액 차액을 과세표준으로 사용합니다."],
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    };
  }

  // ── 부담부증여 (§10의4) ──
  if (input.acquisitionCause === "burdened_gift" && input.encumbrance && input.encumbrance > 0) {
    return calcBurdenedGiftTaxBase(input, warnings);
  }

  // ── 원시취득 (신축·증축·개축·매립) ──
  const isOriginalAcquisition = [
    "new_construction",
    "extension",
    "reconstruction",
    "reclamation",
  ].includes(input.acquisitionCause);

  if (isOriginalAcquisition) {
    return calcOriginalAcquisitionTaxBase(input, warnings);
  }

  // ── 시가표준액 결정 ──
  const standardPriceResult = calcStandardPrice(
    input.propertyType,
    input.standardValue,
    input.standardPriceInput
  );
  const standardValue = standardPriceResult.standardValue;
  warnings.push(...standardPriceResult.warnings);

  // ── 특수관계인 거래 (§10의2) ──
  if (input.isRelatedParty) {
    return calcRelatedPartyTaxBase(input, standardValue, warnings);
  }

  // ── 무상취득 (상속·증여·기부) ──
  const isGratuitous = [
    "inheritance",
    "inheritance_farmland",
    "gift",
    "donation",
  ].includes(input.acquisitionCause);

  if (isGratuitous) {
    return calcGratuitousTaxBase(input, standardValue, warnings);
  }

  // ── 일반 유상취득 (매매·공매경매·교환·현물출자) ──
  return calcOnerousTaxBase(input, standardValue, warnings);
}

// ============================================================
// 유상취득 과세표준 (§10)
// ============================================================

function calcOnerousTaxBase(
  input: AcquisitionTaxInput,
  standardValue: number,
  warnings: string[]
): TaxBaseResult {
  // 실거래가가 시가표준액보다 낮으면 경고 (과세관청이 시가표준액으로 경정 가능)
  if (input.reportedPrice < standardValue && standardValue > 0) {
    warnings.push(
      `신고가액(${input.reportedPrice.toLocaleString()}원)이 시가표준액(${standardValue.toLocaleString()}원) 미만입니다. 과세관청이 시가표준액으로 경정할 수 있습니다.`
    );
  }

  // 신고가가 없으면 시가표준액 사용
  const rawTaxBase = input.reportedPrice > 0 ? input.reportedPrice : standardValue;

  return {
    method: input.reportedPrice > 0 ? "actual_price" : "standard_value",
    taxBase: rawTaxBase,
    rawTaxBase,
    warnings,
    legalBasis: input.reportedPrice > 0 ? ACQUISITION.TAX_BASE : ACQUISITION.STANDARD_VALUE,
  };
}

// ============================================================
// 무상취득 과세표준 (§10의3)
// ============================================================

function calcGratuitousTaxBase(
  input: AcquisitionTaxInput,
  standardValue: number,
  warnings: string[]
): TaxBaseResult {
  const { useStandardPrice, reason } = shouldUseStandardPrice(
    input.acquisitionCause,
    input.reportedPrice,
    input.marketValue,
    standardValue
  );

  if (!useStandardPrice && input.marketValue && input.marketValue > 0) {
    // 시가인정액(매매사례가액·감정가) 사용 — 지방세법 §10의3(무상취득 시가표준액 특례)
    warnings.push(`무상취득 — 시가인정액(${input.marketValue.toLocaleString()}원) 적용`);
    return {
      method: "recognized_market",
      taxBase: input.marketValue,
      rawTaxBase: input.marketValue,
      warnings,
      legalBasis: ACQUISITION.STANDARD_VALUE, // §10의3 (§10의2 특수관계인 조항 아님)
    };
  }

  // 시가표준액 사용
  if (standardValue <= 0) {
    warnings.push("시가표준액이 0원입니다. 주택공시가격 또는 개별공시지가를 확인하세요.");
  }

  const rawTaxBase = standardValue > 0 ? standardValue : 0;

  warnings.push(reason);

  return {
    method: "standard_value",
    taxBase: rawTaxBase,
    rawTaxBase,
    warnings,
    legalBasis: ACQUISITION.STANDARD_VALUE,
  };
}

// ============================================================
// 특수관계인 거래 과세표준 (§10의2)
// ============================================================

function calcRelatedPartyTaxBase(
  input: AcquisitionTaxInput,
  standardValue: number,
  warnings: string[]
): TaxBaseResult {
  // 시가 기준 (시가인정액 또는 시가표준액)
  const marketBase = input.marketValue && input.marketValue > 0 ? input.marketValue : standardValue;

  if (marketBase <= 0) {
    warnings.push("특수관계인 거래 — 시가 산정 불가. 신고가액을 과세표준으로 사용합니다.");
    return {
      method: "actual_price",
      taxBase: input.reportedPrice,
      rawTaxBase: input.reportedPrice,
      warnings,
      legalBasis: ACQUISITION.RELATED_PARTY,
    };
  }

  // 정상가격 범위: 시가의 70%~130% (원 미만 버림으로 대칭 처리)
  const lowerBound = Math.floor(marketBase * ACQUISITION_CONST.RELATED_PARTY_MIN_RATIO);
  const upperBound = Math.floor(marketBase * ACQUISITION_CONST.RELATED_PARTY_MAX_RATIO);

  if (input.reportedPrice >= lowerBound && input.reportedPrice <= upperBound) {
    // 정상 거래 → 신고가 사용
    warnings.push(
      `특수관계인 거래 — 신고가(${input.reportedPrice.toLocaleString()}원)가 시가(${marketBase.toLocaleString()}원)의 70%~130% 이내(정상 범위). 신고가 사용.`
    );
    return {
      method: "actual_price",
      taxBase: input.reportedPrice,
      rawTaxBase: input.reportedPrice,
      warnings,
      legalBasis: ACQUISITION.RELATED_PARTY,
    };
  }

  // 비정상 거래 → 시가인정액 사용
  warnings.push(
    `특수관계인 거래 — 신고가(${input.reportedPrice.toLocaleString()}원)가 시가의 70% 미만이거나 130% 초과. 시가인정액(${marketBase.toLocaleString()}원)을 과세표준으로 사용합니다.`
  );
  return {
    method: "recognized_market",
    taxBase: marketBase,
    rawTaxBase: marketBase,
    warnings,
    legalBasis: ACQUISITION.RELATED_PARTY,
  };
}

// ============================================================
// 원시취득 과세표준 (§10 + 시행령 §18)
// ============================================================

function calcOriginalAcquisitionTaxBase(
  input: AcquisitionTaxInput,
  warnings: string[]
): TaxBaseResult {
  if (input.constructionCost && input.constructionCost > 0) {
    return {
      method: "construction_cost",
      taxBase: input.constructionCost,
      rawTaxBase: input.constructionCost,
      warnings: ["원시취득: 사실상 취득가액(공사비 + 부대비용)을 과세표준으로 사용합니다."],
      legalBasis: ACQUISITION.TAX_BASE,
    };
  }

  // 공사비 불명 → 시가표준액
  const standardPriceResult = calcStandardPrice(
    input.propertyType,
    input.standardValue,
    input.standardPriceInput
  );
  warnings.push(...standardPriceResult.warnings);
  warnings.push("원시취득 — 공사비 미입력. 시가표준액(완공 후 건물 기준시가)을 과세표준으로 사용합니다.");

  return {
    method: "standard_value",
    taxBase: standardPriceResult.standardValue,
    rawTaxBase: standardPriceResult.standardValue,
    warnings,
    legalBasis: ACQUISITION.STANDARD_VALUE,
  };
}

// ============================================================
// 부담부증여 과세표준 (§10의4)
// ============================================================

function calcBurdenedGiftTaxBase(
  input: AcquisitionTaxInput,
  warnings: string[]
): TaxBaseResult {
  const encumbrance = input.encumbrance ?? 0;

  // 전체 취득가액 결정
  const standardPriceResult = calcStandardPrice(
    input.propertyType,
    input.standardValue,
    input.standardPriceInput
  );
  warnings.push(...standardPriceResult.warnings);

  const totalValue =
    input.marketValue && input.marketValue > 0
      ? input.marketValue
      : standardPriceResult.standardValue > 0
      ? standardPriceResult.standardValue
      : input.reportedPrice;

  if (totalValue <= 0) {
    warnings.push("부담부증여 — 전체 취득가액 산정 불가. 신고가액을 사용합니다.");
  }

  // 유상 취득 부분 (채무액) — 매매세율 적용
  const onerousTaxBase = Math.min(encumbrance, totalValue);
  // 무상 취득 부분 (초과분) — 증여세율 적용
  const gratuitousTaxBase = Math.max(0, totalValue - encumbrance);

  // 채무액이 취득가액 초과: 과세 실무상 채무액을 취득가액으로 간주 (경고 표시)
  if (encumbrance > totalValue && totalValue > 0) {
    warnings.push(
      `채무액(${encumbrance.toLocaleString()}원)이 취득가액(${totalValue.toLocaleString()}원)을 초과합니다. 부담부증여 유상 부분을 취득가액 전액으로 처리합니다.`
    );
  }

  warnings.push(
    `부담부증여: 유상 부분(채무 ${encumbrance.toLocaleString()}원) → 매매세율 / 무상 부분(${Math.max(0, totalValue - encumbrance).toLocaleString()}원) → 증여세율`
  );

  return {
    method: "split_onerous",
    taxBase: onerousTaxBase + gratuitousTaxBase, // 합산 (세율 적용은 별도)
    rawTaxBase: totalValue,
    breakdown: {
      onerousTaxBase,
      gratuitousTaxBase,
    },
    warnings,
    legalBasis: ACQUISITION.BURDENED_GIFT,
  };
}
