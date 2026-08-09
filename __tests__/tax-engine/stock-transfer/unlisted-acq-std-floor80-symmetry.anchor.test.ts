/**
 * anchor: 80% 하한(§165④1 단서)은 **양도·취득 기준시가 양쪽**에 적용된다 (2026-08-09)
 *
 * ## 무엇을 고정하는가
 *
 * 환산취득가액 = 양도가액 × (취득당시 기준시가 ÷ 양도당시 기준시가) 에서 **분자·분모 모두**
 * 「소득세법 시행령」 §165④1호 평가액이다. 그 1호 **단서**는
 *
 *   「**그 가중평균한 가액이** 1주당 순자산가치에 100분의 80을 곱한 금액보다 적은 경우에는
 *     1주당 순자산가치에 100분의 80을 곱한 금액을 **평가액으로 한다**」
 *
 * 로 **양도/취득을 가르지 않는다**. §165④1호는 「1주당 가액의 평가」 방법 전체이고 가·나목이
 * 「**양도일 또는 취득일**이 속하는 사업연도…」라 양쪽 다 이 방법으로 평가한다.
 * ⇒ 단서는 그 평가방법의 일부다.
 *
 * ## 종전 동작과 그 근거 (되살리지 말 것)
 *
 * 종전에는 하한을 **양도측에만** 걸었다(`stock-valuation-unlisted.ts` 주석 "80% 하한은
 * 양도기준시가에만"). 그 취급의 근거를 추적하면 **코드 주석 → 계획서(「80% 하한 관행」) →
 * 설계서**가 서로를 인용하는 **자기참조 루프**이고 사슬 끝에 법령도 예규도 없다.
 * 도메인 최초 커밋부터 그대로였다.
 *
 * 🔴 **방향이 한쪽으로만 찌그러진다** — 하한은 값을 **올리는** 장치인데 분모에만 걸면
 *    분자는 낮은 채 분모만 커져 비율이 **최소**가 된다 ⇒ 취득가액 과소 ⇒ 양도차익 과대 ⇒ 세액 과대.
 *
 * ## 확증 (3중 + 심판례)
 *
 * ① 위임 조문 **법 §99①4호 후단**이 같은 문장에서 「**취득 당시의 기준시가**」를 다룬다
 * ② §165④1호 **가·나목**이 「양도일 또는 취득일」 병렬
 * ③ **§165⑤**이 「취득 당시의 기준시가는 **제4항에도 불구하고**…」라며 예외를 두고 그 안에서
 *    「취득일 현재의 **제4항에 따른 평가액**」이라 쓴다 — 예외를 둔다는 것 자체가 원칙적으로
 *    **취득 기준시가도 ④(하한 포함)로 평가**함을 전제한다
 * ④ 조세심판례 — 같은 환산 산식에서 「하나의 산식에서 **동일한 자산을 2가지의 서로 다른 기준**에
 *    의하여 평가하는 것은 … 타당하지 아니하다」(국심1997경1195 외 5건 · 참조 국심1996부1246)
 *
 * ⚠️ **직접 예규는 확보하지 못했다.** 국세청 양도소득세 집행기준 99-165에는 하한 자체가
 *    등장하지 않으나, 같은 문서가 **상증법 §54① 단서의 하한도 언급하지 않으므로**
 *    그 침묵은 배제의 근거가 아니다(요약 문서). 반대 근거는 문언·심판례·집행기준 어디에도 0건이다.
 *    **반대 해석이 등장하면 이 anchor부터 재검토할 것.**
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 비상장 환산 기본 입력 — 양도가 500,000 × 1,000주 = 500,000,000 */
function base(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.2,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.2,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),

    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,

    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000,
    acquisitionCause: "purchase",

    transferPriceMode: "actual",
    perShareTransferPrice: 500_000,

    acquisitionMode: "estimated",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,

    transferYearNetIncomePerShare: 150_000,
    transferYearNetAssetPerShare: 200_000,
    acquisitionYearNetIncomePerShare: 120_000,
    acquisitionYearNetAssetPerShare: 150_000,

    expenseMode: "estimated",
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  } as StockTransferInput;
}

