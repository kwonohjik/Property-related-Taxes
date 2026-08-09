/**
 * anchor: **§165⑤ 환산비율 분자·분모에 §165④1 단서(80% 하한) 적용**
 *
 * ## 왜 바꿨나
 *
 * 「소득세법 시행령」 §165⑤ 본문은 환산식의 분자·분모를 각각
 *   「**취득일 현재의 제4항에 따른 평가액**」 / 「**상장일 현재의 제4항에 따른 평가액**」
 * 이라 부른다. 80% 하한은 바로 그 **제4항 제1호 단서**다
 *   (「다만, 그 가중평균한 가액이 1주당 순자산가치에 100분의 80을 곱한 금액보다 적은 경우에는
 *     1주당 순자산가치에 100분의 80을 곱한 금액을 **평가액으로 한다**」).
 *
 * 종전 구현은 「80% 하한은 양도일 평가에만 적용. 환산비율 분자·분모에는 미적용」이라는
 * **근거 0건의 주석**으로 단서를 빼고 있었다. §165④ 취득기준시가 건(PR #1150)과 **같은 뿌리**다
 *   — 코드 주석 → 계획서 → 설계서가 서로를 인용하는 자기참조 루프였고, 사슬 끝에 외부 권위가 없었다.
 *   근거가 필요한 것은 「적용한다」가 아니라 코드가 만든 「분자·분모는 뺀다」는 **예외** 쪽이다.
 *
 * ## 방향은 양방향이다 (납세자 유·불리 어느 한쪽이 아니다)
 *   - 분모(상장연도)에 하한이 걸리면 → 비율↓ → 취득가액↓ → 세액↑ (PLF-1)
 *   - 분자(취득연도)에 하한이 걸리면 → 비율↑ → 취득가액↑ → 세액↓ (PLF-2)
 *
 * ## ⚠️ 하한은 「비율」에 걸리지 않는다
 * 환산비율이 0.8 미만이어도 0.8로 끌어올리지 않는다. 분자·분모 **각각의 평가액**에 개별로
 * 걸릴 뿐이다. 그 회귀 보호는 `post-listing-detail.full.test.ts` PL-FLOOR-1·2가 담당한다
 * (해당 픽스처는 NI == NA라 하한 자체가 발동하지 않아 이 변경에 영향받지 않는다).
 */

import { describe, it, expect } from "vitest";
import { calcPostListingConversion } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 상장일 1개월 종가평균 10,000 · 1,000주 · 양도일 2023-02-26(하한 연혁 안) 고정. */
function base(): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 6_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    priorYearEndDate: new Date("2022-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2004-07-01"),
    transferDate: new Date("2023-02-26"),
    shareCount: 1_000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 8_950,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 8_659,
    listingDate: new Date("2018-07-01"),
    acquiredBeforeListing: true,
    tradingHaltAtTransfer: false,
    bookLost: false,
    listingDatePriceAvg1Month: 10_000,
    listingYearNetIncomePerShare: 0,
    listingYearNetAssetPerShare: 0,
    acquisitionYearNetIncomePerShare: 0,
    acquisitionYearNetAssetPerShare: 0,
    postListingDetail: undefined,
  } as unknown as StockTransferInput;
}

