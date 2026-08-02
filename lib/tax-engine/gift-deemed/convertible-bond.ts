/** (11) 전환사채등의 주식전환 등에 따른 이익의 증여 (§40) — 인수·취득(①1호)·주식전환(①2호)·양도(①3호)
 * 엔진 코어 순수: 최종값(creditedShares·interestLoss)만 차감. 자동계산(이자손실분 PV·초과분)은 헬퍼/lib·calc.
 * 교부주식가액 §30⑤1 단서: 상장은 Min(㉠시세평균,㉡이론주가) 가·나·다 / Max 라목. 비상장 ㉡.
 */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import { computeWeightedPerShare, applyListedPerShareBound } from "./capital-helpers";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ConvertibleBondInput } from "./types";

const ABSOLUTE_THRESHOLD = 100_000_000;

/** §40 공통 증여세 연계 echo: 연대납부 면제(§4의2⑥)는 §40 전체, 합산배제(§47①)는 caseType별 호출부에서 지정 */
function withGiftFlags(result: DeemedGiftResult, aggregationExcluded: boolean): DeemedGiftResult {
  return { ...result, aggregationExcluded, donorJointLiabilityExempt: true };
}

/** §30⑤1 교부주식가액 1주당 — 상장이면 시세평균과 이론주가 중 Min(가나다)/Max(라목), 비상장은 이론주가 */
function creditedPerShareValue(input: ConvertibleBondInput, pick: "min" | "max"): number {
  const theoretical = computeWeightedPerShare(
    input.preConvPrice ?? 0,
    input.preConvShares ?? 0,
    input.conversionPrice ?? 0,
    input.increasedShares ?? 0,
  );
  // §29②1가·3나 단서와 같은 규칙 — 공용 헬퍼 단일 소스(single-source-engine-helper)
  return applyListedPerShareBound(theoretical, input, pick);
}

export function calcConvertibleBondGift(input: ConvertibleBondInput): DeemedGiftResult {
  switch (input.caseType ?? "acquisition") {
    case "conversion":
      return bondConversion(input);
    case "conversion_reverse":
      return bondConversionReverse(input);
    case "transfer":
      return bondTransfer(input);
    default:
      return bondAcquisition(input);
  }
}

/** ①1호 인수·취득 (§30①1·②1) — 이익 = 시가 − 취득가, 기준 MIN(시가30%,1억). §40①1호는 합산배제 비대상 */
function bondAcquisition(input: ConvertibleBondInput): DeemedGiftResult {
  const { bondMarketValue } = input;
  const acquisitionPrice = input.acquisitionPrice ?? 0;
  const gain = bondMarketValue - acquisitionPrice;
  const threshold = Math.min(applyRate(bondMarketValue, 0.3), ABSOLUTE_THRESHOLD);
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "전환사채등 시가", amount: bondMarketValue, lawRef: GIFT.CONVERTIBLE_BOND },
    { label: "인수·취득가액", amount: acquisitionPrice },
    { label: "증여재산가액 (시가 − 인수가)", amount: value, lawRef: GIFT.CONVERTIBLE_BOND, note: "§40①1호 저가 인수·취득" },
  ];
  return withGiftFlags(
    {
      type: "convertible_bond",
      applied,
      deemedGiftValue: value,
      breakdown,
      exclusionReason: applied ? undefined : "이익이 기준금액(시가 30%·1억 중 적은 금액) 미만",
      legalBasis: GIFT.CONVERTIBLE_BOND,
      thresholdEcho: { gain, threshold },
    },
    false, // §40①1호 — 합산배제 비대상(일반 합산)
  );
}

