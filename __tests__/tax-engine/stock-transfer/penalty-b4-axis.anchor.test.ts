/**
 * anchor: 가산세 코드리뷰 **B4** — 주식 축 (뿌리 R-3, 2026-09)
 *
 * ## 한 뿌리의 여러 얼굴
 *
 * R-3은 「**합산 분기가 단건 분기의 계약을 잃는다**」는 한 가지 사실이다:
 *
 * | ID | 잃은 계약 |
 * |---|---|
 * | G-27 | 종목 `finalTax`에서 가산세를 걷는 계약 — 조기반환이 국외 결과를 통과시켰다 |
 * | G-45 | 전자신고 공제 판정 소스 — 짧은 분기는 **결과값**, 긴 분기는 **입력값** |
 * | G-46 | 기준금액·조문·가목나목 분해 echo — 합산에는 아예 필드가 없었다 |
 * | G-12 | 세율의 단일 소스 — 결과 카드가 토글에서 파생해 산식이 금액을 못 재현했다 |
 * | G-44 | 그것들을 고정할 anchor — 종목 `finalTax` 항등식을 아무도 단언하지 않았다 |
 * | G-35 | 10원 미만 절사(국고금 관리법 §47①)를 **구별하는** 픽스처 부재 |
 */

import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

/** 국내 종목 — 산출세액 19,500,000 (과세표준 97,500,000 × 20%) */
function dom(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
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
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 110_000,
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
    ...overrides,
  };
}

/** 국외 종목 — 환율 1 고정, 외국납부세액 없음 */
function fx(gain: number, o: Partial<ForeignStockInput> = {}): ForeignStockInput {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Corp",
    countryCode: "US",
    shareCount: 1,
    transferDate: new Date("2024-03-01"),
    transferPriceMode: "total",
    totalTransferPriceForeign: gain + 1_000_000,
    transferCurrencyCode: "USD",
    transferExchangeRate: 1,
    acquisitionDate: new Date("2021-01-02"),
    acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 1_000_000,
    acquisitionCurrencyCode: "USD",
    acquisitionExchangeRate: 1,
    capitalExpenditureForeign: 0,
    transferCostForeign: 0,
    hasForeignTax: false,
    foreignTaxMethod: "credit",
    isElectronicFiling: false,
    ...o,
  };
}

describe("G-27 · G-44 종목 finalTax 항등식 — 가산세는 신고 단위라 종목에 남지 않는다", () => {
  /**
   * `stripItemPenalties`는 종목 가산세를 0으로 만들면서 `finalTax`도 결정세액으로 되돌린다.
   * 그런데 조기반환(`underReportPenalty === 0 && latePaymentPenalty === 0`)이 있어
   * **국외 종목은 그 문을 통과**했다 — 어댑터가 두 필드를 이미 0으로 눌러 놓고 `finalTax`에는
   * 가산세를 포함한 값을 그대로 옮기기 때문이다.
   *
   * ⇒ 「가산세 0이라고 보고하면서 finalTax에는 가산세가 들어 있는」 자기모순 결과가 나왔다.
   */
  it("B4-27-1: 🔴 국외 단건 aggregate — items[0].finalTax에 가산세가 남지 않는다", () => {
    const agg = calculateStockTransferTaxAggregate([
      fx(100_000_000, { filingViolation: "under_report", isFraudulent: true }),
    ]);
    const item = agg.items[0];
    expect(item.calculatedTax).toBe(19_500_000);
    expect(item.underReportPenalty).toBe(0);
    // 종전: 27,300,000 (= 19,500,000 + 가산세 7,800,000)
    expect(item.finalTax).toBe(19_500_000);
    // 가산세는 신고 단위 총계에만 있다
    expect(agg.totalUnderReportPenalty).toBe(7_800_000);
    expect(agg.totalFinalTax).toBe(27_300_000);
  });

  it("B4-27-2: 납부지연까지 얹어도 같다 (68,200원이 종목에 남지 않는다)", () => {
    const agg = calculateStockTransferTaxAggregate([
      fx(100_000_000, {
        filingViolation: "under_report",
        isFraudulent: true,
        unpaidTax: 10_000_000,
        paymentDeadline: new Date("2024-08-31"),
        actualPaymentDate: new Date("2024-10-01"),
      }),
    ]);
    expect(agg.items[0].finalTax).toBe(19_500_000);
    expect(agg.items[0].latePaymentPenalty).toBe(0);
    expect(agg.totalLatePaymentPenalty).toBe(66_000);
  });

  /**
   * 🔑 G-44: **항등식**으로 고정한다 — 값 하나가 아니라 규약을 못박는다.
   *
   * 「가산세는 신고 단위 1회」라는 규약이 종목 결과에도 그대로 걸린다:
   *   finalTax === floorTen(calculatedTax − 외국납부세액공제 − 전자신고공제)
   * 종전에는 이 등식을 보는 anchor가 하나도 없어(`grep items[0].finalTax` 0건)
   * G-27 같은 회귀가 통째로 통과했다.
   */
  it.each([
    ["국외 단건", [fx(100_000_000, { filingViolation: "under_report", isFraudulent: true })]],
    ["국내 단건", [dom({ filingViolation: "under_report", isFraudulent: true })]],
    [
      "국내+국외 혼합",
      [dom({ filingViolation: "under_report" }), fx(50_000_000)],
    ],
    ["국외 2건", [fx(100_000_000, { filingViolation: "non_report" }), fx(30_000_000)]],
  ])("B4-44-1: %s — 모든 종목이 finalTax 항등식을 만족한다", (_label, inputs) => {
    const agg = calculateStockTransferTaxAggregate(
      inputs as (StockTransferInput | ForeignStockInput)[],
    );
    for (const r of agg.items) {
      if (r.isExempt) continue; // 비과세는 finalTax 0 강제 (applyExemptZeroing)
      const foreignCredit = r.foreignDetail?.foreignTaxCreditApplied ?? 0;
      const expected = Math.max(
        0,
        Math.floor((r.calculatedTax - foreignCredit - r.electronicFilingCredit) / 10) * 10,
      );
      expect(r.finalTax, `종목 finalTax (calculatedTax=${r.calculatedTax})`).toBe(expected);
      expect(r.underReportPenalty).toBe(0);
      expect(r.latePaymentPenalty).toBe(0);
    }
  });
});

