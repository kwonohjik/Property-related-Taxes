/**
 * 겸용주택 — 용도변경일 기반 시간 비례 분할 LTHD (집행기준 89-154-24 취지)
 *
 * 보유 중 일부 용도변경(`partialUsageChange`) + 용도변경일(`usageChangeDate`) 입력 시,
 * 양도차익을 시간 비례로 Period 1 / Period 2로 분할하여 각 Period에 적합한
 * 보유연수로 LTHD를 적용한다.
 *
 * 모델:
 *   t_total = 양도일 - 취득일
 *   t1 = 용도변경일 - 취득일 (단일 용도 기간)
 *   t2 = 양도일 - 용도변경일 (혼용 기간)
 *
 *   Period 1 양도차익 = total × t1/t_total
 *     - house_to_commercial: 100% 주택분
 *     - commercial_to_house: 100% 상가분
 *   Period 2 양도차익 = total × t2/t_total → 양도시점 housingRatio 안분
 *
 *   LTHD: Period 1 → t1 보유기간, Period 2 → t2 보유기간
 *
 * NB(비사업용토지) 비율 + 12억 비과세 안분(proratio)은 housing 풀 전체에 적용.
 */

import { applyRate, calculateHoldingPeriod } from "./tax-utils";
import {
  calcLongTermRate,
  type HousingGainSplit,
  type CommercialGainSplit,
  type ExcessLandResult,
  type HousingEstimatedAcqResult,
} from "./transfer-tax-mixed-use-helpers";
import type {
  MixedUseApportionment,
  MixedUseHousingPart,
  MixedUseCommercialPart,
} from "./types/transfer-mixed-use.types";

export interface UsagePeriodInfo {
  /** Period 1 (취득~용도변경) 일수 */
  t1Days: number;
  /** Period 2 (용도변경~양도) 일수 */
  t2Days: number;
  /** 전체 보유 일수 */
  totalDays: number;
  /** Period 1 보유연수 (365.25 기준, 시간비례 안분용) */
  t1Years: number;
  /** Period 2 보유연수 (365.25 기준, 시간비례 안분용) */
  t2Years: number;
  /** Period 1 완성 보유연수 (초일불산입·calendar, LTHD 율 산정용) */
  t1HoldingYears: number;
  /** Period 2 완성 보유연수 (초일불산입·calendar, LTHD 율 산정용) */
  t2HoldingYears: number;
}

/**
 * 용도변경일 기반 시간 분할 정보 산출.
 * 미입력·취득일 이전·양도일 이후이면 null 반환 (fallback to 전체 보유기간 LTHD).
 */
export function calcUsagePeriodInfo(
  acquisitionDate: Date,
  usageChangeDate: Date | undefined,
  transferDate: Date,
): UsagePeriodInfo | null {
  if (!usageChangeDate) return null;
  const acqMs = acquisitionDate.getTime();
  const changeMs = usageChangeDate.getTime();
  const transferMs = transferDate.getTime();
  if (changeMs <= acqMs || changeMs >= transferMs) return null;

  const DAY_MS = 1000 * 60 * 60 * 24;
  const t1Days = (changeMs - acqMs) / DAY_MS;
  const t2Days = (transferMs - changeMs) / DAY_MS;
  const totalDays = t1Days + t2Days;

  return {
    t1Days,
    t2Days,
    totalDays,
    t1Years: t1Days / 365.25,
    t2Years: t2Days / 365.25,
    // LTHD 율은 §95② 완성연수 기준 — 분수(t1Years/t2Years)가 아닌 초일불산입 calendar 연수 사용.
    t1HoldingYears: calculateHoldingPeriod(acquisitionDate, usageChangeDate).years,
    t2HoldingYears: calculateHoldingPeriod(usageChangeDate, transferDate).years,
  };
}

