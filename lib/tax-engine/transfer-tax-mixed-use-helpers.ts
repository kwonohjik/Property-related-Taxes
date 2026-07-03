/**
 * 겸용주택 분리계산 헬퍼 (순수 함수)
 *
 * transfer-tax-mixed-use.ts에서 사용하는 내부 헬퍼.
 * 소득세법 시행령 §160 ① 단서 / §164 / §168의12 / §95 ②
 */

import { calculateEstimatedAcquisitionPrice, calculateHoldingPeriod, applyRate } from "./tax-utils";
import { getHousingMultiplier } from "./non-business-land/urban-area";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
import {
  buildHousingGainSplitFromFourPart,
  buildCommercialGainSplitFromFourPart,
} from "./transfer-tax-mixed-use-fourpart";
import type { PreHousingDisclosureResult } from "./types/transfer.types";
import type {
  MixedUseAssetInput,
  MixedUseDerivedAreas,
  MixedUseApportionment,
  MixedUseHousingPart,
  MixedUseCommercialPart,
  MixedUseNonBusinessLandPart,
  MixedUseTotalTax,
} from "./types/transfer-mixed-use.types";
import type { TaxBracket } from "./types";
import { calculateProgressiveTax } from "./tax-utils";

// ──────────────────────────────────────────────────────────────
// 1. 면적 파생값 계산
// ──────────────────────────────────────────────────────────────

/** 소수점 2자리 반올림 — UI 표시값(toFixed(2))과 엔진 계산값을 일치시켜
 *  사용자 기대값(76.51 × 단가)과 결과값이 어긋나지 않도록 한다. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeDerivedAreas(asset: MixedUseAssetInput): MixedUseDerivedAreas {
  const total = asset.residentialFloorArea + asset.nonResidentialFloorArea;
  if (total <= 0) {
    return {
      residentialRatio: 0,
      residentialLandArea: 0,
      commercialLandArea: round2(asset.totalLandArea),
      residentialFootprintArea: 0,
    };
  }
  const residentialRatio = asset.residentialFloorArea / total;
  // 부수토지 면적은 UI에서 소수점 2자리로 표시되므로 엔진에서도 동일 정밀도 사용
  const residentialLandArea = round2(asset.totalLandArea * residentialRatio);
  const commercialLandArea = round2(asset.totalLandArea - residentialLandArea);
  return {
    residentialRatio,
    residentialLandArea,
    commercialLandArea,
    residentialFootprintArea: round2(asset.buildingFootprintArea * residentialRatio),
  };
}

/**
 * 취득시 면적 파생값 산출 — 보유 중 일부 용도변경 (시행령 §166⑥).
 *
 * `partialUsageChange === undefined`이면 양도시 derived 그대로 반환 (backward compat).
 *
 * direction별 처리:
 *   - house_to_commercial: 취득시 전체가 주택. acqResidentialArea = 사용자입력 ?? 양도시 합계,
 *                          acqCommercialArea = 0
 *   - commercial_to_house: 취득시 전체가 상가. 반대.
 */
export function computeAcqDerivedAreas(
  asset: MixedUseAssetInput,
  transferDerived: MixedUseDerivedAreas,
): MixedUseDerivedAreas {
  if (!asset.partialUsageChange) return transferDerived;

  const { direction, acqResidentialArea, acqCommercialArea } = asset.partialUsageChange;
  const transferTotal = asset.residentialFloorArea + asset.nonResidentialFloorArea;

  const acqRes = direction === "house_to_commercial"
    ? (acqResidentialArea ?? transferTotal)
    : (acqResidentialArea ?? 0);
  const acqComm = direction === "house_to_commercial"
    ? (acqCommercialArea ?? 0)
    : (acqCommercialArea ?? transferTotal);

  const acqTotalFloor = acqRes + acqComm;
  if (acqTotalFloor <= 0) {
    return {
      residentialRatio: 0,
      residentialLandArea: 0,
      commercialLandArea: round2(asset.totalLandArea),
      residentialFootprintArea: 0,
    };
  }
  const acqResRatio = acqRes / acqTotalFloor;
  const acqResLand = round2(asset.totalLandArea * acqResRatio);
  return {
    residentialRatio: acqResRatio,
    residentialLandArea: acqResLand,
    commercialLandArea: round2(asset.totalLandArea - acqResLand),
    residentialFootprintArea: round2(asset.buildingFootprintArea * acqResRatio),
  };
}

// ──────────────────────────────────────────────────────────────
// 2. 양도가액 안분 (STEP 2)
//    주택부분 기준시가 = 개별주택공시가격 (토지+건물 일괄)
//    상가부분 기준시가 = (공시지가 × 상가부수토지 면적) + 상가건물 기준시가
// ──────────────────────────────────────────────────────────────

