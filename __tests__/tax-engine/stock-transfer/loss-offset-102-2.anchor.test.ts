/**
 * 주식 다종목 §102② 양도차손 통산 anchor (D-A · D-B · D-C)
 *
 * 계획서: docs/02-design/features/stock-102-2-loss-offset-and-103-deduction-order.plan.md §5
 *
 * 법령:
 *   법 §92②   — 양도차익 → **양도소득금액**(통산 포함) → 과세표준(§103 기본공제 차감). 순서 강제.
 *   법 §102①  — 「소득별로 구분」 + 후단 「결손금은 **다른 호의 소득금액과 합산하지 아니한다**」.
 *                주식은 2호(§94①3호), 기타자산은 1호(§94①4호).
 *   법 §102②  — 「제1항 **각 호별로** … 양도차손을 공제」.
 *   영 §167의2① — 1호 같은 세율 먼저 → 2호 다른 세율 pro-rata. 잔여 차손은 소멸(이월 없음).
 *   별지 제84호서식 작성요령 4번 — 주식은 「**주식등 종류코드란의 세율이 같은 자산**을 합산」.
 *
 * 예규:
 *   사전-2025-법규재산-1163(2026.04.01.) — KDR 차손과 §94①3호다목 주식 손익 **합산 가능**.
 *   제도46014-10860(2001.04.30.) — 서로 다른 비상장주식 간 소득금액·결손금 **통산**.
 *   상속증여세과-209(2013.06.10.) — **비과세** 자산의 차익·차손은 과세분과 **통산 불가**.
 *
 * Pre-Do 실측(구현 전): M-2·M-3·M-4·M-7이 실패, M-1·M-5·M-8은 통과(양성 대조군).
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** kospi 대주주·비중소·2022-01-01 취득·2024-06-01 양도(비단기) ⇒ §104①11호가목2) 20% */
function stockInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
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
    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 50_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 40_000,
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
    ...overrides,
  };
}

/** 이익 +10,000,000 (20% 군) */
const GAIN = stockInput();
/** 차손 −5,000,000 (20% 군) */
const LOSS = stockInput({ perShareTransferPrice: 30_000, perShareAcquisitionPrice: 35_000 });

describe("M-1 양성 대조군: 이익 단독 — 통산 도입으로 달라지지 않는다", () => {
  const r = calculateStockTransferTaxAggregate([GAIN]);
  it("소득 1천만 · 기본공제 250만 · 과표 750만 · 세액 150만", () => {
    expect({
      income: r.totalTransferIncome,
      base: r.totalTaxBase,
      tax: r.totalCalculatedTax,
    }).toEqual({ income: 10_000_000, base: 7_500_000, tax: 1_500_000 });
  });
  it("통산이 없으면 lossOffset은 실리지 않는다", () => {
    expect(r.lossOffset).toBeUndefined();
  });
});

describe("M-2 🔴 D-A: 이익 1천만 + 차손 5백만 → 통산", () => {
  const r = calculateStockTransferTaxAggregate([GAIN, LOSS]);

  it("M-2-1: 통산 후 소득 5,000,000", () => {
    expect(r.totalTransferIncome).toBe(5_000_000);
  });

  it("M-2-2: 과세표준 2,500,000 (5,000,000 − 기본공제 2,500,000)", () => {
    expect(r.totalTaxBase).toBe(2_500_000);
  });

  it("M-2-3: 산출세액 500,000 — 종전 1,500,000에서 1,000,000 과대 해소", () => {
    expect(r.totalCalculatedTax).toBe(500_000);
    expect(r.totalCalculatedTax).not.toBe(1_500_000);
  });

  it("M-2-4: 차손 자산은 과세표준·세액 0, 이익 자산이 통산을 흡수", () => {
    expect(r.items.map((i) => i.transferIncome)).toEqual([5_000_000, 0]);
    expect(r.items.map((i) => i.taxBase)).toEqual([2_500_000, 0]);
    expect(r.items.map((i) => i.calculatedTax)).toEqual([500_000, 0]);
  });

  it("M-2-5: lossOffset 요약 (§102① 호별)", () => {
    expect(r.lossOffset).toEqual({
      stock: { totalOffset: 5_000_000, unusedLoss: 0 },
      real_estate_and_other_asset: { totalOffset: 0, unusedLoss: 0 },
    });
  });

  it("M-2-6: 표시 항등식 — taxBase = transferIncome − basicDeduction", () => {
    r.items.forEach((i) => {
      expect(i.taxBase).toBe(Math.max(0, i.transferIncome - i.basicDeduction));
    });
  });

  it("M-2-7: 입력 순서를 뒤집어도 합계가 같다", () => {
    const rev = calculateStockTransferTaxAggregate([LOSS, GAIN]);
    expect(rev.totalCalculatedTax).toBe(r.totalCalculatedTax);
    expect(rev.totalTransferIncome).toBe(r.totalTransferIncome);
  });
});

