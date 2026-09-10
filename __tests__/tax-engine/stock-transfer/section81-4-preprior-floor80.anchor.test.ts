/**
 * anchor — 소칙 §81④ 월할 보정의 **전전사업연도 평가액에도 80% 하한을 적용한다**
 *
 * ## 위임 사슬 (KoreanLaw 실측 2026-09-01)
 *
 * 법 **§99①4호** 「비상장주식등의 기준시가 = 대통령령으로 정하는 방법에 따라 평가한 가액」
 *   → 영 **§165④1호** 순손익가치 3 : 순자산가치 2 가중평균.
 *     **단서** 「그 가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액보다 적은 경우에는
 *     … 100분의 80을 곱한 금액을 **평가액으로 한다**」 ⇒ 하한은 **평가액 자체의 속성**이다.
 *   → 영 **§165⑨** 「**법 제99조제1항제3호 및 제4호에 따라 산정한** 양도 당시의 기준시가와
 *     취득 당시의 기준시가가 같은 경우에는 … 재정경제부령으로 정하는 방법에 따라 계산한 가액을
 *     양도 당시의 기준시가로 한다」
 *   → 소칙 **§81④1호** 「양도당시 기준시가 = **직전사업연도 기준시가** +
 *     (직전사업연도 기준시가 − **전전사업연도 기준시가**) × (보유월수 ÷ 직전사업연도 월수)」
 *
 * ⇒ §81④ 산식의 항은 「**기준시가**」이고, 그 기준시가는 §165⑨가 「법 §99①3·4호에 따라 산정한」
 *   것이라고 못박는다. 비상장주식의 그 산정 방법이 곧 §165④(단서 포함)이므로
 *   **전전사업연도 값에도 하한이 따라온다.**
 *
 * ## 종전 상태 — 「본문 미확인」으로 하한을 빼고 있었다
 *
 * 두 경로(`stock-valuation-post-listing.ts` §165⑤ · `stock-valuation-unlisted.ts` §165⑨)가
 * 전전연도만 `calcUnlistedPerShareWeighted`(하한 없는 순수 가중평균)로 계산했다.
 * 소칙 §81④ 본문을 읽지 않은 채 「§165⑤ 본문은 분자·분모만 「제4항에 따른 평가액」이라 부른다」를
 * 근거로 유보한 것이었는데, 본문을 읽으니 §81④는 그 표현 대신 **「기준시가」**를 쓰고
 * §165⑨가 그 계보를 지정한다.
 *
 * ## 세액 방향 — 현행이 납세자에게 불리했다
 *
 * 하한이 전전연도를 끌어올리면 (직전 − 전전)이 작아져 보정 분모가 내려가고,
 * §165⑤ 환산 분자(취득기준시가)가 **올라간다** ⇒ 취득가액 증가 = 양도차익 감소.
 * 실측(아래 F81-1): 1주당 666,666 → 777,777 · **취득기준시가 총액**(개산공제 base)
 * 3,333,330,000 → 3,888,885,000. ⚠️ 이 수는 「취득가액」이 아니다 — 취득가액은 그 뒤에
 * §176의2②1호 환산을 한 번 더 거친다(F81-2가 두 값을 나눠 고정한다).
 *
 * 🔑 **착수 전 안전망 0건**이었다 — 이 변경을 적용해도 `__tests__/tax-engine/stock-transfer`
 *    + `__tests__/calc` **295파일 3,240건이 전부 통과**했다. 아무도 보고 있지 않았다.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calcPostListingConversion } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { calcUnlistedValuation } from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 하한 구속 조합 — 가중평균 0.6·NI + 0.4·NA < 0.8·NA  ⟺  NI < (2/3)·NA */
const PREPRIOR_FLOOR_BOUND = { ni: 100_000, na: 300_000 }; // 180,000 < 240,000 ⇒ 하한
/** 대조군 — 하한 미구속 (NI = NA) */
const PREPRIOR_FLOOR_FREE = { ni: 200_000, na: 200_000 }; // 200,000 > 160,000 ⇒ 원값

function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: false,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2020-03-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 5_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 900_000,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 800_000,
    tradingHaltAtTransfer: false,
    acquiredBeforeListing: false,
    bookLost: false,
    expenseMode: "estimated",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    priorBizYearMonths: 12,
    ...o,
  } as unknown as StockTransferInput;
}

/** §165⑤ 취득후상장 — 취득연도 == 상장연도 평가라 §81④ 월할 보정이 발동한다 */
function postListingInput(prePrior: { ni: number; na: number }): StockTransferInput {
  return base({
    acquiredBeforeListing: true,
    listingDate: new Date("2020-08-21"),
    listingDatePriceAvg1Month: 700_000,
    listingYearNetIncomePerShare: 200_000,
    listingYearNetAssetPerShare: 200_000,
    acquisitionYearNetIncomePerShare: 200_000,
    acquisitionYearNetAssetPerShare: 200_000,
    prePriorYearNetIncomePerShare: prePrior.ni,
    prePriorYearNetAssetPerShare: prePrior.na,
    postListingDetail: { unlistedDetailMode: "simple", monthlyAccrualToggle: true },
  } as Partial<StockTransferInput>);
}

