/**
 * 일반건물(토지+건물 일괄) 환산취득가 — 소득세법 시행령 §176조의2②.
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * general-building-valuation.ts 800줄 정책으로 sibling 분리 (Step 2 환산 전담).
 *
 * §164⑨ 1호 공익수용 특례(토지 전용 — 계획 D16-GB): 토지 환산 **분모**만 min[]로 낮춘다.
 *   - 시행규칙 §80⑧: "보상액 산정 기초 기준시가 = 보상금 산정 당시 해당 **토지**의 개별공시지가" →
 *     건물분(나목)은 대상 아님(보수적).
 *   - 안분(§166⑥ `allocateBundledTransferPrice`)에는 전파하지 않는다 — 토지 환산 분모 전용.
 *   상세 근거: `expropriation-scope.ts` · 계획 §4-7.
 */

import { safeMultiplyThenDivide } from "./tax-utils";
import {
  applyExpropriationValuation,
  type ExpropriationValuationDetail,
} from "./transfer-tax-expropriation-valuation";
import type {
  GeneralBuildingInput,
  GeneralBuildingAllocation,
  GeneralBuildingAcquisition,
} from "./general-building-valuation";

/**
 * Step 2: 환산취득가 (소득세법 시행령 §176조의2②)
 *
 * 자산별로 취득시/양도시 기준시가 비율을 이용해 환산취득가를 산정한다.
 *   토지: landAcq = INT(토지양도가 × 취득시 토지기준시가 / 양도시 토지기준시가)
 *   건물: buildingAcq = INT(건물양도가 × 취득시 건물기준시가 / 양도시 건물기준시가)
 *
 * 토지 분모(양도시 토지기준시가)는 §164⑨ 공익수용 특례 시 min[]로 낮춘다(토지 전용).
 *
 * ⚠️ BigInt 필수: 토지 분자 ≈ 904,725,192 × 238,000,000 ≈ 2.15×10¹⁷ > MAX_SAFE_INTEGER
 */
export function calculateConvertedAcquisition(
  input: GeneralBuildingInput,
  allocation: GeneralBuildingAllocation,
): {
  acquisition: GeneralBuildingAcquisition;
  /** §164⑨ 산출근거 — 게이트 미충족 시 undefined */
  expropriationValuationDetail?: ExpropriationValuationDetail;
} {
  const landStdTotal = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );
  const acqLandStdTotal = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );

  // §164⑨ 1호 공익수용 특례 (토지 전용): 양도시 토지 기준시가(분모)만 min[]로 낮춘다.
  // `applyExpropriationValuation` 재사용(원/㎡ ← transferLandPricePerSqm, 면적 ← landArea).
  // 게이트 미충족 시 null → 현행 분모 유지(회귀 0).
  const exprVal = applyExpropriationValuation({
    propertyType: "general_building",
    useEstimatedAcquisition: true, // GB 2-way = 환산취득가 모드
    transferCause: input.transferCause,
    transferDate: input.transferDate,
    standardPricePerSqmAtTransfer: input.transferLandPricePerSqm,
    transferArea: input.landArea,
    compensationPerSqm: input.compensationPerSqm,
    compensationBasisStdPrice: input.compensationBasisStdPrice,
  });
  const landStdTotalForValuation = exprVal?.denominator ?? landStdTotal;

  // 토지 환산취득가 — 분모만 §164⑨로 낮춤. 분자(allocation.land)는 안분 원값 유지.
  const landAcq = Math.floor(
    safeMultiplyThenDivide(allocation.land, acqLandStdTotal, landStdTotalForValuation),
  );

  // 건물 환산취득가 — 분모(양도시 건물기준시가) 무변경(§164⑨ 미적용)
  const buildingAcq = Math.floor(
    safeMultiplyThenDivide(
      allocation.building,
      input.acquisitionBuildingStdPrice,
      input.transferBuildingStdPrice,
    ),
  );

  return {
    acquisition: { land: landAcq, building: buildingAcq },
    expropriationValuationDetail: exprVal?.detail,
  };
}