describe("M-3 🔴 D-B: 차손 단독 — 음수 소득이 노출되지 않는다", () => {
  const r = calculateStockTransferTaxAggregate([LOSS]);
  it("M-3-1: totalTransferIncome은 0 (종전 −5,000,000)", () => {
    expect(r.totalTransferIncome).toBe(0);
    expect(r.totalTransferIncome).not.toBe(-5_000_000);
  });
  it("M-3-2: 세액 0", () => {
    expect(r.totalCalculatedTax).toBe(0);
    expect(r.totalFinalTax).toBe(0);
  });
});

describe("M-4 🔴 D-A+D-C: 차손이 이익을 초과 — 잔여 소멸 · 기본공제 0", () => {
  const r = calculateStockTransferTaxAggregate([GAIN, LOSS, LOSS, LOSS]);

  it("M-4-1: 통산 후 소득 0 · 세액 0 (종전 1,500,000)", () => {
    expect(r.totalTransferIncome).toBe(0);
    expect(r.totalCalculatedTax).toBe(0);
    expect(r.totalCalculatedTax).not.toBe(1_500_000);
  });

  it("M-4-2: 잔여 차손 5,000,000은 소멸 (이월 불인정)", () => {
    expect(r.lossOffset).toEqual({
      stock: { totalOffset: 10_000_000, unusedLoss: 5_000_000 },
      real_estate_and_other_asset: { totalOffset: 0, unusedLoss: 0 },
    });
  });

  it("M-4-3: D-C 해소 — 표시 기본공제와 실제 적용이 일치한다", () => {
    // 종전: basicDeductionByGroup.stock = 0 인데 items[0].basicDeduction = 2,500,000 (불일치)
    const applied = r.items.reduce((s, i) => s + i.basicDeduction, 0);
    expect(r.basicDeductionByGroup.stock).toBe(applied);
    expect(applied).toBe(0);
  });
});

describe("M-5 양성 대조군: 같은 세율 이익 2건 — 통산 대상 없음", () => {
  const r = calculateStockTransferTaxAggregate([GAIN, GAIN]);
  it("소득 2천만 · 기본공제 1회 · 세액 350만", () => {
    expect(r.totalTransferIncome).toBe(20_000_000);
    expect(r.totalTaxBase).toBe(17_500_000);
    expect(r.totalCalculatedTax).toBe(3_500_000);
  });
  it("lossOffset 없음", () => expect(r.lossOffset).toBeUndefined());
});

// ============================================================================
// M-11 — 종목별 «흡수한 차손» echo (`lossOffsetFromSameGroup` / `…FromOtherGroup`)
// ============================================================================
//
// 계획서: docs/00-pm/stock-multi-asset-filing-loss-offset.plan.md §2 G-4 · §5 Phase B(B-2)
//
// 🔴 코어(`loss-offset-core.ts`)는 자산별 흡수 내역을 늘 계산하는데 주식 aggregate 는
//    **총액만 쓰고 버렸다**(`fromSame`·`fromOther` 사용처 0건 — 전수 grep). 그래서 결과 화면도
//    신고서도 「내 3번 종목이 얼마를 흡수했는가」를 말하지 못했다. 부동산 정본은 자산별로
//    보여준다(`MultiTransferPropertyBreakdown.tsx` 「차손 통산 (동일그룹)」·「(타군안분)」).
//
// 규약(부동산과 동일): 둘 다 **양수**(차감액의 절댓값) · **다자산 경로에서만** 실린다.
//   「0원 흡수」와 「통산 자체가 없음」을 구분해야 결과 화면이 0원 행을 만들지 않는다.