export function apportionTransferPrice(
  totalTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
): MixedUseApportionment {
  const housingStdPrice = asset.transferStandardPrice.housingPrice;
  // 상가부수토지 기준시가 = 공시지가/㎡ × 상가부수토지 면적 — 원 단위 정수 보장
  const commercialLandPrice = Math.floor(
    asset.transferStandardPrice.landPricePerSqm * derived.commercialLandArea,
  );
  const commercialStdPrice =
    commercialLandPrice + asset.transferStandardPrice.commercialBuildingPrice;

  const totalStd = housingStdPrice + commercialStdPrice;
  if (totalStd <= 0) {
    return {
      housingStandardPrice: 0,
      commercialStandardPrice: 0,
      housingRatio: 0,
      housingTransferPrice: 0,
      commercialTransferPrice: totalTransferPrice,
    };
  }

  const housingRatio = housingStdPrice / totalStd;
  const housingTransferPrice = Math.floor(totalTransferPrice * housingRatio);
  const commercialTransferPrice = totalTransferPrice - housingTransferPrice;

  return {
    housingStandardPrice: housingStdPrice,
    commercialStandardPrice: commercialStdPrice,
    housingRatio,
    housingTransferPrice,
    commercialTransferPrice,
  };
}

// ──────────────────────────────────────────────────────────────
// 3. 주택부분 환산취득가액 (STEP 3, §97 또는 §164⑤ PHD)
//    취득시 기준시가 = 취득시 개별주택공시가격
//    양도시 기준시가 = 양도시 개별주택공시가격
//    usePreHousingDisclosure=true 시 PHD 3-시점 알고리즘으로 취득시 주택가격 역산.
//    토지면적 = 주택부수토지(totalLandArea × residentialRatio) 자동 주입.
// ──────────────────────────────────────────────────────────────

export interface HousingEstimatedAcqResult {
  /** 주택부분 환산취득가액 */
  estimatedAcq: number;
  /** PHD 모드에서 역산된 취득시 개별주택가격 (P_A_est) */
  phdAcqHousingPrice?: number;
  /** PHD 3-시점 산식 상세 (UI 표시용) */
  phdResult?: PreHousingDisclosureResult;
  /**
   * PHD §164⑤ 환산 분기 — `partialUsageChange` 결합 시에만 산출.
   *
   * - "case_a_whole_building": firstDisclosureDate < usageChangeDate.
   *   최초공시 시점에 아직 용도변경 전(전체 주택). Sum_A·Sum_F 에 전체 토지면적·전체 건물 사용.
   * - "case_b_housing_only": firstDisclosureDate ≥ usageChangeDate.
   *   최초공시 시점에 이미 겸용. 주택분만 사용.
   * - undefined: 일반 PHD (partialUsageChange 미사용).
   */
  phdScopeBranch?: "case_a_whole_building" | "case_b_housing_only";
}

