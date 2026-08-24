/**
 * 신고서 양식 — 컬럼별 재무 값 채우기 헬퍼 (4부분·겸용2열·토지건물2열).
 * 800줄 정책 준수를 위해 FilingFormTableHelpers.ts에서 분리 (순수 내부 헬퍼, 외부 importer 없음).
 */
import type {
  MixedUseHousingPart,
  MixedUseCommercialPart,
  MixedUseNonBusinessLandPart,
} from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { SplitPartResult } from "@/lib/tax-engine/types/transfer.types";
import type { ColumnKey } from "./FilingFormTableHelpers";

export function fourPartFinancials(
  hp: MixedUseHousingPart,
  cp: MixedUseCommercialPart,
  /**
   * 배율초과 비사업용토지 파트(「소득세법」 제104조 제5항 본문 후단 — 별개 자산 의제).
   * 전용 열을 세우지 않고 **주택분 토지 열 안에서** 과세/비과세를 가른다:
   * 배율초과분은 주택 부수토지와 같은 필지이고, 후단의 의제는 「제2호의 금액을 계산할 때」로
   * 한정돼 양도차익·필요경비 기재 단계까지 미치지 않기 때문이다.
   */
  nb: MixedUseNonBusinessLandPart | null,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  const nbGain = nb?.transferGain ?? 0;
  const nbLtDeduction = nb?.longTermDeductionAmount ?? 0;
  const nbIncome = nb?.incomeAmount ?? 0;
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
  // 12억 초과 안분 비율의 분모는 **비사토를 뺀** 주택분 양도차익이다 — 엔진(`buildHousingPart` ①②)이
  // 비사토를 먼저 떼어낸 뒤 남은 차익에만 안분하므로, 분모에 비사토를 남기면 그만큼이
  // 「비과세」로 흡수된다. 비사토분은 안분 대상이 아니라 **전액 과세**로 주택분 토지 열에 되돌린다.
  const housingBaseGain = hp.transferGain - nbGain;
  const housingExemptRatio = housingBaseGain > 0 ? hp.proratedTaxableGain / housingBaseGain : 1;
  const housingLandTaxable =
    Math.floor((hp.landTransferGain - nbGain) * housingExemptRatio) + nbGain;
  const housingBuildingTaxable = Math.floor(hp.buildingTransferGain * housingExemptRatio);
  setNum("taxableGain", "housingLand", housingLandTaxable);
  setNum("taxableGain", "housingBuilding", housingBuildingTaxable);
  setNum("taxableGain", "commercialLand", cp.landTransferGain);
  setNum("taxableGain", "commercialBuilding", cp.buildingTransferGain);
  setNum("exemptGain", "housingLand", hp.landTransferGain - housingLandTaxable);
  setNum("exemptGain", "housingBuilding", hp.buildingTransferGain - housingBuildingTaxable);
  setNum("exemptGain", "commercialLand", 0);
  setNum("exemptGain", "commercialBuilding", 0);
  const hpLandRatio = hp.transferGain > 0 ? hp.landTransferGain / hp.transferGain : 0.5;
  const hpBuildRatio = 1 - hpLandRatio;
  const cpLandRatio = cp.transferGain > 0 ? cp.landTransferGain / cp.transferGain : 0.5;
  const cpBuildRatio = 1 - cpLandRatio;
  // 비사토 장특(표1 보유분)은 주택분 토지 열에 함께 싣는다 — 합계 열(§95② 공제 합계)과 정합.
  setNum("ltDeduction", "housingLand", Math.floor(hp.longTermDeductionAmount * hpLandRatio) + nbLtDeduction);
  setNum("ltDeduction", "housingBuilding", Math.floor(hp.longTermDeductionAmount * hpBuildRatio));
  setNum("ltDeduction", "commercialLand", Math.floor(cp.longTermDeductionAmount * cpLandRatio));
  setNum("ltDeduction", "commercialBuilding", Math.floor(cp.longTermDeductionAmount * cpBuildRatio));
  setNum("incomeAmount", "housingLand", Math.floor(hp.incomeAmount * hpLandRatio) + nbIncome);
  setNum("incomeAmount", "housingBuilding", Math.floor(hp.incomeAmount * hpBuildRatio));
  setNum("incomeAmount", "commercialLand", Math.floor(cp.incomeAmount * cpLandRatio));
  setNum("incomeAmount", "commercialBuilding", Math.floor(cp.incomeAmount * cpBuildRatio));
  setNum("incomeAmountAfter", "housingLand", Math.floor(hp.incomeAmount * hpLandRatio) + nbIncome);
  setNum("incomeAmountAfter", "housingBuilding", Math.floor(hp.incomeAmount * hpBuildRatio));
  setNum("incomeAmountAfter", "commercialLand", Math.floor(cp.incomeAmount * cpLandRatio));
  setNum("incomeAmountAfter", "commercialBuilding", Math.floor(cp.incomeAmount * cpBuildRatio));
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
