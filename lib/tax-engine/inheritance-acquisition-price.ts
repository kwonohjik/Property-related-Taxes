/**
 * 상속·증여 자산 취득가액 산정 Pure Engine
 *
 * 양도소득세 계산 시 상속·증여로 취득한 자산의 취득가액은 상속개시일(또는 증여일)
 * 현재 상증법상 평가가액으로 한다. 단, 의제취득일(1985.1.1.) 전 상속 자산은
 * max(환산가액, 취득실가×물가상승률)을 취득가액으로 할 수 있다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수. 정수 연산(원 단위).
 *
 * 근거 조문:
 *   - 소득세법 §97 — 양도소득 필요경비
 *   - 소득세법 시행령 §163 ⑨ — 상속·증여 자산 취득가액 의제 (의제취득일 이후)
 *   - 소득세법 시행령 §176조의2 ④ — 의제취득일 전 상속: max(환산가액, 취득실가×물가상승률)
 *   - 상증법 §60 — 평가의 원칙 (시가주의 + 보충적평가)
 *   - 상증법 §61 — 부동산 보충적평가 방법
 */

import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { TRANSFER } from "./legal-codes";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import { getCpiRatio, getCpiAnnual, CPI_MIN_YEAR, CPI_MAX_YEAR } from "./data/cpi-rates";
import type {
  InheritanceAcquisitionInput,
  InheritanceAcquisitionResult,
  InheritanceAssetKind,
  InheritanceAcquisitionMethod,
  PreDeemedBreakdown,
} from "./types/inheritance-acquisition.types";

export type {
  InheritanceAcquisitionInput,
  InheritanceAcquisitionResult,
  InheritanceAssetKind,
  InheritanceAcquisitionMethod,
  PreDeemedBreakdown,
} from "./types/inheritance-acquisition.types";

// ─── 진입점 ────────────────────────────────────────────────────────────────

export function calculateInheritanceAcquisitionPrice(
  input: InheritanceAcquisitionInput,
): InheritanceAcquisitionResult {
  validateInput(input);

  const isPreDeemed =
    input.inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime();

  if (isPreDeemed) return calcPreDeemed(input);
  return calcPostDeemed(input);
}

// ─── 입력 검증 ─────────────────────────────────────────────────────────────

function validateInput(input: InheritanceAcquisitionInput): void {
  if (!input.inheritanceDate) {
    throw new Error("inheritanceDate가 필수입니다");
  }
  if (input.publishedValueAtInheritance !== undefined && input.publishedValueAtInheritance < 0) {
    throw new Error("publishedValueAtInheritance는 0 이상이어야 합니다");
  }
  if (input.reportedValue !== undefined && input.reportedValue < 0) {
    throw new Error("reportedValue는 0 이상이어야 합니다");
  }
  // case A: 피상속인 실가 입증 시 취득일 필수
  if (
    input.decedentActualPrice !== undefined &&
    input.decedentActualPrice > 0 &&
    !input.decedentAcquisitionDate
  ) {
    throw new Error("피상속인 실지취득가액 입증 시 decedentAcquisitionDate가 필수입니다");
  }
}

// ─── Case A: 의제취득일(1985.1.1.) 전 상속 ────────────────────────────────