export function calcHousingEstimatedAcq(
  housingTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  acqDerived?: MixedUseDerivedAreas,
): HousingEstimatedAcqResult {
  // §164⑤ PHD 분기 — 겸용주택의 주택부수토지 면적을 토지면적으로 사용
  if (asset.usePreHousingDisclosure && asset.preHousingDisclosure) {
    // 사용자가 면적을 직접 지정한 경우(최초 공시 당시 전체 주택 등) 우선 사용
    const effectiveLandArea =
      (asset.preHousingDisclosure.landArea ?? 0) > 0
        ? asset.preHousingDisclosure.landArea!
        : derived.residentialLandArea;

    // ─── 보유 중 일부 용도변경 + PHD 결합 시 시점별 면적·기준시가 영역 분기 (Case A/B) ───
    // Case A: firstDisclosureDate < usageChangeDate
    //   최초공시 시점에 아직 용도변경 전(전체 주택). P_F = 건물 전체(미래 상가 부분 포함)의 가격.
    //   → Sum_A·Sum_F 에 전체 토지면적·전체 건물 기준시가 사용
    //   → landAreaAtAcquisition = landAreaAtFirstDisclosure = totalLandArea
    // Case B: firstDisclosureDate ≥ usageChangeDate
    //   최초공시 시점에 이미 겸용. P_F = 주택분만의 가격.
    //   → Sum_A·Sum_F 에 주택분만 사용 (시점별 겸용 면적)
    //   → landAreaAtAcquisition·AtFirstDisclosure 는 시점별 주택부수토지
    let landAreaAtAcquisition: number | undefined;
    let landAreaAtFirstDisclosure: number | undefined;
    let landAreaAtTransfer: number | undefined;
    let phdScopeBranch: "case_a_whole_building" | "case_b_housing_only" | undefined;
    const usageChangeDate = asset.partialUsageChange?.usageChangeDate;
    if (usageChangeDate) {
      const firstDate = asset.preHousingDisclosure.firstDisclosureDate;
      const isCaseA = firstDate < usageChangeDate;
      phdScopeBranch = isCaseA ? "case_a_whole_building" : "case_b_housing_only";
      if (isCaseA) {
        // 취득·최초공시 시점에는 건물 전체가 주택 → 전체 토지면적 사용
        landAreaAtAcquisition = asset.totalLandArea;
        landAreaAtFirstDisclosure = asset.totalLandArea;
        landAreaAtTransfer = derived.residentialLandArea;
      } else if (acqDerived) {
        // Case B: 시점별 주택부수토지 사용
        landAreaAtAcquisition = acqDerived.residentialLandArea;
        landAreaAtFirstDisclosure = derived.residentialLandArea;
        landAreaAtTransfer = derived.residentialLandArea;
      }
    }

    // Case A 4부분 안분 자동 주입 — phdScopeBranch === "case_a_whole_building" 이고
    // 4부분 입력이 갖춰진 경우만. 양도시 상가건물은 transferStandardPrice.commercialBuildingPrice 자동 사용.
    // PHD 의 buildingStdPriceAtTransfer 필드가 이미 양도시 주택건물 기준시가(홈택스) 역할.
    const isCaseA = phdScopeBranch === "case_a_whole_building";
    const fourPartFields = isCaseA &&
      asset.preHousingDisclosure.commercialBuildingStdPriceAtAcq !== undefined &&
      asset.preHousingDisclosure.commercialBuildingStdPriceAtFirstDisclosure !== undefined &&
      asset.preHousingDisclosure.totalTransferPriceForFourPart !== undefined &&
      asset.preHousingDisclosure.totalTransferPriceForFourPart > 0
      ? {
          commercialBuildingStdPriceAtAcq: asset.preHousingDisclosure.commercialBuildingStdPriceAtAcq,
          commercialBuildingStdPriceAtFirstDisclosure: asset.preHousingDisclosure.commercialBuildingStdPriceAtFirstDisclosure,
          commercialBuildingStdPriceAtTransfer: asset.transferStandardPrice.commercialBuildingPrice,
          housingLandArea: derived.residentialLandArea,
          commercialLandArea: derived.commercialLandArea,
          totalTransferPriceForFourPart: asset.preHousingDisclosure.totalTransferPriceForFourPart,
        }
      : {};

    const phdResult = calcPreHousingDisclosureGain(housingTransferPrice, {
      ...asset.preHousingDisclosure,
      landArea: effectiveLandArea,
      landAreaAtAcquisition: asset.preHousingDisclosure.landAreaAtAcquisition ?? landAreaAtAcquisition,
      landAreaAtFirstDisclosure: asset.preHousingDisclosure.landAreaAtFirstDisclosure ?? landAreaAtFirstDisclosure,
      landAreaAtTransfer: asset.preHousingDisclosure.landAreaAtTransfer ?? landAreaAtTransfer,
      ...fourPartFields,
    });
    // Case A 4부분 모드 — 주택부분 환산취득가는 D11+E11 합계 (housingAcqPriceSum)
    // 비4부분 모드 — 기존 totalEstimatedAcquisitionPrice (housingTransferPrice 기반 환산)
    const fp = phdResult.fourPartApportionment;
    const housingEstAcq = fp
      ? fp.housingAcqPriceSum
      : phdResult.totalEstimatedAcquisitionPrice;
    return {
      estimatedAcq: housingEstAcq,
      phdAcqHousingPrice: phdResult.estimatedHousingPriceAtAcquisition,
      phdResult,
      phdScopeBranch,
    };
  }

  // 기존 §97 직접 환산
  let stdAtAcq = asset.acquisitionStandardPrice.housingPrice ?? 0;

  // ─── 보유 중 일부 용도변경 (상가→주택) — 시행령 §166⑥ 미러 ───
  // 취득시점에 주택이 없었으므로 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 안분.
  if (asset.partialUsageChange?.direction === "commercial_to_house") {
    const acqCommBuilding = asset.acquisitionStandardPrice.commercialBuildingPrice;
    const acqLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;
    const acqCommTotal = acqCommBuilding + Math.floor(acqLandPerSqm * asset.totalLandArea);
    const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
    const housRatio = totalFloor > 0 ? asset.residentialFloorArea / totalFloor : 0;
    stdAtAcq = Math.floor(acqCommTotal * housRatio);
    if (stdAtAcq === 0) {
      throw new Error(
        "용도변경(상가→주택): 취득시 상가 기준시가(건물+토지)가 0이거나 미입력. " +
          "취득시 상가건물 기준시가와 공시지가를 입력하세요.",
      );
    }
  }

  const stdAtTransfer = asset.transferStandardPrice.housingPrice;
  if (stdAtTransfer <= 0) {
    return { estimatedAcq: 0 };
  }
  return {
    estimatedAcq: calculateEstimatedAcquisitionPrice(
      housingTransferPrice,
      stdAtAcq,
      stdAtTransfer,
    ),
  };
}