describe("PLF — §165⑤ 환산 분자·분모 80% 하한", () => {
  it("PLF-1 분모(상장연도)만 하한 발동 → 1주당 6,250 (종전 9,090)", () => {
    // 상장연도 NI 50 / NA 200 → 가중평균 50×3/5 + 200×2/5 = 110, 하한 200×0.8 = 160 ⇒ 160
    // 취득연도 NI 100 / NA 100 → 가중평균 100, 하한 80 ⇒ 100 (미발동)
    // 비율 100 / 160 = 0.625 → floor(10,000 × 0.625) = 6,250
    const r = calcPostListingConversion({
      ...base(),
      listingYearNetIncomePerShare: 50,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 100,
    });
    expect(r.listingYearPerShareValue).toBe(160);
    expect(r.acquisitionYearPerShareValue).toBe(100);
    expect(r.conversionRatio).toBeCloseTo(0.625, 6);
    expect(r.finalPerShareValue).toBe(6_250);
    expect(r.totalAcquisitionPrice).toBe(6_250_000);
    expect(r.detail?.floor80Applied).toEqual({ listing: true, acquisition: false });
    // 종전 구현은 분모를 110으로 두어 9,090을 냈다 — 되돌아가면 이 단언이 깨진다.
    expect(r.finalPerShareValue).not.toBe(9_090);
  });

  it("PLF-2 분자(취득연도)만 하한 발동 → 1주당 16,000 (종전 11,000)", () => {
    // 반대 방향: 취득가액이 **늘어난다**(납세자 유리). 한쪽으로만 유리/불리한 수정이 아니다.
    const r = calcPostListingConversion({
      ...base(),
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 100,
      acquisitionYearNetIncomePerShare: 50,
      acquisitionYearNetAssetPerShare: 200,
    });
    expect(r.listingYearPerShareValue).toBe(100);
    expect(r.acquisitionYearPerShareValue).toBe(160);
    expect(r.conversionRatio).toBeCloseTo(1.6, 6);
    expect(r.finalPerShareValue).toBe(16_000);
    expect(r.detail?.floor80Applied).toEqual({ listing: false, acquisition: true });
    expect(r.finalPerShareValue).not.toBe(11_000);
  });

  it("PLF-3 양쪽 하한 발동 → §165⑤ 후단(§165⑨ 준용) 트리거가 **신규로 성립**한다", () => {
    // 상장 NI 50 / NA 200 → 가중 110, 하한 160
    // 취득 NI 20 / NA 200 → 가중  92, 하한 160  ⇒ 하한 적용 후 **둘 다 160 = 같다**
    //
    // §165⑤ 후단은 「취득일 현재의 제4항에 따른 평가액과 … 상장일 현재의 제4항에 따른 평가액이
    // **같은 경우**」를 트리거로 삼는다. 즉 트리거 비교도 **하한 적용 후 값**이어야 한다.
    // 종전에는 110 vs 92라 트리거가 서지 않았다(1주당 8,363).
    const r = calcPostListingConversion({
      ...base(),
      listingYearNetIncomePerShare: 50,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 20,
      acquisitionYearNetAssetPerShare: 200,
    });
    expect(r.listingYearPerShareValue).toBe(160);
    expect(r.acquisitionYearPerShareValue).toBe(160);
    expect(r.conversionRatio).toBeCloseTo(1, 6);
    expect(r.finalPerShareValue).toBe(10_000);
    expect(r.finalPerShareValue).not.toBe(8_363);
    // 토글 OFF이므로 §81④ 2호 — 보정 없이 상장일 평가액 그대로 + 안내
    expect(r.monthlyAccrualApplied).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/§81④ 2호/);
  });

  it("PLF-4 연혁 게이트 — 2007.2.27.까지는 하한이 없다 (양도일 기준)", () => {
    // ⚠️ 이 대조군이 없으면 「연혁 무시하고 무조건 하한」이라는 과거 감사 결함
    //    (audit-fix-stock-valuation-unlisted.test.ts)을 그대로 재현해도 아무도 모른다.
    const before = calcPostListingConversion({
      ...base(),
      transferDate: new Date("2007-02-27"),
      listingYearNetIncomePerShare: 50,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 100,
    });
    expect(before.listingYearPerShareValue).toBe(110); // 하한 미적용
    expect(before.finalPerShareValue).toBe(9_090);
    expect(before.detail?.floor80Applied).toEqual({ listing: false, acquisition: false });

    // 하루 뒤(시행일)부터 하한이 산다 — PLF-1과 동일 입력·동일 값
    const onward = calcPostListingConversion({
      ...base(),
      transferDate: new Date("2007-02-28"),
      listingYearNetIncomePerShare: 50,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 100,
    });
    expect(onward.listingYearPerShareValue).toBe(160);
    expect(onward.finalPerShareValue).toBe(6_250);
  });

  it("PLF-5 연혁 게이트 — 1998.12.31. 이하는 순자산 단독 평가다", () => {
    // 🔴 이것은 하한과 **별개의 2차 변경**이다. 종전 post-listing은 양도일과 무관하게
    //    항상 3:2로 가중평균했다(§165④ 본체 경로는 이미 연혁을 가르고 있었다).
    //    §165⑤이 부르는 것이 「제4항에 따른 평가액」인 이상 가중치 연혁도 함께 따라간다.
    const r = calcPostListingConversion({
      ...base(),
      transferDate: new Date("1998-12-31"),
      listingYearNetIncomePerShare: 50,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 100,
    });
    expect(r.listingYearPerShareValue).toBe(200); // 순자산 단독 (3:2 가중평균 110이 아님)
    expect(r.acquisitionYearPerShareValue).toBe(100);
    expect(r.finalPerShareValue).toBe(5_000); // floor(10,000 × 0.5)
  });

  it("PLF-6 하한이 발동하지 않는 입력은 완전히 불변이다 (회귀 대조군)", () => {
    // 순손익가치가 순자산가치보다 큰 통상적 입력 — 실무 대다수가 여기에 속한다.
    const r = calcPostListingConversion({
      ...base(),
      listingYearNetIncomePerShare: 200,
      listingYearNetAssetPerShare: 100,
      acquisitionYearNetIncomePerShare: 150,
      acquisitionYearNetAssetPerShare: 80,
    });
    expect(r.listingYearPerShareValue).toBe(160); // 200×3/5 + 100×2/5 = 160 > 하한 80
    expect(r.acquisitionYearPerShareValue).toBe(122); // 150×3/5 + 80×2/5 = 122 > 하한 64
    expect(r.detail?.floor80Applied).toEqual({ listing: false, acquisition: false });
  });
});