describe("M-11 🔒 종목별 흡수 차손 echo", () => {
  it("M-11-1: 같은 세율군 통산 — 이익 자산이 `FromSameGroup` 으로 흡수한다", () => {
    const r = calculateStockTransferTaxAggregate([GAIN, LOSS]);
    expect(r.items[0].lossOffsetFromSameGroup).toBe(5_000_000);
    expect(r.items[0].lossOffsetFromOtherGroup).toBe(0);
    // 차손 자산 자신은 흡수한 것이 없다(주는 쪽이다).
    expect(r.items[1].lossOffsetFromSameGroup).toBe(0);
  });

  it("M-11-2: 자산별 흡수액 합계 = `lossOffset.stock.totalOffset`", () => {
    // 표시값이 요약값과 어긋나면 화면이 자기모순이 된다.
    const r = calculateStockTransferTaxAggregate([GAIN, LOSS]);
    const sum = r.items.reduce(
      (s, x) => s + (x.lossOffsetFromSameGroup ?? 0) + (x.lossOffsetFromOtherGroup ?? 0),
      0,
    );
    expect(sum).toBe(r.lossOffset!.stock.totalOffset);
  });

  it("M-11-3: 기타자산 그룹도 실린다 (§102①1호)", () => {
    const r = calculateStockTransferTaxAggregate([
      stockInput({ marketType: "unlisted", isQualifyingBlockShareholder: true }),
      stockInput({
        marketType: "unlisted",
        isQualifyingBlockShareholder: true,
        perShareTransferPrice: 30_000,
        perShareAcquisitionPrice: 35_000,
      }),
    ]);
    expect(r.items[0].lossOffsetFromSameGroup).toBe(5_000_000);
    expect(r.items[1].lossOffsetFromSameGroup).toBe(0);
  });

  it("M-11-4 🟢 통산이 없으면 **필드 자체가 없다** (0이 아니다)", () => {
    // 0을 채우면 결과 화면이 「0원 흡수」 행을 만들어 「통산 없음」과 구분되지 않는다.
    const r = calculateStockTransferTaxAggregate([GAIN, stockInput()]);
    expect(r.items[0].lossOffsetFromSameGroup).toBeUndefined();
    expect(r.items[0].lossOffsetFromOtherGroup).toBeUndefined();
  });

  it("M-11-5 🟢 단건 계산에는 실리지 않는다", () => {
    const r = calculateStockTransferTaxAggregate([GAIN]);
    expect(r.items[0].lossOffsetFromSameGroup).toBeUndefined();
  });

  it("M-11-6: 다른 세율군 안분은 `FromOtherGroup` 으로 갈린다 (영 §167의2①2호)", () => {
    // M-7-2 와 같은 구성 — 30% 군에서 소진하고 남은 차손이 20% 군 이익에 안분된다.
    const SHORT = { acquisitionDate: new Date("2024-01-02"), transferDate: new Date("2024-06-01") };
    const shortGain = stockInput(SHORT);
    const shortLoss = stockInput({
      ...SHORT,
      perShareTransferPrice: 30_000,
      perShareAcquisitionPrice: 35_000,
    });
    const r = calculateStockTransferTaxAggregate([shortGain, shortLoss, shortLoss, shortLoss, GAIN]);
    // 30% 군 이익: 같은 군에서 1천만 전액 흡수 → FromSame 1천만 · FromOther 0
    expect(r.items[0].lossOffsetFromSameGroup).toBe(10_000_000);
    expect(r.items[0].lossOffsetFromOtherGroup).toBe(0);
    // 20% 군 이익: 같은 군 차손이 없으므로 FromSame 0 · 잔여 5백만을 FromOther 로 안분받는다
    expect(r.items[4].lossOffsetFromSameGroup).toBe(0);
    expect(r.items[4].lossOffsetFromOtherGroup).toBe(5_000_000);
  });
});