// ──────────────────────────────────────────────────────────────
// 4. 주택부분 토지/건물 양도차익 분리 (STEP 4)
//    주택 환산취득가액을 취득시 토지/건물 기준시가 비율로 재안분
// ──────────────────────────────────────────────────────────────

export interface HousingGainSplit {
  totalGain: number;
  landGain: number;
  buildingGain: number;
  landTransferPrice: number;
  buildingTransferPrice: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  landAppraisalDed: number;
  buildingAppraisalDed: number;
  landStdPriceAtAcq?: number;
  buildingStdPriceAtAcq?: number;
  landHoldingYears: number;
  buildingHoldingYears: number;
}

export function calcHousingGainSplit(
  housingTransferPrice: number,
  housingAcqResult: HousingEstimatedAcqResult,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
  acqDerived?: MixedUseDerivedAreas,
): HousingGainSplit {
  const housingEstimatedAcq = housingAcqResult.estimatedAcq;
  const effectiveAcqDerived = acqDerived ?? derived;

  // PHD 분기 — 산식 상세에서 토지/건물 안분값 직접 사용
  if (housingAcqResult.phdResult) {
    const phd = housingAcqResult.phdResult;
    // Case A 4부분 안분 — 별도 파일로 분리 (transfer-tax-mixed-use-fourpart.ts)
    if (phd.fourPartApportionment) {
      // 동적 import 대신 require 회피 — 상위 helpers는 4부분 어댑터를 직접 호출
      return buildHousingGainSplitFromFourPart(phd.fourPartApportionment, asset, transferDate);
    }
    const landGain = phd.landTransferPrice - phd.landAcquisitionPrice - phd.landLumpDeduction;
    const buildingGain =
      phd.buildingTransferPrice - phd.buildingAcquisitionPrice - phd.buildingLumpDeduction;
    const totalGain = landGain + buildingGain;
    const { years: landHoldingYears } = calculateHoldingPeriod(
      asset.landAcquisitionDate,
      transferDate,
    );
    const { years: buildingHoldingYears } = calculateHoldingPeriod(
      asset.buildingAcquisitionDate,
      transferDate,
    );
    return {
      totalGain,
      landGain,
      buildingGain,
      landTransferPrice: phd.landTransferPrice,
      buildingTransferPrice: phd.buildingTransferPrice,
      landAcqPrice: phd.landAcquisitionPrice,
      buildingAcqPrice: phd.buildingAcquisitionPrice,
      landAppraisalDed: phd.landLumpDeduction,
      buildingAppraisalDed: phd.buildingLumpDeduction,
      landStdPriceAtAcq: phd.landHousingAtAcquisition,
      buildingStdPriceAtAcq: phd.buildingHousingAtAcquisition,
      landHoldingYears,
      buildingHoldingYears,
    };
  }

  // 기존 §97 분기 — 시행령 §166⑥: 양도가액은 양도시 비율, 취득가액은 취득시 비율로 안분

  // 양도시 토지/건물 기준시가 (양도가액 안분용 — 분기 위에서 먼저 계산)
  // 개별주택공시가격은 토지+건물 일괄이므로, 양도시 토지분 = 공시지가 × 주택부수토지 면적,
  // 양도시 건물분 = 개별주택공시가격 - 토지분 (음수 방지).
  const transferLandStd =
    asset.transferStandardPrice.landPricePerSqm * derived.residentialLandArea;
  const transferHousingTotal = asset.transferStandardPrice.housingPrice;
  const transferBuildingStd = Math.max(transferHousingTotal - transferLandStd, 0);
  const transferTotal = transferLandStd + transferBuildingStd;

  // 취득시 토지/건물 기준시가 (취득가액 안분 + 개산공제 base)
  let acqLandStd: number;
  let acqBuildingStd: number;

  if (asset.partialUsageChange?.direction === "commercial_to_house") {
    // ─── 보유 중 일부 용도변경 (상가→주택) — 시행령 §166⑥ 미러 ───
    // 취득시점에 주택이 없었으므로 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 안분.
    // ※ MixedUseAssetInput.totalLandArea는 types L46에 명시 정의됨 (필드 존재 확인).
    const acqCommBuilding = asset.acquisitionStandardPrice.commercialBuildingPrice;
    const acqLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;
    // 가정: 취득시 토지면적 = 양도시 토지면적 (단순 용도변경 케이스)
    // 분필·합필·도로편입 시에는 사용자가 partialChangeAcqResidentialArea로 보정 가능
    const acqCommTotal = acqCommBuilding + Math.floor(acqLandPerSqm * asset.totalLandArea);
    const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
    const housRatio = totalFloor > 0 ? asset.residentialFloorArea / totalFloor : 0;
    const acqHousingTotal = Math.floor(acqCommTotal * housRatio);

    if (acqHousingTotal === 0) {
      throw new Error(
        "용도변경(상가→주택): 취득시 상가 기준시가(건물+토지)가 0이거나 미입력. " +
          "취득시 상가건물 기준시가와 공시지가를 입력하세요.",
      );
    }

    // 토지/건물 내부 분리 — 양도시 토지/건물 비율 차용 (취득시 분리값 없음)
    const transferLandRatioForFallback = transferTotal > 0 ? transferLandStd / transferTotal : 0.5;
    acqLandStd = Math.floor(acqHousingTotal * transferLandRatioForFallback);
    acqBuildingStd = acqHousingTotal - acqLandStd;
  } else {
    // 기존 일반 겸용주택 분기
    acqLandStd =
      asset.acquisitionStandardPrice.landPricePerSqm * effectiveAcqDerived.residentialLandArea;
    const acqHousingTotal = asset.acquisitionStandardPrice.housingPrice ?? 0;
    acqBuildingStd = Math.max(acqHousingTotal - acqLandStd, 0);
  }

  const acqTotal = acqLandStd + acqBuildingStd;
  const acqLandRatio = acqTotal > 0 ? acqLandStd / acqTotal : 0.5;
  const transferLandRatio = transferTotal > 0 ? transferLandStd / transferTotal : acqLandRatio;

  // 양도가액 안분 — 양도시 비율
  const landTransferPrice = Math.floor(housingTransferPrice * transferLandRatio);
  const buildingTransferPrice = housingTransferPrice - landTransferPrice;

  // 취득가액 안분 — 취득시 비율
  const landAcqPrice = Math.floor(housingEstimatedAcq * acqLandRatio);
  const buildingAcqPrice = housingEstimatedAcq - landAcqPrice;

  // 개산공제 (환산취득가 사용 시, §163⑥) — 취득시 토지/건물 기준시가 × 3%
  const landAppraisalDed = applyRate(acqLandStd, 0.03);
  const buildingAppraisalDed = applyRate(acqBuildingStd, 0.03);

  const landGain = landTransferPrice - landAcqPrice - landAppraisalDed;
  const buildingGain = buildingTransferPrice - buildingAcqPrice - buildingAppraisalDed;
  const totalGain = landGain + buildingGain;

  const { years: landHoldingYears } = calculateHoldingPeriod(
    asset.landAcquisitionDate,
    transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    asset.buildingAcquisitionDate,
    transferDate,
  );

  return {
    totalGain,
    landGain,
    buildingGain,
    landTransferPrice,
    buildingTransferPrice,
    landAcqPrice,
    buildingAcqPrice,
    landAppraisalDed,
    buildingAppraisalDed,
    landStdPriceAtAcq: acqLandStd,
    buildingStdPriceAtAcq: acqBuildingStd,
    landHoldingYears,
    buildingHoldingYears,
  };
}

