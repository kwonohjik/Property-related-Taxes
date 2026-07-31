/**
 * 겸용주택 분리계산 헬퍼 (순수 함수)
 *
 * transfer-tax-mixed-use.ts에서 사용하는 내부 헬퍼.
 * 소득세법 시행령 §160 ① 단서 / §164 / §168의12 / §95 ②
 */

import { calculateEstimatedAcquisitionPrice, applyRate } from "./tax-utils";
import { getHousingMultiplier } from "./non-business-land/urban-area";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
import {
  applyExprTotalDenominator,
  type ExprTotalValuationDetail,
} from "./transfer-tax-expropriation-valuation";
import {
  resolveHousingInheritedAcqDirect,
  resolveHousingInheritedAcqPhd,
  calcLongTermRate,
  buildHousingLthdEcho,
  type InheritedAcquisitionDetail,
} from "./transfer-tax-mixed-use-inheritance";
import type { PreHousingDisclosureResult } from "./types/transfer.types";
import type { CommercialGainSplit } from "./transfer-tax-mixed-use-commercial";
import type { HousingGainSplit } from "./transfer-tax-mixed-use-housing";
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
import { computeDerivedAreas, round2 } from "./mixed-use-derived-areas";
import { residualArea } from "./area-utils";

// ──────────────────────────────────────────────────────────────
// 1. 면적 파생값 계산
// ──────────────────────────────────────────────────────────────

// round2 · computeDerivedAreas 는 leaf 모듈 `./mixed-use-derived-areas` 로 추출되어
// UI·사이드바·bridge·엔진이 단일 소스를 공유한다. 여기서는 재export 하여 하위 호환 유지.
// `MixedUseAssetInput` 은 leaf 파라미터(residentialLandAreaOverride? 포함) 구조를 만족하므로
// 호출부 `computeDerivedAreas(asset)` 가 그대로 override 를 자동 전파한다 (취득·양도 양시점).
export { computeDerivedAreas };

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
    // 잔액 흡수 정본 — round2(T − x)는 T가 2자리 초과일 때 ±0.01㎡ 어긋난다
    // (예: T=1.005, x=0.08 → 현행 0.93 / 정본 0.92). feedback_area_apportion_residual_absorption
    commercialLandArea: residualArea(asset.totalLandArea, acqResLand),
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

/**
 * 취득 실거래가 안분 (법 §100² — 매매 실가 모드 전용, R1).
 *
 * `apportionTransferPrice`(양도가액·양도시 기준시가)의 **취득시 미러** — 총 취득 실거래가를
 * 취득시 기준시가 비율로 주택분/상가분에 안분. 법 §100²("취득 또는 양도 당시의 기준시가 등을
 * 고려하여 안분")에 직접 근거. 오케스트레이터에서 useActualAcquisition=true일 때 1회 호출.
 *
 * ⚠️ 취득시 상가부수토지 면적은 `acqDerived.commercialLandArea`. house_to_commercial 등
 *    용도변경 조합은 실가 모드 미지원(엔진 throw)이라 여기 도달하지 않음.
 */
export function apportionAcquisitionPrice(
  totalAcqPrice: number,
  asset: MixedUseAssetInput,
  acqDerived: MixedUseDerivedAreas,
): { housingRatio: number; housingAcqPrice: number; commercialAcqPrice: number } {
  const housingStd = asset.acquisitionStandardPrice.housingPrice ?? 0;
  const commercialLandStd = Math.floor(
    asset.acquisitionStandardPrice.landPricePerSqm * acqDerived.commercialLandArea,
  );
  const commercialStd = commercialLandStd + asset.acquisitionStandardPrice.commercialBuildingPrice;
  const totalStd = housingStd + commercialStd;
  // totalStd<=0은 validation(취득시 기준시가 3필드 필수)에서 선차단되어 실경로 도달 불가 — 방어적 균등 0.5.
  // (양도가액 apportionTransferPrice는 미러이나 이 극단 fallback만 0 반환으로 다름 — 도달 불가라 영향 없음.)
  const housingRatio = totalStd > 0 ? housingStd / totalStd : 0.5;
  const housingAcqPrice = Math.floor(totalAcqPrice * housingRatio);
  return {
    housingRatio,
    housingAcqPrice,
    commercialAcqPrice: totalAcqPrice - housingAcqPrice, // 잔액 흡수
  };
}