describe("M-7 🔴 영 §167의2①: 같은 세율 먼저 → 다른 세율 pro-rata", () => {
  // 30% 군(대주주·비중소·1년미만) 이익 1천만 + 차손 5백만  → 1호로 같은 군 내 통산
  // 20% 군 이익 1천만                                      → 영향 없음
  const SHORT_GAIN = stockInput({
    acquisitionDate: new Date("2024-01-02"),
    transferDate: new Date("2024-06-01"),
  });
  const SHORT_LOSS = stockInput({
    acquisitionDate: new Date("2024-01-02"),
    transferDate: new Date("2024-06-01"),
    perShareTransferPrice: 30_000,
    perShareAcquisitionPrice: 35_000,
  });

  it("M-7-1: 30% 군 차손은 같은 군 이익에서 먼저 공제된다", () => {
    const r = calculateStockTransferTaxAggregate([SHORT_GAIN, SHORT_LOSS, GAIN]);
    // 30% 군: 1천만 − 5백만 = 5백만 / 20% 군: 1천만
    // 합계 소득 1,500만 − 기본공제 250만.
    // 기본공제는 §103② 「먼저 양도한 자산부터」인데 셋 다 같은 양도일이라 입력 순서(D-D Q-2).
    expect(r.totalTransferIncome).toBe(15_000_000);
    expect(r.totalTaxBase).toBe(12_500_000);
    expect(r.lossOffset).toEqual({
      stock: { totalOffset: 5_000_000, unusedLoss: 0 },
      real_estate_and_other_asset: { totalOffset: 0, unusedLoss: 0 },
    });
  });

  it("M-7-2: 차손이 같은 군 이익을 넘으면 잔여가 다른 군으로 안분된다", () => {
    // 30% 군 이익 1천만 + 차손 5백만 ×3 = −1,500만 → 같은 군에서 1천만 소진, 잔여 5백만
    // 잔여 5백만이 20% 군 이익 1천만에 안분
    const r = calculateStockTransferTaxAggregate([
      SHORT_GAIN,
      SHORT_LOSS,
      SHORT_LOSS,
      SHORT_LOSS,
      GAIN,
    ]);
    expect(r.totalTransferIncome).toBe(5_000_000); // 20% 군 1천만 − 안분 5백만
    expect(r.lossOffset).toEqual({
      stock: { totalOffset: 15_000_000, unusedLoss: 0 },
      real_estate_and_other_asset: { totalOffset: 0, unusedLoss: 0 },
    });
  });
});