// ──────────────────────────────────────────────────────────────
// 5. 상가부분 환산취득가액 + 양도차익 분리 (STEP 7)
// ──────────────────────────────────────────────────────────────

export interface CommercialGainSplit {
  estimatedAcqPrice: number;
  totalGain: number;
  landGain: number;
  buildingGain: number;
  landTransferPrice: number;
  buildingTransferPrice: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  landAppraisalDed: number;
  buildingAppraisalDed: number;
  /** 취득시 토지/건물 기준시가 — 개산공제 산식 표시용 */
  landStdPriceAtAcq?: number;
  buildingStdPriceAtAcq?: number;
  landHoldingYears: number;
  buildingHoldingYears: number;
  acqStandardSource: "user_input";
  acqStandardLand: number;
  acqStandardBuilding: number;
}

export function calcCommercialGainSplit(
  commercialTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
  acqDerived?: MixedUseDerivedAreas,
  housingAcqResult?: HousingEstimatedAcqResult,
): CommercialGainSplit {
  // Case A 4부분 안분 — 별도 어댑터 호출
  const fp = housingAcqResult?.phdResult?.fourPartApportionment;
  if (fp) {
    return buildCommercialGainSplitFromFourPart(fp, asset, transferDate);
  }

  // acqDerived 미주입 시 derived 그대로 사용 (backward compat)
  const effectiveAcqDerived = acqDerived ?? derived;

  // 양도시 상가부분 기준시가
  const transferLandStd =
    asset.transferStandardPrice.landPricePerSqm * derived.commercialLandArea;
  const transferTotalStd =
    transferLandStd + asset.transferStandardPrice.commercialBuildingPrice;

  // 취득시 상가부분 기준시가 — 사용자 직접 입력만 허용 (모든 direction 동일)
  // 과거 house_to_commercial 미입력 시 개별주택공시가격을 면적비율로 자동 안분하던 fallback은
  // 세법상 부정확하여 2026-05-01 제거. 미입력 시 명확한 오류로 차단.
  const userBuildingStd = asset.acquisitionStandardPrice.commercialBuildingPrice;
  const userLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;

  if (userBuildingStd <= 0 || userLandPerSqm <= 0) {
    if (asset.partialUsageChange?.direction === "house_to_commercial") {
      throw new Error(
        "보유 중 일부 용도변경(주택→상가): 취득시 상가건물 기준시가와 개별공시지가를 모두 입력하세요. " +
          "취득 당시 동일 건물의 국세청 고시 기준시가를 직접 조회·입력해야 합니다.",
      );
    }
    throw new Error(
      "겸용주택: 취득시 상가건물 기준시가와 개별공시지가를 모두 입력하세요.",
    );
  }

  // 토지분 = 단가 × 면적, 건물분 = 입력값.
  // house_to_commercial은 acqDerived.commercialLandArea = 0이므로 양도시 면적 사용.
  const landAreaForUserInput =
    asset.partialUsageChange?.direction === "house_to_commercial"
      ? derived.commercialLandArea
      : effectiveAcqDerived.commercialLandArea;
  const acqLandStd = userLandPerSqm * landAreaForUserInput;
  const acqBuildingStd = userBuildingStd;
  const acqStandardSource = "user_input" as const;

  const acqTotalStd = acqLandStd + acqBuildingStd;

  // §97 환산취득가액
  const estimatedAcqPrice =
    transferTotalStd > 0
      ? calculateEstimatedAcquisitionPrice(
          commercialTransferPrice,
          acqTotalStd,
          transferTotalStd,
        )
      : 0;

  // 시행령 §166⑥: 양도가액은 양도시 비율, 취득가액은 취득시 비율로 안분
  const acqLandRatio = acqTotalStd > 0 ? acqLandStd / acqTotalStd : 0.5;
  const transferLandRatio = transferTotalStd > 0 ? transferLandStd / transferTotalStd : acqLandRatio;

  // 양도가액 안분 — 양도시 비율
  const landTransferPrice = Math.floor(commercialTransferPrice * transferLandRatio);
  const buildingTransferPrice = commercialTransferPrice - landTransferPrice;

  // 취득가액 안분 — 취득시 비율
  const landAcqPrice = Math.floor(estimatedAcqPrice * acqLandRatio);
  const buildingAcqPrice = estimatedAcqPrice - landAcqPrice;

  // 개산공제 (§163⑥)
  const landAppraisalDed = applyRate(acqLandStd, 0.03);
  const buildingAppraisalDed = applyRate(acqBuildingStd, 0.03);

  const landGain = landTransferPrice - landAcqPrice - landAppraisalDed;
  const buildingGain = buildingTransferPrice - buildingAcqPrice - buildingAppraisalDed;
  const totalGain = landGain + buildingGain;

  const { years: landHoldingYears } = calculateHoldingPeriod(
    asset.landAcquisitionDate,
    transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    asset.buildingAcquisitionDate,
    transferDate,
  );

  return {
    estimatedAcqPrice,
    totalGain,
    landGain,
    buildingGain,
    landTransferPrice,
    buildingTransferPrice,
    landAcqPrice,
    buildingAcqPrice,
    landAppraisalDed,
    buildingAppraisalDed,
    landStdPriceAtAcq: acqLandStd,
    buildingStdPriceAtAcq: acqBuildingStd,
    landHoldingYears,
    buildingHoldingYears,
    acqStandardSource,
    acqStandardLand: acqLandStd,
    acqStandardBuilding: acqBuildingStd,
  };
}

