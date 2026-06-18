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
  const conversion = calcCapitalIncreaseGift(input.atConversion);
  const issuance = calcCapitalIncreaseGift(input.atIssuance);
  const raw = conversion.deemedGiftValue - issuance.deemedGiftValue;
  const value = raw > 0 ? raw : 0; // 시행령 §29②6 단서: 영 이하면 이익 없음
  const applied = value > 0;

  const breakdown: CalculationStep[] = [
    { label: "전환 후 교부주식 기준 이익 (§29②1~5)", amount: conversion.deemedGiftValue, lawRef: GIFT.CAPITAL_INCREASE },
    { label: "전환주식 발행 당시 이익 (§29②1~5)", amount: issuance.deemedGiftValue },
    { label: "증여재산가액 (전환후 − 발행당시, 영 이하면 0)", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: "§39①3호 전환주식" },
  ];
  return {
    type: "capital_increase",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "전환후 이익이 발행당시 이익 이하 — 추가 이익 없음",
    legalBasis: GIFT.CAPITAL_INCREASE,
    thresholdEcho: { gain: value },
  };
}
