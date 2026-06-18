/** (3) 저가양수·고가양도 §35 — 기존 detectBargainTransfer(본칙 정정본) DeemedGiftResult 어댑터 */
import { detectBargainTransfer, type BargainTransferInput } from "../bargain-transfer";
import { GIFT } from "../legal-codes";
import type { DeemedGiftResult } from "./types";

export function calcBargainTransferGift(input: BargainTransferInput): DeemedGiftResult {
  const r = detectBargainTransfer(input);
  return {
    type: "bargain_transfer",
    applied: r.isSubjectToGiftTax,
    deemedGiftValue: r.deemedGiftAmount,
    breakdown: r.breakdown,
    exclusionReason: r.exclusionReason,
    legalBasis: GIFT.BARGAIN_TRANSFER,
    thresholdEcho: {
      rateThresholdMet: r.thresholdCheck.rateThresholdMet,
      absoluteThresholdMet: r.thresholdCheck.absoluteThresholdMet,
    },
  };
}
