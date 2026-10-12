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
import { splitPartAcquisitionDeducted } from "@/lib/tax-engine/transfer-tax-split-display";
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
  //
  // OH-17 — §154③ 본문으로 상가 부분도 주택이 되면(`deemedHouseBy154_3Main`) 비사토 차익에 **상가 토지분**
  // 배율 초과 몫이 합쳐진다. 주택분 몫은 엔진 `nonBusinessTransferredGain`, 나머지가 상가분 몫이다
  // (단서 경로에서는 두 값이 같아 상가분 몫은 0 — 종전과 동일).
  const hpNbGain = hp.nonBusinessTransferredGain;
  const cpNbGain = nbGain - hpNbGain;
  const housingBaseGain = hp.transferGain - hpNbGain;
  const housingExemptRatio = housingBaseGain > 0 ? hp.proratedTaxableGain / housingBaseGain : 1;
  // #2141 — 나중에 취득한 부수토지가 보유요건 미달이면 토지분은 비율 안분이 아니라 **전액 과세**이고, 나머지가 건물분 과세다.
  //   엔진과 같이 비사토 이전 후 토지 차익의 음수는 0으로 본다(`buildHousingPart` ②). 장특은 보유 미달로 토지 0 · 건물만.
  const laterLandGain = hp.laterLandExemptExcluded ? Math.max(hp.landTransferGain - hpNbGain, 0) : 0;
  const housingLandTaxable = hp.laterLandExemptExcluded
    ? laterLandGain + hpNbGain
    : Math.floor((hp.landTransferGain - hpNbGain) * housingExemptRatio) + hpNbGain;
  const housingBuildingTaxable = hp.laterLandExemptExcluded
    ? hp.proratedTaxableGain - laterLandGain
    : Math.floor(hp.buildingTransferGain * housingExemptRatio);
  const commercialExempt = cp.deemedHouseBy154_3Main === true;
  // 주택으로 본 상가 부분의 과세 토지분(#2141 — 장특 0) — 그 밖에는 0.
  const commercialLandLaterTaxable = commercialExempt ? cp.incomeAmount + cp.longTermDeductionAmount : 0;
  setNum("taxableGain", "housingLand", housingLandTaxable);
  setNum("taxableGain", "housingBuilding", housingBuildingTaxable);
  // 상가 토지분 배율 초과 몫은 같은 열에서 과세(비과세 대상 아님)로 남긴다 — 열별 과세+비과세 = 양도차익.
  setNum("taxableGain", "commercialLand", commercialExempt ? cpNbGain + commercialLandLaterTaxable : cp.landTransferGain);
  setNum("taxableGain", "commercialBuilding", commercialExempt ? 0 : cp.buildingTransferGain);
  setNum("exemptGain", "housingLand", hp.landTransferGain - housingLandTaxable);
  setNum("exemptGain", "housingBuilding", hp.buildingTransferGain - housingBuildingTaxable);
  setNum("exemptGain", "commercialLand", commercialExempt ? cp.landTransferGain - cpNbGain - commercialLandLaterTaxable : 0);
  setNum("exemptGain", "commercialBuilding", commercialExempt ? cp.buildingTransferGain : 0);
  const hpLandRatio = hp.transferGain > 0 ? hp.landTransferGain / hp.transferGain : 0.5;
  const hpBuildRatio = 1 - hpLandRatio;
  const cpLandRatio = cp.transferGain > 0 ? cp.landTransferGain / cp.transferGain : 0.5;
  const cpBuildRatio = 1 - cpLandRatio;
  // 비사토 장특(표1 보유분)은 주택분 토지 열에 함께 싣는다 — 합계 열(§95② 공제 합계)과 정합.
  // #2141 — 나중 토지 제외면 주택분 장특은 건물분뿐이고 토지 소득금액은 과세 토지 차익 그대로다. 주택으로 본 상가 부분은
  //   건물분이 비과세라 상가 소득금액(장특 0)은 전부 토지 열이다. 그 밖에는 종전대로 양도차익 비율로 나눈다.
  const hpLtLand = hp.laterLandExemptExcluded ? 0 : Math.floor(hp.longTermDeductionAmount * hpLandRatio);
  const hpLtBuilding = hp.laterLandExemptExcluded
    ? hp.longTermDeductionAmount
    : Math.floor(hp.longTermDeductionAmount * hpBuildRatio);
  const hpIncomeLand = hp.laterLandExemptExcluded ? laterLandGain : Math.floor(hp.incomeAmount * hpLandRatio);
  const hpIncomeBuilding = hp.laterLandExemptExcluded
    ? hp.incomeAmount - laterLandGain
    : Math.floor(hp.incomeAmount * hpBuildRatio);
  const cpIncomeLand = commercialExempt ? cp.incomeAmount : Math.floor(cp.incomeAmount * cpLandRatio);
  const cpIncomeBuilding = commercialExempt ? 0 : Math.floor(cp.incomeAmount * cpBuildRatio);
  setNum("ltDeduction", "housingLand", hpLtLand + nbLtDeduction);
  setNum("ltDeduction", "housingBuilding", hpLtBuilding);
  setNum("ltDeduction", "commercialLand", Math.floor(cp.longTermDeductionAmount * cpLandRatio));
  setNum("ltDeduction", "commercialBuilding", Math.floor(cp.longTermDeductionAmount * cpBuildRatio));
  setNum("incomeAmount", "housingLand", hpIncomeLand + nbIncome);
  setNum("incomeAmount", "housingBuilding", hpIncomeBuilding);
  setNum("incomeAmount", "commercialLand", cpIncomeLand);
  setNum("incomeAmount", "commercialBuilding", cpIncomeBuilding);
  setNum("incomeAmountAfter", "housingLand", hpIncomeLand + nbIncome);
  setNum("incomeAmountAfter", "housingBuilding", hpIncomeBuilding);
  setNum("incomeAmountAfter", "commercialLand", cpIncomeLand);
  setNum("incomeAmountAfter", "commercialBuilding", cpIncomeBuilding);
}

export function splitTwoColFinancials(
  land: SplitPartResult,
  building: SplitPartResult,
  taxableRatio: number,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  setNum("transferPrice", "land", land.transferPrice);
  setNum("transferPrice", "building", building.transferPrice);
  // §97②2호 단서 swap 파트는 취득가액을 차감하지 않는다(0) — 합계 열(`summarizeSplitGain`)과 같은 정의라야
  // 「양도가 − 취득가 − 경비 = 양도차익」 항등식이 열별로도 성립한다(H-7).
  setNum("acquisitionPrice", "land", splitPartAcquisitionDeducted(land));
  setNum("acquisitionPrice", "building", splitPartAcquisitionDeducted(building));
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