describe("M-6 🔴 D-D: §103② 기본공제는 **먼저 양도한 자산**부터", () => {
  // 2월 양도 · 보유 2년 → §104①11호가목2) 20%
  const FEB_20 = stockInput({
    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-02-01"),
    filingDate: new Date("2024-04-30"),
  });
  // 11월 양도 · 보유 6개월 → §104①11호가목1) 30%
  const NOV_30 = stockInput({
    acquisitionDate: new Date("2024-05-01"),
    transferDate: new Date("2024-11-01"),
    filingDate: new Date("2025-01-31"),
  });

  // 먼저 양도한 것은 2월(20%) ⇒ 기본공제 250만은 **2월 종목**이 받아야 한다.
  //   2월: (1천만 − 250만) × 20% = 1,500,000
  //   11월: 1천만 × 30%          = 3,000,000
  //   합계 4,500,000
  const EXPECTED_TAX = 4_500_000;

  it("M-6-1: 입력이 [11월, 2월]이어도 2월 종목이 공제받는다", () => {
    const r = calculateStockTransferTaxAggregate([NOV_30, FEB_20]);
    expect(r.items.map((i) => i.basicDeduction)).toEqual([0, 2_500_000]);
    expect(r.totalCalculatedTax).toBe(EXPECTED_TAX);
  });

  it("M-6-2: 입력이 [2월, 11월]이어도 결과가 같다", () => {
    const r = calculateStockTransferTaxAggregate([FEB_20, NOV_30]);
    expect(r.items.map((i) => i.basicDeduction)).toEqual([2_500_000, 0]);
    expect(r.totalCalculatedTax).toBe(EXPECTED_TAX);
  });

  it("M-6-3: 🔑 입력 순서가 세액을 바꾸지 않는다 (종전 250,000 차이)", () => {
    const a = calculateStockTransferTaxAggregate([NOV_30, FEB_20]).totalCalculatedTax;
    const b = calculateStockTransferTaxAggregate([FEB_20, NOV_30]).totalCalculatedTax;
    expect(a).toBe(b);
    // 종전 [11월, 2월] 입력에서 나오던 값 — 30% 종목이 공제를 가져가 과소산출됐다.
    expect(a).not.toBe(4_250_000);
  });

  it("M-6-4: 결과 배열 순서는 **입력 순서**를 유지한다", () => {
    const r = calculateStockTransferTaxAggregate([NOV_30, FEB_20]);
    expect(r.items.map((i) => i.appliedRate)).toEqual([0.3, 0.2]);
  });
});

describe("M-8 🔒 §102①후단: 호가 다르면 통산하지 못한다", () => {
  // 기타자산(§94①4호 = §102①1호) 이익 + 주식(§102①2호) 차손
  const OTHER_ASSET_GAIN = stockInput({
    marketType: "unlisted",
    isQualifyingBlockShareholder: true, // 과점주주 → 기타자산
    perShareTransferPrice: 50_000,
    perShareAcquisitionPrice: 40_000,
  });

  it("M-8-1: 주식 차손이 기타자산 소득을 줄이지 않는다", () => {
    const withLoss = calculateStockTransferTaxAggregate([OTHER_ASSET_GAIN, LOSS]);
    const alone = calculateStockTransferTaxAggregate([OTHER_ASSET_GAIN]);
    expect(withLoss.items[0].taxBase).toBe(alone.items[0].taxBase);
    expect(withLoss.items[0].calculatedTax).toBe(alone.items[0].calculatedTax);
  });

  it("M-8-2 mutation 대조군: **같은 호**(주식) 이익이면 차손이 실제로 움직인다", () => {
    // 0 vs 0은 판정 근거가 못 된다 — 같은 차손이 같은 호 이익은 **줄인다**는 대조군을 둔다.
    const sameGroup = calculateStockTransferTaxAggregate([GAIN, LOSS]);
    const alone = calculateStockTransferTaxAggregate([GAIN]);
    expect(sameGroup.items[0].taxBase).toBeLessThan(alone.items[0].taxBase);
    expect(alone.items[0].taxBase - sameGroup.items[0].taxBase).toBe(5_000_000);
  });

  it("M-8-3: 주식 차손은 소멸한다 (기타자산으로 넘어가지 않는다)", () => {
    const r = calculateStockTransferTaxAggregate([OTHER_ASSET_GAIN, LOSS]);
    // 🔑 **두 호를 모두 단언한다.** 주식 차손 5,000,000 은 기타자산으로 넘어가지 못하고
    //    소멸하며(§102① 후단), 기타자산 호는 차손이 없어 통산도 소멸도 0 이다.
    //    한쪽만 단언하면 반전이 형제 안전망을 지운다
    //    ([[feedback_shared_assertion_reversal_erases_sibling_net]]).
    expect(r.lossOffset).toEqual({
      stock: { totalOffset: 0, unusedLoss: 5_000_000 },
      real_estate_and_other_asset: { totalOffset: 0, unusedLoss: 0 },
    });
  });
});

