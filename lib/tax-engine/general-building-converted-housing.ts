/**
 * 사례 35 후속-1 — 양도소득세 집행기준 99-164-10 환산주택가격.
 *
 * 주택으로 개별주택가격이 최초공시된 후 상가로 용도를 변경하여 양도하는 경우
 * 취득당시 환산주택가격을 산정하고, 자산별 취득당시 기준시가 비율로 안분하여
 * acquisition*StdPrice를 override한다.
 *
 * `general-building-valuation.ts` 800줄 정책 회피를 위해 sibling 분리.
 */

import type { GeneralBuildingInput } from "./general-building-valuation";
import { safeMultiplyThenDivide } from "./tax-utils";

/**
 * §99-164-10 환산주택가격 산식.
 *
 *   환산주택가격 = 최초공시주택가격
 *                × (취득당시 토지기준시가 + 취득당시 건물기준시가)
 *                ÷ (최초공시 당시 토지기준시가 + 최초공시 당시 건물기준시가)
 */
export function calcConvertedHousingPrice(input: GeneralBuildingInput): number {
  const acqLandStd = (input.acquisitionLandPricePerSqm ?? 0) * input.landArea;
  const acqBuildingStd = input.acquisitionBuildingStdPrice ?? 0;
  const firstDiscLand = input.firstDisclosureLandStdPrice ?? 0;
  const firstDiscBuilding = input.firstDisclosureBuildingStdPrice ?? 0;
  const firstDiscTotal = firstDiscLand + firstDiscBuilding;
  if (firstDiscTotal <= 0) return 0;
  const acqTotal = acqLandStd + acqBuildingStd;
  return safeMultiplyThenDivide(input.firstDisclosurePrice ?? 0, acqTotal, firstDiscTotal);
}

/**
 * 환산주택가격을 자산별 취득당시 기준시가 비율로 안분하여
 * `acquisitionLandPricePerSqm` + `acquisitionBuildingStdPrice` 를 override.
 *
 * hasFirstDisclosure=false 시 input 그대로 반환 — 회귀 0.
 * 환산 모드는 GeneralBuildingInput 진입 시점에 이미 결정되어 있음
 * (route helper `actualPriceMode===false` 분기에서만 본 함수 도달).
 */
export function applyConvertedHousingPriceOverride(
  input: GeneralBuildingInput,
): GeneralBuildingInput {
  if (!input.hasFirstDisclosure) return input;
  const acqLandStd = (input.acquisitionLandPricePerSqm ?? 0) * input.landArea;
  const acqBuildingStd = input.acquisitionBuildingStdPrice ?? 0;
  const acqTotal = acqLandStd + acqBuildingStd;
  if (acqTotal <= 0) return input;
  const converted = calcConvertedHousingPrice(input);
  if (converted <= 0) return input;
  const convertedLand = safeMultiplyThenDivide(converted, acqLandStd, acqTotal);
  const convertedBuilding = converted - convertedLand;
  return {
    ...input,
    acquisitionLandPricePerSqm: input.landArea > 0
      ? Math.floor(convertedLand / input.landArea)
      : 0,
    acquisitionBuildingStdPrice: convertedBuilding,
  };
}