function calcPreDeemed(input: InheritanceAcquisitionInput): InheritanceAcquisitionResult {
  const warnings: string[] = [];

  // 1. 환산취득가: 양도가 × (의제취득일 기준시가 ÷ 양도시 기준시가)
  let converted = 0;
  if (
    input.transferPrice &&
    input.standardPriceAtDeemedDate &&
    input.standardPriceAtTransfer &&
    input.standardPriceAtTransfer > 0
  ) {
    converted = calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.standardPriceAtDeemedDate,
      input.standardPriceAtTransfer,
    );
  } else {
    warnings.push("환산취득가 산정 정보(양도가·기준시가)가 부족하여 환산가 = 0으로 처리됩니다");
  }

  // 2. 취득실가 × 물가상승률 (피상속인 실가 입증된 경우만)
  let inflationAdjusted: number | null = null;
  let cpiFromYear = 0;
  let cpiToYear = 0;
  let cpiRatio = 1;

  if (
    input.decedentActualPrice &&
    input.decedentActualPrice > 0 &&
    input.decedentAcquisitionDate &&
    input.transferDate
  ) {
    cpiFromYear = input.decedentAcquisitionDate.getFullYear();
    cpiToYear = input.transferDate.getFullYear();

    const fromCpi = getCpiAnnual(cpiFromYear);
    const toCpi = getCpiAnnual(cpiToYear);
    if (fromCpi === null || toCpi === null) {
      warnings.push(
        `CPI 데이터 범위 외 (${cpiFromYear}~${cpiToYear}). 유효 범위: ${CPI_MIN_YEAR}~${CPI_MAX_YEAR}. 물가상승률 환산을 건너뜁니다.`,
      );
    } else {
      cpiRatio = getCpiRatio(input.decedentAcquisitionDate, input.transferDate);
      inflationAdjusted = Math.floor(input.decedentActualPrice * cpiRatio);
    }
  }

  // 3. max(환산가, 실가×CPI) 선택
  const isInflationWin =
    inflationAdjusted !== null && inflationAdjusted > converted;
  const acquisitionPrice = Math.max(converted, inflationAdjusted ?? 0);

  if (acquisitionPrice === 0) {
    warnings.push("환산취득가와 물가상승률 산정 정보가 모두 부족합니다. 취득가 = 0으로 처리됩니다.");
  }

  const breakdown: PreDeemedBreakdown = {
    convertedAmount: converted,
    inflationAdjustedAmount: inflationAdjusted,
    selectedMethod: isInflationWin ? "inflation_adjusted" : "converted",
    cpiFromYear,
    cpiToYear,
    cpiRatio,
  };

  return {
    acquisitionPrice,
    method: "pre_deemed_max",
    legalBasis: `${TRANSFER.INHERITED_BEFORE_DEEMED} · ${TRANSFER.PRE1990_STD_PRICE_CONVERSION}`,
    formula: buildPreDeemedFormula(converted, inflationAdjusted, isInflationWin, cpiRatio, acquisitionPrice),
    preDeemedBreakdown: breakdown,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function buildPreDeemedFormula(
  converted: number,
  inflationAdjusted: number | null,
  isInflationWin: boolean,
  cpiRatio: number,
  acquisitionPrice: number,
): string {
  const lines: string[] = [];
  lines.push(`환산취득가: ${converted.toLocaleString()}원`);
  if (inflationAdjusted !== null) {
    const ratioStr = cpiRatio.toFixed(3);
    lines.push(`취득실가 × 물가상승률(${ratioStr}배): ${inflationAdjusted.toLocaleString()}원`);
  }
  const selectedLabel = isInflationWin ? "취득실가×물가상승률" : "환산취득가";
  lines.push(`→ 적용 (큰 금액, ${selectedLabel}): ${acquisitionPrice.toLocaleString()}원`);
  return lines.join("\n");
}

// ─── Case B: 의제취득일(1985.1.1.) 이후 상속 ─────────────────────────────

function calcPostDeemed(input: InheritanceAcquisitionInput): InheritanceAcquisitionResult {
  // 상속세 신고가액이 입력된 경우 그대로 취득가액으로 사용
  if (input.reportedValue !== undefined && input.reportedValue >= 0 && input.reportedMethod) {
    return {
      acquisitionPrice: Math.floor(input.reportedValue),
      method: input.reportedMethod,
      legalBasis: resolvePostDeemedLegalBasis(input.reportedMethod),
      formula: resolvePostDeemedFormula(input.reportedMethod, input.reportedValue),
    };
  }

  // 신고가액 미입력 — 기존 우선순위(시가→감정→보충) fallback (하위호환)
  return legacyFallback(input);
}

function resolvePostDeemedLegalBasis(method: InheritanceAcquisitionMethod): string {
  switch (method) {
    case "market_value":        return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ①`;
    case "appraisal":           return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ⑤`;
    case "auction_public_sale": return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ② (수용·경매·공매)`;
    case "similar_sale":        return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 시행령 §49 (유사매매사례)`;
    case "supplementary":       return `${TRANSFER.INHERITED_AFTER_DEEMED} · ${TRANSFER.INHERITANCE_VALUATION_PRINCIPLE}`;
    default:                    return TRANSFER.INHERITED_AFTER_DEEMED;
  }
}

function resolvePostDeemedFormula(method: InheritanceAcquisitionMethod, value: number): string {
  const v = value.toLocaleString();
  switch (method) {
    case "market_value":        return `매매사례가액 ${v}원 (상속세 신고가액) 적용`;
    case "appraisal":           return `감정평가액 ${v}원 (상속세 신고가액) 적용`;
    case "auction_public_sale": return `수용·경매·공매가액 ${v}원 (상속세 신고가액) 적용`;
    case "similar_sale":        return `유사매매사례가액 ${v}원 (상속세 신고가액) 적용`;
    case "supplementary":       return `보충적평가액 ${v}원 (상속세 신고가액) 적용`;
    default:                    return `상속세 신고가액 ${v}원 적용`;
  }
}

// ─── 기존 로직 fallback (하위호환) ────────────────────────────────────────

function legacyFallback(
  input: InheritanceAcquisitionInput,
): InheritanceAcquisitionResult {
  const { assetKind, landAreaM2, publishedValueAtInheritance, marketValue, appraisalAverage } = input;

  if (assetKind === "land" && (!landAreaM2 || landAreaM2 <= 0)) {
    throw new Error("토지는 landAreaM2(㎡)가 필수입니다");
  }

  // 우선순위 1: 시가
  if (marketValue !== undefined && marketValue > 0) {
    return {
      acquisitionPrice: Math.floor(marketValue),
      method: "market_value",
      legalBasis: "상증법 §60 ①",
      formula: `시가 ${marketValue.toLocaleString()}원 적용`,
    };
  }

  // 우선순위 2: 감정가 평균
  if (appraisalAverage !== undefined && appraisalAverage > 0) {
    return {
      acquisitionPrice: Math.floor(appraisalAverage),
      method: "appraisal",
      legalBasis: "상증법 §60 ⑤",
      formula: `감정평가액 평균 ${appraisalAverage.toLocaleString()}원 적용`,
    };
  }

  // 우선순위 3: 보충적평가액
  const supplementary = computeSupplementary(assetKind, publishedValueAtInheritance ?? 0, landAreaM2);
  return {
    acquisitionPrice: supplementary.amount,
    method: "supplementary",
    legalBasis: `${TRANSFER.ACQ_INHERITED_SUPPLEMENTARY} · 상증법 §61`,
    formula: supplementary.formula,
  };
}

// ─── 보충적평가 계산 ──────────────────────────────────────────────────────

function computeSupplementary(
  assetKind: InheritanceAssetKind,
  publishedValue: number,
  landAreaM2: number | undefined,
): { amount: number; formula: string } {
  if (assetKind === "land") {
    const area = landAreaM2 ?? 0;
    const amount = Math.floor(publishedValue * area);
    return {
      amount,
      formula: `개별공시지가 ${publishedValue.toLocaleString()}원/㎡ × ${area}㎡ = ${amount.toLocaleString()}원`,
    };
  }

  const amount = Math.floor(publishedValue);
  const label = assetKind === "house_individual" ? "개별주택가격" : "공동주택가격";
  return {
    amount,
    formula: `${label} ${amount.toLocaleString()}원 적용`,
  };
}