describe("G-45 전자신고 세액공제 — 판정 소스가 하나다 (조특법 §104의8①)", () => {
  /**
   * 짧은 분기(단건·each_item)는 종목 **결과값**(`r.electronicFilingCredit > 0`)을 봤는데,
   * 국외 종목은 어댑터가 그 필드를 항상 0으로 눌러 놓아 영영 잡히지 않았다.
   * ⇒ 같은 「전자신고」 선언인데 **종목 수만으로** 공제가 갈리고, 그 20,000원이 곧바로
   *   가산세 base 를 움직였다(실측: 국외 1건 0원 공제 / 2건 20,000원 공제).
   */
  it("B4-45-1: 🔴 국외 1건도 전자신고 공제가 적용된다 (종전 0원)", () => {
    const agg = calculateStockTransferTaxAggregate([
      fx(100_000_000, {
        filingViolation: "under_report",
        isFraudulent: true,
        isElectronicFiling: true,
      }),
    ]);
    expect(agg.electronicFilingCredit).toBe(20_000);
    // base = 19,500,000 − 20,000 = 19,480,000 → × 40% = 7,792,000 (종전 7,800,000)
    expect(agg.penaltyBase).toBe(19_480_000);
    expect(agg.totalUnderReportPenalty).toBe(7_792_000);
  });

  it("B4-45-2: 🔑 종목 수로 공제 여부가 갈리지 않는다 (1건 = 2건)", () => {
    const one = calculateStockTransferTaxAggregate([
      fx(100_000_000, { isElectronicFiling: true }),
    ]);
    const two = calculateStockTransferTaxAggregate([
      fx(100_000_000, { isElectronicFiling: true }),
      fx(1_000_000, { isElectronicFiling: true }),
    ]);
    expect(one.electronicFilingCredit).toBe(20_000);
    expect(two.electronicFilingCredit).toBe(20_000);
  });

  it("B4-45-3: ⛔ 선언하지 않으면 공제가 없다 (양성 대조군)", () => {
    const agg = calculateStockTransferTaxAggregate([fx(100_000_000)]);
    expect(agg.electronicFilingCredit).toBe(0);
  });
});