/** §165⑨ 비상장 본체 — 양도·취득 기준시가 동일 + 동일 사업연도 토글 */
function unlistedInput(prePrior: { ni: number; na: number }): StockTransferInput {
  return base({
    marketType: "unlisted",
    transferYearNetIncomePerShare: 200_000,
    transferYearNetAssetPerShare: 200_000,
    acquisitionYearNetIncomePerShare: 200_000,
    acquisitionYearNetAssetPerShare: 200_000,
    prePriorYearNetIncomePerShare: prePrior.ni,
    prePriorYearNetAssetPerShare: prePrior.na,
    unlistedSameBizYearToggle: true,
  } as Partial<StockTransferInput>);
}

describe("F81 — §81④ 전전사업연도 평가액의 80% 하한", () => {
  it("F81-1: §165⑤ 경로 — 전전연도에 하한이 걸린다 (180,000 → 240,000)", () => {
    const r = calcPostListingConversion(postListingInput(PREPRIOR_FLOOR_BOUND));
    expect(r.monthlyAccrualApplied).toBe(true);
    // 하한 미적용이면 180,000 · 적용이면 순자산 300,000 × 80% = 240,000
    expect(r.monthlyAccrualDetail?.prePriorYearPerShareValue).toBe(240_000);
  });

  /**
   * 🔑 세액 축까지 고정한다 — 평가값만 보면 「그 값을 호출부가 쓰는지」를 모른다.
   * 보정 분모 = 200,000 + (200,000 − 240,000) × (6/12) = 180,000
   * 환산 분자 = 700,000 × (200,000 / 180,000) = 777,777.77… → 777,777
   *
   * 🔴 **2026-09-10 정정 — 종전 단언은 그 세액 축에 «닿지 않았다».**
   * `calcPostListingConversion(...).totalAcquisitionPrice`를 봤는데, 그 필드는
   * §176의2②1호 환산을 한 함수로 모은 뒤(S1) **프로덕션 소비처가 0**이 됐다.
   * 게다가 값의 정체가 취득가액이 아니라 **취득기준시가 총액**이었다 —
   * 이름이 「총 환산취득가」라고 말해 반대로 읽히던 자리다. ⇒ 필드를 걷어내고,
   * **엔진 본체를 돌려** 하한이 실제로 움직이는 세 값을 고정한다.
   *
   *   취득기준시가 총액 = 777,777 × 5,000주            = 3,888,885,000  ← 종전 단언이 보던 수
   *   취득가액        = 4,500,000,000 × (777,777/800,000) = 4,374,995,625
   *   산출세액                                            =    16,723,100
   *
   * 하한이 구속하지 않으면(F81-3 조합) 산출세액은 116,250,000이다 — 하한 하나가
   * 세액을 약 1억 원 가른다. 종전 단언은 그 축을 한 번도 지나지 않았다.
   */
  it("F81-2: §165⑤ 경로 — 취득기준시가·취득가액이 하한을 반영한다", () => {
    const r = calcPostListingConversion(postListingInput(PREPRIOR_FLOOR_BOUND));
    expect(r.finalPerShareValue).toBe(777_777);

    const full = calculateStockTransferTax(postListingInput(PREPRIOR_FLOOR_BOUND));
    expect(full.valuationDetail?.conversionAcqStdPerShare).toBe(777_777);
    expect(full.estimatedBase).toBe(3_888_885_000);
    expect(full.acquisitionPrice).toBe(4_374_995_625);
    expect(full.calculatedTax).toBe(16_723_100);
  });

  /**
   * 🔑 **대조군.** 하한이 구속하지 않는 조합에서는 값이 바뀌지 않아야 한다.
   * 「무조건 순자산×80%로 바꾼다」로 잘못 고치면 이 단언이 잡는다.
   * 보정 분모 = 200,000 + (200,000 − 200,000) × (6/12) = 200,000
   * 환산 분자 = 700,000 × (200,000 / 200,000) = 700,000
   */
  it("F81-3: §165⑤ 대조군 — 하한 미구속이면 원값 그대로", () => {
    const r = calcPostListingConversion(postListingInput(PREPRIOR_FLOOR_FREE));
    expect(r.monthlyAccrualDetail?.prePriorYearPerShareValue).toBe(200_000);
    expect(r.finalPerShareValue).toBe(700_000);
  });

  it("F81-4: §165⑨ 경로도 같은 규칙이다 (두 경로 대칭)", () => {
    const r = calcUnlistedValuation(unlistedInput(PREPRIOR_FLOOR_BOUND), 4_500_000_000);
    expect(r.section1659Detail?.prePrior).toBe(240_000);
  });

  it("F81-5: §165⑨ 대조군 — 하한 미구속이면 원값 그대로", () => {
    const r = calcUnlistedValuation(unlistedInput(PREPRIOR_FLOOR_FREE), 4_500_000_000);
    expect(r.section1659Detail?.prePrior).toBe(200_000);
  });
});