// ──────────────────────────────────────────────────────────────
// 3. 주택부분 환산취득가액 (STEP 3, §97 또는 §164⑦ PHD)
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
   * PHD §164⑦ 환산 분기 — `partialUsageChange` 결합 시에만 산출.
   *
   * - "case_a_whole_building": firstDisclosureDate < usageChangeDate.
   *   최초공시 시점에 아직 용도변경 전(전체 주택). Sum_A·Sum_F 에 전체 토지면적·전체 건물 사용.
   * - "case_b_housing_only": firstDisclosureDate ≥ usageChangeDate.
   *   최초공시 시점에 이미 겸용. 주택분만 사용.
   * - undefined: 일반 PHD (partialUsageChange 미사용).
   */
  phdScopeBranch?: "case_a_whole_building" | "case_b_housing_only";
  /** §164⑨1호 주택분 총액 특례 산출근거 (계획 P7/D8, 일반 §97 전용) — 적용 시만 */
  expropriationDetail?: ExprTotalValuationDetail;
  /** 상속 취득가액 산정 상세(소령 §163⑨) — acquisitionByInheritance=true일 때만 */
  inheritedAcquisitionDetail?: InheritedAcquisitionDetail;
  /** PHD 상속(§163⑨2호 max) 취득시 토지분 취득가액 — PHD+상속 분기 전용 */
  inheritedLandAcqPrice?: number;
  /** PHD 상속(§163⑨2호 max) 취득시 건물분 취득가액 — PHD+상속 분기 전용 */
  inheritedBuildingAcqPrice?: number;
}

