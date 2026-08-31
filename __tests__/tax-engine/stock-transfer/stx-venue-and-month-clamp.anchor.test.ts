/**
 * 잔여 배관 anchor — 리뷰 2026-08-28 #21·#30·#31
 *
 * ── #21 증권거래세에 거래 장소 축이 없다 ─────────────────────────────────────
 *   `SecuritiesTaxParams`가 `marketType`·`isKOTCTrading`·`transferDate` 3필드뿐이라
 *   상장 **장외** 양도에도 증권시장 탄력세율(코스피 3/10000 + 농특세 15/10000)이 걸렸다.
 *   판정 축은 이미 있다 — `isOnMarketTransaction`이 14계층 배선을 마쳤고
 *   `calcSecuritiesTransactionTax(input, …)`로 input 전체가 전달되는데 읽지 않았다
 *   (true/false를 뒤집어도 결과 JSON이 **바이트 동일**).
 *
 *   근거: 증권거래세법 §8①(1만분의 35 본칙) ·
 *        §8②(「… **증권시장에서 거래되는 주권에 한정하여** … 낮추거나 영으로 할 수 있다」) ·
 *        같은 법 시행령 §5 각 호(전부 「~시장에서 **양도되는** 주권」) ·
 *        농어촌특별세법 §5①5호(「**증권시장에서 거래된** 증권의 양도가액」)
 *   ⇒ 증권시장 **밖** 양도면 시장 구분과 무관하게 법 §8① 본칙 + 농특세 0이다.
 *
 * ── #30 「상장일 이후 1개월」 윈도우에 말일 클램프가 없다 ──────────────────────
 *   `buildOneMonthAfterListingSlots`가 `Date.UTC(y, m, d)` 후 −1일만 해서
 *   짧은 달로 넘어갈 때 JS 오버플로가 그대로 남는다(주석의 「자동 보정」은 사실이 아니다).
 *   같은 파일 **역방향**은 `monthBeforeClamped`로 클램프하고 그 사고를 주석에 기록해 뒀다 —
 *   한 파일 안에서 두 방향이 갈려 있었다.
 *   근거: 민법 §160③ 「최종의 월에 해당일이 없는 때에는 그 월의 말일로 기간이 만료한다」
 *        · 소득세법 시행령 §165⑤
 *
 * ── #31 aggregate route가 `addStockRefines`를 태우지 않는다 ────────────────────
 *   단건은 `addStockRefines(...)`로 파싱하는데 다건은 맨 스키마라, **단건이면 400인 payload가
 *   다건 items[0]에 넣으면 통과**한다. 스키마 주석이 「API를 직접 호출하는 경로에는
 *   이 게이트가 유일한 방어다」라고 적어 둔 그 게이트다.
 *
 *   PL-STX-1~5   (#21)
 *   PL-CLAMP-1~4 (#30)
 *   PL-AGG-1~3   (#31)
 */

import { describe, it, expect } from "vitest";
import { calcSecuritiesTransactionTax } from "@/lib/tax-engine/stock-transfer/securities-transaction-tax";
import { buildOneMonthAfterListingSlots } from "@/lib/kiwoom/calendar";
import { stockTransferAggregateInputSchema } from "@/lib/api/stock-transfer-tax-schema";

const TRANSFER_DATE = new Date("2024-06-01");

// ============================================================
// #21 — 증권거래세 거래 장소 축
// ============================================================

