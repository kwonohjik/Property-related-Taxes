/**
 * 일반건물 증축 환산취득가 계산 엔진 (사례 33)
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 *
 * 원취득(토지+건물1) + 증축분(건물2) 혼재 케이스 — 4가지 조합 지원:
 *   조합 A: 원건물 실가 안분 + 건물2 환산취득가 (사례 33 기존 동작)
 *   조합 B: 원건물 실가 안분 + 건물2 실가 직접 입력
 *   조합 C: 원건물 환산취득가 (사례 31 산식) + 건물2 환산취득가
 *   조합 D: 원건물 환산취득가 + 건물2 실가 직접 입력
 *
 * buildGeneralBuildingAssetCards() 의 extensionInfo 분기 전용.
 * 직접 호출 금지 — general-building-valuation.ts 오케스트레이터에서만 진입.
 *
 * 법령 근거:
 *   소득세법 시행령 §166 ⑥ — 기준시가 비율 3-way 안분 (토지/건물1/건물2)
 *   소득세법 시행령 §176조의2 ② — 원건물·건물2 환산취득가
 *   소득세법 §97 ② 2호 + 시행령 §163 ⑥ — 개산공제 (취득시 기준시가 × 3%)
 *   소득세법 §114조의2 ① — 건물2 가산세 (extensionAcquisitionCause + extensionDate)
 *
 * 원건물 모드 판별 (옵션 B — 필드 유무):
 *   ext.actualBundledAcquisitionPrice !== undefined → 실가 모드
 *   ext.actualBundledAcquisitionPrice === undefined → 환산 모드 (§176의2②)
 */

