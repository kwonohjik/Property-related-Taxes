/**
 * STEP 0.35: 상업용건물·오피스텔 환산취득가 사전 처리 (소령 §164⑥ + §176조의2②2호 + §164⑨ 수용)
 *
 * transfer-tax-helpers.ts 800줄 정책 준수를 위해 분리 (2026-07-20, 상가 상속 §163⑨ 가드 추가 시).
 * 단방향 의존: transfer-tax.ts → applyCommercialBuildingStep → commercial-building-valuation.ts
 * 순환 방지: transfer-tax.ts / transfer-tax-helpers.ts를 import하지 않는다.
 */

import {
  applyExpropriationValuation,
  type ExpropriationValuationDetail,
} from "./transfer-tax-expropriation-valuation";
import {
  calculateCommercialBuildingValuation,
  type CommercialBuildingValuationResult,
} from "./commercial-building-valuation";
import type { TransferTaxInput } from "./types/transfer.types";

export interface CommercialBuildingStepResult {
  /** 엔진 input 덮어쓰기용 업데이트된 acquisitionPrice·expenses */
  acquisitionPrice: number;
  /** 개산공제액 (§163⑥ 취득당시기준시가 × 3%) */
  lumpSumDeduction: number;
  /** 상세 결과 (결과 카드 산식 표시용) */
  detail: CommercialBuildingValuationResult;
  /**
   * 공익수용 §164⑨ 1호 특례 산출근거 — 발동 시에만 존재.
   * 양도시 호별총액(환산 분모)을 min[호별고시가, 보상액, 보상기초] × 연면적으로 낮춘 근거.
   */
  expropriationValuationDetail?: ExpropriationValuationDetail;
  /**
   * §97②2호 단서 swap 발동 여부. 가목(환산취득가+개산공제) < 나목(자본적지출+양도비)이면 true.
   * swap은 이 STEP(단건 엔진 밖 재구성)에서 판정 → transfer-tax.ts가 result.swapApplied로 승격.
   */
  swapApplied?: boolean;
  /** §97②2호 단서 swap 비교 (capitalExpenditure·transferExpense 중 하나라도 입력 시). */
  swapComparison?: { estimatedSide: number; directSide: number; chosen: "estimated" | "direct" };
}

/**
 * STEP 0.35: 상업용건물·오피스텔 환산취득가 처리 (소령 §164⑥ + §176조의2②2호)
 *
 * propertyType === "commercial_building" + useEstimatedAcquisition === true +
 * commercialBuildingValuation 제공 시 환산취득가·개산공제를 계산하여
 * 파이프라인 input에 주입할 값을 반환.
 *
 * 단방향 의존: transfer-tax.ts → 이 함수 → commercial-building-valuation.ts
 *
 * @returns CommercialBuildingStepResult | undefined (분기 해당 없음 시 undefined)
 */
export function runCommercialBuildingStep(
  input: TransferTaxInput,
): CommercialBuildingStepResult | undefined {
  if (
    input.propertyType !== "commercial_building" ||
    !input.useEstimatedAcquisition ||
    !input.commercialBuildingValuation
  ) {
    return undefined;
  }

  const cbInput = input.commercialBuildingValuation;

  // 공익수용 §164⑨ 1호 — 양도시 호별총액(환산 분모)을 낮춘다. CB의 양도시 기준시가는
  // `unitPriceAtTransfer(원/㎡) × 연면적`이므로(§99①1호다목) 단건과 **동일 함수 재사용**
  // (원/㎡ ← unitPriceAtTransfer, 면적 ← 연면적). min[] 재구현 금지(dual-truth). 미발동 시 null.
  const floorAreaTotal = cbInput.exclusiveArea + cbInput.commonArea;
  const exprVal = applyExpropriationValuation({
    propertyType: input.propertyType,
    useEstimatedAcquisition: input.useEstimatedAcquisition,
    transferCause: input.transferCause,
    transferDate: input.transferDate,
    standardPricePerSqmAtTransfer: cbInput.unitPriceAtTransfer,
    transferArea: floorAreaTotal,
    compensationPerSqm: input.compensationPerSqm,
    compensationBasisStdPrice: input.compensationBasisStdPrice,
  });

  // 특례 발동 시 낮아진 ㎡당가액으로 재계산 — `:151`이 이 값 × 연면적으로 호별총액을 만든다.
  const effectiveCbInput = exprVal
    ? { ...cbInput, unitPriceAtTransfer: exprVal.detail.chosenPerSqm }
    : cbInput;

  // ⚠️ 표시-엔진 단일 진실: `applyExpropriationValuation`의 detail.denominator는 표시용으로 면적을
  //    round2(소수 2자리)해 산출한다. 그러나 CB 실제 분모(`commercial-building-valuation.ts:151`)는
  //    **raw 연면적**을 쓴다 → 연면적이 소수 3자리 이상이면 표시값이 실제와 어긋난다(dual-truth).
  //    CB에서는 detail.denominator를 **실제 분모(raw)**로 덮어써 결과 카드가 실제 계산과 일치하게 한다.
  const exprDetail = exprVal
    ? { ...exprVal.detail, denominator: Math.floor(exprVal.detail.chosenPerSqm * floorAreaTotal) }
    : undefined;

  const detail = calculateCommercialBuildingValuation(
    effectiveCbInput,
    input.transferPrice,
  );

  return {
    acquisitionPrice: detail.estimatedAcquisitionTotal,
    lumpSumDeduction: detail.estimatedDeductionTotal,
    detail,
    expropriationValuationDetail: exprDetail,
  };
}

