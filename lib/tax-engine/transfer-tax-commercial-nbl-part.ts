/**
 * 상업용건물·오피스텔 부수토지 초과분의 **비사업용 파트 = 토지 양도차익** (NBL2611-V5-BX01 · 로드맵 R14).
 *
 * ## 결함이었던 것
 *
 * STEP 0.62(`runCommercialAppurtenantLandStep`)는 「초과 대지면적 ÷ 집합건물 전체 대지면적」을 상가 1호 **자산 전체**
 * (구분소유 건물 + 대지권)의 `nonBusinessLandAreaRatio`로 주입했다. 그 비율이 건물분 양도소득에도 곱해져
 * 건물분에까지 §104①8호 +10%p가 붙었다 — 비사업용 토지는 «토지»뿐인데(법 §104의3① · 저장소 M-12 「건물은 비사업용
 * 토지가 될 수 없다」 `transfer-tax-split-part-seeds.ts`) 자산 전체에 곱한 것이다.
 *
 * ## 처방 — 토지분 / 건물분 파트
 *
 * 1. 양도가액은 **양도 당시** 토지·건물 기준시가 비율로, 취득가액(환산취득가액·개산공제 포함)은 **취득 당시** 비율로 나눈다
 *    (법 §100② · 영 §166⑥ — 가액 구분이 불분명할 때의 안분). 자본적지출은 취득 당시, 양도비는 양도가액 비율이다.
 *    4개 기준시가는 입력이다 — **없으면 자동 안분하지 않고 거부한다**(저장소 「자동 안분 fallback 금지」).
 * 2. 토지분 양도차익 = 토지분 양도가액 − 토지분 취득가액 − 토지분 필요경비. 건물분은 자산 양도차익의 잔액이다
 *    (§97③ 감가상각비는 건물에만 걸리므로 잔액에 자연히 실린다).
 * 3. 초과 면적 비율은 **토지분 양도차익에만** 곱한다 → 비사업용 파트 양도차익.
 * 4. 비사업용 파트가 자산 양도소득에서 차지하는 몫(정수 분수)을 `nonBusinessLandPartShare`로 주입한다.
 *    이후는 **기존 부분 비사업용 파트 모델**(`transfer-tax-split-part-seeds.ts` `partialNblRateInputs`·`partialNblIncome`)이 그대로 받는다:
 *    비사업용 파트는 §104①8호(+10%p), 나머지(사업용 토지 + 건물)는 비사업용이 아닌 파트로 §104⑤ 후단(각각 별개 자산)·
 *    차손 통산·기본공제 배분이 파트 단위로 돈다. 새 병렬 모델은 없다.
 *
 * ## 이 PR의 한계 (C3 · R15 몫)
 *
 * 장기보유특별공제는 여전히 **자산 단위**다 — 2016.1.1. 전 양도분의 비사업용 장특 배제(`isNblLthdExclusionEra`)는 이 상가의
 * 건물분·사업용 토지분에도 걸린다(V5-G1). 파트별 장특 연혁은 R15가 단일 leaf로 정한다. 2016.1.1. 이후 양도분은 표1을 모든 파트에
 * 같은 율로 적용하므로 이 몫 계산이 파트별 계산과 같다(절사 ±수 원).
 */
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { NBL, TRANSFER } from "./legal-codes";
import { toAreaMicro } from "./area-limit";
import { judgeAppurtenantLandExcess } from "./appurtenant-land-excess";
import { apportionByStdPrice } from "./std-price-apportion";
import { safeMultiplyThenDivide } from "./tax-utils";
import { calcTransferGain, applyCommercialBuildingStep, type CommercialBuildingStepResult } from "./transfer-tax-helpers";
import type { CommercialAppurtenantLandInput, CommercialNblPartEcho } from "./types/commercial-appurtenant.types";
import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";

type GainOut = ReturnType<typeof calcTransferGain>;

/** 상가 STEP 0.35 결과 + 비사업용 토지 파트 — `applyCommercialBuildingStep`을 감싼다(호출부 한 줄 교체). */
export interface CommercialBuildingAndNblPart {
  effectiveInput: TransferTaxInput;
  cbStep: CommercialBuildingStepResult | undefined;
  /** 초과분이 있어 파트를 나눴을 때만 존재 */
  nblPart: CommercialNblPartEcho | undefined;
}

/** 결과 echo(`totalLandArea100`·`excessArea100`)는 ㎡ × 100 정수다 — 판정·분수는 마이크로㎡ 정수(`area-limit.ts`)로 하고 echo만 이 단위로 줄인다. */
const microToArea100 = (micro: number): number => Math.round(micro / 10_000);

