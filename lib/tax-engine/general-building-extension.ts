/**
 * 일반건물 증축 환산취득가 계산 엔진 (사례 33)
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 *
 * 원취득(토지+건물1 실가 일괄 안분) + 증축분(건물2 환산취득가) 혼재 케이스.
 * buildGeneralBuildingAssetCards() 의 extensionInfo 분기 전용.
 * 직접 호출 금지 — general-building-valuation.ts 오케스트레이터에서만 진입.
 *
 * 법령 근거:
 *   소득세법 시행령 §166 ⑥ — 기준시가 비율 3-way 안분 (토지/건물1/건물2)
 *   소득세법 시행령 §176조의2 ② — 건물2 환산취득가
 *   소득세법 §97 ② 2호 + 시행령 §163 ⑥ — 건물2 개산공제 (취득시 기준시가 × 3%)
 *   소득세법 §114조의2 ① — 건물2 가산세 (extensionAcquisitionCause + extensionDate)
 */

import { safeMultiplyThenDivide } from "./tax-utils";
import { getLandFootprintMultiplier } from "./non-business-land/urban-area";
import type { ZoneType } from "./non-business-land/types";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import {
  ESTIMATED_DEDUCTION_RATE_LAND_BUILDING,
  type GeneralBuildingInput,
  type GeneralBuildingOutput,
  type AssetCardForAggregate,
} from "./general-building-valuation";

// ============================================================
// 증축 3-way 분기 메인 함수
// ============================================================

/**
 * 증축 건물(3-asset) 환산취득가 계산 — 자산 카드 3장 생성
 *
 * 사례 33: 원취득(토지+건물1 실가 일괄 안분) + 증축분(건물2 환산취득가) 혼재.
 *
 * 4단 파이프라인:
 *   Step 1: 양도가 3-way 안분 (§166⑥ — 토지/건물1/건물2)
 *   Step 2: 일괄 취득가 2-way 안분 (토지+건물1만, §166⑥ 양도시 비율)
 *   Step 3: 건물2 환산취득가 + 개산공제 (§176의2② + §163⑥)
 *   Step 4: 자산 카드 3장 출력 (토지/건물1/건물2)
 *
 * @internal buildGeneralBuildingAssetCards() 에서만 호출. 직접 호출 금지.
 */
