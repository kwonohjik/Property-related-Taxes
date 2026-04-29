/**
 * 검용주택 분리계산 헬퍼 (순수 함수)
 *
 * transfer-tax-mixed-use.ts에서 사용하는 내부 헬퍼.
 * 소득세법 시행령 §160 ① 단서 / §164 / §168의12 / §95 ②
 */

import { calculateEstimatedAcquisitionPrice, calculateHoldingPeriod, applyRate } from "./tax-utils";
import { getHousingMultiplier } from "./non-business-land/urban-area";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
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
}

export function calcHousingEstimatedAcq(
  housingTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
): HousingEstimatedAcqResult {
  // §164⑤ PHD 분기 — 검용주택의 주택부수토지 면적을 토지면적으로 사용
  if (asset.usePreHousingDisclosure && asset.preHousingDisclosure) {
    const phdResult = calcPreHousingDisclosureGain(housingTransferPrice, {
      ...asset.preHousingDisclosure,
      landArea: derived.residentialLandArea,
    });
    return {
      estimatedAcq: phdResult.totalEstimatedAcquisitionPrice,
      phdAcqHousingPrice: phdResult.estimatedHousingPriceAtAcquisition,
      phdResult,
    };
  }

  // 기존 §97 직접 환산
  const stdAtAcq = asset.acquisitionStandardPrice.housingPrice ?? 0;
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
  landHoldingYears: number;
  buildingHoldingYears: number;
}

export function calcHousingGainSplit(
  housingTransferPrice: number,
  housingAcqResult: HousingEstimatedAcqResult,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
): HousingGainSplit {
  const housingEstimatedAcq = housingAcqResult.estimatedAcq;

  // PHD 분기 — 산식 상세에서 토지/건물 안분값 직접 사용
  if (housingAcqResult.phdResult) {
    const phd = housingAcqResult.phdResult;
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
      landHoldingYears,
      buildingHoldingYears,
    };
  }

  // 기존 §97 분기 — 시행령 §166⑥: 양도가액은 양도시 비율, 취득가액은 취득시 비율로 안분
  // 취득시 토지/건물 기준시가 (취득가액 안분 + 개산공제 base)
  const acqLandStd =
    asset.acquisitionStandardPrice.landPricePerSqm * derived.residentialLandArea;
  const acqHousingTotal = asset.acquisitionStandardPrice.housingPrice ?? 0;
  const acqBuildingStd = Math.max(acqHousingTotal - acqLandStd, 0);
  const acqTotal = acqLandStd + acqBuildingStd;
  const acqLandRatio = acqTotal > 0 ? acqLandStd / acqTotal : 0.5;

  // 양도시 토지/건물 기준시가 (양도가액 안분용)
  // 개별주택공시가격은 토지+건물 일괄이므로, 양도시 토지분 = 공시지가 × 주택부수토지 면적,
  // 양도시 건물분 = 개별주택공시가격 - 토지분 (음수 방지).
  const transferLandStd =
    asset.transferStandardPrice.landPricePerSqm * derived.residentialLandArea;
  const transferHousingTotal = asset.transferStandardPrice.housingPrice;
  const transferBuildingStd = Math.max(transferHousingTotal - transferLandStd, 0);
  const transferTotal = transferLandStd + transferBuildingStd;
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
  landHoldingYears: number;
  buildingHoldingYears: number;
}

export function calcCommercialGainSplit(
  commercialTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
): CommercialGainSplit {
  // 취득시 상가부분 기준시가
  const acqLandStd =
    asset.acquisitionStandardPrice.landPricePerSqm * derived.commercialLandArea;
  const acqBuildingStd = asset.acquisitionStandardPrice.commercialBuildingPrice;
  const acqTotalStd = acqLandStd + acqBuildingStd;

  // 양도시 상가부분 기준시가
  const transferLandStd =
    asset.transferStandardPrice.landPricePerSqm * derived.commercialLandArea;
  const transferTotalStd =
    transferLandStd + asset.transferStandardPrice.commercialBuildingPrice;

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
    landHoldingYears,
    buildingHoldingYears,
  };
}

// ──────────────────────────────────────────────────────────────
// 6. 장기보유공제율 계산
//    표2: 1세대1주택 거주 2년+ → Math.min(holdYears×4% + resYears×4%, 80%)
//    표1: 그 외 → Math.min(holdYears×2%, 30%)
// ──────────────────────────────────────────────────────────────

