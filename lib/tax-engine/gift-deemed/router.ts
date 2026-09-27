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
import { calcRelatedCorpGift } from "./related-corp";
import { calcTrustBenefit } from "./trust-benefit";
import { jointLiabilityExemptForDeemedType } from "./taxpayer-gate";

/**
 * 「상증법」§4의2⑥ 단서 — 증여자 연대납부의무 면제 표지를 **전 유형에 한 곳에서** 세운다.
 *
 * 유형만으로 결정되는 사실이라(입력 축 0개) 각 엔진에 흩어 두면 새 유형이 조용히 빠진다.
 * 판정 자체는 `taxpayer-gate.ts`의 표가 갖는다 — 이 파일은 그 표를 적용만 한다.
 *
 * ⚠️ 이것은 「후처리」가 아니라 **결과 echo 필드**다. 금액·적용 여부에 손대지 않는다.
 *    §39·§40 엔진은 leaf 호출자(테스트)를 위해 자기 결과에도 같은 표를 적용하며,
 *    같은 표에서 파생되므로 값이 어긋날 수 없다.
 */
export function calcDeemedGift(input: DeemedGiftInput): DeemedGiftResult {
  return {
    ...dispatchDeemedGift(input),
    donorJointLiabilityExempt: jointLiabilityExemptForDeemedType(input.type),
  };
}

function dispatchDeemedGift(input: DeemedGiftInput): DeemedGiftResult {
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
    case "related_corp":
      return calcRelatedCorpGift(input);
  }
}
// 🔴 「router 후처리」로 **계산을 바꾸는 것은 없다** — 금액·적용 여부는 `dispatchDeemedGift`의
//    `switch`가 전부다. 그 바깥에 있는 것은 §4의2⑥ 표지 한 줄(유형표 조회)뿐이고,
//    이것은 계산이 아니라 **결과 echo 필드**다.
//    ⚠️ 종전 문구는 「이 파일은 `switch` 하나가 전부다」였다 — 7-10에서 ⑥ 표지가 붙으면서
//       그대로 두면 XX-B와 같은 stale 단언이 된다(아래 §43② 목록이 겪은 실패형).
//    §43① 중복배제 구현체(`dup-exclusion.ts`의 `selectPrimaryDeemedGift`)는 프로덕션
//    호출처가 0건이고(테스트만 참조), UI가 한 번에 한 유형만 계산하므로 도달 경로가 없다.
//
//    §43②(1년 합산)는 **후처리가 아니라 `switch` 안의 축별 구현**으로 살아 있다.
//    법 §43② 열거 verbatim: 「제31조제1항제2호, 제35조, 제37조부터 제39조까지, 제39조의2,
//    제39조의3, 제40조, 제41조의2, 제41조의4, 제42조 및 제45조의5」 — **11개 축**이다.
//    그중 배선된 것은 **2개뿐**이다:
//      · §41의4 — `case "free_loan_aggregated"` → `free-loan-aggregated.ts`
//      · §45의5 — `specific-corp.ts`의 소급 1년 윈도(1억원 문턱 판정)
//    나머지 9개(§31①2호·§35·§37~§39·§39의2·§39의3·§40·§41의2·§42)는 미배선이다.
//    ⚠️ 종전 주석은 「§43② 1년 합산도 미배선이다(특정법인 1억원 문턱 판정에 필요)」였는데,
//       괄호가 지목한 바로 그 축이 구현된 뒤에도 문장이 남아 **미구현을 선언하는 stale**이
//       됐다(XX-B). 축을 새로 배선하면 위 목록도 함께 고칠 것 —
//       `__tests__/tax-engine/gift-deemed/router-dup-aggregation-claims.test.ts`가 고정한다.
