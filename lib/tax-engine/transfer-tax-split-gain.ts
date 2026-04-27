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
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";

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
 *
 * preHousingDisclosure 제공 시: §164⑤ 3-시점 알고리즘으로 취득시 기준시가 추정 후 안분.
 * 미제공 시: 기존 standardPricePerSqmAtAcquisition × acquisitionArea 기반 안분.
 *
 * [알려진 한계] 단기세율 혼합 케이스:
 *   토지 보유기간은 길지만 건물 보유기간이 2년 미만인 경우, 현재는 acquisitionDate(건물 취득일)
 *   기준 단일 세율이 전체에 적용된다. 건물에만 단기세율, 토지에는 누진세율을 파트별로 분리
 *   적용하는 로직은 미구현 (실무 발생 빈도 극히 낮음, 향후 과제).
 */
export function calcSplitGain(input: TransferTaxInput): SplitGainResult | null {
  if (!input.landAcquisitionDate) return null;
  if (input.propertyType !== "housing" && input.propertyType !== "building") return null;

  // ── 개별주택가격 미공시 취득 경로 (§164⑤) ──
  if (input.preHousingDisclosure && input.useEstimatedAcquisition) {
    return calcSplitGainPreDisclosure(input);
  }

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
    selfOwns: input.selfOwns ?? "both",
  };
}

/**
 * §164⑤ 경로: 개별주택가격 미공시 취득 + 3-시점 환산취득가 분리 계산.
 * calcPreHousingDisclosureGain() 결과로 SplitGainResult 구성.
 */
function calcSplitGainPreDisclosure(input: TransferTaxInput): SplitGainResult {
  const phd = calcPreHousingDisclosureGain(input.transferPrice, input.preHousingDisclosure!);

  // 추가 필요경비(자본적지출) 안분 — preHousingDisclosure 경로에서도 적용
  const totalExpenses = input.expenses ?? 0;
  const landExpRatio = phd.transferApportionRatio.land;
  const landDirectExp = input.landDirectExpenses ?? Math.floor(totalExpenses * landExpRatio);
  const buildingDirectExp = input.buildingDirectExpenses ?? (totalExpenses - landDirectExp);

  const landGain = phd.landTransferPrice - phd.landAcquisitionPrice - phd.landLumpDeduction - landDirectExp;
  const buildingGain = phd.buildingTransferPrice - phd.buildingAcquisitionPrice - phd.buildingLumpDeduction - buildingDirectExp;

  const { years: landHoldingYears } = calculateHoldingPeriod(
    input.landAcquisitionDate!,
    input.transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    input.acquisitionDate,
    input.transferDate,
  );

  const landPart: SplitPartResult = {
    transferPrice: phd.landTransferPrice,
    acquisitionPrice: phd.landAcquisitionPrice,
    directExpenses: landDirectExp,
    appraisalDeduction: phd.landLumpDeduction,
    gain: landGain,
    holdingYears: landHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
  };

  const buildingPart: SplitPartResult = {
    transferPrice: phd.buildingTransferPrice,
    acquisitionPrice: phd.buildingAcquisitionPrice,
    directExpenses: buildingDirectExp,
    appraisalDeduction: phd.buildingLumpDeduction,
    gain: buildingGain,
    holdingYears: buildingHoldingYears,
    longTermRate: 0,
    longTermDeduction: 0,
  };

  return {
    land: landPart,
    building: buildingPart,
    apportionRatio: phd.transferApportionRatio,
    note: `개별주택가격 미공시(§164⑤) — 토지 ${landHoldingYears}년 + 건물 ${buildingHoldingYears}년 분리`,
    selfOwns: input.selfOwns ?? "both",
    preHousingDisclosureDetail: phd,
  };
}