/**
 * 필요경비 중 **취득 당시 기준시가 비율**로 나눌 몫.
 *   · 환산 본문(개산공제 = 취득 당시 기준시가 × 3%) — 전부
 *   · §97②2호 단서 채택 / 실가 — 자본적지출(`영 §100② 후문`: 취득시) · 양도비는 양도가액 비율
 *   · 자본적지출·양도비 구분 없는 한 덩어리(legacy)는 취득 쪽에 두지 않는다 — 양도비용으로 보고 양도가액 비율을 쓴다
 */
function expenseAcquisitionShare(args: {
  expenses: number;
  cbStep: CommercialBuildingStepResult | undefined;
  preStepInput: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  usedEstimated: boolean;
}): number {
  const { expenses, cbStep, preStepInput, effectiveInput, usedEstimated } = args;
  if (cbStep) {
    // 환산 본문은 개산공제 전부, 단서 채택은 자본적지출(원 입력은 STEP 0.35가 지우므로 단계 이전 입력에서 읽는다)
    return cbStep.swapApplied ? Math.min(expenses, Math.max(0, preStepInput.capitalExpenditure ?? 0)) : expenses;
  }
  if (usedEstimated) return expenses; // 감정·매매사례 — 개산공제
  const declared = effectiveInput.capitalExpenditure !== undefined || effectiveInput.transferExpense !== undefined;
  return declared ? Math.min(expenses, Math.max(0, effectiveInput.capitalExpenditure ?? 0)) : 0;
}

/**
 * 상가 초과분 비사업용 파트를 산출해 입력에 주입한다. 초과분이 없으면 입력을 그대로 돌려준다.
 *
 * `gain`은 같은 입력으로 `calcTransferGain`이 낸 값이다 — 호출부가 다음 STEP에서 쓰는 값과 같다(순수·결정적).
 */
