/** 증여로 보는 경우 — 유형별 계산기 dispatch (Phase 1) */
import type { DeemedGiftInput, DeemedGiftResult } from "./types";
import { calcInsuranceGift } from "./insurance";
import { calcBargainTransferGift } from "./bargain-transfer";
import { calcDebtForgivenessGift } from "./debt-forgiveness";
import { calcFreeRealEstateGift } from "./free-realestate-use";
import { calcFreeLoanGift } from "./free-loan";

export function calcDeemedGift(input: DeemedGiftInput): DeemedGiftResult {
  switch (input.type) {
    case "insurance":
      return calcInsuranceGift(input);
    case "bargain_transfer":
      return calcBargainTransferGift(input);
    case "debt_forgiveness":
      return calcDebtForgivenessGift(input);
    case "free_realestate":
      return calcFreeRealEstateGift(input);
    case "free_loan":
      return calcFreeLoanGift(input);
  }
}
// §43① 중복배제·§43② 합산은 Phase 3 router 후처리(여기선 단일 의제만)
