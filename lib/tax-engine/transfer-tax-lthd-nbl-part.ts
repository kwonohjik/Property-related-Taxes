/**
 * 부분 비사업용 자산의 **파트별 장기보유특별공제** (NBL2611-V5-G1 · 로드맵 R15).
 *
 * ## 결함이었던 것
 *
 * 2026-09 리뷰 H-2가 구현한 「2016.1.1. 전 양도 비사업용 토지 장특 배제」(`isNblLthdExclusionEra`)와 「2016년 양도 기산 단서」
 * (`usesNbl2016LthdAnchor`)는 **자산 단위**로 걸렸다. 한 필지 중 일부만 비사업용인 자산(`hasPartialNonBusinessLand`)은 자산 전체의
 * 양도차익에 배제·기산 이동이 걸려, 비사업용이 **아닌** 파트(사업용분 · 상가 건물분)까지 장특을 잃었다(과대 과세).
 * 법 §104⑤ 후단은 한 필지가 비사업용 토지와 그 외의 토지로 갈리면 «각각을 별개의 자산»으로 본다 — 장특도 파트 몫마다
 * 자기 규칙으로 계산해야 한다.
 *
 * ## 처방 — 양도차익을 파트로 나눠 각자 규칙으로 공제하고 합산
 *
 * | 파트 | 입력 | 규칙 |
 * |---|---|---|
 * | 비사업용 파트 | `isNonBusinessLand: true` | 2016.1.1. 전 양도 → 배제(0) · 2016년 양도 → 2016.1.1. 기산(§95④ 단서) · 이후 → 표1 취득일 기산 |
 * | 그 밖의 파트 | `isNonBusinessLand: false` | 표1 취득일 기산 (시기 무관) |
 *
 * 파트 양도차익은 이후 §104⑤ 파트 세율 분리가 소득을 나누는 것과 **같은 몫**(`partialNblIncome` — 면적 비율 또는 상가 정수 분수)이다.
 * 공제 **후** 소득의 몫은 정수 분수(`netShare`)로 돌려준다 — 두 파트의 공제율이 다르면 «장특 차감 후 소득 × 면적 비율»이 파트 소득이 아니기 때문이다.
 *
 * ## 범위 — 두 규칙이 갈릴 때만
 *
 * 2016.1.1. 이후 양도(2016년 양도 중 취득이 2016.1.1. 이후인 경우 포함)는 두 파트의 장특 규칙이 같아 자산 단위 계산과 값이 같다.
 * 그 경우 이 파일은 개입하지 않는다(절사 ±1원 회귀 0).
 *
 * ⛔ 이 파일은 G-6(2026-07-30 «무시 확정·재제안 금지»)의 범위를 넓히지 않는다 — 주택 split·§155⑳ 경로의 비사업용 파트
 * (엔진 밖에서 `isNonBusinessLand: false`로 떼어낸 배율 초과분)는 건드리지 않는다. 과대 정정(H-2 과잉 적용)만 한다.
 */
import { NBL_LTHD_EXCLUSION_LIFTED, isNblLthdExclusionEra, usesNbl2016LthdAnchor } from "./data/lthd-non-business-land-era";
import { LTHD_EXCLUSION_LABEL } from "./legal-codes/transfer-house";
import { calcLongTermHoldingDeduction, type LongTermHoldingResult } from "./transfer-tax-lthd";
import { hasPartialNonBusinessLand, partialNblIncome, partialNblRateInputs } from "./transfer-tax-split-part-seeds";
import type { NblPartLthdDetail } from "./types/transfer-result.types";
import type { TransferTaxInput } from "./types/transfer.types";
import type { SplitGainResult } from "./types/transfer-split-gain.types";

/** 두 파트의 장특 규칙이 갈리는가 — 부분 비사업용 + (2016.1.1. 전 양도 | 2016년 양도·2016.1.1. 이전 취득). */
export function lthdRulesDifferByNblPart(input: TransferTaxInput): boolean {
  return (
    hasPartialNonBusinessLand(input) &&
    (isNblLthdExclusionEra(input.transferDate) || usesNbl2016LthdAnchor(input.transferDate, input.acquisitionDate))
  );
}

