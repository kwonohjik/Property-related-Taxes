/**
 * 상속·증여 자산 취득가액 산정 Pure Engine
 *
 * 양도소득세 계산 시 상속·증여로 취득한 자산의 취득가액은 해당 자산의
 * 상속개시일(또는 증여일) 현재 상증법상 평가가액(보충적평가액 포함)으로 본다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수. 정수 연산(원 단위).
 *
 * 근거 조문:
 *   - 소득세법 §97 — 양도소득 필요경비
 *   - 소득세법 시행령 §163 ⑨ — 상속·증여 자산 취득가액 의제
 *     (TRANSFER.ACQ_INHERITED_SUPPLEMENTARY)
 *   - 상증법 §60 — 평가의 원칙 (시가주의 + 보충적평가)
 *   - 상증법 §61 — 부동산 보충적평가 방법
 *
 * 평가 우선순위 (상증법 §60 ① · ⑤):
 *   1. 시가 (marketValue)
 *   2. 2개 이상 감정평가액 평균 (appraisalAverage)
 *   3. 보충적평가액 (supplementary)
 *        - 토지: 개별공시지가(원/㎡) × 면적
 *        - 주택: 개별주택가격 or 공동주택가격 (총액 그대로)
 */

import { TRANSFER } from "./legal-codes";
import type {
  InheritanceAcquisitionInput,
  InheritanceAcquisitionResult,
  InheritanceAssetKind,
  InheritanceAcquisitionMethod,
} from "./types/inheritance-acquisition.types";

export type {
  InheritanceAcquisitionInput,
  InheritanceAcquisitionResult,
  InheritanceAssetKind,
  InheritanceAcquisitionMethod,
} from "./types/inheritance-acquisition.types";

export function calculateInheritanceAcquisitionPrice(
  input: InheritanceAcquisitionInput,
): InheritanceAcquisitionResult {
  const { assetKind, landAreaM2, publishedValueAtInheritance, marketValue, appraisalAverage } = input;

  // 입력 검증
  if (assetKind === "land" && (!landAreaM2 || landAreaM2 <= 0)) {
    throw new Error("토지는 landAreaM2(㎡)가 필수입니다");
  }
  if (publishedValueAtInheritance < 0) {
    throw new Error("publishedValueAtInheritance는 0 이상이어야 합니다");
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
  const supplementary = computeSupplementary(assetKind, publishedValueAtInheritance, landAreaM2);
  return {
    acquisitionPrice: supplementary.amount,
    method: "supplementary",
    legalBasis: `${TRANSFER.ACQ_INHERITED_SUPPLEMENTARY} · 상증법 §61`,
    formula: supplementary.formula,
  };
}

function computeSupplementary(
  assetKind: InheritanceAssetKind,
  publishedValue: number,
  landAreaM2: number | undefined,
): { amount: number; formula: string } {
  if (assetKind === "land") {
    // 개별공시지가 × 면적
    const area = landAreaM2 ?? 0;
    const amount = Math.floor(publishedValue * area);
    return {
      amount,
      formula: `개별공시지가 ${publishedValue.toLocaleString()}원/㎡ × ${area}㎡ = ${amount.toLocaleString()}원`,
    };
  }

  // 주택(개별 또는 공동): 공시가격 총액 그대로
  const amount = Math.floor(publishedValue);
  const label = assetKind === "house_individual" ? "개별주택가격" : "공동주택가격";
  return {
    amount,
    formula: `${label} ${amount.toLocaleString()}원 적용`,
  };
}
