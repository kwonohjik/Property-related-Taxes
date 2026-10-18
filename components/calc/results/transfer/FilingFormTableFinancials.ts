/**
 * 신고서 양식 — 컬럼별 재무 값 채우기 헬퍼 (4부분·겸용2열·토지건물2열).
 * 800줄 정책 준수를 위해 FilingFormTableHelpers.ts에서 분리 (순수 내부 헬퍼, 외부 importer 없음).
 */
import type {
  MixedUseHousingPart,
  MixedUseCommercialPart,
  MixedUseNonBusinessLandPart,
  MixedUseGainBreakdown,
} from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { splitLtDeduction } from "./FilingFormTableDateHelpers";
import type { SplitPartResult } from "@/lib/tax-engine/types/transfer.types";
import type { SplitNonBusinessLandPart } from "@/lib/tax-engine/types/transfer-split-gain.types";
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
  // 재산세제과-915 회신 방식(고가주택 + 배율 초과)이면 엔진이 파트별 과세 양도차익·장특을 echo한다(`highValueExcessRuling`) — 안분 비율을 다시 곱해 만들지 않고 그대로 읽는다.
  //   종전 식(`(토지 − 비사토) × 비율`)은 초과분을 이중으로 빼는 옛 산식이라 이 경우 엔진 값과 어긋난다.
  const ruling = hp.highValueExcessRuling;
  // 파트 echo(`partLthd`) — 엔진이 장특을 곱한 파트별 과세 양도차익·장특을 그대로 싣는다(915 회신·나중 취득 토지도 같은 값이다).
  //   있으면 그것이 정본이고, 아래 비율 근사는 echo가 없는 옛 결과(`resultData`)의 fallback이다.
  const hpPart = hp.partLthd;
  const housingLandTaxable = hpPart
    ? hpPart.land.taxableGain + hpNbGain
    : ruling
    ? ruling.landTaxableGain + hpNbGain
    : hp.laterLandExemptExcluded
      ? laterLandGain + hpNbGain
      : Math.floor((hp.landTransferGain - hpNbGain) * housingExemptRatio) + hpNbGain;
  const housingBuildingTaxable = hpPart
    ? hpPart.building.taxableGain
    : ruling
    ? ruling.buildingTaxableGain
    : hp.laterLandExemptExcluded
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
  const hpLtLand = hpPart
    ? hpPart.land.longTermDeduction
    : ruling
    ? ruling.landLongTermDeduction
    : hp.laterLandExemptExcluded ? 0 : Math.floor(hp.longTermDeductionAmount * hpLandRatio);
  const hpLtBuilding = hpPart
    ? hpPart.building.longTermDeduction
    : ruling
    ? ruling.buildingLongTermDeduction
    : hp.laterLandExemptExcluded
      ? hp.longTermDeductionAmount
      : Math.floor(hp.longTermDeductionAmount * hpBuildRatio);
  const hpIncomeLand = hpPart
    ? hpPart.land.taxableGain - hpPart.land.longTermDeduction
    : ruling
    ? ruling.landTaxableGain - ruling.landLongTermDeduction
    : hp.laterLandExemptExcluded ? laterLandGain : Math.floor(hp.incomeAmount * hpLandRatio);
  const hpIncomeBuilding = hpPart
    ? hpPart.building.taxableGain - hpPart.building.longTermDeduction
    : ruling
    ? ruling.buildingTaxableGain - ruling.buildingLongTermDeduction
    : hp.laterLandExemptExcluded
      ? hp.incomeAmount - laterLandGain
      : Math.floor(hp.incomeAmount * hpBuildRatio);
  // 상가분 — 파트 echo가 있으면 토지·건물 각자의 공제율로 계산한 장특·소득금액 그대로(주택으로 본 상가 부분은 echo가 없다 — 자체 분기).
  //   양도소득금액 열은 그 열의 양도차익(음수 그대로 — 위 과세대상 양도차익 열과 같은 값) − 파트 장특이다. 한쪽 차익이 음수여도
  //   열 합 = 상가 소득금액(차익 합 − 장특 합)이 된다(합계가 음수라 0으로 막힌 경우만 예외).
  const cpPart = commercialExempt ? undefined : cp.partLthd;
  const cpIncomeLand = commercialExempt
    ? cp.incomeAmount
    : cpPart
      ? cp.landTransferGain - cpPart.land.longTermDeduction
      : Math.floor(cp.incomeAmount * cpLandRatio);
  const cpIncomeBuilding = commercialExempt
    ? 0
    : cpPart
      ? cp.buildingTransferGain - cpPart.building.longTermDeduction
      : Math.floor(cp.incomeAmount * cpBuildRatio);
  setNum("ltDeduction", "housingLand", hpLtLand + nbLtDeduction);
  setNum("ltDeduction", "housingBuilding", hpLtBuilding);
  setNum("ltDeduction", "commercialLand", cpPart ? cpPart.land.longTermDeduction : Math.floor(cp.longTermDeductionAmount * cpLandRatio));
  setNum("ltDeduction", "commercialBuilding", cpPart ? cpPart.building.longTermDeduction : Math.floor(cp.longTermDeductionAmount * cpBuildRatio));
  setNum("incomeAmount", "housingLand", hpIncomeLand + nbIncome);
  setNum("incomeAmount", "housingBuilding", hpIncomeBuilding);
  setNum("incomeAmount", "commercialLand", cpIncomeLand);
  setNum("incomeAmount", "commercialBuilding", cpIncomeBuilding);
  setNum("incomeAmountAfter", "housingLand", hpIncomeLand + nbIncome);
  setNum("incomeAmountAfter", "housingBuilding", hpIncomeBuilding);
  setNum("incomeAmountAfter", "commercialLand", cpIncomeLand);
  setNum("incomeAmountAfter", "commercialBuilding", cpIncomeBuilding);
}

