/** (Phase 3) 재산사용 및 용역제공 등에 따른 이익의 증여 (§42 · 시행령 §32) */
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, PropertyServiceUseInput } from "./types";

const FREE_USE_THRESHOLD = 10_000_000; // §32②1호 무상사용·용역 = 1천만원

/**
 * 시행령 §32①: 무상(1호)=시가 상당액 / 저가사용·용역제공받음(2호)=시가−대가 / 고가사용하게함·용역제공(3호)=대가−시가.
 * 기준금액(§32②): 무상=1천만원 / 저가·고가=시가의 100분의 30. 미만이면 제외.
 */
export function calcPropertyServiceUseGift(input: PropertyServiceUseInput): DeemedGiftResult {
  const { subType, marketValue } = input;
  const consideration = input.consideration ?? 0;

  let raw: number;
  let threshold: number;
  let note: string;
  if (subType === "free_use") {
    raw = marketValue; // 무상 = 시가 상당액
    threshold = FREE_USE_THRESHOLD;
    note = "§42①1호 무상사용·용역제공받음";
  } else if (subType === "low_price") {
    raw = marketValue - consideration; // 저가 = 시가 − 대가
    threshold = safeMultiplyThenDivide(marketValue, 30, 100);
    note = "§42①1·3호 저가사용·용역제공받음";
  } else {
    raw = consideration - marketValue; // 고가 = 대가 − 시가
    threshold = safeMultiplyThenDivide(marketValue, 30, 100);
    note = "§42①2·4호 고가사용하게함·용역제공";
  }
  const applied = raw > 0 && raw >= threshold;
  const value = applied ? raw : 0;

  const breakdown: CalculationStep[] = [
    { label: subType === "free_use" ? "재산사용·용역 시가 상당액" : "시가", amount: marketValue, lawRef: GIFT.PROPERTY_SERVICE_USE },
    ...(subType === "free_use" ? [] : [{ label: "대가", amount: consideration }]),
    { label: "이익", amount: raw },
    { label: subType === "free_use" ? "기준금액 (1천만원)" : "기준금액 (시가 30%)", amount: threshold },
    { label: "증여재산가액", amount: value, lawRef: GIFT.PROPERTY_SERVICE_USE, note },
  ];
  return {
    type: "property_service_use",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : subType === "free_use" ? "이익이 기준금액(1천만원) 미만" : "이익이 기준금액(시가 30%) 미만",
    legalBasis: GIFT.PROPERTY_SERVICE_USE,
    thresholdEcho: { gain: value, threshold },
  };
}
