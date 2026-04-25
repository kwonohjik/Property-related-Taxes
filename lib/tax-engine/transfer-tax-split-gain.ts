/**
 * 토지/건물 취득일 분리 양도차익 계산 모듈
 *
 * housing·building 자산에서 토지와 건물의 취득일이 다른 경우
 * (원시취득·신축·승계취득 시점 차이 등) 각각의 양도차익을 계산한다.
 *
 * 소득세법 §95②, 소득령 §166⑥·§168②:
 * - 양도가액·취득가액·필요경비·개산공제를 토지/건물 각각 구분 계산
 * - 실제 가액 확인 시 그 가액 사용, 미확인 시 기준시가 비율로 안분
 */

import type { TransferTaxInput, SplitGainResult, SplitPartResult } from "./types/transfer.types";
import { applyRate, calculateHoldingPeriod } from "./tax-utils";

/** 안분 비율 산출 — 토지 기준시가 / 전체 기준시가 */
function calcApportionRatio(input: TransferTaxInput): { land: number; building: number } | null {
  const sqm = input.standardPricePerSqmAtAcquisition ?? 0;
  const area = input.acquisitionArea ?? 0;
  const total = input.standardPriceAtAcquisition ?? 0;

  if (sqm <= 0 || area <= 0 || total <= 0) return null;

  const landStd = Math.floor(sqm * area);
  const landRatio = Math.min(landStd / total, 1); // 클램핑: 토지 기준시가 > 전체 방지
  return { land: landRatio, building: 1 - landRatio };
}

/** 취득가액 분리 (실가/환산/감정 분기) */
function calcSplitAcquisitionPrice(
  input: TransferTaxInput,
  landTransferPrice: number,
  buildingTransferPrice: number,
  landStdAtAcq: number,
  buildingStdAtAcq: number,
  landRatio: number,
): { land: number; building: number } {
  if (input.useEstimatedAcquisition) {
    // 환산취득가: 각각의 양도가액 × (취득시 기준시가 / 양도시 기준시가)
    const totalStdAtTransfer = input.standardPriceAtTransfer ?? 0;
    const landStdAtTransfer = input.landStandardPriceAtTransfer
      ?? Math.floor(totalStdAtTransfer * landRatio);
    const buildingStdAtTransfer = input.buildingStandardPriceAtTransfer
      ?? Math.max(totalStdAtTransfer - landStdAtTransfer, 0);

    const landAcq = landStdAtTransfer > 0
      ? Math.floor(landTransferPrice * (landStdAtAcq / landStdAtTransfer))
      : 0;
    const buildingAcq = buildingStdAtTransfer > 0
      ? Math.floor(buildingTransferPrice * (buildingStdAtAcq / buildingStdAtTransfer))
      : 0;
    return { land: landAcq, building: buildingAcq };
  }

  if (input.acquisitionMethod === "appraisal") {
    const base = input.appraisalValue ?? input.acquisitionPrice ?? 0;
    const land = input.landAcquisitionPrice ?? Math.floor(base * landRatio);
    return { land, building: base - land };
  }

  // 실거래가
  const base = input.acquisitionPrice ?? 0;
  const land = input.landAcquisitionPrice ?? Math.floor(base * landRatio);
  return { land, building: base - land };
}

/**
 * 토지/건물 분리 양도차익 계산.
 * landAcquisitionDate 미제공 또는 지원 대상 아닌 propertyType 시 null 반환.
 */
export function calcSplitGain(input: TransferTaxInput): SplitGainResult | null {
  if (!input.landAcquisitionDate) return null;
  if (input.propertyType !== "housing" && input.propertyType !== "building") return null;

  const ratio = calcApportionRatio(input);
  if (!ratio) return null;

  const { land: landRatio, building: buildingRatio } = ratio;

  // 취득시 기준시가 — 토지/건물 분리
  const totalStdAtAcq = input.standardPriceAtAcquisition ?? 0;
  const landStdAtAcq = Math.floor((input.standardPricePerSqmAtAcquisition ?? 0) * (input.acquisitionArea ?? 0));
  const buildingStdAtAcq = Math.max(totalStdAtAcq - landStdAtAcq, 0);

  // ① 양도가액 분리
  const totalTransfer = input.transferPrice;
  const landTransferPrice = input.landTransferPrice
    ?? Math.floor(totalTransfer * landRatio);
  const buildingTransferPrice = input.buildingTransferPrice
    ?? (totalTransfer - landTransferPrice);

  // ② 취득가액 분리
  const { land: landAcqPrice, building: buildingAcqPrice } = calcSplitAcquisitionPrice(
    input,
    landTransferPrice,
    buildingTransferPrice,
    landStdAtAcq,
    buildingStdAtAcq,
    landRatio,
  );

  // ③ 필요경비(자본적지출) 분리
  const totalExpenses = input.expenses ?? 0;
  const landDirectExp = input.landDirectExpenses
    ?? Math.floor(totalExpenses * landRatio);
  const buildingDirectExp = input.buildingDirectExpenses
    ?? (totalExpenses - landDirectExp);

  // ④ 개산공제 — 환산취득가·감정가액 모드 시 (소득령 §163⑥)
  const usesEstOrAppraisal =
    input.useEstimatedAcquisition || input.acquisitionMethod === "appraisal";
  const landAppraisalDed = usesEstOrAppraisal ? applyRate(landStdAtAcq, 0.03) : 0;
  const buildingAppraisalDed = usesEstOrAppraisal ? applyRate(buildingStdAtAcq, 0.03) : 0;

  // ⑤ 양도차익
  const landGain = landTransferPrice - landAcqPrice - landDirectExp - landAppraisalDed;
  const buildingGain = buildingTransferPrice - buildingAcqPrice - buildingDirectExp - buildingAppraisalDed;

  // ⑥ 보유연수 (민법 초일불산입)
  const { years: landHoldingYears } = calculateHoldingPeriod(
    input.landAcquisitionDate,
    input.transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    input.acquisitionDate,
    input.transferDate,
  );

  const landPart: SplitPartResult = {
    transferPrice: landTransferPrice,
    acquisitionPrice: landAcqPrice,
    directExpenses: landDirectExp,
    appraisalDeduction: landAppraisalDed,
    gain: landGain,
    holdingYears: landHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
  };

  const buildingPart: SplitPartResult = {
    transferPrice: buildingTransferPrice,
    acquisitionPrice: buildingAcqPrice,
    directExpenses: buildingDirectExp,
    appraisalDeduction: buildingAppraisalDed,
    gain: buildingGain,
    holdingYears: buildingHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
  };

  return {
    land: landPart,
    building: buildingPart,
    apportionRatio: { land: landRatio, building: buildingRatio },
    note: `토지 ${landHoldingYears}년 + 건물 ${buildingHoldingYears}년 분리 (안분비 토지 ${(landRatio * 100).toFixed(1)}% : 건물 ${(buildingRatio * 100).toFixed(1)}%)`,
  };
}
