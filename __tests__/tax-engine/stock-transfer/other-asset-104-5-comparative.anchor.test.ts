/**
 * anchor: **기타자산(§94①4호) 다건 — §104⑤ 비교과세**
 *
 * 계획서: `docs/00-pm/stock-other-asset-104-5-and-104-1-9.plan.md` 결함 A
 *
 * ── 무엇을 고쳤는가 ────────────────────────────────────────────────────
 * `calculateStockTransferTaxAggregate`가 `totalCalculatedTax = Σ 단건 세액`을 냈다.
 * 그러면 **누진 구간이 자산마다 리셋**되어 §104⑤ 1호도 2호도 아닌 값이 나온다 —
 * 부동산 쪽 P11이 저질렀다 되돌린 오류와 **같은 성질**이다
 * (`aggregate-progressive-clause-104-5.anchor.test.ts` ❌재제안 금지 항목).
 *
 * [법령 — 전부 본문 확보]
 * - §104⑤ 본문: 「해당 과세기간에 §94①1호ㆍ2호 및 **제4호**에서 규정한 자산을 **둘 이상 양도**
 *   하는 경우 … 다음 각 호의 금액 중 **큰 것**」
 *     1호 = 양도소득과세표준 **합계액** × §55① / 2호 = **자산별** 산출세액 합계액
 * - 「기획재정부 재산-536」(2018.6.19.) · 국세청 「기준-2018-법령해석재산-0098」:
 *   「2호의 "자산별" = §104 **각 호별로 합산한 자산**」 ⇒ 같은 호 합산은 **본문·무조건**
 * - §104①1호가 「§94①1호ㆍ2호 및 **4호**에 따른 자산 — §55①」이라 **기타자산은 1호**다.
 *   단기세율(§104①2·3호)은 「§94①**1호 및 2호**」로 4호가 빠져 **기타자산에 적용되지 않는다**.
 *   ⇒ **9호에 해당하지 않는 한** 호가 하나뿐이라 1호 = 2호이고 MAX도 그 값이다.
 *
 * ⚠️ **주식(§94①3호 가·나목)은 §104⑤ 대상이 아니다** — 본문이 3호를 열거하지 않는다. A-3이 고정.
 *
 * 🔄 **2026-08-03 갱신 — 「호가 하나」 전제는 해제됐다.**
 *   §104①**9호**(비사업용 토지 과다소유법인 주식 — 시행령 §167의7, 기본세율 + 10%p)가 구현되어
 *   호가 **둘**이 됐다. `computeOtherAssetComparativeTax`는 이제 버킷 2개를 만들고 **MAX를 실제로
 *   취한다**(`clause1Tax`·`clause2Tax`·`applied` echo).
 *   ⇒ **이 파일의 케이스는 전부 9호 미해당**이라 1호 = 2호가 유지되고 값도 불변이다.
 *     9호가 섞이는 국면은 `nbl-heavy-corp-104-1-9.anchor.test.ts`가 다룬다
 *     (특히 **B-7 — 1호가 이기는 케이스**).
 */
import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTaxAggregate,
  calculateStockTransferTax,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 기타자산(§94①4다 — 과점주주) 1건. `gain` = 양도차익(원) */
function otherAsset(gain: number, o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "other_asset",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: true,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: gain / 100 + 10_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  };
}

/** 상장 대주주 주식(§94①3가) — §104⑤ 대상 **아님** */
function listedMajor(gain: number): StockTransferInput {
  return otherAsset(gain, {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    isQualifyingBlockShareholder: false,
  });
}

