/**
 * 「소득세법」 §114조의2 — 신축·증축 건물 5년 이내 양도 가산세 (순수 함수).
 *
 * `transfer-tax-rate-calc.ts`에서 분리(2026-08-11 — §104① 후단 배선으로 811줄 초과, 800줄 정책).
 * 세율·세액 결정(§104)과는 **다른 축**이라 이음매가 자연스럽다 — 이쪽은 취득가액 산정방법
 * (환산·감정)에 붙는 제재이고, 저쪽은 과세표준에 곱할 세율을 고르는 일이다.
 *
 * ⚠️ 종전 import 경로(`./transfer-tax-rate-calc`)를 깨지 않도록 그쪽에서 **재수출**한다
 *   (memory `feedback_800line_split_export_preservation`).
 */

import { addYears } from "date-fns";
import { applyRate, calculateEstimatedAcquisitionPrice } from "./tax-utils";
import type { TransferTaxInput } from "./types/transfer.types";

export function calculateBuildingPenalty(
  input: TransferTaxInput,
  acquisitionPriceForPenalty: number,
): { penalty: number; note: string } | null {
  if (!input.isSelfBuilt) return null;

  const method = input.acquisitionMethod;
  const transferDate = input.transferDate;

  if (transferDate < new Date("2018-01-01")) return null;

  const isPenaltyMethod =
    method === "estimated" ||
    (method === "appraisal" && transferDate >= new Date("2020-01-01"));
  if (!isPenaltyMethod) return null;

  if (input.buildingType === "extension") {
    if (transferDate < new Date("2020-01-01")) return null;
    if ((input.extensionFloorArea ?? 0) <= 85) return null;
  }

  if (!input.constructionDate) return null;
  // §114조의2 ① "취득일부터 5년 이내" — "이내"는 당일 포함 해석.
  // 정확한 날짜 비교(addYears 5)로 윤년·30일/31일 월말 경계 안전 처리.
  // 예: 취득 2018-03-31 → 5년 시점 2023-03-31. 양도일이 ≤ 2023-03-31이면 발동, > 이면 미적용.
  // 기존 365.25 분모 방식은 윤년에서 부정확(예: 2020-02-29 + 5년 = 2025-02-28인데 1826일 / 365.25 = 4.9986).
  const fifthAnniversary = addYears(input.constructionDate, 5);
  if (transferDate.getTime() > fifthAnniversary.getTime()) return null;

  const penalty = applyRate(acquisitionPriceForPenalty, 0.05);
  const typeLabel = input.buildingType === "extension" ? "증축" : "신축";
  const methodLabel = method === "appraisal" ? "감정가액" : "환산취득가액";
  return {
    penalty,
    note: `${typeLabel} 5년 이내 양도 + ${methodLabel} 적용`,
  };
}

/**
 * §114조의2① 증축부분 한정 penalty base — 정상·손실 경로 공통 (single-source).
 * 통상(비-부담부) 환산(K-5) 양도에서 base를 증축부분 한정 환산취득가로 산출.
 *   증축부분 환산취득가 = 양도가 × (증축부분 취득기준시가 ÷ 양도시 건물 기준시가) — calculateEstimatedAcquisitionPrice 재사용.
 * - 부담부증여(transferType/acquisitionCause)는 step override가 effectiveInput.estimatedBase에 증축부분 base를 이미 실으므로 배제(fullBuildingBase 그대로).
 * - 신축·비환산·증축필드 미입력 시 fullBuildingBase(건물 전체) 유지.
 * finalize STEP 10.5(정상 이익)와 transfer-tax.ts 손실 조기반환(§114조의2② 산출세액0) 양쪽에서 호출 — dual-truth 방지.
 */
export function resolveExtensionPenaltyBase(
  input: TransferTaxInput,
  fullBuildingBase: number,
): number {
  const isBurdenedGiftPath =
    input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift";
  if (
    !isBurdenedGiftPath &&
    input.useEstimatedAcquisition &&
    input.buildingType === "extension" &&
    (input.extensionStdPriceAtAcquisition ?? 0) > 0 &&
    (input.standardPriceAtTransfer ?? 0) > 0
  ) {
    return calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.extensionStdPriceAtAcquisition!,
      input.standardPriceAtTransfer!,
    );
  }
  return fullBuildingBase;
}