import { computeEstimatedDeduction, safeMultiplyThenDivide } from "./tax-utils";
import { apportionLandByBusinessArea } from "./general-building-area-apportion";
import { getBuildingSiteMultiplier } from "./non-business-land/urban-area";
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
  // NOTE: #16에서 acquisitionMode 분기 추가 예정. 현재는 "estimated" 경로만 지원.
  // optional로 완화된 필드는 0 fallback — denom3===0 검증에서 차단됨.
  const extStdTotal = ext.transferExtensionBuildingStdPrice ?? 0; // 건물2 총액
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

  // ── Step 2: 토지+건물1 취득가·필요경비 결정 (원건물 모드 분기) ───────
  //
  // 원건물 모드 판별 (옵션 B):
  //   actualBundledAcquisitionPrice !== undefined → "actual" (실가 2-way 안분)
  //   actualBundledAcquisitionPrice === undefined → "estimated" (사례 31 환산 산식)
  //
  // 공통: 취득시 기준시가 (환산 분자 + 안분 비율 분모 공유)
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

  // 원건물 실가 모드 여부 (옵션 B)
  const isOriginActual = ext.actualBundledAcquisitionPrice !== undefined;

  let landAcq: number;
  let building1Acq: number;
  let landExp: number;
  let building1Exp: number;
  /** 토지·건물1 카드의 usedEstimatedAcquisition 플래그 */
  let originUsedEstimated: boolean;

  if (isOriginActual) {
    // ── 조합 A / B: 원건물 실가 2-way 안분 (§166⑥ 취득시 비율) ─────────
    // §166⑥은 "취득가액을 안분할 때도 기준시가 비율"을 사용.
    // 취득시 기준시가 비율로 일괄실가를 토지·건물1에 배분.
    // QA 2026-05-11 버그 수정: 양도시 비율 → 취득시 비율로 정정
    // (양도시 비율 사용 시 정답표 T-05=164,880,819와 수학적으로 동시 만족 불가)
    const bundledAcq = ext.actualBundledAcquisitionPrice!;
    const bundledExp = ext.actualBundledExpenses ?? 0;

    landAcq = Math.floor(
      safeMultiplyThenDivide(bundledAcq, acqLandStdTotal, denom2),
    );
    building1Acq = bundledAcq - landAcq; // 잔액 보정

    landExp = Math.floor(
      safeMultiplyThenDivide(bundledExp, acqLandStdTotal, denom2),
    );
    building1Exp = bundledExp - landExp; // 잔액 보정

    originUsedEstimated = false;
  } else {
    // ── 조합 C / D: 원건물 환산취득가 (사례 31 §176의2② 산식 재사용) ───
    //
    // 토지 환산취득가: INT(토지 안분 양도가 × 취득시 공시지가 총액 / 양도시 공시지가 총액)
    // 건물1 환산취득가: INT(건물1 안분 양도가 × 취득시 건물기준시가 / 양도시 건물기준시가)
    // ⚠️ BigInt: 분자 ≈ 수억 × 수억 > MAX_SAFE_INTEGER — safeMultiplyThenDivide 사용
    landAcq = Math.floor(
      safeMultiplyThenDivide(landTransferPrice, acqLandStdTotal, landStdTotal),
    );
    building1Acq = Math.floor(
      safeMultiplyThenDivide(
        building1TransferPrice,
        acqBuilding1StdTotal,
        buildingStdTotal,
      ),
    );

    // 개산공제: 취득시 기준시가 × 3% (§163⑥ — 환산 모드에서는 필요경비 = 개산공제만)
    landExp = computeEstimatedDeduction(acqLandStdTotal, rate, input.ownershipRatio);
    building1Exp = computeEstimatedDeduction(acqBuilding1StdTotal, rate, input.ownershipRatio);

    originUsedEstimated = true;
  }

  // ── Step 3: 건물2 취득가·필요경비 결정 (건물2 모드 분기) ─────────────
  //
  // ext.acquisitionMode (default: "estimated"):
  //   "estimated" → 환산취득가 (§176의2②) + 개산공제 (§163⑥)
  //   "actual"    → 실가 직접 입력 + 필요경비 직접 입력 + 개산공제 없음
  const extensionMode = ext.acquisitionMode ?? "estimated";

  let building2Acq: number;
  let building2EstDeduction: number;
  let extensionUsedEstimated: boolean;

  if (extensionMode === "estimated") {
    // 환산 분자: 건물2 안분 양도가 (총 양도가 아님 — 설계 검토 정정 #2)
    const acqExtStd = ext.acquisitionExtensionBuildingStdPrice ?? 0;
    const transExtStd = ext.transferExtensionBuildingStdPrice ?? 0;
    building2Acq = Math.floor(
      safeMultiplyThenDivide(
        building2TransferPrice,
        acqExtStd,
        transExtStd,
      ),
    );
    // 개산공제: 취득시 건물2 기준시가 × 3% (§163⑥ — 취득시 기준시가 기준)
    // ★ 환산취득가(building2Acq) × 3% 아님 (설계 §5 확정)
    building2EstDeduction = computeEstimatedDeduction(acqExtStd, rate, input.ownershipRatio);
    extensionUsedEstimated = true;
  } else {
    // 실가 직접 입력 — 개산공제 없음 (실가 취득비용은 별도 필요경비로 처리)
    building2Acq = ext.actualAcquisitionPrice ?? 0;
    building2EstDeduction = ext.actualExpenses ?? 0;
    extensionUsedEstimated = false;
  }

  // ── 비사업용토지 판정 (공통) ──────────────────────────────────────────
  // 「소득세법」 제104조의3 제1항 제4호 나목 → 「지방세법」 제106조 제1항 제2호
  //   → 「지방세법 시행령」 제101조 제1항 제2호(바닥면적 × 제2항 적용배율).
  // ⚠️ 「소득세법 시행령」 제168조의12(주택 부수토지)는 이 경로에 쓰지 않는다.
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
    // 「지방세법 시행령」 제101조 제2항 표에 없는 용도지역(residential 등)은 추정 금지 → 차단
    const resolved = getBuildingSiteMultiplier(input.zoneType as ZoneType);
    if (!resolved) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `일반건물(증축) 비사업용토지 판정: 용도지역 "${input.zoneType}"은 「지방세법 시행령」 제101조 제2항 적용배율표에 대응 항목이 없습니다.`,
      );
    }
    const { multiplier, detail } = resolved;
    appliedMultiplier = multiplier;
    multiplierDetail = detail;
    allowedLandArea = input.buildingFootprintArea * multiplier;
    isWithinNblRatio = input.landArea <= allowedLandArea;
  }

  const nonBusinessArea = Math.max(0, input.landArea - allowedLandArea);
  const nonBusinessRatio =
    input.landArea > 0
      ? nonBusinessArea / input.landArea
      : 0;

  // ── Step 4: 자산 카드 3장 생성 ────────────────────────────────────────
  // originUsedEstimated: 토지·건물1 카드에 적용 (원건물 모드에 따라 결정됨)
  // extensionUsedEstimated: 건물2 카드에 적용 (건물2 모드에 따라 결정됨)
  const assetCards: AssetCardForAggregate[] = [];

  // 토지 카드 (비사업용 분할 포함 — 인정면적 직접 안분, round 의존 제거)
  if (!isWithinNblRatio && nonBusinessRatio > 0) {
    const landBusinessTransfer = apportionLandByBusinessArea(landTransferPrice, allowedLandArea, input.landArea);
    const landBusinessAcq = apportionLandByBusinessArea(landAcq, allowedLandArea, input.landArea);
    const landBusinessExp = apportionLandByBusinessArea(landExp, allowedLandArea, input.landArea);
    assetCards.push({
      propertyId: "land_business",
      propertyLabel: "토지-사업용(1001)",
      propertyType: "land",
      transferPrice: landBusinessTransfer,
      acquisitionPrice: landBusinessAcq,
      expenses: landBusinessExp,
      usedEstimatedAcquisition: originUsedEstimated,
      estimatedBase: originUsedEstimated ? landBusinessAcq : 0,
      estimatedDeduction: originUsedEstimated ? landBusinessExp : 0,
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
      usedEstimatedAcquisition: originUsedEstimated,
      estimatedBase: originUsedEstimated ? landAcq - landBusinessAcq : 0,
      estimatedDeduction: originUsedEstimated ? landExp - landBusinessExp : 0,
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
      usedEstimatedAcquisition: originUsedEstimated,
      estimatedBase: originUsedEstimated ? landAcq : 0,
      estimatedDeduction: originUsedEstimated ? landExp : 0,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  }

  // 건물1 카드 — 원건물 모드에 따라 usedEstimatedAcquisition 분기
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
    usedEstimatedAcquisition: originUsedEstimated,
    estimatedBase: originUsedEstimated ? building1Acq : 0,
    estimatedDeduction: originUsedEstimated ? building1Exp : 0,
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

  // 건물2 카드 — 건물2 모드에 따라 usedEstimatedAcquisition 분기
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
    usedEstimatedAcquisition: extensionUsedEstimated,
    estimatedBase: extensionUsedEstimated ? building2Acq : 0,
    estimatedDeduction: extensionUsedEstimated ? building2EstDeduction : 0,
    acquisitionDate: ext.extensionDate,
    transferDate: input.transferDate,
    isNonBusinessLand: false,
    isExtensionBuilding: true,
    isSelfBuilt: building2IsSelfBuilt,
    buildingType: "extension", // §114조의2① 증축 — 85㎡ 게이트 진입 (신축 취급 방지)
    extensionFloorArea: ext.extensionFloorArea85, // 85㎡ 초과 판정값
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
    // ── 산식 변수 (사례 33 — 3-way 양도가 안분 + 2-way 취득가 안분/환산)
    landStdTotal,
    buildingStdTotal,
    extensionStdTotal: extStdTotal,
    acqLandStdTotal,
    acqBuilding1StdTotal,
    acqExtensionStdTotal: ext.acquisitionExtensionBuildingStdPrice ?? undefined,
  };
}
