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
import { forProfitDoneeGateApplies } from "./taxpayer-gate";
import { forProfitDoneeExcludedResult } from "./taxpayer-gate";
import { incomeTaxedDoneeGateApplies } from "./taxpayer-gate";
import { incomeTaxedDoneeExcludedResult } from "./taxpayer-gate";
import { dupExclusionAppliesToDeemedType } from "./dup-exclusion";

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
    ...incomeTaxedDoneeGate(input, forProfitDoneeGate(input, dispatchDeemedGift(input))),
    donorJointLiabilityExempt: jointLiabilityExemptForDeemedType(input.type),
    // §43① 열거 표지 — ⑥ 표지와 같은 층위(유형표 조회, 계산 아님). #112
    dupExclusionApplies: dupExclusionAppliesToDeemedType(input.type),
  };
}

/**
 * 「상증법」§2 9호·§4의2①·③ 공통 게이트 — §39 밖 단일 수증자 13종(7-12) + 명부형 3종의 단일 모드(7-15).
 *
 * ⚠️ **과세되는 결과에만** 건다. 요건 불성립(기준금액 미달 등)으로 이미 미적용이면 그 사유가
 *    더 근본적이다 — 증여 자체가 성립하지 않았는데 「영리법인이라 제외」라고 덮으면 사유가 틀린다.
 * ⚠️ ⑥ 표지는 이 뒤에 붙는다 — 제외돼도 「그 유형에 연대납부의무가 없다」는 사실은 남는다.
 */
function forProfitDoneeGate(input: DeemedGiftInput, result: DeemedGiftResult): DeemedGiftResult {
  if (!forProfitDoneeGateApplies(input)) return result;
  if (!("doneeIsForProfitCorp" in input) || input.doneeIsForProfitCorp !== true) return result;
  if (result.applied !== true || result.deemedGiftValue <= 0) return result;
  return forProfitDoneeExcludedResult(result);
}

/**
 * 「상증법」§4의2③ — 수증자에게 소득세·법인세가 부과되면 증여세를 부과하지 않는다(7-16).
 * 수증자 1명(한 묶음) 입력만(`incomeTaxedDoneeGateApplies`). 영리법인 게이트 **뒤**다 — 둘 다 켜져도
 * 먼저 성립한 사유(납세의무자 아님)가 남는다. 과세되는 결과에만 거는 규칙은 영리법인 게이트와 같다.
 */
function incomeTaxedDoneeGate(input: DeemedGiftInput, result: DeemedGiftResult): DeemedGiftResult {
  if (!incomeTaxedDoneeGateApplies(input)) return result;
  if (!("doneeIncomeOrCorporateTaxed" in input) || input.doneeIncomeOrCorporateTaxed !== true) return result;
  if (result.applied !== true || result.deemedGiftValue <= 0) return result;
  return incomeTaxedDoneeExcludedResult(result);
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
//    `switch`와 §4의2 납세의무 게이트(영리법인·③)가 전부다. 그 밖에 붙는 §4의2⑥·§43① 표지는
//    유형표 조회이고, 계산이 아니라 **결과 echo 필드**다(§43① 표지는 고지 전용 — #112).
//    ⚠️ 종전 문구는 「이 파일은 `switch` 하나가 전부다」였다 — 7-10에서 ⑥ 표지가 붙으면서
//       그대로 두면 XX-B와 같은 stale 단언이 된다(아래 §43② 목록이 겪은 실패형).
//    §43① 중복배제 구현체(`dup-exclusion.ts`의 `selectPrimaryDeemedGift`)는 프로덕션
//    호출처가 0건이고(테스트만 참조), UI가 한 번에 한 유형만 계산하므로 도달 경로가 없다.
//
//    §43②(1년 합산)는 **후처리가 아니라 `switch` 안의 축별 구현**으로 살아 있다.
//    법 §43② 열거 verbatim: 「제31조제1항제2호, 제35조, 제37조부터 제39조까지, 제39조의2,
//    제39조의3, 제40조, 제41조의2, 제41조의4, 제42조 및 제45조의5」 — **12개 축**이다(§37~§39는 §37·§38·§39 셋).
//    합산은 영 §32의4 두문대로 **금액기준 판정용**이다 — 과세액은 당해 건(`same-clause-43-2.ts` 머리 주석).
//    배선된 것은 **7개**다:
//      · §41의4 — `case "free_loan_aggregated"` → `free-loan-aggregated.ts`
//      · §45의5 — `specific-corp.ts`의 소급 1년 윈도(1억원 문턱 판정)
//      · §39 — `same-clause-43-2.ts` — 나목 3억 금액기준 판정에만 합산, 과세는 당해 건(#19 · 영 §32의4 4호 호 단위)
//      · §38·§39의2·§39의3·§40 — 같은 헬퍼로 3억·1억 leg에 합산(`docs/00-pm/gift43-2-capital-axes.plan.md`)
//    금액기준이 없어 합산해도 결과가 같은 축(**대상 없음**, 영 §32의4 두문 「각각의 금액기준」):
//      · §41의2 초과배당 — 기준금액 없음
//      · §31①2호 — 이 계산기에 엔진이 없다(유형 목록 밖)
//      · 하위 유형: §39의3①1호 저가(영 §29의3②는 2호만) · §40①2호 라목(영 §30②3 = 0원)
//      · §42 저가·고가 — 기준금액이 「시가의 100분의 30에 상당하는 가액」(영 §32②2호)뿐이다. 30% leg는
//        건별로 판정한다는 정책 (a)(#19 사용자 결정)를 따르므로 합산할 금액 leg가 없다 — 조문의 결론이 아니라 정책의 결과다
//    남은 미배선: §35(기준금액이 **차감형** — 합산이 과세액을 바꿔 정책 확정 필요) · §37 · §42 무상(1천만원) — 별건.
//    ⚠️ 종전 주석은 「§43② 1년 합산도 미배선이다(특정법인 1억원 문턱 판정에 필요)」였는데,
//       괄호가 지목한 바로 그 축이 구현된 뒤에도 문장이 남아 **미구현을 선언하는 stale**이
//       됐다(XX-B). 축을 새로 배선하면 위 목록도 함께 고칠 것 —
//       `__tests__/tax-engine/gift-deemed/router-dup-aggregation-claims.test.ts`가 고정한다.