export function calcHousingEstimatedAcq(
  housingTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
  acqDerived?: MixedUseDerivedAreas,
  /** 매매 실가 모드(useActualAcquisition) 취득가액 주택분 — 오케스트레이터 apportionAcquisitionPrice 산출값. */
  actualHousingAcqPrice?: number,
): HousingEstimatedAcqResult {
  // ─── 취득가액 총액 직접 안분 (법 §100²) — 실거래가(R1·§97①1호가목) 또는 감정/매매사례(R-B·§176의2②③) ───
  // 환산·PHD 미적용. 취득가액 총액을 취득시 기준시가 비율로 안분한 주택분을 직접 사용.
  // 개산공제 차이(실거래가=배제·감정/매매사례=적용)는 calcHousingGainSplit의 usesDeemedAcq에서 처리.
  // ⚠️ 미공시(PHD)·보유중용도변경·공익수용 조합은 미지원 — 안분 비율/시점 구조가 달라 별도 설계 필요.
  if (asset.useActualAcquisition || asset.useAppraisalSalesAcquisition) {
    const kind = asset.useActualAcquisition ? "취득 실거래가" : "감정가액·매매사례가액";
    if (asset.usePreHousingDisclosure || asset.partialUsageChange) {
      throw new Error(
        `겸용 ${kind} + 미공시(PHD)·보유 중 용도변경 조합은 아직 지원하지 않습니다. 환산취득가 모드로 입력하세요.`,
      );
    }
    if (asset.transferCause === "public_expropriation") {
      throw new Error(
        `겸용 ${kind} + 공익수용 특례 조합은 아직 지원하지 않습니다.`,
      );
    }
    return { estimatedAcq: actualHousingAcqPrice ?? 0 };
  }

  // §164⑦ PHD 분기 — 겸용주택의 주택부수토지 면적을 토지면적으로 사용
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
      ownershipRatio: asset.ownershipRatio,
      isUnregistered: asset.isUnregistered,
      ...fourPartFields,
    });
    // 상속·증여 취득(소령 §163⑨2호) — 미공시 주택분 = max(신고가액, §164⑦ 환산). 4부분 조합은 Phase 2 범위 밖.
    if (asset.acquisitionByInheritance || asset.acquisitionByGift) {
      if (phdResult.fourPartApportionment) {
        throw new Error(
          "상속 취득 + PHD 4부분 안분(용도변경 결합) 조합은 아직 지원하지 않습니다 (Phase 2 예정).",
        );
      }
      const inherited = resolveHousingInheritedAcqPhd(asset, phdResult);
      return {
        estimatedAcq: inherited.estimatedAcq,
        phdAcqHousingPrice: phdResult.estimatedHousingPriceAtAcquisition,
        phdResult,
        phdScopeBranch,
        inheritedAcquisitionDetail: inherited.detail,
        inheritedLandAcqPrice: inherited.landAcqPrice,
        inheritedBuildingAcqPrice: inherited.buildingAcqPrice,
      };
    }

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

  // 상속 취득(소령 §163⑨ 본문) — 공시(비-PHD) 주택분은 fallback(reportedValue ?? stdCandidate).
  // 보유 중 용도변경(§166⑥ 안분) 조합은 Phase 2 범위 밖(가드) — §164⑨1호 공익수용 특례(exprVal)
  // 분모 계산에도 도달하지 않으므로 상속+공익수용 조합은 이 지점에서 자연 차단.
  if (asset.acquisitionByInheritance || asset.acquisitionByGift) {
    if (asset.partialUsageChange) {
      throw new Error(
        "상속·증여 취득 + 보유 중 용도변경 조합은 아직 지원하지 않습니다 (Phase 2 예정).",
      );
    }
    const inherited = resolveHousingInheritedAcqDirect(asset);
    return { estimatedAcq: inherited.estimatedAcq, inheritedAcquisitionDetail: inherited.detail };
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

  const rawStdAtTransfer = asset.transferStandardPrice.housingPrice;
  if (rawStdAtTransfer <= 0) {
    return { estimatedAcq: 0 };
  }
  // §164⑨1호 공익수용 특례 — 주택분(라목 개별주택가격 총액) 환산 분모만 낮춘다(안분 원값).
  // PHD 분기는 위에서 조기 반환하므로 여기(일반 §97)만 적용. 미충족 시 null → 현행 분모 유지.
  const exprVal = applyExprTotalDenominator({
    standardTotal: rawStdAtTransfer,
    compensationTotal: asset.housingCompensationTotal,
    compensationBasisTotal: asset.housingCompensationBasisTotal,
    isExpropriation: asset.transferCause === "public_expropriation",
    transferDate,
  });
  const stdAtTransfer = exprVal?.denominator ?? rawStdAtTransfer;
  return {
    estimatedAcq: calculateEstimatedAcquisitionPrice(
      housingTransferPrice,
      stdAtAcq,
      stdAtTransfer,
    ),
    expropriationDetail: exprVal?.detail,
  };
}

// STEP 4(주택부분 토지/건물 양도차익 분리)는 800줄 정책에 따라
// transfer-tax-mixed-use-housing.ts 로 분리(2026-07-28) — 상가부분과 대칭 구조.
// 재export 로 기존 호출부(transfer-tax-mixed-use.ts·fourpart·period-split·test) import 경로 유지.
export { calcHousingGainSplit, type HousingGainSplit } from "./transfer-tax-mixed-use-housing";

// STEP 5(상가부분 환산취득가액 + 양도차익 분리, STEP 7)는 800줄 정책에 따라
// transfer-tax-mixed-use-commercial.ts 로 분리(2026-07-20). 아래에서 재export 하여
// 기존 호출부(transfer-tax-mixed-use.ts 등)의 import 경로를 그대로 유지한다.
export { calcCommercialGainSplit, type CommercialGainSplit } from "./transfer-tax-mixed-use-commercial";

