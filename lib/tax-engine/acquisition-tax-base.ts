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

// 연부취득이 유효한 취득 원인 목록 (유상취득만 해당 — §6 제17호)
const ONEROUS_CAUSES = ["purchase", "exchange", "auction", "in_kind_investment"] as const;
type OnerousCause = typeof ONEROUS_CAUSES[number];

function isOnerousCause(cause: string): cause is OnerousCause {
  return (ONEROUS_CAUSES as readonly string[]).includes(cause);
}

// ============================================================
// 과세표준 결정 메인 함수
// ============================================================

/**
 * 취득세 과세표준 결정 (지방세법 §10~§10의5)
 *
 * 결정 우선순위:
 * 1. 부담부증여 → 유상/무상 분리 계산 (연부취득보다 우선)
 * 2. 연부취득 → 회차별 지급액 합산 (유상취득만 해당, 2년 이상 요건)
 * 3. 원시취득 → 공사비 또는 시가표준액
 * 4. 간주취득 → 별도 과세표준 전달
 * 5. 특수관계인 거래 → 시가인정액 vs 신고가 비교
 * 6. 무상취득 → 시가인정액 또는 시가표준액
 * 7. 일반 유상취득 → 사실상취득가격
 */
export function determineTaxBase(input: AcquisitionTaxInput): TaxBaseResult {
  const warnings: string[] = [];

  // ── 부담부증여 (§10의4) — 연부취득보다 우선 처리 ──
  if (input.acquisitionCause === "burdened_gift" && input.encumbrance && input.encumbrance > 0) {
    return calcBurdenedGiftTaxBase(input, warnings);
  }

  // ── 연부취득 (§10의5) ──
  if (input.installments && input.installments.length > 0) {
    // 비유상취득에 installments 입력된 경우 → 무시하고 일반 흐름으로 진행
    if (!isOnerousCause(input.acquisitionCause)) {
      warnings.push(
        `연부취득 입력이 있으나 취득 원인(${input.acquisitionCause})은 연부취득 대상이 아닙니다. 일반 과세표준으로 처리합니다.`
      );
      // installments 무시 — 아래 일반 흐름으로 계속 (return 없이 fall-through)
    } else {
      // 유상취득 연부취득 처리
      return calcInstallmentTaxBase(input, warnings);
    }
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
// 연부취득 과세표준 (§10의5)
// ============================================================

function calcInstallmentTaxBase(
  input: AcquisitionTaxInput,
  warnings: string[]
): TaxBaseResult {
  const installments = input.installments!;

  // 빈 배열 방어 (length > 0 보장되지만 명시적으로 처리)
  if (installments.length === 0) {
    // 빈 배열이면 일반 유상취득으로 처리
    const standardPriceResult = calcStandardPrice(
      input.propertyType,
      input.standardValue,
      input.standardPriceInput
    );
    warnings.push("연부취득 목록이 비어 있습니다. 일반 유상취득으로 처리합니다.");
    return calcOnerousTaxBase(input, standardPriceResult.standardValue, warnings);
  }

  // 단일 회차: §6 제17호 요건(2년 이상 분할 지급) 미충족 → 일반 매매 처리
  if (installments.length === 1) {
    warnings.push(
      `연부취득 회차가 1개입니다. §6 제17호상 연부취득은 2회 이상 분할 지급이어야 합니다. 일반 매매 과세표준으로 처리합니다.`
    );
    const totalAmount = installments[0].amount;
    const standardPriceResult = calcStandardPrice(
      input.propertyType,
      input.standardValue,
      input.standardPriceInput
    );
    return calcOnerousTaxBase(
      { ...input, installments: undefined, reportedPrice: totalAmount },
      standardPriceResult.standardValue,
      warnings
    );
  }

  // §6 제17호: 연부취득은 2년 이상 분할 지급이어야 함
  const firstDate = new Date(installments[0].paymentDate);
  const lastDate = new Date(installments[installments.length - 1].paymentDate);
  const diffYears = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  if (diffYears < ACQUISITION_CONST.INSTALLMENT_MIN_PERIOD_YEARS) {
    warnings.push(
      `연부취득 기간이 2년 미만입니다 (${diffYears.toFixed(1)}년). ` +
      `§6 제17호상 연부취득은 2년 이상 분할 지급이어야 합니다. ` +
      `일반 매매 과세표준으로 처리합니다.`
    );
    // 2년 미만 → 합산액을 reportedPrice로 보정해 일반 흐름
    const totalAmount = installments.reduce((s, p) => s + p.amount, 0);
    const standardPriceResult = calcStandardPrice(
      input.propertyType,
      input.standardValue,
      input.standardPriceInput
    );
    return calcOnerousTaxBase(
      { ...input, installments: undefined, reportedPrice: totalAmount },
      standardPriceResult.standardValue,
      warnings
    );
  }

  // 정상 연부취득: 합산 금액을 과세표준으로 사용
  const totalInstallment = installments.reduce((sum, p) => sum + p.amount, 0);

  // 특수관계인 + 연부취득: 시가표준액 70% 미달 경고 (§10의2)
  if (input.isRelatedParty) {
    const stdValue = input.standardValue ?? 0;
    if (stdValue > 0 && totalInstallment < Math.floor(stdValue * ACQUISITION_CONST.RELATED_PARTY_MIN_RATIO)) {
      warnings.push(
        `특수관계인 간 연부취득으로, 합산금액(${totalInstallment.toLocaleString()}이 ` +
        `시가표준액의 70%(${Math.floor(stdValue * ACQUISITION_CONST.RELATED_PARTY_MIN_RATIO).toLocaleString()}에 미달합니다. ` +
        `과세관청이 시가인정액으로 과세표준을 경정할 수 있습니다 (§10의2).`
      );
    }
  }

  // 시가표준액보다 낮은 합산금액 경고 (특수관계인 아닌 경우도)
  const stdValue = input.standardValue ?? 0;
  if (!input.isRelatedParty && stdValue > 0 && totalInstallment < stdValue) {
    warnings.push(
      `연부취득 합산금액(${totalInstallment.toLocaleString()}이 ` +
      `시가표준액(${stdValue.toLocaleString()}보다 낮습니다.`
    );
  }

  warnings.push(
    `연부취득(일괄 신고 기준): ${installments.length}회차 합산 ` +
    `${totalInstallment.toLocaleString()}원을 과세표준으로 사용합니다. ` +
    `각 회차마다 지급일로부터 60일 이내 별도 신고·납부 의무가 있습니다 (§10의5, §20⑤).`
  );

  return {
    method: "installment",
    taxBase: totalInstallment,
    rawTaxBase: totalInstallment,
    warnings,
    legalBasis: ACQUISITION.INSTALLMENT,
  };
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
      `신고가액(${input.reportedPrice.toLocaleString()}이 시가표준액(${standardValue.toLocaleString()} 미만입니다. 과세관청이 시가표준액으로 경정할 수 있습니다.`
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
    warnings.push(`무상취득 — 시가인정액(${input.marketValue.toLocaleString()} 적용`);
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
      `특수관계인 거래 — 신고가(${input.reportedPrice.toLocaleString()}가 시가(${marketBase.toLocaleString()}의 70%~130% 이내(정상 범위). 신고가 사용.`
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
    `특수관계인 거래 — 신고가(${input.reportedPrice.toLocaleString()}가 시가의 70% 미만이거나 130% 초과. 시가인정액(${marketBase.toLocaleString()}을 과세표준으로 사용합니다.`
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
    warnings.push("원시취득: 사실상 취득가액(공사비 + 부대비용)을 과세표준으로 사용합니다.");
    return {
      method: "construction_cost",
      taxBase: input.constructionCost,
      rawTaxBase: input.constructionCost,
      warnings,
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
      `채무액(${encumbrance.toLocaleString()}이 취득가액(${totalValue.toLocaleString()}을 초과합니다. 부담부증여 유상 부분을 취득가액 전액으로 처리합니다.`
    );
  }

  warnings.push(
    `부담부증여: 유상 부분(채무 ${encumbrance.toLocaleString()}) → 매매세율 / 무상 부분(${Math.max(0, totalValue - encumbrance).toLocaleString()}) → 증여세율`
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
