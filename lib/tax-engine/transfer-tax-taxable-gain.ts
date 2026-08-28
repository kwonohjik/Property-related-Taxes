/**
 * STEP 3 — 과세 양도차익 결정 (1세대1주택 12억 초과분 안분 + 부수토지 비과세 제외).
 *
 * [법령 근거]
 * - 「소득세법」 제89조 제1항 제3호 단서 · 같은 법 시행령 제160조 제1항 — 고가주택(양도 당시
 *   실지거래가액 12억원 초과)은 양도차익 × (양도가액 − 12억) ÷ 양도가액 만큼만 과세한다.
 * - 「소득세법」 시행령 제154조 제1항 — 1세대1주택 비과세의 보유요건(2년).
 *
 * `transfer-tax.ts` 800줄 정책으로 분리했다. 분기 순서·산식 문자열은 종전 그대로다.
 */
import { calcOneHouseProration } from "./transfer-tax-helpers";
import {
  applyHousingLandExclusions,
  hasHousingLandExemptExclusion,
} from "./transfer-tax-split-rate";
import { TRANSFER } from "./legal-codes";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

export function resolveTaxableGain(args: {
  effectiveInput: TransferTaxInput;
  splitDetail: SplitGainResult | undefined;
  transferGain: number;
  isExempt: boolean;
  isPartialExempt: boolean;
  /** 산출근거 — 호출부 steps에 push */
  steps: CalculationStep[];
}): number {
  const { effectiveInput, splitDetail, transferGain, isExempt, isPartialExempt, steps } = args;
  // 우선순위: burdenedGiftDenominator (부담부증여 — 해석 B) > totalPropertyTransferPrice (지분) > transferPrice (단독)
  const prorate = (g: number) =>
    calcOneHouseProration(
      g,
      effectiveInput.transferPrice,
      effectiveInput.totalPropertyTransferPrice,
      effectiveInput.burdenedGiftDenominator,
    );

  // G-2·G-3: 비과세 대상이 아닌 부수토지분(배율 초과분 · 보유 2년 미만분)을 12억 안분 대상에서
  // 빼고 전액 과세한다 (겸용주택 ①→② 패턴)
  const exclusion = applyHousingLandExclusions({
    input: effectiveInput,
    splitDetail,
    isExempt,
    isPartialExempt,
    prorate,
  });
  if (exclusion) {
    steps.push(exclusion.step);
    return exclusion.taxableGain;
  }
  if (isExempt && hasHousingLandExemptExclusion(effectiveInput)) {
    // G-3 때문에 전액 비과세 조기 반환을 건너뛰었는데 분리 결과가 없다 — 비과세를 유지한다
    // (조용한 전액 과세 금지).
    // ⚠️ `isExempt`만으로 판정하면 안 된다 — §155⑳ 시나리오 B·A 미충족은 `isExempt=true`인 채로
    //    **과세돼야** 하는 별개의 조기반환 억제 경로다(`canEarlyReturnPrhp`).
    return 0;
  }
  if (!isPartialExempt) return transferGain;

  const taxableGain = prorate(transferGain);
  const denom =
    effectiveInput.burdenedGiftDenominator ??
    effectiveInput.totalPropertyTransferPrice ??
    effectiveInput.transferPrice;
  const isBurdened = effectiveInput.burdenedGiftDenominator !== undefined;
  const isFractional =
    !isBurdened &&
    effectiveInput.totalPropertyTransferPrice !== undefined &&
    effectiveInput.totalPropertyTransferPrice !== effectiveInput.transferPrice;
  const denomLabel = isBurdened ? "증여가액 C" : isFractional ? "총양도가" : "양도가";
  steps.push({
    label: "과세 양도차익 (12억 초과분)",
    formula: `${transferGain.toLocaleString()} × (${denomLabel} ${denom.toLocaleString()} - 12억) / ${denomLabel} ${denom.toLocaleString()}`,
    amount: taxableGain,
    legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
  });
  return taxableGain;
}

/**
 * 양도차익 산출근거 문자열 — 취득가액 산정방식 3분기.
 *
 * ⚠️ 파생 입력(`effectiveInput`) 기준으로 통일한다. 원본 `input` 기준이면
 *    CB 환산은 취득가·개산공제가 0이고 §97② swap은 개산공제가 실제 경비와 어긋나
 *    산식이 금액과 불일치한다.
 */
export function buildGainFormula(args: {
  swapApplied: boolean | undefined;
  useEstimatedAcquisition: boolean | undefined;
  transferPrice: number;
  acquisitionPrice: number;
  estimatedBase: number;
  appliedExpenses: number;
}): string {
  const { swapApplied, useEstimatedAcquisition, transferPrice, acquisitionPrice, estimatedBase, appliedExpenses } = args;
  const effectiveInput = { transferPrice, acquisitionPrice, useEstimatedAcquisition };
  let gainFormula: string;
  if (swapApplied) {
    // §97② 2호 단서: 필요경비 = 자본적지출+양도비 단독 → 환산취득가액은 차감·표시에서 제외.
    // 상가(CB) swap은 effectiveInput.useEstimatedAcquisition=false라 최상위에서 분기(환산·상가 공통).
    gainFormula = [
      `양도가(${effectiveInput.transferPrice.toLocaleString()})`,
      `필요경비(자본적지출+양도비 ${appliedExpenses.toLocaleString()})`,
    ].join(" - ");
  } else if (effectiveInput.useEstimatedAcquisition) {
    gainFormula = [
      `양도가(${effectiveInput.transferPrice.toLocaleString()})`,
      `취득가(환산 ${estimatedBase.toLocaleString()})`,
      `경비(개산공제 ${appliedExpenses.toLocaleString()})`,
    ].join(" - ");
  } else {
    gainFormula = [
      `양도가(${effectiveInput.transferPrice.toLocaleString()})`,
      `취득가(${effectiveInput.acquisitionPrice.toLocaleString()})`,
      `경비(${appliedExpenses.toLocaleString()})`,
    ].join(" - ");
  }
  return gainFormula;
}