export function calcLongTermRate(
  holdingYears: number,
  residenceYears: number,
  useTable2: boolean,
): number {
  if (holdingYears < 3) return 0;
  if (useTable2) {
    return Math.min(holdingYears * 0.04 + residenceYears * 0.04, 0.80);
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
): MixedUseHousingPart {
  const housingAcq = housingAcqResult.estimatedAcq;
  const HIGH_VALUE_THRESHOLD = 1_200_000_000;
  const isExempt = apportionment.housingTransferPrice <= HIGH_VALUE_THRESHOLD;

  // ── ① 비사업용토지 이전 (안분 전 양도차익에서 분리) ──
  const nonBizRatio = excessResult.nonBizRatio;
  const nonBusinessTransferredGain = Math.floor(gainSplit.landGain * nonBizRatio);
  const housingLandGainAfterNB = gainSplit.landGain - nonBusinessTransferredGain;

  // ── ② 12억 초과 비과세 안분 (비사업용 제외 주택부분 양도차익에만 적용) ──
  // §89 ① 3호 단서 — 비사업용토지는 1세대1주택 비과세 대상이 아니므로 비사업용 이전 후 잔여 양도차익에만 안분
  const proratio = isExempt
    ? 0
    : (apportionment.housingTransferPrice - HIGH_VALUE_THRESHOLD) /
      apportionment.housingTransferPrice;

  const proratedLandGain = Math.floor(Math.max(housingLandGainAfterNB, 0) * proratio);
  const proratedBuildingGain = Math.floor(Math.max(gainSplit.buildingGain, 0) * proratio);
  const proratedTaxableGain = proratedLandGain + proratedBuildingGain;

  // ── ③ 장기보유특별공제 (안분 후 과세대상 양도차익에 표율 적용) ──
  const useTable2 = residenceYears >= 2;
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
    buildingTransferPrice: gainSplit.buildingTransferPrice,
    buildingAcqPrice: gainSplit.buildingAcqPrice,
    buildingAppraisalDed: gainSplit.buildingAppraisalDed,
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
    buildingTransferPrice: gainSplit.buildingTransferPrice,
    buildingAcqPrice: gainSplit.buildingAcqPrice,
    buildingAppraisalDed: gainSplit.buildingAppraisalDed,
    longTermDeductionRate,
    longTermDeductionAmount,
    incomeAmount: Math.max(0, gainSplit.totalGain - longTermDeductionAmount),
  };
}

/** 비사업용토지 부분 조립 */
export function buildNonBusinessPart(
  housingPart: MixedUseHousingPart,
  excessResult: ExcessLandResult,
  landHoldingYears: number,
): MixedUseNonBusinessLandPart | null {
  if (excessResult.excessArea <= 0) return null;

  const transferredGain = housingPart.nonBusinessTransferredGain;
  const deductionRate = calcLongTermRate(landHoldingYears, 0, false);
  const longTermDeductionAmount = applyRate(Math.max(transferredGain, 0), deductionRate);

  return {
    excessArea: excessResult.excessArea,
    appliedMultiplier: excessResult.multiplier,
    transferGain: transferredGain,
    longTermDeductionRate: deductionRate,
    longTermDeductionAmount,
    incomeAmount: Math.max(0, transferredGain - longTermDeductionAmount),
    additionalRate: 0.10,
  };
}

/** 합산 세액 조립 */
export function buildTotalTax(
  housingIncome: number,
  commercialIncome: number,
  nonBizIncome: number,
  brackets: TaxBracket[],
): MixedUseTotalTax {
  const BASIC_DEDUCTION = 2_500_000;

  const aggregateIncome = housingIncome + commercialIncome + nonBizIncome;
  const taxBase = Math.max(0, aggregateIncome - BASIC_DEDUCTION);
  const taxByBasicRate = calculateProgressiveTax(taxBase, brackets);
  const nonBusinessSurcharge = applyRate(nonBizIncome, 0.10);
  const transferTax = taxByBasicRate + nonBusinessSurcharge;
  const localTax = applyRate(transferTax, 0.10);

  return {
    aggregateIncome,
    basicDeduction: BASIC_DEDUCTION,
    taxBase,
    taxByBasicRate,
    nonBusinessSurcharge,
    transferTax,
    localTax,
    totalPayable: transferTax + localTax,
  };
}