/**
 * STEP 0.35 오케스트레이션 — 상가 환산 성공 시 `effectiveInput`을 실가 경로로 교체.
 *
 * `runCommercialBuildingStep`이 §164⑥·§176의2②2호·§164⑨ 환산을 수행하면, 그 결과
 * (환산취득가·개산공제)를 실가처럼 주입하고 `useEstimatedAcquisition: false`로 내린다.
 */
export function applyCommercialBuildingStep(input: TransferTaxInput): {
  effectiveInput: TransferTaxInput;
  cbStep: CommercialBuildingStepResult | undefined;
} {
  if (input.propertyType !== "commercial_building" || !input.useEstimatedAcquisition) {
    return { effectiveInput: input, cbStep: undefined };
  }
  // §163⑨: 상속 자산은 상속개시일 상증법 §60~66 평가액을 취득당시 실지거래가액으로 본다(환산 아님).
  // STEP 0.45(transfer-tax.ts:126)가 STEP 0.35(:325)보다 먼저 실행되어 input.acquisitionPrice를
  // 상속개시일 평가액으로 이미 세팅했으므로, 상속이면 환산을 건너뛴다.
  // ⚠️ useEstimatedAcquisition=false 명시 해제 필수 — calcTransferGain 실가 경로(transfer-tax-helpers.ts:351)가
  //    input.acquisitionPrice(상속평가액)를 직접 차감한다. true로 두면 환산식(:318, standardPriceAtAcquisition
  //    기반)으로 빠져 상속평가액이 무시된다. 개산공제(§163⑥)는 환산 전용 → 상속 미적용.
  if (input.acquisitionCause === "inheritance") {
    return { effectiveInput: { ...input, useEstimatedAcquisition: false }, cbStep: undefined };
  }
  const cbStep = runCommercialBuildingStep(input);
  if (!cbStep) return { effectiveInput: input, cbStep: undefined };
  // §97②2호 단서 swap: 가목(환산취득가+개산공제) < 나목(자본적지출+양도비)이면 나목을 필요경비 '전체'로.
  // 이 STEP은 useEstimatedAcquisition=true 확정(진입 게이트 :108) → 환산 전용 단서 대상.
  // 재구성 후 useEstimatedAcquisition=false로 내려 calcTransferGain 실가 경로를 타므로 엔진 내장 swap이
  // 발동하지 못한다 → 여기서 직접 판정하고 acquisitionPrice=0(환산취득가 미차감)·expenses=나목으로 재구성.
  const directSide = (input.capitalExpenditure ?? 0) + (input.transferExpense ?? 0);
  const swapEligible = input.capitalExpenditure !== undefined || input.transferExpense !== undefined;
  const estimatedSide = cbStep.acquisitionPrice + cbStep.lumpSumDeduction;
  const swapToDirect = swapEligible && directSide > estimatedSide; // 동률은 본문(단서 "적은 경우")
  return {
    effectiveInput: {
      ...input,
      useEstimatedAcquisition: false,
      // §97②2호: 나목 채택 시 환산취득가 미차감(=0)·필요경비=나목. 본문은 환산취득가+개산공제.
      acquisitionPrice: swapToDirect ? 0 : cbStep.acquisitionPrice,
      expenses: swapToDirect ? directSide : cbStep.lumpSumDeduction,
      capitalExpenditure: undefined,
      transferExpense: undefined,
    },
    cbStep: {
      ...cbStep,
      swapApplied: swapToDirect,
      swapComparison: swapEligible
        ? { estimatedSide, directSide, chosen: swapToDirect ? "direct" : "estimated" }
        : undefined,
    },
  };
}