describe("M-9 🔒 비과세 종목은 통산에서 제외 (상속증여세과-209)", () => {
  // 시장 내 거래 비대주주 = §94①3호가목2) 비해당 → 비과세
  // ⚠️ `isMajorShareholder:false`만으로는 부족하다 — 지분율 3%가 §157 대주주 요건(1%)을 넘어
  //    엔진이 대주주로 재판정한다(실측으로 확인). 지분·시총을 0으로 내려야 비대주주가 된다.
  const EXEMPT_LOSS = stockInput({
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isOnMarketTransaction: true, // 장내 거래 → §94①3호가목 비해당 = 비과세
    perShareTransferPrice: 30_000,
    perShareAcquisitionPrice: 35_000,
  });

  it("M-9-0 픽스처 가드: 이 종목이 **실제로** 비과세로 분류되는가", () => {
    // 이 단언이 없으면 「비과세라서 통산 안 됨」이 아니라 「픽스처가 애초에 차손이 아님」이어도
    // M-9-1이 통과한다. 전제를 먼저 고정한다.
    const r = calculateStockTransferTaxAggregate([EXEMPT_LOSS]);
    expect(r.items[0].isExempt).toBe(true);
    expect(r.items[0].taxCategory).toBe("listed_non_major_in_market");
    expect(r.items[0].transferIncome).toBe(-5_000_000);
  });

  it("M-9-1: 비과세 차손은 과세 이익을 줄이지 못한다", () => {
    const withExempt = calculateStockTransferTaxAggregate([GAIN, EXEMPT_LOSS]);
    const alone = calculateStockTransferTaxAggregate([GAIN]);
    expect(withExempt.items[0].taxBase).toBe(alone.items[0].taxBase);
  });

  it("M-9-2: 비과세 차손은 unusedLoss에도 잡히지 않는다", () => {
    const r = calculateStockTransferTaxAggregate([GAIN, EXEMPT_LOSS]);
    expect(r.lossOffset).toBeUndefined();
  });
});

// ============================================================================
// M-10 — 기타자산 그룹(§102①1호) 통산   [Pre-Do anchor · PR-2 Phase 0]
// ============================================================================
//
// 계획서: docs/00-pm/stock-multi-asset-filing-loss-offset.plan.md §2 G-2 · §5 Phase 0
//
// 🔴 **착수 시점에 M-10-1·2·3·5 는 RED 다.** 기타자산 그룹은 통산을 타지 않는다 —
//    `stock-transfer-aggregate.ts` STEP 1.5 가 `basicDeductionGroup === "stock"` 만 코어에
//    넣고(`:328`), 기타자산 분기는 `offsetIncome` 을 **읽지도 않는다**(`:500-510` — 입력에서
//    엔진을 통째로 다시 돌린다). 두 겹을 함께 고쳐야 움직인다.
//
// 기대값은 **법령 정합값**이다(현행값이 아니다 — [[feedback_anchor_correction_legal_priority]]):
//   법 §102①1호   「제94조제1항제1호ㆍ제2호 및 **제4호**에 따른 소득」 ⇒ 기타자산은 1호 그룹
//   법 §102②      「제1항 **각 호별로** … 그 양도차손을 공제한다」 ⇒ 조건 없음. 같은 호면 통산
//   영 §167의2①   1호 같은 세율 먼저 → 2호 다른 세율 pro-rata. 잔여는 소멸(이월 없음)
//
// 📌 **현행 실측(구현 전, 2026-09-12)** — 무엇이 바뀌는지 남긴다:
//   · M-10-1 계열: totalTaxBase **7,500,000** · totalCalculatedTax **450,000**
//     (= 차손 종목을 함께 신고해도 이익 단독과 **1원도 다르지 않다**)
//   · M-10-5 계열: 같은 450,000 · `clause1BucketTaxBase` 7,500,000
//
// ⚠️ `lossOffset` **그룹별 형태**(Q-1(b) — `Record<basicDeductionGroup, …>`)는 타입이 아직
//    없어 여기서 단언하지 않는다. Phase A 의 A-5 와 함께 들어온다(계획서 §6.1).