describe("G-46 · G-12 가산세 산출근거 echo — 다종목에서도 산식이 화면에 남는다", () => {
  it("B4-46-1: 🔴 합산 결과에 기준금액·적용 조문이 실린다", () => {
    const agg = calculateStockTransferTaxAggregate([
      dom({ filingViolation: "under_report", isFraudulent: true }),
      dom({ perShareTransferPrice: 60_000 }),
    ]);
    expect(agg.totalUnderReportPenalty).toBeGreaterThan(0);
    expect(agg.penaltyBase).toBe(agg.totalCalculatedTax);
    expect(agg.penaltyRuleRef).toBe("국세기본법 §47조의3 ①1호 가목");
    // 산식이 금액을 재현한다 — 표시 드리프트 방지
    expect(Math.floor((agg.penaltyBase! * 0.4) / 10) * 10).toBe(agg.totalUnderReportPenalty);
  });

  it("B4-46-2: ⛔ 가산세가 0이면 근거 echo 도 싣지 않는다 (「가산세 0인데 40% 배지」 방지)", () => {
    const agg = calculateStockTransferTaxAggregate([dom(), dom()]);
    expect(agg.totalUnderReportPenalty).toBe(0);
    expect(agg.penaltyBase).toBeUndefined();
    expect(agg.penaltyRuleRef).toBeUndefined();
    expect(agg.fraudSplit).toBeUndefined();
  });

  /**
   * 🔴 G-12: §47조의3①1호는 가목(부정분 × 40%)과 나목(나머지 × 10%)으로 **나뉜다**.
   * 엔진은 분해값을 만들면서도 결과에 싣지 않아, 결과 카드가 토글에서만 세율을 파생해
   * 「기준금액 19,500,000 × 40%」(= 7,800,000)를 적고 그 옆에 3,450,000을 찍었다.
   */
  it("B4-12-1: 🔴 단건 result에 fraudSplit이 실린다 — 산식이 금액을 재현한다", () => {
    const r = calculateStockTransferTax(
      dom({ filingViolation: "under_report", isFraudulent: true, fraudulentPortion: 5_000_000 }),
    );
    expect(r.penaltyBase).toBe(19_500_000);
    expect(r.underReportPenalty).toBe(3_450_000);
    const s = r.fraudSplit;
    expect(s, "fraudSplit이 버려졌다").toBeDefined();
    expect(s).toEqual({
      fraudBase: 5_000_000,
      fraudRate: 0.4,
      normalBase: 14_500_000,
      normalRate: 0.1,
    });
    // 가목 2,000,000 + 나목 1,450,000 = 3,450,000 — 분해 산식이 금액과 일치한다
    expect(
      Math.floor(s!.fraudBase * s!.fraudRate) + Math.floor(s!.normalBase * s!.normalRate),
    ).toBe(r.underReportPenalty);
  });

  it("B4-12-2: 🔴 합산 결과에도 fraudSplit이 실린다", () => {
    const agg = calculateStockTransferTaxAggregate([
      dom(),
      dom({ filingViolation: "under_report", isFraudulent: true, fraudulentPortion: 25_000_000 }),
    ]);
    expect(agg.totalCalculatedTax).toBe(39_500_000);
    expect(agg.fraudSplit).toEqual({
      fraudBase: 25_000_000,
      fraudRate: 0.4,
      normalBase: 14_500_000,
      normalRate: 0.1,
    });
    // 10,000,000 + 1,450,000 = 11,450,000 (전액 40%면 15,800,000 — 4,350,000 과대였다)
    expect(agg.totalUnderReportPenalty).toBe(11_450_000);
  });

  it("B4-12-3: ⛔ 부정행위분을 입력하지 않으면 분해가 없다 (종전 동작 = 전액 부정)", () => {
    const r = calculateStockTransferTax(
      dom({ filingViolation: "under_report", isFraudulent: true }),
    );
    expect(r.fraudSplit).toBeUndefined();
    expect(r.underReportPenalty).toBe(7_800_000);
  });
});

describe("G-35 10원 미만 절사 (국고금 관리법 §47①) — 절사를 **구별하는** 픽스처", () => {
  /**
   * 종전 픽스처는 raw 가산세가 전부 우연히 10의 배수라 `floorTen`이 항등원으로 동작했다.
   * 두 줄(`floorTen(result.filingPenalty)` · `floorTen(result.delayedPaymentPenalty)`)을
   * 통째로 지워도 저장소 19,055개 테스트가 전건 통과했다.
   *
   * ⇒ raw 가 10의 배수가 **아닌** 격자를 고정한다. base 를 10의 배수 밖으로 밀려면
   *   「당초 신고세액」(§47조의3① 「과소신고납부세액등」에서 차감)을 쓰면 된다.
   */
  it("B4-35-1: 🔴 신고불성실 — raw 1,826,543 → 절사 1,826,540", () => {
    const r = calculateStockTransferTax(
      dom({ filingViolation: "under_report", originalFiledTax: 1_234_567 }),
    );
    // base = 19,500,000 − 1,234,567 = 18,265,433
    expect(r.penaltyBase).toBe(18_265_433);
    const raw = Math.floor(r.penaltyBase! * 0.1); // 1,826,543 — 10의 배수가 아니다
    expect(raw % 10).not.toBe(0);
    expect(r.underReportPenalty).toBe(1_826_540);
    expect(r.underReportPenalty).not.toBe(raw);
  });

  it("B4-35-2: 🔴 납부지연 — raw 81,481 → 절사 81,480", () => {
    const r = calculateStockTransferTax(
      dom({
        unpaidTax: 12_345_678,
        paymentDeadline: new Date("2024-08-31"),
        actualPaymentDate: new Date("2024-10-01"),
      }),
    );
    // 2024-09-01 ~ 2024-09-30 = 30일 × 10만분의 22 (국세기본법 §47의4①1호 — 납부일 전날까지)
    const raw = Math.floor((12_345_678 * 30 * 22) / 100_000); // 81,481
    expect(raw % 10).not.toBe(0);
    expect(r.latePaymentPenalty).toBe(81_480);
    expect(r.latePaymentPenalty).not.toBe(raw);
  });

  it("B4-35-3: 합산 경로도 같은 절사를 거친다", () => {
    const agg = calculateStockTransferTaxAggregate([
      dom({ filingViolation: "under_report", originalFiledTax: 1_234_567 }),
    ]);
    expect(agg.totalUnderReportPenalty % 10).toBe(0);
    expect(agg.totalUnderReportPenalty).toBe(1_826_540);
  });
});