// ──────────────────────────────────────────────────────────────
// 6. 장기보유공제율 계산
//    표2: 1세대1주택 거주 2년+ → min(holdYears×4%,40%) + min(resYears×4%,40%) (합계 최대 80%)
//    표1: 그 외 → Math.min(holdYears×2%, 30%)
// ──────────────────────────────────────────────────────────────

export function calcLongTermRate(
  holdingYears: number,
  residenceYears: number,
  useTable2: boolean,
): number {
  if (holdingYears < 3) return 0;
  if (useTable2) {
    // §95② 별표: 보유분·거주분 '각각' 연 4%·최대 40% 상한을 적용한 뒤 합산(합계 최대 80%).
    // 합산 후 80% 상한만 적용하면 (예: 보유 18년·거주 2년) 보유분이 40%를 넘어 과대 공제된다.
    // 메인 엔진(transfer-tax-helpers.ts)의 표2 산식과 동일하게 각 상한 후 합산.
    const holdingPart = Math.min(holdingYears * 0.04, 0.40);
    const residencePart = Math.min(residenceYears * 0.04, 0.40);
    return holdingPart + residencePart;
  }
  return Math.min(holdingYears * 0.02, 0.30);
}

// ──────────────────────────────────────────────────────────────
// 7. 주택부수토지 배율초과 → 비사업용 이전 (STEP 6)
// ──────────────────────────────────────────────────────────────

