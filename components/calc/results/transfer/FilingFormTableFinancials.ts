/**
 * 신고서 양식 — 컬럼별 재무 값 채우기 헬퍼 (4부분·겸용2열·토지건물2열).
 * 800줄 정책 준수를 위해 FilingFormTableHelpers.ts에서 분리 (순수 내부 헬퍼, 외부 importer 없음).
 */
import type { MixedUseHousingPart, MixedUseCommercialPart } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { SplitPartResult } from "@/lib/tax-engine/types/transfer.types";
import type { ColumnKey } from "./FilingFormTableHelpers";

export function fourPartFinancials(
  hp: MixedUseHousingPart,
  cp: MixedUseCommercialPart,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  setNum("transferPrice", "housingLand", hp.landTransferPrice);
  setNum("transferPrice", "housingBuilding", hp.buildingTransferPrice);
  setNum("transferPrice", "commercialLand", cp.landTransferPrice);
  setNum("transferPrice", "commercialBuilding", cp.buildingTransferPrice);
  setNum("acquisitionPrice", "housingLand", hp.landAcqPrice);
  setNum("acquisitionPrice", "housingBuilding", hp.buildingAcqPrice);
  setNum("acquisitionPrice", "commercialLand", cp.landAcqPrice);
  setNum("acquisitionPrice", "commercialBuilding", cp.buildingAcqPrice);
  setNum("expenses", "housingLand", hp.landAppraisalDed);
  setNum("expenses", "housingBuilding", hp.buildingAppraisalDed);
  setNum("expenses", "commercialLand", cp.landAppraisalDed);
  setNum("expenses", "commercialBuilding", cp.buildingAppraisalDed);
  setNum("transferGain", "housingLand", hp.landTransferGain);
  setNum("transferGain", "housingBuilding", hp.buildingTransferGain);
  setNum("transferGain", "commercialLand", cp.landTransferGain);
  setNum("transferGain", "commercialBuilding", cp.buildingTransferGain);
  const housingExemptRatio = hp.transferGain > 0 ? hp.proratedTaxableGain / hp.transferGain : 1;
  setNum("taxableGain", "housingLand", Math.floor(hp.landTransferGain * housingExemptRatio));
  setNum("taxableGain", "housingBuilding", Math.floor(hp.buildingTransferGain * housingExemptRatio));
  setNum("taxableGain", "commercialLand", cp.landTransferGain);
  setNum("taxableGain", "commercialBuilding", cp.buildingTransferGain);
  setNum("exemptGain", "housingLand", hp.landTransferGain - Math.floor(hp.landTransferGain * housingExemptRatio));
  setNum("exemptGain", "housingBuilding", hp.buildingTransferGain - Math.floor(hp.buildingTransferGain * housingExemptRatio));
  setNum("exemptGain", "commercialLand", 0);
  setNum("exemptGain", "commercialBuilding", 0);
  const hpLandRatio = hp.transferGain > 0 ? hp.landTransferGain / hp.transferGain : 0.5;
  const hpBuildRatio = 1 - hpLandRatio;
  const cpLandRatio = cp.transferGain > 0 ? cp.landTransferGain / cp.transferGain : 0.5;
  const cpBuildRatio = 1 - cpLandRatio;
  setNum("ltDeduction", "housingLand", Math.floor(hp.longTermDeductionAmount * hpLandRatio));
  setNum("ltDeduction", "housingBuilding", Math.floor(hp.longTermDeductionAmount * hpBuildRatio));
  setNum("ltDeduction", "commercialLand", Math.floor(cp.longTermDeductionAmount * cpLandRatio));
  setNum("ltDeduction", "commercialBuilding", Math.floor(cp.longTermDeductionAmount * cpBuildRatio));
  setNum("incomeAmount", "housingLand", Math.floor(hp.incomeAmount * hpLandRatio));
  setNum("incomeAmount", "housingBuilding", Math.floor(hp.incomeAmount * hpBuildRatio));
  setNum("incomeAmount", "commercialLand", Math.floor(cp.incomeAmount * cpLandRatio));
  setNum("incomeAmount", "commercialBuilding", Math.floor(cp.incomeAmount * cpBuildRatio));
  setNum("incomeAmountAfter", "housingLand", Math.floor(hp.incomeAmount * hpLandRatio));
  setNum("incomeAmountAfter", "housingBuilding", Math.floor(hp.incomeAmount * hpBuildRatio));
  setNum("incomeAmountAfter", "commercialLand", Math.floor(cp.incomeAmount * cpLandRatio));
  setNum("incomeAmountAfter", "commercialBuilding", Math.floor(cp.incomeAmount * cpBuildRatio));
}

