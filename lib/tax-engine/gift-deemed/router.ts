/** 증여로 보는 경우 — 유형별 계산기 dispatch (Phase 1~2) */
import type { DeemedGiftInput, DeemedGiftResult } from "./types";
import { calcInsuranceGift } from "./insurance";
import { calcBargainTransferGift } from "./bargain-transfer";
import { calcDebtForgivenessGift } from "./debt-forgiveness";
import { calcFreeRealEstateGift } from "./free-realestate-use";
import { calcFreeLoanGift } from "./free-loan";
import { calcFreeLoanAggregatedGift } from "./free-loan-aggregated";
import { calcMergerGift } from "./merger";
import { calcCapitalIncreaseGift } from "./capital-increase";
import { calcCapitalDecreaseGift } from "./capital-decrease";
import { calcContributionGift } from "./contribution-in-kind";
import { calcConvertibleStockGift } from "./convertible-stock";
import { calcConvertibleBondGift } from "./convertible-bond";
import { calcAcquisitionFundPresumption } from "./acquisition-fund-presumption";
import { calcNomineeTrustGift } from "./nominee-trust";
import { calcExcessDividendGift } from "./excess-dividend";
import { calcListingGainGift } from "./listing-gain";
import { calcPropertyServiceUseGift } from "./property-service-use";
import { calcOrgChangeGift } from "./org-change";
import { calcValueIncreaseGift } from "./value-increase";
import { calcSpecificCorpGift, calcSpecificCorpGiftMulti } from "./specific-corp";
import { calcTrustBenefit } from "./trust-benefit";

export function calcDeemedGift(input: DeemedGiftInput): DeemedGiftResult {
  switch (input.type) {
    case "trust_benefit":
      return calcTrustBenefit(input);
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
    case "free_loan_aggregated":
      return calcFreeLoanAggregatedGift(input);
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
    case "acquisition_fund_presumption":
      return calcAcquisitionFundPresumption(input);
    case "nominee_trust":
      return calcNomineeTrustGift(input);
    case "excess_dividend":
      return calcExcessDividendGift(input);
    case "listing_gain":
      return calcListingGainGift(input);
    case "property_service_use":
      return calcPropertyServiceUseGift(input);
    case "org_change":
      return calcOrgChangeGift(input);
    case "value_increase":
      return calcValueIncreaseGift(input);
    case "specific_corp":
      return input.shareholders && input.shareholders.length > 0
        ? calcSpecificCorpGiftMulti(input)
        : calcSpecificCorpGift(input);
  }
}
// §43① 중복배제·§43② 합산은 Phase 3 router 후처리(여기선 단일 의제만)