// 장기보유공제율(§95② 별표)은 buildHousingLthdEcho와 함께 transfer-tax-mixed-use-inheritance.ts 로
// 이관(800줄 정책). 기존 호출부(totals·period-split·test)의 import 경로 유지를 위해 재export.
export { calcLongTermRate } from "./transfer-tax-mixed-use-inheritance";

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
  /** 양도일 — 영 §168의12 배율 경과조치(2022.1.1., 부칙 §39) 판정용. 미제공 시 현행 배율. */
  transferDate?: Date,
): ExcessLandResult {
  const zoneType = asset.zoneType ?? "residential";
  const isMetro = asset.isMetropolitanArea ?? true;
  const { multiplier: rawMultiplier } = getHousingMultiplier(zoneType, isMetro, transferDate);
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
  // §154⑧3호 표2 '대상 판정'용 통산 거주 연수 (게이트 전용). 거주분 공제율은 residenceYears(실거주) 유지.
  table2ResidenceYears: number,
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
  // 표2 게이트는 통산(table2ResidenceYears), 거주분 공제율은 실거주(residenceYears) — §154⑧3호 / 2021-202.
  const useTable2 = isOneHouseExempt && table2ResidenceYears >= 2;
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

  // echo — 보유/거주 기간분 분리(표시 전용·세액 불변). 계산은 inheritance leaf에 위임(800줄 정책).
  const lthdEcho = buildHousingLthdEcho({
    proratedLandGain,
    proratedBuildingGain,
    landDedRate,
    buildingDedRate,
    landHoldingRate: calcLongTermRate(gainSplit.landHoldingYears, 0, useTable2),
    buildingHoldingRate: calcLongTermRate(gainSplit.buildingHoldingYears, 0, useTable2),
    longTermDeductionAmount,
    buildingHoldingYears: gainSplit.buildingHoldingYears,
    residenceYears,
  });

  // ── ④ 양도소득금액 ──
  const incomeAmount = Math.max(0, proratedTaxableGain - longTermDeductionAmount);

  return {
    estimatedAcquisitionPrice: housingAcq,
    phdEstimatedAcqHousingPrice: housingAcqResult.phdAcqHousingPrice,
    phdResult: housingAcqResult.phdResult,
    inheritedAcquisitionDetail: housingAcqResult.inheritedAcquisitionDetail,
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
    ...lthdEcho,
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
    inheritedAcquisitionDetail: gainSplit.inheritedAcquisitionDetail,
    transferGain: gainSplit.totalGain,
    // 파트별 양도소득금액 — §104①2·3호 단기세율은 토지·건물 각각의 보유기간으로 갈린다.
    // 장특이 이미 파트별(landDedRate·buildingDedRate)이므로 같은 축으로 노출한다(재도출 금지).
    landIncomeAmount: Math.max(0, gainSplit.landGain - applyRate(Math.max(gainSplit.landGain, 0), landDedRate)),
    buildingIncomeAmount: Math.max(
      0,
      gainSplit.buildingGain - applyRate(Math.max(gainSplit.buildingGain, 0), buildingDedRate),
    ),
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
    holdingYears,
    incomeAmount: Math.max(0, gainSplit.totalGain - longTermDeductionAmount),
    acqStandardSource: gainSplit.acqStandardSource,
    acqStandardTotal: gainSplit.acqStandardLand + gainSplit.acqStandardBuilding,
    acqStandardLand: gainSplit.acqStandardLand,
    acqStandardBuilding: gainSplit.acqStandardBuilding,
  };
}

// buildNonBusinessPart / buildTotalTax 는 transfer-tax-mixed-use-totals.ts 로 분리.
export { buildNonBusinessPart, buildTotalTax } from "./transfer-tax-mixed-use-totals";