describe("§165④1 단서 — 80% 하한의 양도·취득 대칭 적용", () => {
  it("F-1 취득측만 발동 — 양도연도는 수익이 났고 취득연도만 저수익이었다", () => {
    /**
     * ⭐ 이 케이스가 **핵심**이다. 종전 구현에서는 하한이 양도측에만 있었으므로
     *   「취득측만 발동」이라는 상태가 **존재할 수 없었다**.
     *
     *   양도 ni=150,000 na=200,000 → 가중평균 170,000 · 하한 160,000 → **미발동** → 170,000
     *   취득 ni= 20,000 na=150,000 → 가중평균  72,000 · 하한 120,000 → **발동**   → 120,000
     *   환산 = 500,000,000 × 120,000 / 170,000 = 352,941,176 (BigInt 절사)
     *   ↔ 종전(취득측 미적용): 500,000,000 × 72,000 / 170,000 = 211,764,705
     */
    const r = calculateStockTransferTax(
      base({ acquisitionYearNetIncomePerShare: 20_000, acquisitionYearNetAssetPerShare: 150_000 }),
    );

    expect(r.valuationDetail?.netAssetFloorApplied).toBe(false); // 양도측 미발동
    expect(r.valuationDetail?.acquisitionNetAssetFloorApplied).toBe(true); // 취득측 발동
    expect(r.acquisitionPrice).toBe(352_941_176);
  });

  it("F-2 양쪽 발동 — 두 기준시가가 모두 하한으로 올라간다", () => {
    /**
     *   양도 ni=30,000 na=200,000 → 98,000 · 하한 160,000 → 160,000
     *   취득 ni=20,000 na=150,000 → 72,000 · 하한 120,000 → 120,000
     *   환산 = 500,000,000 × 120,000 / 160,000 = 375,000,000
     */
    const r = calculateStockTransferTax(
      base({
        transferYearNetIncomePerShare: 30_000,
        transferYearNetAssetPerShare: 200_000,
        acquisitionYearNetIncomePerShare: 20_000,
        acquisitionYearNetAssetPerShare: 150_000,
      }),
    );

    expect(r.valuationDetail?.netAssetFloorApplied).toBe(true);
    expect(r.valuationDetail?.acquisitionNetAssetFloorApplied).toBe(true);
    expect(r.acquisitionPrice).toBe(375_000_000);
  });

  it("F-3 양쪽 미발동 — 양성 대조군 (하한이 없을 때의 값)", () => {
    /**
     * ⚠️ 이 대조군이 없으면 F-1·F-2가 「하한 때문」이 아니라 다른 이유로 그 값이 된 경우와
     *    구별되지 않는다. 기본 픽스처는 양쪽 다 하한 미발동이다.
     *   양도 170,000 · 취득 132,000 → 500,000,000 × 132,000 / 170,000 = 388,235,294
     */
    const r = calculateStockTransferTax(base());

    expect(r.valuationDetail?.netAssetFloorApplied).toBe(false);
    expect(r.valuationDetail?.acquisitionNetAssetFloorApplied).toBe(false);
    expect(r.acquisitionPrice).toBe(388_235_294);
  });

  it("F-4 하한 신설 전(2007.2.27. 이전 양도)에는 취득측도 발동하지 않는다", () => {
    /**
     * 연혁 게이팅은 **양도일** 기준(`getValuationWeights(transferDate).hasFloor80`)이다.
     * 가중치(3:2)가 이미 양도일 기준으로 양쪽에 동일 적용되므로 하한만 취득일 기준으로
     * 가르면 오히려 어긋난다.
     */
    const r = calculateStockTransferTax(
      base({
        transferDate: new Date("2007-02-27"),
        filingDate: new Date("2007-04-30"),
        acquisitionDate: new Date("2003-01-01"),
        acquisitionYearNetIncomePerShare: 20_000,
        acquisitionYearNetAssetPerShare: 150_000,
      }),
    );

    expect(r.valuationDetail?.netAssetFloorApplied).toBe(false);
    expect(r.valuationDetail?.acquisitionNetAssetFloorApplied).toBe(false);
  });
});