/** ①2호 가·나·다목 주식전환 (§30①2·②2) — (교부주식가액−전환가액)×교부받은주식수 − 이자손실분 − §30①1이익, 기준 1억 */
function bondConversion(input: ConvertibleBondInput): DeemedGiftResult {
  const conversionPrice = input.conversionPrice ?? 0;
  const increasedShares = input.increasedShares ?? 0;
  const creditedShares = input.creditedShares ?? increasedShares; // ④⑥ 전부 / ⑤ 초과분
  const interestLoss = input.interestLoss ?? 0; // 최종값(초과분 안분 포함) — 재안분 금지
  const priorGain = input.acquisitionGainPrior ?? 0;

  const perShareValue = creditedPerShareValue(input, "min"); // §30⑤1 단서 Min(가나다)
  const perShareGain = perShareValue - conversionPrice; // 교부주식가액 > 전환가액
  const base = perShareGain > 0 ? safeMultiply(perShareGain, creditedShares) : 0;
  let net = base - interestLoss - priorGain;
  if (input.bondTransferGainForCap != null) {
    net = Math.min(net, input.bondTransferGainForCap); // 영§30①2 단서 — 전환사채 양도 시 양도차익 한도
  }
  const threshold = ABSOLUTE_THRESHOLD; // §30②2 = 1억
  const applied = net >= threshold;
  const value = applied ? net : 0;

  const breakdown: CalculationStep[] = [
    { label: "교부받은 주식가액 (§30⑤1 1주당)", amount: perShareValue, lawRef: GIFT.CONVERTIBLE_BOND },
    { label: "1주당 전환가액등", amount: conversionPrice },
    { label: "교부받은 주식수", amount: creditedShares },
    { label: "이자손실분", amount: interestLoss, lawRef: GIFT.CONVERTIBLE_BOND_INTEREST_LOSS },
    { label: "인수 시 기과세 이익(§30①1)", amount: priorGain },
  ];
  if (input.bondTransferGainForCap != null) {
    breakdown.push({ label: "양도차익 한도(§30①2 단서)", amount: input.bondTransferGainForCap });
  }
  breakdown.push({
    label: "증여재산가액 ((교부주식가액−전환가액)×주식수 − 이자손실분 − 기과세)",
    amount: value,
    lawRef: GIFT.CONVERTIBLE_BOND,
    note: "§40①2호 가·나·다목 주식전환",
  });
  return withGiftFlags(
    {
      type: "convertible_bond",
      applied,
      deemedGiftValue: value,
      breakdown,
      exclusionReason: applied ? undefined : "이익이 기준금액(1억) 미만",
      legalBasis: GIFT.CONVERTIBLE_BOND,
      thresholdEcho: { gain: net, threshold },
    },
    true, // §40①2호 — 합산배제 대상
  );
}

/** ①2호 라목 주식전환 (§30①3·②3) — (전환가액−교부주식가액)×(증가주식수×특수관계인 전환전 지분율), 기준 0 */
function bondConversionReverse(input: ConvertibleBondInput): DeemedGiftResult {
  const conversionPrice = input.conversionPrice ?? 0;
  const increasedShares = input.increasedShares ?? 0;
  const ratio = input.relatedPreRatio ?? { numer: 0, denom: 1 };

  const perShareValue = creditedPerShareValue(input, "max"); // 라목은 Max(㉠,㉡) — §30⑤1 단서
  const perShareGain = conversionPrice - perShareValue; // 라목: 전환가액 > 교부주식가액
  const base = perShareGain > 0 ? safeMultiply(perShareGain, increasedShares) : 0;
  const value = base > 0 ? safeMultiplyThenDivide(base, ratio.numer, ratio.denom) : 0;
  const applied = value > 0; // §30②3 기준금액 0원

  const breakdown: CalculationStep[] = [
    { label: "1주당 전환가액등", amount: conversionPrice, lawRef: GIFT.CONVERTIBLE_BOND },
    { label: "교부받은 주식가액 (§30⑤1 1주당)", amount: perShareValue },
    { label: "전환등 증가주식수", amount: increasedShares },
    { label: "증여재산가액 ((전환가액−교부주식가액)×증가주식수×특수관계인 전환전 지분율)", amount: value, lawRef: GIFT.CONVERTIBLE_BOND, note: "§40①2호 라목 주식전환" },
  ];
  return withGiftFlags(
    {
      type: "convertible_bond",
      applied,
      deemedGiftValue: value,
      breakdown,
      exclusionReason: applied ? undefined : "특수관계인 이익 없음",
      legalBasis: GIFT.CONVERTIBLE_BOND,
      thresholdEcho: { gain: value },
    },
    true, // §40①2호 — 합산배제 대상
  );
}

/** ①3호 양도 (§30①4·②1) — 이익 = 양도가액 − 시가, 기준 MIN(시가30%,1억). §40①3호 합산배제 대상 */
function bondTransfer(input: ConvertibleBondInput): DeemedGiftResult {
  const { bondMarketValue } = input;
  const transferPrice = input.transferPrice ?? 0;
  const gain = transferPrice - bondMarketValue;
  const threshold = Math.min(applyRate(bondMarketValue, 0.3), ABSOLUTE_THRESHOLD);
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "전환사채등 양도가액", amount: transferPrice, lawRef: GIFT.CONVERTIBLE_BOND },
    { label: "전환사채등 시가", amount: bondMarketValue },
    { label: "증여재산가액 (양도가액 − 시가)", amount: value, lawRef: GIFT.CONVERTIBLE_BOND, note: "§40①3호 특수관계인 양도" },
  ];
  return withGiftFlags(
    {
      type: "convertible_bond",
      applied,
      deemedGiftValue: value,
      breakdown,
      exclusionReason: applied ? undefined : "이익이 기준금액(시가 30%·1억 중 적은 금액) 미만",
      legalBasis: GIFT.CONVERTIBLE_BOND,
      thresholdEcho: { gain, threshold },
    },
    true, // §40①3호 — 합산배제 대상
  );
}