export interface UsagePeriodSplitResult {
  period1Days: number;
  period2Days: number;
  period1Gain: number;
  period2HousingGain: number;
  period2CommercialGain: number;
  period1LongTermDeductionRate: number;
  period1LongTermDeductionAmount: number;
  period2HousingLongTermDeductionRate: number;
  period2HousingLongTermDeductionAmount: number;
  period2CommercialLongTermDeductionRate: number;
  period2CommercialLongTermDeductionAmount: number;
}

/**
 * 용도변경일 기반 시간 분할 LTHD 적용 — 집행기준 89-154-24 취지.
 *
 * 표준 buildHousingPart/buildCommercialPart 대신 본 함수가 housingPart·commercialPart를
 * 직접 조립한다. 호출 측은 `calcUsagePeriodInfo()`가 non-null인 경우 본 함수를 사용.
 */
export function applyUsagePeriodSplit(
  housingGainSplit: HousingGainSplit,
  commercialGainSplit: CommercialGainSplit,
  apportionment: MixedUseApportionment,
  excessResult: ExcessLandResult,
  residenceYears: number,
  isOneHouseExempt: boolean,
  periodInfo: UsagePeriodInfo,
  direction: "house_to_commercial" | "commercial_to_house",
  housingAcqResult: HousingEstimatedAcqResult,
): {
  housingPart: MixedUseHousingPart;
  commercialPart: MixedUseCommercialPart;
  usagePeriodSplit: UsagePeriodSplitResult;
} {
  const HIGH_VALUE_THRESHOLD = 1_200_000_000;
  const { t1Days, t2Days, totalDays, t1HoldingYears, t2HoldingYears } = periodInfo;
  const t1Frac = t1Days / totalDays;
  const t2Frac = t2Days / totalDays;

  const housingRatio = apportionment.housingRatio;
  const isHtoC = direction === "house_to_commercial";

  // 집계 토지·건물 양도차익 (housing + commercial)
  const aggLandGain = housingGainSplit.landGain + commercialGainSplit.landGain;
  const aggBuildingGain =
    housingGainSplit.buildingGain + commercialGainSplit.buildingGain;

  // ── Period × 직책 별 양도차익 분배 ──
  const p1LandGain = aggLandGain * t1Frac;
  const p1BuildingGain = aggBuildingGain * t1Frac;
  const p2LandGain = aggLandGain * t2Frac;
  const p2BuildingGain = aggBuildingGain * t2Frac;

  // h_to_c: P1 → 100% 주택분 / c_to_h: P1 → 100% 상가분
  const p1HousingLandGain = isHtoC ? p1LandGain : 0;
  const p1HousingBuildingGain = isHtoC ? p1BuildingGain : 0;
  const p1CommercialLandGain = isHtoC ? 0 : p1LandGain;
  const p1CommercialBuildingGain = isHtoC ? 0 : p1BuildingGain;

  // P2: 양도시점 housingRatio로 안분
  const p2HousingLandGain = p2LandGain * housingRatio;
  const p2HousingBuildingGain = p2BuildingGain * housingRatio;
  const p2CommercialLandGain = p2LandGain * (1 - housingRatio);
  const p2CommercialBuildingGain = p2BuildingGain * (1 - housingRatio);

  // ── ① 비사업용토지 이전 (housing 토지 전체에 NB 비율 적용) ──
  const nbRatio = excessResult.nonBizRatio;
  const totalHousingLandGain = p1HousingLandGain + p2HousingLandGain;
  const totalNBTransferred = Math.floor(totalHousingLandGain * nbRatio);
  const p1NBShare =
    totalHousingLandGain > 0
      ? totalNBTransferred * (p1HousingLandGain / totalHousingLandGain)
      : 0;
  const p2NBShare = totalNBTransferred - p1NBShare;
  const p1HousingLandAfterNB = Math.max(0, p1HousingLandGain - p1NBShare);
  const p2HousingLandAfterNB = Math.max(0, p2HousingLandGain - p2NBShare);

  // ── ② 12억 초과 비과세 안분 ──
  const isExempt =
    isOneHouseExempt &&
    apportionment.housingTransferPrice <= HIGH_VALUE_THRESHOLD;
  let proratio: number;
  if (!isOneHouseExempt) proratio = 1;
  else if (isExempt) proratio = 0;
  else
    proratio =
      (apportionment.housingTransferPrice - HIGH_VALUE_THRESHOLD) /
      apportionment.housingTransferPrice;

  const p1HousingLandProrated = Math.floor(
    Math.max(p1HousingLandAfterNB, 0) * proratio,
  );
  const p1HousingBuildingProrated = Math.floor(
    Math.max(p1HousingBuildingGain, 0) * proratio,
  );
  const p2HousingLandProrated = Math.floor(
    Math.max(p2HousingLandAfterNB, 0) * proratio,
  );
  const p2HousingBuildingProrated = Math.floor(
    Math.max(p2HousingBuildingGain, 0) * proratio,
  );

  const p1HousingProrated = p1HousingLandProrated + p1HousingBuildingProrated;
  const p2HousingProrated = p2HousingLandProrated + p2HousingBuildingProrated;
  const proratedTaxableGain = p1HousingProrated + p2HousingProrated;

  // ── ③ LTHD (Period × 직책 별) ──
  const useTable2 = isOneHouseExempt && residenceYears >= 2;
  const longTermDeductionTable: 1 | 2 = useTable2 ? 2 : 1;

  // P1 housing LTHD: t1 보유기간 (h_to_c일 때만 housing P1 존재)
  const p1HousingRate = isHtoC
    ? calcLongTermRate(t1HoldingYears, residenceYears, useTable2)
    : 0;
  const p1HousingLTHD =
    applyRate(p1HousingLandProrated, p1HousingRate) +
    applyRate(p1HousingBuildingProrated, p1HousingRate);

  // P2 housing LTHD: t2 보유기간
  const p2HousingRate = calcLongTermRate(t2HoldingYears, residenceYears, useTable2);
  const p2HousingLTHD =
    applyRate(p2HousingLandProrated, p2HousingRate) +
    applyRate(p2HousingBuildingProrated, p2HousingRate);

  const housingLTHD = p1HousingLTHD + p2HousingLTHD;
  const housingIncome = Math.max(0, proratedTaxableGain - housingLTHD);

  // P1 commercial LTHD: t1 보유기간 (c_to_h일 때만 P1 commercial 존재), 표1 only
  const p1CommercialRate = !isHtoC ? calcLongTermRate(t1HoldingYears, 0, false) : 0;
  const p1CommercialLand = !isHtoC
    ? Math.floor(Math.max(p1CommercialLandGain, 0))
    : 0;
  const p1CommercialBuilding = !isHtoC
    ? Math.floor(Math.max(p1CommercialBuildingGain, 0))
    : 0;
  const p1CommercialLTHD =
    applyRate(p1CommercialLand, p1CommercialRate) +
    applyRate(p1CommercialBuilding, p1CommercialRate);

  // P2 commercial LTHD: t2 보유기간, 표1 only
  const p2CommercialRate = calcLongTermRate(t2HoldingYears, 0, false);
  const p2CommercialLand = Math.floor(Math.max(p2CommercialLandGain, 0));
  const p2CommercialBuilding = Math.floor(Math.max(p2CommercialBuildingGain, 0));
  const p2CommercialLTHD =
    applyRate(p2CommercialLand, p2CommercialRate) +
    applyRate(p2CommercialBuilding, p2CommercialRate);

  const commercialLTHD = p1CommercialLTHD + p2CommercialLTHD;
  const totalCommercialLandGain = p1CommercialLand + p2CommercialLand;
  const totalCommercialBuildingGain =
    p1CommercialBuilding + p2CommercialBuilding;
  const totalCommercialGain =
    totalCommercialLandGain + totalCommercialBuildingGain;
  const commercialIncome = Math.max(0, totalCommercialGain - commercialLTHD);

  // 대표 LTHD율 (UI용): 비중이 큰 P2 율 채택
  const representativeHousingRate = p2HousingRate;
  const representativeCommercialRate =
    !isHtoC && totalCommercialGain > 0
      ? (p1CommercialLTHD + p2CommercialLTHD) / (totalCommercialGain || 1)
      : p2CommercialRate;

  // ── housingPart 조립 ──
  const housingPart: MixedUseHousingPart = {
    estimatedAcquisitionPrice: housingAcqResult.estimatedAcq,
    phdEstimatedAcqHousingPrice: housingAcqResult.phdAcqHousingPrice,
    phdResult: housingAcqResult.phdResult,
    transferGain: housingGainSplit.totalGain,
    landTransferGain: housingGainSplit.landGain,
    buildingTransferGain: housingGainSplit.buildingGain,
    landTransferPrice: housingGainSplit.landTransferPrice,
    landAcqPrice: housingGainSplit.landAcqPrice,
    landAppraisalDed: housingGainSplit.landAppraisalDed,
    buildingTransferPrice: housingGainSplit.buildingTransferPrice,
    buildingAcqPrice: housingGainSplit.buildingAcqPrice,
    buildingAppraisalDed: housingGainSplit.buildingAppraisalDed,
    isExempt,
    proratedTaxableGain,
    longTermDeductionTable,
    longTermDeductionRate: representativeHousingRate,
    longTermDeductionAmount: housingLTHD,
    incomeAmount: housingIncome,
    nonBusinessTransferRatio: nbRatio,
    nonBusinessTransferredGain: totalNBTransferred,
  };

  // ── commercialPart 조립 ──
  const commercialPart: MixedUseCommercialPart = {
    estimatedAcquisitionPrice: commercialGainSplit.estimatedAcqPrice,
    transferGain: totalCommercialGain,
    landTransferGain: totalCommercialLandGain,
    buildingTransferGain: totalCommercialBuildingGain,
    landTransferPrice: commercialGainSplit.landTransferPrice,
    landAcqPrice: commercialGainSplit.landAcqPrice,
    landAppraisalDed: commercialGainSplit.landAppraisalDed,
    buildingTransferPrice: commercialGainSplit.buildingTransferPrice,
    buildingAcqPrice: commercialGainSplit.buildingAcqPrice,
    buildingAppraisalDed: commercialGainSplit.buildingAppraisalDed,
    longTermDeductionRate: representativeCommercialRate,
    longTermDeductionAmount: commercialLTHD,
    incomeAmount: commercialIncome,
    acqStandardSource: commercialGainSplit.acqStandardSource,
    acqStandardTotal: commercialGainSplit.acqStandardLand + commercialGainSplit.acqStandardBuilding,
    acqStandardLand: commercialGainSplit.acqStandardLand,
    acqStandardBuilding: commercialGainSplit.acqStandardBuilding,
  };

  // ── 메타데이터 (UI 표시용) ──
  const period1Gain = isHtoC
    ? p1HousingLandGain + p1HousingBuildingGain
    : p1CommercialLandGain + p1CommercialBuildingGain;
  const period2HousingGain = p2HousingLandGain + p2HousingBuildingGain;
  const period2CommercialGain = p2CommercialLandGain + p2CommercialBuildingGain;

  const usagePeriodSplit: UsagePeriodSplitResult = {
    period1Days: t1Days,
    period2Days: t2Days,
    period1Gain: Math.floor(period1Gain),
    period2HousingGain: Math.floor(period2HousingGain),
    period2CommercialGain: Math.floor(period2CommercialGain),
    period1LongTermDeductionRate: isHtoC ? p1HousingRate : p1CommercialRate,
    period1LongTermDeductionAmount: isHtoC ? p1HousingLTHD : p1CommercialLTHD,
    period2HousingLongTermDeductionRate: p2HousingRate,
    period2HousingLongTermDeductionAmount: p2HousingLTHD,
    period2CommercialLongTermDeductionRate: p2CommercialRate,
    period2CommercialLongTermDeductionAmount: p2CommercialLTHD,
  };

  return { housingPart, commercialPart, usagePeriodSplit };
}