export function mixedTwoColFinancials(
  hp: MixedUseHousingPart,
  cp: MixedUseCommercialPart,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  setNum("transferPrice", "housing", hp.landTransferPrice + hp.buildingTransferPrice);
  setNum("transferPrice", "commercial", cp.landTransferPrice + cp.buildingTransferPrice);
  setNum("acquisitionPrice", "housing", hp.estimatedAcquisitionPrice);
  setNum("acquisitionPrice", "commercial", cp.estimatedAcquisitionPrice);
  setNum("expenses", "housing", hp.landAppraisalDed + hp.buildingAppraisalDed);
  setNum("expenses", "commercial", cp.landAppraisalDed + cp.buildingAppraisalDed);
  setNum("transferGain", "housing", hp.transferGain);
  setNum("transferGain", "commercial", cp.transferGain);
  setNum("exemptGain", "housing", hp.transferGain - hp.proratedTaxableGain);
  setNum("exemptGain", "commercial", 0);
  setNum("taxableGain", "housing", hp.proratedTaxableGain);
  setNum("taxableGain", "commercial", cp.transferGain);
  setNum("ltDeduction", "housing", hp.longTermDeductionAmount);
  setNum("ltDeduction", "commercial", cp.longTermDeductionAmount);
  setNum("incomeAmount", "housing", hp.incomeAmount);
  setNum("incomeAmount", "commercial", cp.incomeAmount);
  setNum("incomeAmountAfter", "housing", hp.incomeAmount);
  setNum("incomeAmountAfter", "commercial", cp.incomeAmount);
}

export function splitTwoColFinancials(
  land: SplitPartResult,
  building: SplitPartResult,
  taxableRatio: number,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  setNum("transferPrice", "land", land.transferPrice);
  setNum("transferPrice", "building", building.transferPrice);
  setNum("acquisitionPrice", "land", land.acquisitionPrice);
  setNum("acquisitionPrice", "building", building.acquisitionPrice);
  setNum("expenses", "land", land.directExpenses + land.appraisalDeduction);
  setNum("expenses", "building", building.directExpenses + building.appraisalDeduction);
  setNum("transferGain", "land", land.gain);
  setNum("transferGain", "building", building.gain);
  const landTaxable = Math.floor(land.gain * taxableRatio);
  const buildingTaxable = Math.floor(building.gain * taxableRatio);
  setNum("taxableGain", "land", landTaxable);
  setNum("taxableGain", "building", buildingTaxable);
  setNum("exemptGain", "land", land.gain - landTaxable);
  setNum("exemptGain", "building", building.gain - buildingTaxable);
  setNum("ltDeduction", "land", land.longTermDeduction);
  setNum("ltDeduction", "building", building.longTermDeduction);
  const landIncome = landTaxable - land.longTermDeduction;
  const buildingIncome = buildingTaxable - building.longTermDeduction;
  setNum("incomeAmount", "land", landIncome);
  setNum("incomeAmount", "building", buildingIncome);
  setNum("incomeAmountAfter", "land", landIncome);
  setNum("incomeAmountAfter", "building", buildingIncome);
}