export interface ExcessLandResult {
  multiplier: 3 | 5 | 10;
  excessArea: number;
  nonBizRatio: number;
}

export function calcExcessLandRatio(
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
): ExcessLandResult {
  const zoneType = asset.zoneType ?? "residential";
  const isMetro = asset.isMetropolitanArea ?? true;
  const { multiplier: rawMultiplier } = getHousingMultiplier(zoneType, isMetro);
  const multiplier = (rawMultiplier as 3 | 5 | 10);

  const allowedArea = derived.residentialFootprintArea * multiplier;
  const excessArea = Math.max(0, derived.residentialLandArea - allowedArea);
  const nonBizRatio =
    derived.residentialLandArea > 0 ? excessArea / derived.residentialLandArea : 0;

  return { multiplier, excessArea, nonBizRatio };
}

// ──────────────────────────────────────────────────────────────
// 8. 부분별 양도소득금액·세액 조립 헬퍼
// ──────────────────────────────────────────────────────────────

/** 주택부분 조립
 *
 * 처리 순서 (계산 경계 명문화):
 *   ① 비사업용토지 이전 — 주택 토지차익 중 배율초과 면적 비율만큼 비사업용으로 분리.
 *      비사업용토지는 1세대1주택 비과세 대상이 아니므로 12억 안분 적용 X.
 *   ② 12억 초과 비과세 안분 — 비사업용 이전 후 남은 주택부분 양도차익(토지+건물)에만 적용.
 *      §89 ① 3호 단서, 시행령 §160.
 *   ③ 장기보유특별공제 — 12억 안분 후 과세대상 양도차익에 토지/건물 별 보유연수 기반 표율 적용.
 *      이 패턴은 transfer-tax-helpers.ts:382~406 (단일주택 분리계산)과 동일.
 *   ④ 양도소득금액 = 12억 안분 양도차익 - 장기보유공제액.
 */