describe("PL-STX (#21): 증권시장 밖 양도는 법 §8① 본칙 + 농특세 0", () => {
  const PRICE = 110_000_000;

  it("PL-STX-1: 코스피 장내 — 종전 그대로 (회귀 가드)", () => {
    const r = calcSecuritiesTransactionTax(
      { marketType: "kospi", isKOTCTrading: false, transferDate: TRANSFER_DATE, isOnMarketTransaction: true },
      PRICE,
    );
    expect(r.securitiesTransactionTax).toBe(33_000); // 3/10000
    expect(r.agriculturalTax).toBe(165_000); // 15/10000
  });

  it("PL-STX-2: 코스피 장외 — 35/10000 · 농특세 0", () => {
    const r = calcSecuritiesTransactionTax(
      { marketType: "kospi", isKOTCTrading: false, transferDate: TRANSFER_DATE, isOnMarketTransaction: false },
      PRICE,
    );
    expect(r.securitiesTransactionTax).toBe(385_000);
    expect(r.agriculturalTax).toBe(0);
    expect(r.totalTax).toBe(385_000);
  });

  it("PL-STX-3: 코스닥·코넥스 장외도 같다", () => {
    for (const marketType of ["kosdaq", "konex"] as const) {
      const r = calcSecuritiesTransactionTax(
        { marketType, isKOTCTrading: false, transferDate: TRANSFER_DATE, isOnMarketTransaction: false },
        PRICE,
      );
      expect(r.securitiesTransactionTax).toBe(385_000);
      expect(r.agriculturalTax).toBe(0);
    }
  });

  it("PL-STX-4: 인용도 장외 본칙으로 바뀐다 (「시행령 §5 1호」가 남지 않는다)", () => {
    const r = calcSecuritiesTransactionTax(
      { marketType: "kospi", isKOTCTrading: false, transferDate: TRANSFER_DATE, isOnMarketTransaction: false },
      PRICE,
    );
    expect(r.rateReference).not.toContain("제5조제1호");
    expect(r.rateReference).toContain("§8①");
  });

  it("PL-STX-5: 비상장·K-OTC는 축과 무관 (회귀 가드)", () => {
    const unlisted = calcSecuritiesTransactionTax(
      { marketType: "unlisted", isKOTCTrading: false, transferDate: TRANSFER_DATE, isOnMarketTransaction: false },
      PRICE,
    );
    expect(unlisted.securitiesTransactionTax).toBe(385_000);
    // K-OTC는 증권시장 밖이지만 시행령 §5 3호 나목이 별도 세율을 준다 — 축을 타지 않는다.
    const kotcOn = calcSecuritiesTransactionTax(
      { marketType: "unlisted", isKOTCTrading: true, transferDate: TRANSFER_DATE, isOnMarketTransaction: true },
      PRICE,
    );
    const kotcOff = calcSecuritiesTransactionTax(
      { marketType: "unlisted", isKOTCTrading: true, transferDate: TRANSFER_DATE, isOnMarketTransaction: false },
      PRICE,
    );
    expect(kotcOff.securitiesTransactionTax).toBe(kotcOn.securitiesTransactionTax);
  });
});

// ============================================================
// #30 — 상장일 + 1개월 말일 클램프
// ============================================================

describe("PL-CLAMP (#30): 「상장일 이후 1개월」은 말일로 만료한다 (민법 §160③)", () => {
  it("PL-CLAMP-1: 2023-01-31 상장 → 마지막 슬롯은 2023-02-28", () => {
    const slots = buildOneMonthAfterListingSlots("2023-01-31");
    expect(slots[slots.length - 1]).toBe("2023-02-28");
    expect(slots).not.toContain("2023-03-01");
    expect(slots).not.toContain("2023-03-02");
  });

  it("PL-CLAMP-2: 윤년 2024-01-31 → 2024-02-29", () => {
    const slots = buildOneMonthAfterListingSlots("2024-01-31");
    expect(slots[slots.length - 1]).toBe("2024-02-29");
  });

  it("PL-CLAMP-3: 2023-03-31 → 2023-04-30 (하루 밀리지 않는다)", () => {
    const slots = buildOneMonthAfterListingSlots("2023-03-31");
    expect(slots[slots.length - 1]).toBe("2023-04-30");
  });

  it("PL-CLAMP-4: 오버플로가 없는 달은 종전 그대로 (회귀 가드)", () => {
    expect(buildOneMonthAfterListingSlots("2009-08-21").at(-1)).toBe("2009-09-20");
    expect(buildOneMonthAfterListingSlots("2009-02-01").at(-1)).toBe("2009-02-28");
    expect(buildOneMonthAfterListingSlots("2024-02-01").at(-1)).toBe("2024-02-29");
  });
});

// ============================================================
// #31 — aggregate route가 국내 갈래 refine을 태운다
// ============================================================

describe("PL-AGG (#31): 다건 items도 단건과 같은 refine을 탄다", () => {
  const domesticItem = (o: Record<string, unknown> = {}) => ({
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: "2023-12-31",
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: "2022-01-01",
    transferDate: "2024-06-01",
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 110_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: "2024-08-31",
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  });

  it("PL-AGG-1: 정상 payload는 통과한다 (회귀 가드)", () => {
    const parsed = stockTransferAggregateInputSchema.safeParse({
      items: [domesticItem(), domesticItem()],
      deductionMode: "aggregate",
    });
    expect(parsed.success).toBe(true);
  });

  it("PL-AGG-2: 「정상신고 + 부정행위」 모순이 다건에서도 400이다", () => {
    const parsed = stockTransferAggregateInputSchema.safeParse({
      items: [domesticItem({ filingViolation: "none", isFraudulent: true }), domesticItem()],
      deductionMode: "aggregate",
    });
    expect(parsed.success).toBe(false);
  });

  it("PL-AGG-3: 「합계 입력인데 합계 미입력」도 다건에서 400이다", () => {
    const parsed = stockTransferAggregateInputSchema.safeParse({
      items: [
        domesticItem({
          transferActualInputMode: "total",
          perShareTransferPrice: undefined,
        }),
      ],
      deductionMode: "aggregate",
    });
    expect(parsed.success).toBe(false);
  });
});