describe("§104⑤ — 기타자산 다건 비교과세", () => {
  it("A-1: 기타자산 2건 — 합산 과세표준에 누진 1회 (과소 27,840,000 해소)", () => {
    const r = calculateStockTransferTaxAggregate(
      [otherAsset(300_000_000), otherAsset(300_000_000)],
      "aggregate",
    );

    const c = r.otherAssetComparativeTax!;
    expect(c).toBeDefined();
    expect(c.itemCount).toBe(2);
    // 기본공제 250만원은 그룹 1회 → 첫 종목에서 소진
    expect(c.aggregatedTaxBase).toBe(597_500_000);
    // 종전 산출 — 자산별 누진(구간 리셋). §104⑤ 어느 호도 아니다.
    expect(c.itemSumTax).toBe(187_170_000); // 93,110,000 + 94,060,000
    // 정정 — 597,500,000 × 42% − 35,940,000 = 215,010,000
    expect(c.aggregatedTax).toBe(215_010_000);
    expect(c.aggregatedTax - c.itemSumTax).toBe(27_840_000);

    expect(r.totalCalculatedTax).toBe(215_010_000);
  });

  it("A-2: **엔진 자신이 확증** — 같은 과세표준의 단일 자산과 일치한다", () => {
    // 도출값이 추정이 아님을 엔진 스스로 보인다. 「2건이라는 이유만으로」 갈리던 것이었다.
    const single = calculateStockTransferTax(otherAsset(600_000_000));
    expect(single.taxBase).toBe(597_500_000);
    expect(single.calculatedTax).toBe(215_010_000);

    const multi = calculateStockTransferTaxAggregate(
      [otherAsset(300_000_000), otherAsset(300_000_000)],
      "aggregate",
    );
    expect(multi.totalCalculatedTax).toBe(single.calculatedTax);
    expect(multi.totalTaxBase).toBe(single.taxBase);
  });

  it("A-3: **주식(§94①3호)은 대상이 아니다** — 종전대로 단건 합계", () => {
    // §104⑤ 본문이 「§94①1호ㆍ2호 및 제4호」로 3호를 열거하지 않는다.
    const r = calculateStockTransferTaxAggregate(
      [listedMajor(300_000_000), listedMajor(300_000_000)],
      "aggregate",
    );
    expect(r.otherAssetComparativeTax).toBeUndefined();
    expect(r.totalCalculatedTax).toBe(r.items.reduce((s, x) => s + x.calculatedTax, 0));
  });

  it("A-4: 혼재 — 기타자산만 합산되고 주식분은 그대로 더해진다", () => {
    const r = calculateStockTransferTaxAggregate(
      [otherAsset(300_000_000), otherAsset(300_000_000), listedMajor(300_000_000)],
      "aggregate",
    );
    const c = r.otherAssetComparativeTax!;
    expect(c.itemCount).toBe(2); // 주식은 제외

    const stockTax = r.items
      .filter((x) => x.basicDeductionGroup === "stock")
      .reduce((s, x) => s + x.calculatedTax, 0);
    expect(stockTax).toBeGreaterThan(0);
    expect(r.totalCalculatedTax).toBe(c.aggregatedTax + stockTax);
  });

  it("A-5: 기타자산 **1건**은 §104⑤ 미해당 (「둘 이상 양도」 요건)", () => {
    const r = calculateStockTransferTaxAggregate(
      [otherAsset(300_000_000), listedMajor(300_000_000)],
      "aggregate",
    );
    expect(r.otherAssetComparativeTax).toBeUndefined();
    expect(r.totalCalculatedTax).toBe(r.items.reduce((s, x) => s + x.calculatedTax, 0));
  });

  it("A-6: `each_item` 모드는 종전 동작 유지 (기본공제 중복 허용 진단 모드)", () => {
    const r = calculateStockTransferTaxAggregate(
      [otherAsset(300_000_000), otherAsset(300_000_000)],
      "each_item",
    );
    expect(r.otherAssetComparativeTax).toBeUndefined();
    expect(r.totalCalculatedTax).toBe(r.items.reduce((s, x) => s + x.calculatedTax, 0));
  });

  it("A-7: 불변식 — 합산 누진은 자산별 합보다 **작을 수 없다**(누진의 볼록성)", () => {
    // §104⑤은 MAX인데 1호=2호라 단순 대체로 구현했다. 그 정당성이 이 불변식이다.
    // 구간이 갈리는 여러 조합에서 확인한다.
    for (const [g1, g2] of [
      [50_000_000, 50_000_000],
      [100_000_000, 900_000_000],
      [300_000_000, 300_000_000],
      [1_000_000_000, 1_000_000_000],
    ] as const) {
      const r = calculateStockTransferTaxAggregate(
        [otherAsset(g1), otherAsset(g2)],
        "aggregate",
      );
      const c = r.otherAssetComparativeTax!;
      expect(c.aggregatedTax).toBeGreaterThanOrEqual(c.itemSumTax);
      expect(r.totalCalculatedTax).toBe(Math.max(c.aggregatedTax, c.itemSumTax));
    }
  });

  it("A-8: 종목별 `items`는 **자산 단독 참고값**으로 남는다 (Σ ≠ 합계)", () => {
    // 부동산 정본 `PerPropertyBreakdown.refCalculatedTax`와 같은 규약 —
    // 「Σ ref ≠ 그룹 세액」은 비교과세의 본질이다. 신고서 양식이 두 값을 각각 쓴다.
    const r = calculateStockTransferTaxAggregate(
      [otherAsset(300_000_000), otherAsset(300_000_000)],
      "aggregate",
    );
    expect(r.items.reduce((s, x) => s + x.calculatedTax, 0)).toBe(187_170_000);
    expect(r.totalCalculatedTax).toBe(215_010_000);
    expect(r.totalCalculatedTax).not.toBe(r.items.reduce((s, x) => s + x.calculatedTax, 0));
  });
});