export function buildHousingPart(
  apportionment: MixedUseApportionment,
  housingAcqResult: HousingEstimatedAcqResult,
  gainSplit: HousingGainSplit,
  excessResult: ExcessLandResult,
  residenceYears: number,
  isOneHouseExempt: boolean = true,  // 미주입 시 true (기존 겸용주택 사례14 등 backward compat)
): MixedUseHousingPart {
  const housingAcq = housingAcqResult.estimatedAcq;
  const HIGH_VALUE_THRESHOLD = 1_200_000_000;
  // ─── 🚨 Critical (이슈 8-A): 다주택자 1세대1주택 비과세 미적용 분기 ───
  // - isOneHouseExempt === false: 다주택자·요건 미충족 → 12억 비과세 미적용 (전액 과세)
  // - isOneHouseExempt === true (기본): 12억 이하 비과세 + 표2 거주공제 가능
  const isExempt =
    isOneHouseExempt && apportionment.housingTransferPrice <= HIGH_VALUE_THRESHOLD;

  // ── ① 비사업용토지 이전 (안분 전 양도차익에서 분리) ──
  const nonBizRatio = excessResult.nonBizRatio;
  const nonBusinessTransferredGain = Math.floor(gainSplit.landGain * nonBizRatio);
  const housingLandGainAfterNB = gainSplit.landGain - nonBusinessTransferredGain;

  // ── ② 12억 초과 비과세 안분 (비사업용 제외 주택부분 양도차익에만 적용) ──
  // §89 ① 3호 단서 — 비사업용토지는 1세대1주택 비과세 대상이 아니므로 비사업용 이전 후 잔여 양도차익에만 안분
  // 🚨 Critical: 다주택자(isOneHouseExempt === false)는 12억 안분이 아니라 전액 과세 (proratio = 1)
  let proratio: number;
  if (!isOneHouseExempt) {
    proratio = 1;  // 다주택자: 전액 과세
  } else if (isExempt) {
    proratio = 0;  // 1세대1주택자 + 12억 이하: 전액 비과세
  } else {
    // 1세대1주택자 + 12억 초과: 안분 과세
    proratio =
      (apportionment.housingTransferPrice - HIGH_VALUE_THRESHOLD) /
      apportionment.housingTransferPrice;
  }

  const proratedLandGain = Math.floor(Math.max(housingLandGainAfterNB, 0) * proratio);
  const proratedBuildingGain = Math.floor(Math.max(gainSplit.buildingGain, 0) * proratio);
  const proratedTaxableGain = proratedLandGain + proratedBuildingGain;

  // ── ③ 장기보유특별공제 (안분 후 과세대상 양도차익에 표율 적용) ──
  // 🚨 Critical: 다주택자는 거주 2년+ 이어도 표1 적용 (1세대1주택 거주공제 미적용)
  const useTable2 = isOneHouseExempt && residenceYears >= 2;
  const longTermDeductionTable: 1 | 2 = useTable2 ? 2 : 1;

  const landDedRate = calcLongTermRate(
    gainSplit.landHoldingYears,
    residenceYears,
    useTable2,
  );
  const buildingDedRate = calcLongTermRate(
    gainSplit.buildingHoldingYears,
    residenceYears,
    useTable2,
  );

  const longTermDeductionAmount =
    applyRate(Math.max(proratedLandGain, 0), landDedRate) +
    applyRate(Math.max(proratedBuildingGain, 0), buildingDedRate);

  // 단일 공제율은 "혼합" — 대표값을 건물 기준으로 표시 (UI용)
  const longTermDeductionRate = buildingDedRate;

  // ── ④ 양도소득금액 ──
  const incomeAmount = Math.max(0, proratedTaxableGain - longTermDeductionAmount);

  return {
    estimatedAcquisitionPrice: housingAcq,
    phdEstimatedAcqHousingPrice: housingAcqResult.phdAcqHousingPrice,
    phdResult: housingAcqResult.phdResult,
    transferGain: gainSplit.totalGain,
    landTransferGain: gainSplit.landGain,
    buildingTransferGain: gainSplit.buildingGain,
    landTransferPrice: gainSplit.landTransferPrice,
    landAcqPrice: gainSplit.landAcqPrice,
    landAppraisalDed: gainSplit.landAppraisalDed,
    landStdPriceAtAcq: gainSplit.landStdPriceAtAcq,
    buildingTransferPrice: gainSplit.buildingTransferPrice,
    buildingAcqPrice: gainSplit.buildingAcqPrice,
    buildingAppraisalDed: gainSplit.buildingAppraisalDed,
    buildingStdPriceAtAcq: gainSplit.buildingStdPriceAtAcq,
    isExempt,
    proratedTaxableGain,
    longTermDeductionTable,
    longTermDeductionRate,
    longTermDeductionAmount,
    incomeAmount,
    nonBusinessTransferRatio: nonBizRatio,
    nonBusinessTransferredGain,
  };
}

/** 상가부분 조립 */
export function buildCommercialPart(
  gainSplit: CommercialGainSplit,
): MixedUseCommercialPart {
  const holdingYears = Math.max(gainSplit.landHoldingYears, gainSplit.buildingHoldingYears);
  const landDedRate = calcLongTermRate(gainSplit.landHoldingYears, 0, false);
  const buildingDedRate = calcLongTermRate(gainSplit.buildingHoldingYears, 0, false);

  const longTermDeductionAmount =
    applyRate(Math.max(gainSplit.landGain, 0), landDedRate) +
    applyRate(Math.max(gainSplit.buildingGain, 0), buildingDedRate);

  const longTermDeductionRate = calcLongTermRate(holdingYears, 0, false);

  return {
    estimatedAcquisitionPrice: gainSplit.estimatedAcqPrice,
    transferGain: gainSplit.totalGain,
    landTransferGain: gainSplit.landGain,
    buildingTransferGain: gainSplit.buildingGain,
    landTransferPrice: gainSplit.landTransferPrice,
    landAcqPrice: gainSplit.landAcqPrice,
    landAppraisalDed: gainSplit.landAppraisalDed,
    landStdPriceAtAcq: gainSplit.landStdPriceAtAcq,
    buildingTransferPrice: gainSplit.buildingTransferPrice,
    buildingAcqPrice: gainSplit.buildingAcqPrice,
    buildingAppraisalDed: gainSplit.buildingAppraisalDed,
    buildingStdPriceAtAcq: gainSplit.buildingStdPriceAtAcq,
    longTermDeductionRate,
    longTermDeductionAmount,
    incomeAmount: Math.max(0, gainSplit.totalGain - longTermDeductionAmount),
    acqStandardSource: gainSplit.acqStandardSource,
    acqStandardTotal: gainSplit.acqStandardLand + gainSplit.acqStandardBuilding,
    acqStandardLand: gainSplit.acqStandardLand,
    acqStandardBuilding: gainSplit.acqStandardBuilding,
  };
}

// buildNonBusinessPart / buildTotalTax 는 transfer-tax-mixed-use-totals.ts 로 분리.
export { buildNonBusinessPart, buildTotalTax } from "./transfer-tax-mixed-use-totals";