/**
 * 토지·건물 2열 모드의 열별 재무 값.
 *
 * `nb`(배율 초과 부수토지 = 비사업용 토지 파트 — 「소득세법」 제104조 제5항 본문 후단의 별개 자산 의제)가 **없으면**
 * 종전 그대로 과세 비율(`taxableRatio`)을 파트 양도차익에 곱한다. 있으면 엔진 echo를 그대로 읽는다 —
 * 균일 비율로는 「토지 이내분 = 안분값 − 초과분(0 하한)」·「초과분 전액 과세」·「초과분 표1 장특」을 만들 수 없다.
 * 겸용주택 4열(`fourPartFinancials`)과 같은 규약이다: 초과분은 전용 열을 세우지 않고 **토지 열 안에서** 합산한다
 * (취득가액·필요경비 칸이 토지 전체 기준이라 `양도가 − 취득가 − 필요경비 = 양도차익`이 열 안에서 성립하고,
 * 파트 단위 양도가·취득가를 엔진이 echo하지 않는 초과분을 따로 지어낼 필요가 없다).
 */
export function splitTwoColFinancials(
  land: SplitPartResult,
  building: SplitPartResult,
  taxableRatio: number,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
  nb?: SplitNonBusinessLandPart,
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
  const landTaxable = nb
    ? (land.taxableGainAfterProration ?? land.gain) + (nb.taxableGainAfterProration ?? nb.gain)
    : Math.floor(land.gain * taxableRatio);
  const buildingTaxable = nb
    ? (building.taxableGainAfterProration ?? building.gain)
    : Math.floor(building.gain * taxableRatio);
  setNum("taxableGain", "land", landTaxable);
  setNum("taxableGain", "building", buildingTaxable);
  // 비과세 양도차익 = 열의 전체 양도차익 − 열의 과세 양도차익 — 한쪽 파트가 양도차손이면 그 열은 음수로 남는다(전체 양도차익 행과 같은 부호 · 열 합 = 합계 열).
  setNum("exemptGain", "land", land.gain - landTaxable);
  setNum("exemptGain", "building", building.gain - buildingTaxable);
  const landLt = land.longTermDeduction + (nb?.longTermDeduction ?? 0);
  setNum("ltDeduction", "land", landLt);
  setNum("ltDeduction", "building", building.longTermDeduction);
  const landIncome = landTaxable - landLt;
  const buildingIncome = buildingTaxable - building.longTermDeduction;
  setNum("incomeAmount", "land", landIncome);
  setNum("incomeAmount", "building", buildingIncome);
  setNum("incomeAmountAfter", "land", landIncome);
  setNum("incomeAmountAfter", "building", buildingIncome);
}

/**
 * 배율 초과 부수토지 인용 — 엔진 문구(`transfer-tax-appurtenant-land.ts`·`transfer-tax-rental-housing-nbl-split.ts`)와 같은 표기다.
 * `NBL.*`에는 항·호까지 담은 상수가 없다(`NBL.MAIN`은 조까지) — 새 표기를 만들지 않고 저장소 관행 문자열을 그대로 쓴다.
 */
export const NB_EXCESS_CITATION = "「소득세법」 제104조의3 제1항 제5호";

