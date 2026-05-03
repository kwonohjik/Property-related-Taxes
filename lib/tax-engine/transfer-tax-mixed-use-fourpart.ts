/**
 * 검용주택 PHD Case A 4부분 안분 결과 → mixed-use Gain Split 어댑터.
 *
 * 적용 범위 (절대 한정):
 *   - usePreHousingDisclosure === true
 *   - partialUsageChange.direction === "house_to_commercial"
 *   - firstDisclosureDate < usageChangeDate (Case A)
 *   - PHD 입력에 commercialBuildingStdPriceAt* + housing/commercialLandArea + totalTransferPriceForFourPart 모두 충족
 *
 * 조건 미충족 시 호출자에서 분기 안 함 (= 기존 2부분 흐름 유지).
 */

import { calculateHoldingPeriod } from "./tax-utils";
import type { PreHousingDisclosureResult } from "./types/transfer.types";
import type { MixedUseAssetInput } from "./types/transfer-mixed-use.types";
import type { HousingGainSplit, CommercialGainSplit } from "./transfer-tax-mixed-use-helpers";

/** PHD 4부분 결과 → 주택부분 HousingGainSplit 변환 */
export function buildHousingGainSplitFromFourPart(
  fp: NonNullable<PreHousingDisclosureResult["fourPartApportionment"]>,
  asset: MixedUseAssetInput,
  transferDate: Date,
): HousingGainSplit {
  const { years: landHoldingYears } = calculateHoldingPeriod(
    asset.landAcquisitionDate,
    transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    asset.buildingAcquisitionDate,
    transferDate,
  );
  return {
    totalGain: fp.housingGainSum,
    landGain: fp.housingLandGain,
    buildingGain: fp.housingBuildingGain,
    landTransferPrice: fp.housingLandTransferPrice,
    buildingTransferPrice: fp.housingBuildingTransferPrice,
    landAcqPrice: Math.floor(fp.housingLandAcqPrice),
    buildingAcqPrice: Math.floor(fp.housingBuildingAcqPrice),
    landAppraisalDed: fp.housingLandLumpDed,
    buildingAppraisalDed: fp.housingBuildingLumpDed,
    landStdPriceAtAcq: fp.housingLandAcqShare,
    buildingStdPriceAtAcq: fp.housingBuildingAcqShare,
    landHoldingYears,
    buildingHoldingYears,
  };
}

/** PHD 4부분 결과 → 상가부분 CommercialGainSplit 변환 */
export function buildCommercialGainSplitFromFourPart(
  fp: NonNullable<PreHousingDisclosureResult["fourPartApportionment"]>,
  asset: MixedUseAssetInput,
  transferDate: Date,
): CommercialGainSplit {
  const { years: landHoldingYears } = calculateHoldingPeriod(
    asset.landAcquisitionDate,
    transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    asset.buildingAcquisitionDate,
    transferDate,
  );
  return {
    estimatedAcqPrice: Math.floor(fp.commercialLandAcqPrice + fp.commercialBuildingAcqPrice),
    totalGain: fp.commercialGainSum,
    landGain: fp.commercialLandGain,
    buildingGain: fp.commercialBuildingGain,
    landTransferPrice: fp.commercialLandTransferPrice,
    buildingTransferPrice: fp.commercialBuildingTransferPrice,
    landAcqPrice: Math.floor(fp.commercialLandAcqPrice),
    buildingAcqPrice: Math.floor(fp.commercialBuildingAcqPrice),
    landAppraisalDed: fp.commercialLandLumpDed,
    buildingAppraisalDed: fp.commercialBuildingLumpDed,
    landStdPriceAtAcq: fp.commercialLandAcqShare,
    buildingStdPriceAtAcq: fp.commercialBuildingAcqShare,
    landHoldingYears,
    buildingHoldingYears,
    acqStandardSource: "user_input",
    acqStandardLand: fp.commercialLandStdAtAcq,
    acqStandardBuilding: fp.commercialBuildingStdAtAcq,
  };
}
