/** 증여로 보는 경우 — 유형별 계산기 dispatch (Phase 1~2) */
import type { DeemedGiftInput, DeemedGiftResult } from "./types";
import { calcInsuranceGift } from "./insurance";
import { calcBargainTransferGift } from "./bargain-transfer";
import { calcDebtForgivenessGift } from "./debt-forgiveness";
import { calcFreeRealEstateGift } from "./free-realestate-use";
import { calcFreeLoanGift } from "./free-loan";
import { calcMergerGift } from "./merger";
import { calcCapitalIncreaseGift } from "./capital-increase";
import { calcCapitalDecreaseGift } from "./capital-decrease";
import { calcContributionGift } from "./contribution-in-kind";
import { calcConvertibleStockGift } from "./convertible-stock";
import { calcConvertibleBondGift } from "./convertible-bond";

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
    case "merger":
      return calcMergerGift(input);
    case "capital_increase":
      return calcCapitalIncreaseGift(input);
    case "capital_decrease":
      return calcCapitalDecreaseGift(input);
    case "contribution":
      return calcContributionGift(input);
    case "convertible_stock":
      return calcConvertibleStockGift(input);
    case "convertible_bond":
      return calcConvertibleBondGift(input);
  }
}
// §43① 중복배제·§43② 합산은 Phase 3 router 후처리(여기선 단일 의제만)