/** 초과분이 합산된 토지 열 칸의 각주 — 행 키(`RowDef` 키)별. 이 다섯 행 외에는 초과분이 숫자에 섞이지 않는다. */
export type SplitNonBusinessLandNotes = Record<
  "taxableGain" | "exemptGain" | "ltDeduction" | "ltHoldingPart" | "incomeAmount" | "incomeAmountAfter",
  string
>;

/**
 * 초과분을 합산한 토지 열의 구성 각주 — 「기준면적 이내 토지분 + 배율 초과 부수토지분」을 숫자로 밝힌다.
 * 열 값만으로는 초과분이 섞였는지 알 수 없다(겸용 4열은 별도 비사업용 카드가 따로 있다). 합산이 숫자에 영향을 주는 모든 행에 단다.
 * 엔진 echo를 그대로 읽는다 — 값을 새로 계산하지 않는다(소득금액의 파트별 값은 echo 과세 양도차익 − echo 장특의 차이일 뿐이다).
 * 문구에 `/`·`÷`를 쓰지 않는다(분수 치환 방지). 고가주택 기준금액은 양도일 연혁(6억·9억·12억)이라 금액을 문구에 넣지 않는다.
 */
export function splitNonBusinessLandNotes(
  land: SplitPartResult,
  nb: SplitNonBusinessLandPart,
): SplitNonBusinessLandNotes {
  const f = (n: number) => n.toLocaleString();
  const nbTaxable = nb.taxableGainAfterProration ?? nb.gain;
  const landTaxable = land.taxableGainAfterProration ?? land.gain;
  const income =
    `기준면적 이내 토지분 ${f(landTaxable - land.longTermDeduction)} + 배율 초과 부수토지분 ${f(nbTaxable - nb.longTermDeduction)} ` +
    "(과세 양도차익에서 장기보유특별공제를 뺀 금액)";
  return {
    taxableGain:
      `기준면적 이내 토지분 ${f(landTaxable)} + 배율 초과 부수토지분 ${f(nbTaxable)} ` +
      `(초과 ${nb.excessArea}㎡ — 비사업용 토지로 안분 없이 전액 과세, ${NB_EXCESS_CITATION})`,
    exemptGain: "배율 초과 부수토지분은 비과세 대상이 아니라 이 칸에 들어가지 않습니다",
    ltDeduction:
      `기준면적 이내 토지분 ${f(land.longTermDeduction)} + 배율 초과 부수토지분 ${f(nb.longTermDeduction)} ` +
      `(표1 — 토지 보유 ${nb.holdingYears}년, 공제율 ${Math.round(nb.longTermRate * 100)}%)`,
    ltHoldingPart: "배율 초과 부수토지분의 표1 보유분 포함",
    incomeAmount: income,
    incomeAmountAfter: income,
  };
}

/**
 * 겸용 4열 — 장기보유특별공제 **보유 기간분 · 거주 기간분** 행.
 *
 * 엔진 파트 echo(`partLthd`)가 있으면 열마다 그 보유분·거주분을 그대로 싣고 **합계 열 = 열 합**이다(장특 행과 같은 열 값 ·
 * 열 안에서 보유분 + 거주분 = 장특). 주택분 토지 열에는 배율 초과 비사토 장특(표1 보유분)을 더한다.
 *
 * echo가 없는 옛 결과(`resultData`)는 종전 근사 그대로다 — 주택 장특 합계를 건물 보유개월·거주개월 비율로 나누고(`splitLtDeduction`)
 * 토지·건물 열은 양도차익 비율(915 회신 방식이면 그 echo 비율)로 나눈다. 토지·건물 공제율이 다르면 이 근사는 틀린다(계획서
 * `transfer-mixed-use-filing-lthd-part-split.plan.md` §2 — 거주분 합계 열이 엔진보다 7,246,107 많았던 사례).
 */