/** 기타자산(§94①4호 다목) — 과점주주 비상장. `stockInput` 기본값에 두 축만 얹는다. */
function otherAssetInput(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return stockInput({
    marketType: "unlisted",
    isQualifyingBlockShareholder: true,
    ...o,
  });
}

/** §104①1호 버킷(§55① 누진) 이익 +10,000,000 */
const OA1_GAIN = otherAssetInput();
/** §104①1호 버킷 차손 −5,000,000 */
const OA1_LOSS = otherAssetInput({
  perShareTransferPrice: 30_000,
  perShareAcquisitionPrice: 35_000,
});
/** §104①9호 버킷(기본세율 +10%p) 차손 −5,000,000 — 영 §167의7 「100분의 50 이상」 */
const OA9_LOSS = otherAssetInput({
  nblRatioOfCorpAssets: 0.6,
  perShareTransferPrice: 30_000,
  perShareAcquisitionPrice: 35_000,
});
/** §104①9호 버킷 이익 +10,000,000 */
const OA9_GAIN = otherAssetInput({ nblRatioOfCorpAssets: 0.6 });

describe("M-10 🔒 기타자산 그룹(§102①1호)도 §102② 통산 대상이다", () => {
  it("M-10-0 픽스처 가드: 두 종목이 **실제로** 기타자산 그룹이고 소득이 +1천만/−5백만인가", () => {
    // 이 단언이 없으면 「통산이 됐다/안 됐다」가 아니라 **픽스처가 주식 그룹**이어도
    // 아래가 통과·실패한다(M-9-0과 같은 규약 — [[feedback_fixture_default_masks_gate_defect]]).
    const r = calculateStockTransferTaxAggregate([OA1_GAIN, OA1_LOSS]);
    expect(r.items.map((x) => x.basicDeductionGroup)).toEqual([
      "real_estate_and_other_asset",
      "real_estate_and_other_asset",
    ]);
    expect(r.items.map((x) => x.taxCategory)).toEqual([
      "other_asset_block_shareholder",
      "other_asset_block_shareholder",
    ]);
    expect(r.items.map((x) => x.isExempt)).toEqual([false, false]);
  });

  it("M-10-1: 같은 세율군 통산 (영 §167의2①1호) — 과세표준 2,500,000 · 세액 150,000", () => {
    // 통산 5,000,000 → 소득 5,000,000 − 기본공제 2,500,000 = 2,500,000 × §55① 6% = 150,000
    const r = calculateStockTransferTaxAggregate([OA1_GAIN, OA1_LOSS]);
    expect(r.totalTransferIncome).toBe(5_000_000);
    expect(r.basicDeductionByGroup.real_estate_and_other_asset).toBe(2_500_000);
    expect(r.totalTaxBase).toBe(2_500_000);
    expect(r.totalCalculatedTax).toBe(150_000);
  });

  it("M-10-2: 차손 자산은 과세표준·세액 0, 이익 자산이 통산을 흡수한다", () => {
    const r = calculateStockTransferTaxAggregate([OA1_GAIN, OA1_LOSS]);
    expect(r.items[0].transferIncome).toBe(5_000_000);
    expect(r.items[0].basicDeduction).toBe(2_500_000);
    expect(r.items[0].taxBase).toBe(2_500_000);
    expect(r.items[0].calculatedTax).toBe(150_000);
    expect(r.items[1].taxBase).toBe(0);
    expect(r.items[1].calculatedTax).toBe(0);
  });

  it("M-10-3: 합계행 항등식 — totalTaxBase = totalTransferIncome − Σ기본공제 (G-3)", () => {
    // 🔴 현행은 `totalTransferIncome` 5,000,000 · 기본공제 2,500,000 인데 `totalTaxBase` 가
    //    7,500,000 이다. `StockAggregateSummaryCard` 합계행만 보면
    //    「5,000,000 − 2,500,000 = 7,500,000」이라 화면이 **자기모순**이다(계획서 G-3).
    //
    // ⚠️ **초판 정정 (Phase 0 실행 중, 2026-09-12)** — 처음에는 우변을
    //    `Σ max(0, item.transferIncome)` 로 썼다. 그러면 현행(10,000,000 − 2,500,000 = 7,500,000)도
    //    구현 후(5,000,000 − 2,500,000 = 2,500,000)도 **양쪽 다 성립**해 구별력이 0이다.
    //    실제로 GREEN 이 나왔다. 화면이 실제로 쓰는 값은 **`totalTransferIncome`**(차손을 이미
    //    net 한 값)이므로 그것으로 단언해야 모순이 드러난다
    //    ([[feedback_mutation_zero_discrimination_is_not_proof]]).
    const r = calculateStockTransferTaxAggregate([OA1_GAIN, OA1_LOSS]);
    const dedSum = r.items.reduce((s, x) => s + x.basicDeduction, 0);
    expect(r.totalTaxBase).toBe(Math.max(0, r.totalTransferIncome) - dedSum);
  });

  it("M-10-4 🟢 대조군: 차손이 없으면 **아무것도 달라지지 않는다** (이익 2건)", () => {
    // 이 anchor 가 없으면 「통산이 돌기 시작했다」와 「통산 아닌 것이 망가졌다」를 가르지 못한다.
    // 값은 구현 전 실측(2026-09-12)이며 **구현 후에도 같아야 한다**.
    const r = calculateStockTransferTaxAggregate([OA1_GAIN, otherAssetInput()]);
    expect(r.totalTransferIncome).toBe(20_000_000);
    expect(r.totalTaxBase).toBe(17_500_000);
    expect(r.totalCalculatedTax).toBe(1_365_000);
    expect(r.items.map((x) => x.taxBase)).toEqual([7_500_000, 10_000_000]);
    expect(r.lossOffset).toBeUndefined();
  });

  it("M-10-5: §104⑤ 버킷 echo 가 **통산 후 값**을 따른다 (1호 이익 + 9호 차손)", () => {
    // 🔑 계획서 §4.3 — 패치 방식으로 바꾸면 `clause1BucketTaxBase`·`clause9TaxBase`·
    //    `cross1045Adjustment` 가 **옛 값으로 남을 수 있다**. 그 드리프트는 주식 신고서에
    //    아무 흔적도 남기지 않고 **부동산 크로스 합산만 조용히 틀린다**.
    //
    // 세율군이 다르므로 영 §167의2①**2호**(pro-rata)로 공제된다. 이익이 1호 하나뿐이라
    // 5,000,000 전액이 거기로 간다 ⇒ 1호 소득 5,000,000 → 과표 2,500,000 → 150,000.
    const r = calculateStockTransferTaxAggregate([OA1_GAIN, OA9_LOSS]);
    expect(r.totalCalculatedTax).toBe(150_000);
    expect(r.items[0].clause1BucketTaxBase).toBe(2_500_000);
    expect(r.items[0].clause1BucketTax).toBe(150_000);
    // 차손 종목이므로 9호 버킷은 0 (구현 전후 동일)
    expect(r.items[1].clause9TaxBase).toBe(0);
    expect(r.otherAssetComparativeTax?.clause1BucketTaxBase).toBe(2_500_000);
    expect(r.otherAssetComparativeTax?.aggregatedTax).toBe(150_000);
  });

  it("M-10-6 🟢 대조군: 1호 이익 + 9호 이익 — §104⑤ MAX 거동이 그대로다", () => {
    // 구현 전 실측(2026-09-12). 차손이 없으니 통산이 개입할 자리가 없다.
    const r = calculateStockTransferTaxAggregate([OA1_GAIN, OA9_GAIN]);
    expect(r.totalTaxBase).toBe(17_500_000);
    expect(r.totalCalculatedTax).toBe(2_050_000);
    expect(r.otherAssetComparativeTax).toMatchObject({
      clause1Tax: 1_365_000,
      clause2Tax: 2_050_000,
      clause9TaxBase: 10_000_000,
      clause9Tax: 1_600_000,
      clause1BucketTaxBase: 7_500_000,
      applied: "clause2",
      aggregatedTax: 2_050_000,
    });
  });
});