/**
 * 장특 차감 **후** 비사업용 파트 몫을 세율 판정 입력에 싣는다 — §104⑤ 파트 분리(`computePartialNblTax`)와 다건 차손 통산 파트(`splitPartsForLossOffset`)가
 * 소득을 나누는 몫이다. 파트별 장특이 없으면 입력을 그대로 둔다.
 */
export function withNblPartNetShare(input: TransferTaxInput, detail: NblPartLthdDetail | undefined): TransferTaxInput {
  return detail?.netShare ? { ...input, nonBusinessLandPartShare: detail.netShare } : input;
}

const pct = (rate: number): string => `${Number((rate * 100).toFixed(2))}%`;

export type LongTermHoldingByPartResult = LongTermHoldingResult & { nblPartLthd?: NblPartLthdDetail };

/**
 * `calcLongTermHoldingDeduction`의 부분 비사업용 대응판 — 호출 인자·반환은 같고 `nblPartLthd` echo만 더한다.
 * 파트로 가를 이유가 없으면(규칙이 같거나 양도차익이 양수가 아니거나 토지·건물 split) 원 함수 결과를 그대로 돌려준다.
 */
export function calcLongTermHoldingDeductionByNblPart(
  taxableGain: number,
  input: TransferTaxInput,
  isSurcharge: boolean,
  isSuspended: boolean,
  splitDetail?: SplitGainResult,
  deemedOneHouseBy155?: boolean,
): LongTermHoldingByPartResult {
  const whole = () => calcLongTermHoldingDeduction(taxableGain, input, isSurcharge, isSuspended, splitDetail, deemedOneHouseBy155);
  // 토지·건물 split 자산은 자기 파트 분해(split 분기)가 있어 스칼라 양도차익으로 가를 수 없다 — 종전 경로.
  if (taxableGain <= 0 || splitDetail || !lthdRulesDifferByNblPart(input)) return whole();

  const { nbl: nblInput, other: bizInput } = partialNblRateInputs(input);
  const nonBusinessGain = partialNblIncome(taxableGain, input.nonBusinessLandAreaRatio!, input.nonBusinessLandPartShare);
  const businessGain = taxableGain - nonBusinessGain;
  const biz = calcLongTermHoldingDeduction(businessGain, bizInput, isSurcharge, isSuspended, undefined, deemedOneHouseBy155);
  // 미등기·분양권 등 자산 전체 배제 사유는 파트와 무관하다 — 원 함수가 그 사유로 돌려준다.
  if (biz.exclusionReason !== undefined) return whole();
  const nb = calcLongTermHoldingDeduction(nonBusinessGain, nblInput, isSurcharge, isSuspended, undefined, deemedOneHouseBy155);

  const deduction = biz.deduction + nb.deduction;
  const totalNet = taxableGain - deduction;
  const nbNet = nonBusinessGain - nb.deduction;
  const anchored = usesNbl2016LthdAnchor(input.transferDate, input.acquisitionDate);
  const nbText = nb.exclusionReason
    ? `비사업용 파트 양도차익 ${nonBusinessGain.toLocaleString()} × 0% (${LTHD_EXCLUSION_LABEL[nb.exclusionReason]})`
    : `비사업용 파트 양도차익 ${nonBusinessGain.toLocaleString()} × ${pct(nb.rate)}` +
      (anchored ? ` (보유기간 ${NBL_LTHD_EXCLUSION_LIFTED} 기산 — 구 §95④ 단서)` : "");
  const formula =
    `${nbText} + 그 밖의 파트 양도차익 ${businessGain.toLocaleString()} × ${pct(biz.rate)}` +
    ` (보유 ${biz.holdingPeriod.years}년, 취득일 기산) = ${deduction.toLocaleString()}`;

  return {
    ...biz,
    deduction,
    nblPartLthd: {
      nonBusinessGain,
      businessGain,
      nonBusinessDeduction: nb.deduction,
      businessDeduction: biz.deduction,
      ...(nb.exclusionReason ? { nonBusinessExclusionReason: nb.exclusionReason } : {}),
      nonBusinessAnchoredTo2016: anchored,
      ...(totalNet > 0 && nbNet >= 0 ? { netShare: { numerator: nbNet, denominator: totalNet } } : {}),
      formula,
    },
  };
}