export function fourPartLthdSplitRows(
  mu: MixedUseGainBreakdown,
  holdingMs: number,
  residenceMs: number,
  useTable2: boolean,
  setNum: (rowKey: string, col: ColumnKey, n: number | null) => void,
) {
  const nbLtDeduction = mu.nonBusinessLandPart?.longTermDeductionAmount ?? 0;
  const hpPart = mu.housingPart.partLthd;
  const cpPart = mu.commercialPart.deemedHouseBy154_3Main === true ? undefined : mu.commercialPart.partLthd;
  if (hpPart) {
    // 상가분: echo가 있으면 그대로(표1이라 전부 보유분). 주택으로 본 상가 부분(OH-17)은 엔진이 echo를 지우고 장특이 0이라
    //   아래 비율식이 0을 낸다(장특 행 `fourPartFinancials`와 같은 식).
    const cp = mu.commercialPart;
    const cpLandRatioFb = cp.transferGain > 0 ? cp.landTransferGain / cp.transferGain : 0.5;
    const cpHold = cpPart
      ? [cpPart.land.holdingDeductionAmount, cpPart.building.holdingDeductionAmount]
      : [Math.floor(cp.longTermDeductionAmount * cpLandRatioFb), Math.floor(cp.longTermDeductionAmount * (1 - cpLandRatioFb))];
    const cpRes = cpPart ? [cpPart.land.residenceDeductionAmount, cpPart.building.residenceDeductionAmount] : [0, 0];
    const hold = [hpPart.land.holdingDeductionAmount + nbLtDeduction, hpPart.building.holdingDeductionAmount, ...cpHold];
    const res = [hpPart.land.residenceDeductionAmount, hpPart.building.residenceDeductionAmount, ...cpRes];
    const cols = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"] as const;
    cols.forEach((c, i) => {
      setNum("ltHoldingPart", c, hold[i]);
      setNum("ltResidencePart", c, res[i]);
    });
    setNum("ltHoldingPart", "total", hold.reduce((a, b) => a + b, 0));
    setNum("ltResidencePart", "total", res.reduce((a, b) => a + b, 0));
    return;
  }
  const hpSplit = splitLtDeduction(mu.housingPart.longTermDeductionAmount, holdingMs, residenceMs, useTable2);
  const cpSplit = { holdingAmount: mu.commercialPart.longTermDeductionAmount, residenceAmount: 0 };
  const hpLandRatio = mu.housingPart.transferGain > 0 ? mu.housingPart.landTransferGain / mu.housingPart.transferGain : 0.5;
  const hpBuildRatio = 1 - hpLandRatio;
  const cpLandRatio = mu.commercialPart.transferGain > 0 ? mu.commercialPart.landTransferGain / mu.commercialPart.transferGain : 0.5;
  const cpBuildRatio = 1 - cpLandRatio;
  // 배율초과 비사업용토지 장특은 표1 **보유분** 단독(거주분 없음) — 보유 기간분 행에 싣는다.
  // 누락하면 「장기보유특별공제 합계 ≠ 보유분 + 거주분」이 되어 합계 열 내부가 어긋난다.
  setNum("ltHoldingPart", "total", hpSplit.holdingAmount + cpSplit.holdingAmount + nbLtDeduction);
  setNum("ltResidencePart", "total", hpSplit.residenceAmount);
  // 재산세제과-915 회신 방식(고가주택 + 배율 초과)이면 주택분 토지·건물의 장특이 양도차익 비율이 아니라 **엔진 echo**(`highValueExcessRuling`)로 갈린다 —
  // 그 비율로 보유·거주분을 나누고 건물 열이 잔액을 흡수한다(위 「장기보유특별공제」 열과 같은 값 · 합 불변식).
  const ruling = mu.housingPart.highValueExcessRuling;
  const hpTotalLt = mu.housingPart.longTermDeductionAmount;
  const splitByRuling = (amount: number) => {
    const land = hpTotalLt > 0 ? Math.floor((amount * ruling!.landLongTermDeduction) / hpTotalLt) : 0;
    return { land, building: amount - land };
  };
  const hpHolding = ruling
    ? splitByRuling(hpSplit.holdingAmount)
    : { land: Math.floor(hpSplit.holdingAmount * hpLandRatio), building: Math.floor(hpSplit.holdingAmount * hpBuildRatio) };
  const hpResidence = ruling
    ? splitByRuling(hpSplit.residenceAmount)
    : { land: Math.floor(hpSplit.residenceAmount * hpLandRatio), building: Math.floor(hpSplit.residenceAmount * hpBuildRatio) };
  setNum("ltHoldingPart", "housingLand", hpHolding.land + nbLtDeduction);
  setNum("ltHoldingPart", "housingBuilding", hpHolding.building);
  setNum("ltHoldingPart", "commercialLand", Math.floor(cpSplit.holdingAmount * cpLandRatio));
  setNum("ltHoldingPart", "commercialBuilding", Math.floor(cpSplit.holdingAmount * cpBuildRatio));
  setNum("ltResidencePart", "housingLand", hpResidence.land);
  setNum("ltResidencePart", "housingBuilding", hpResidence.building);
  setNum("ltResidencePart", "commercialLand", 0);
  setNum("ltResidencePart", "commercialBuilding", 0);
}
