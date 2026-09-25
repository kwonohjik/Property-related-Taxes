/** (8-3) 전환주식에 따른 이익의 증여 (§39①3호) — 전환후 이익 − 발행당시 이익 (시행령 §29②6) */
import { GIFT } from "../legal-codes";
import { calcCapitalIncreaseGift } from "./capital-increase";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ConvertibleStockInput } from "./types";

/**
 * §29②6: 가목(전환 후 교부받은 주식을 신주로 보아 §29②1~5 계산한 이익)에서
 * 나목(전환주식 발행 당시 §29②1~5 계산한 이익)을 차감. 그 금액이 영 이하이면 이익 없음.
 */
export function calcConvertibleStockGift(input: ConvertibleStockInput): DeemedGiftResult {
  // 「상증법」§2 9호·§4의2①·③ — 수증자가 영리법인이면 §39①3호 경로에서도 납세의무자가 아니다.
  //   두 leg가 각각 0을 내면 차감 결과도 0이지만, 그 0은 「전환후 이익 ≤ 발행당시 이익」이라는
  //   **다른 사유**로 표시된다. 사유가 화면·이력에 남으므로 여기서 먼저 가른다.
  const doneeIsForProfitCorp =
    input.atConversion.doneeIsForProfitCorp === true || input.atIssuance.doneeIsForProfitCorp === true;
  const conversion = calcCapitalIncreaseGift(input.atConversion);
  // 나목(차감항)은 「전환주식 발행 당시 **제1호부터 제5호까지의 규정에 따라 계산한 이익**」이다.
  //   제1호~제5호는 **계산방법** 규정이고, 공모 제외는 그 바깥의 **법** §39① 본문 괄호에 있다.
  //   차감항은 과세단위가 아니라 **기준선**이므로 요건필터를 태우지 않는다.
  //   ⚠️ 종전에는 차감항에만 필터가 걸려 **어느 독법으로도 도출되지 않는 비대칭**이었다 —
  //      필터가 준용된다면 두 leg 모두 0이라 0 − 0 = 0이고, 준용되지 않는다면 둘 다 산식값이다.
  //      실측: 발행 시점만 공모로 두면 200,000,000이 500,000,000으로 뛰었다(차감액 전액 소멸).
  //      기준금액 게이트(30%·3억)는 §29②2호·4호 **안에** 있으므로 그대로 준용된다 — 떼지 말 것.
  const issuance = calcCapitalIncreaseGift({ ...input.atIssuance, allocationMethod: "normal" });
  const raw = conversion.deemedGiftValue - issuance.deemedGiftValue;
  const value = raw > 0 ? raw : 0; // 시행령 §29②6 단서: 영 이하면 이익 없음
  const applied = value > 0;

  const breakdown: CalculationStep[] = [
    { label: "전환 후 교부주식 기준 이익 (§29②1~5)", amount: conversion.deemedGiftValue, lawRef: GIFT.CAPITAL_INCREASE },
    { label: "전환주식 발행 당시 이익 (§29②1~5)", amount: issuance.deemedGiftValue },
    { label: "증여재산가액 (전환후 − 발행당시, 영 이하면 0)", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: "§39①3호 전환주식" },
  ];
  if (doneeIsForProfitCorp) {
    return {
      type: "convertible_stock",
      applied: false,
      deemedGiftValue: 0,
      breakdown,
      exclusionReason: `영리법인 수증자 — 증여세 납세의무자가 아님 (${GIFT.FOR_PROFIT_CORP_NOT_TAXPAYER})`,
      legalBasis: GIFT.CAPITAL_INCREASE,
      thresholdEcho: { gain: 0 },
    };
  }
  return {
    type: "convertible_stock",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "전환후 이익이 발행당시 이익 이하 — 추가 이익 없음",
    legalBasis: GIFT.CAPITAL_INCREASE,
    thresholdEcho: { gain: value },
  };
}