export function resolveCommercialNblPart(args: {
  effectiveInput: TransferTaxInput;
  preStepInput: TransferTaxInput;
  cbStep: CommercialBuildingStepResult | undefined;
  gain: GainOut;
  steps: CalculationStep[];
}): { effectiveInput: TransferTaxInput; nblPart: CommercialNblPartEcho | undefined } {
  const { effectiveInput, preStepInput, cbStep, gain, steps } = args;
  const cal: CommercialAppurtenantLandInput | undefined = effectiveInput.commercialAppurtenantLand;
  if (effectiveInput.propertyType !== "commercial_building" || !cal) return { effectiveInput, nblPart: undefined };

  const judged = judgeAppurtenantLandExcess({
    landArea: cal.totalLandArea,
    buildingFootprintArea: cal.totalBuildingFootprintArea,
    zoneType: cal.zoneType,
    unapprovedBuilding: cal.unapprovedBuilding,
    context: "상업용건물",
  });
  if (judged.nonBusinessArea <= 0) return { effectiveInput, nblPart: undefined };

  const basis = cal.partBasis;
  if (!basis) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "상업용건물 부수토지 판정: 초과분이 있으면 해당 호의 취득 당시·양도 당시 토지·건물 기준시가 4값이 필요합니다 " +
        "(토지분 양도차익에만 +10%p를 적용하려면 토지·건물 가액을 나눠야 합니다 — 소득세법 §100②, 영 §166⑥). 자동 안분하지 않습니다.",
    );
  }
  const stdPositive = (land: number, building: number) => land >= 0 && building >= 0 && land + building > 0;
  if (!stdPositive(basis.acquisitionLandStd, basis.acquisitionBuildingStd) || !stdPositive(basis.transferLandStd, basis.transferBuildingStd)) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "상업용건물 부수토지 판정: 토지·건물 기준시가는 0 이상이고 취득 당시·양도 당시 각각 합이 0보다 커야 합니다.",
    );
  }

  // ── 면적 비율(정수 분수) — 지분율은 약분되므로 집합건물 전체 면적만 쓴다(계획서 §2.3 모델 ㉮)
  // NBL2611-V9-I — 초과 면적은 `judgeAppurtenantLandExcess`(= `area-limit.ts`)가 낸 정수 정확 값을 그대로 쓴다. 판정(`nonBusinessArea <= 0`)과 분수가 한 값이다.
  const totalMicro = toAreaMicro(cal.totalLandArea);
  const excessMicro = toAreaMicro(judged.nonBusinessArea);
  const total100 = microToArea100(totalMicro);
  const excess100 = microToArea100(excessMicro);

  const totalGain = gain.gain;
  // 양도가액 · 취득가액 · 필요경비를 토지분/건물분으로 (취득시 / 양도시 기준시가)
  const T = effectiveInput.transferPrice;
  const A = cbStep ? effectiveInput.acquisitionPrice : gain.usedEstimated ? gain.estimatedBase : effectiveInput.acquisitionPrice;
  const E = gain.expenses;
  const t = apportionByStdPrice(T, basis.transferLandStd, basis.transferBuildingStd);
  const a = apportionByStdPrice(A, basis.acquisitionLandStd, basis.acquisitionBuildingStd);
  const acqShare = expenseAcquisitionShare({ expenses: E, cbStep, preStepInput, effectiveInput, usedEstimated: gain.usedEstimated });
  const eAcq = apportionByStdPrice(acqShare, basis.acquisitionLandStd, basis.acquisitionBuildingStd);
  const eTr = apportionByStdPrice(E - acqShare, basis.transferLandStd, basis.transferBuildingStd);
  const e = { land: eAcq.land + eTr.land, building: eAcq.building + eTr.building };

  const landGain = t.land - a.land - e.land;
  const buildingGain = totalGain - landGain; // 잔액 흡수 — §97③ 감가상각비도 여기에 실린다
  // 초과 면적 몫은 양도차익(양수)에만 — 토지분 양도차손에는 비사업용 파트가 소득을 갖지 않는다
  const nonBusinessGain = landGain > 0 && totalMicro > 0 ? safeMultiplyThenDivide(landGain, excessMicro, totalMicro) : 0;
  const businessLandGain = landGain - nonBusinessGain;

  const applied = totalGain > 0 && nonBusinessGain > 0;
  const whole = applied && nonBusinessGain >= totalGain;
  const partial = applied && !whole;
  const injected: CommercialNblPartEcho["injected"] = !applied
    ? { isNonBusinessLand: false }
    : whole
      ? { isNonBusinessLand: true, nonBusinessLandAreaRatio: 1 }
      : {
          isNonBusinessLand: true,
          nonBusinessLandAreaRatio: nonBusinessGain / totalGain,
          nonBusinessLandPartShare: { numerator: nonBusinessGain, denominator: totalGain },
        };

  const nblPart: CommercialNblPartEcho = {
    totalLandArea100: total100,
    excessArea100: excess100,
    multiplier: judged.multiplier,
    transferPrice: t,
    acquisitionCost: a,
    expenses: e,
    landGain,
    buildingGain,
    totalGain,
    nonBusinessGain,
    businessLandGain,
    applied,
    injected,
  };

  steps.push({
    label: "비사업용 파트 — 토지분 양도차익 × 초과 면적 비율",
    formula:
      `토지분 양도차익 ${landGain.toLocaleString()} (양도 ${t.land.toLocaleString()} − 취득 ${a.land.toLocaleString()} − 경비 ${e.land.toLocaleString()}) · ` +
      `건물분 ${buildingGain.toLocaleString()} · 초과 면적 비율 ${excess100}/${total100} → 비사업용 파트 ${nonBusinessGain.toLocaleString()}` +
      (applied
        ? partial
          ? ` (자산 양도차익 ${totalGain.toLocaleString()}의 ${((nonBusinessGain / totalGain) * 100).toFixed(2)}%에만 §104①8호 +10%p)`
          : " (자산 양도차익 전부가 비사업용 파트)"
        : " — 비사업용 파트에 양도소득이 없어 중과하지 않음"),
    amount: nonBusinessGain,
    legalBasis: `${NBL.MAIN} · ${TRANSFER.BUNDLED_APPORTIONMENT}`,
  });

  const { nonBusinessLandAreaRatio, nonBusinessLandPartShare } = injected;
  return {
    effectiveInput: {
      ...effectiveInput,
      isNonBusinessLand: injected.isNonBusinessLand,
      nonBusinessLandAreaRatio,
      nonBusinessLandPartShare,
    },
    nblPart,
  };
}

/**
 * STEP 0.35(상가 환산·swap) 직후 비사업용 토지 파트를 확정한다 — `applyCommercialBuildingStep`의 상위 집합.
 * 초과분이 없거나 상가가 아니면 `applyCommercialBuildingStep`과 같은 값을 돌려준다(회귀 0).
 */
export function applyCommercialBuildingAndNblPart(
  input: TransferTaxInput,
  preDeemedConvertedSelected = false,
  steps: CalculationStep[] = [],
): CommercialBuildingAndNblPart {
  const base = applyCommercialBuildingStep(input, preDeemedConvertedSelected);
  const cal = input.commercialAppurtenantLand;
  if (input.propertyType !== "commercial_building" || !cal) return { ...base, nblPart: undefined };
  const resolved = resolveCommercialNblPart({
    effectiveInput: base.effectiveInput,
    preStepInput: input,
    cbStep: base.cbStep,
    gain: calcTransferGain(base.effectiveInput),
    steps,
  });
  return { effectiveInput: resolved.effectiveInput, cbStep: base.cbStep, nblPart: resolved.nblPart };
}