export function buildGeneralBuildingAssetCardsWithExtension(
  input: GeneralBuildingInput,
  ext: NonNullable<GeneralBuildingInput["extensionInfo"]>,
): GeneralBuildingOutput {
  const rate =
    input.estimatedDeductionRate ?? ESTIMATED_DEDUCTION_RATE_LAND_BUILDING;

  // ── Step 1: 양도가 3-way 안분 (§166⑥) ─────────────────────────────
  // 분모: 양도시 토지기준시가 + 건물1기준시가 + 건물2기준시가 (원 총액 통일)
  const landStdTotal = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );
  const buildingStdTotal = input.transferBuildingStdPrice; // 건물1 총액
  const extStdTotal = ext.transferExtensionBuildingStdPrice; // 건물2 총액
  const denom3 = landStdTotal + buildingStdTotal + extStdTotal;

  if (denom3 === 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "일반건물 증축 안분: 양도시 기준시가 합계(토지+건물1+건물2)가 0입니다. 기준시가를 입력하세요.",
    );
  }

  // 토지·건물1 안분 — BigInt 연산 (분자 ≈ 3.3억 × 수십억 > MAX_SAFE_INTEGER)
  const landTransferPrice = Math.floor(
    safeMultiplyThenDivide(input.totalTransferPrice, landStdTotal, denom3),
  );
  const building1TransferPrice = Math.floor(
    safeMultiplyThenDivide(input.totalTransferPrice, buildingStdTotal, denom3),
  );
  // 건물2 = 잔액 보정 (3중 floor 오차 방지)
  const building2TransferPrice =
    input.totalTransferPrice - landTransferPrice - building1TransferPrice;

  // ── Step 2: 일괄 취득가 2-way 안분 (토지+건물1만, §166⑥ 취득시 비율) ──
  // 건물2는 별도 환산 → 분배 대상 아님. 분모 = 취득시 토지 + 건물1 기준시가.
  // §166⑥은 "취득가액을 안분할 때도 기준시가 비율"을 사용하며,
  // 취득가액(일괄실가) 안분의 분모는 취득시 기준시가로 계산하는 것이 법령 취지에 부합.
  // QA 2026-05-11 버그 수정: 양도시 비율 → 취득시 비율로 정정
  // (양도시 비율 사용 시 정답표 T-05=164,880,819와 수학적으로 동시 만족 불가)
  const acqLandStdTotal = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );
  const acqBuilding1StdTotal = input.acquisitionBuildingStdPrice; // 건물1 취득시 기준시가
  const denom2 = acqLandStdTotal + acqBuilding1StdTotal;

  if (denom2 === 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "일반건물 증축 안분: 취득시 기준시가 합계(토지+건물1)가 0입니다. 기준시가를 입력하세요.",
    );
  }

  // 실가 안분 → usedEstimatedAcquisition=false (토지·건물1 카드)
  const bundledAcq = ext.actualBundledAcquisitionPrice;
  const bundledExp = ext.actualBundledExpenses;

  const landAcq = Math.floor(
    safeMultiplyThenDivide(bundledAcq, acqLandStdTotal, denom2),
  );
  const building1Acq = bundledAcq - landAcq; // 잔액 보정

  const landExp = Math.floor(
    safeMultiplyThenDivide(bundledExp, acqLandStdTotal, denom2),
  );
  const building1Exp = bundledExp - landExp; // 잔액 보정

  // ── Step 3: 건물2 환산취득가 + 개산공제 (§176의2② + §163⑥) ──────────
  // 환산 분자: 건물2 안분 양도가 (총 양도가 아님 — 설계 검토 정정 #2)
  const building2Acq = Math.floor(
    safeMultiplyThenDivide(
      building2TransferPrice,
      ext.acquisitionExtensionBuildingStdPrice,
      ext.transferExtensionBuildingStdPrice,
    ),
  );
  // 개산공제: 취득시 건물2 기준시가 × 3% (§163⑥ — 취득시 기준시가 기준)
  // ★ 환산취득가(building2Acq) × 3% 아님 (설계 §5 확정)
  const building2EstDeduction = Math.floor(
    ext.acquisitionExtensionBuildingStdPrice * rate,
  );

  // ── 비사업용토지 판정 (공통, §104의3·§168의12) ───────────────────────
  let appliedMultiplier: number;
  let multiplierDetail: string;
  let allowedLandArea: number;
  let isWithinNblRatio: boolean;

  if (input.isUnregistered) {
    appliedMultiplier = 0;
    multiplierDetail = "무허가건축물 — 전체 비사업용";
    allowedLandArea = 0;
    isWithinNblRatio = false;
  } else {
    if (!input.zoneType) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "일반건물(증축) 비사업용토지 판정: zoneType(용도지역)이 입력되지 않았습니다.",
      );
    }
    const { multiplier, detail } = getLandFootprintMultiplier(
      input.zoneType as ZoneType,
      input.isMetropolitan ?? false,
      "general_building",
    );
    appliedMultiplier = multiplier;
    multiplierDetail = detail;
    allowedLandArea = input.buildingFootprintArea * multiplier;
    isWithinNblRatio = input.landArea <= allowedLandArea;
  }

  const nonBusinessArea = Math.max(0, input.landArea - allowedLandArea);
  const nonBusinessRatio =
    input.landArea > 0
      ? Math.round((nonBusinessArea / input.landArea) * 10000) / 10000
      : 0;
  const businessRatio = 1 - nonBusinessRatio;

  // ── Step 4: 자산 카드 3장 생성 ────────────────────────────────────────
  const assetCards: AssetCardForAggregate[] = [];

  // 토지 카드 (비사업용 분할 포함)
  if (!isWithinNblRatio && nonBusinessRatio > 0) {
    const landBusinessTransfer = Math.floor(landTransferPrice * businessRatio);
    const landBusinessAcq = Math.floor(landAcq * businessRatio);
    const landBusinessExp = Math.floor(landExp * businessRatio);
    assetCards.push({
      propertyId: "land_business",
      propertyLabel: "토지-사업용(1001)",
      propertyType: "land",
      transferPrice: landBusinessTransfer,
      acquisitionPrice: landBusinessAcq,
      expenses: landBusinessExp,
      usedEstimatedAcquisition: false,
      estimatedBase: 0,
      estimatedDeduction: 0,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
    assetCards.push({
      propertyId: "land_nbl",
      propertyLabel: "토지-비사업용초과분(1002)",
      propertyType: "land",
      transferPrice: landTransferPrice - landBusinessTransfer,
      acquisitionPrice: landAcq - landBusinessAcq,
      expenses: landExp - landBusinessExp,
      usedEstimatedAcquisition: false,
      estimatedBase: 0,
      estimatedDeduction: 0,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: true,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  } else {
    assetCards.push({
      propertyId: "land",
      propertyLabel: "토지(1001)",
      propertyType: "land",
      transferPrice: landTransferPrice,
      acquisitionPrice: landAcq,
      expenses: landExp,
      usedEstimatedAcquisition: false,
      estimatedBase: 0,
      estimatedDeduction: 0,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  }

  // 건물1 카드 — 실가 안분, usedEstimatedAcquisition=false
  // buildingAcquisitionCause는 건물1 원취득 기준 (건물2는 extensionAcquisitionCause 별도).
  const building1AcqDate =
    input.buildingAcquisitionDate ?? input.acquisitionDate;
  const building1IsSelfBuilt =
    input.buildingAcquisitionCause === "newConstruction";
  assetCards.push({
    propertyId: "building1",
    propertyLabel: "건물(3001)",
    propertyType: "general_building_unit",
    transferPrice: building1TransferPrice,
    acquisitionPrice: building1Acq,
    expenses: building1Exp,
    usedEstimatedAcquisition: false,
    estimatedBase: 0,
    estimatedDeduction: 0,
    acquisitionDate: building1AcqDate,
    transferDate: input.transferDate,
    isNonBusinessLand: false,
    isExtensionBuilding: false,
    isSelfBuilt: building1IsSelfBuilt,
    buildingAcquisitionDate: building1AcqDate,
    buildingAcquisitionCause: input.buildingAcquisitionCause,
    ...(input.buildingAcquisitionCause === "inheritance"
      ? (() => {
          const bd =
            input.buildingDecedentAcquisitionDate ??
            input.decedentAcquisitionDate;
          return bd ? { decedentAcquisitionDate: bd } : {};
        })()
      : {}),
    ...(input.buildingAcquisitionCause === "gift"
      ? (() => {
          const bd =
            input.buildingDonorAcquisitionDate ?? input.donorAcquisitionDate;
          return bd ? { donorAcquisitionDate: bd } : {};
        })()
      : {}),
  });

  // 건물2 카드 — 환산취득가, usedEstimatedAcquisition=true
  // acquisitionDate = extensionDate (건물2 LTHD 기산점 = 증축일)
  // isSelfBuilt: extensionAcquisitionCause==="newConstruction" → §114조의2 가산세 발동 가능
  const building2IsSelfBuilt = ext.extensionAcquisitionCause === "newConstruction";
  assetCards.push({
    propertyId: "building2",
    propertyLabel: "증축건물(3002)",
    propertyType: "general_building_unit",
    transferPrice: building2TransferPrice,
    acquisitionPrice: building2Acq,
    expenses: building2EstDeduction,
    usedEstimatedAcquisition: true,
    estimatedBase: building2Acq,
    estimatedDeduction: building2EstDeduction,
    acquisitionDate: ext.extensionDate,
    transferDate: input.transferDate,
    isNonBusinessLand: false,
    isExtensionBuilding: true,
    isSelfBuilt: building2IsSelfBuilt,
    buildingAcquisitionDate: ext.extensionDate, // §114조의2 5년 기산점
    buildingAcquisitionCause: ext.extensionAcquisitionCause,
  });

  // allocation·acquisition·estimatedDeduction 출력 구조는 2-way 기준 호환.
  // 증축 경로에서는 토지·건물1 값으로 채움 (건물2는 assetCards에 직접 포함).
  return {
    allocation: { land: landTransferPrice, building: building1TransferPrice },
    acquisition: { land: landAcq, building: building1Acq },
    estimatedDeduction: { land: landExp, building: building1Exp },
    buildingFootprintArea: input.buildingFootprintArea,
    appliedMultiplier,
    multiplierDetail,
    allowedLandArea,
    isWithinNblRatio,
    nonBusinessArea,
    nonBusinessRatio,
    assetCards,
  };
}
