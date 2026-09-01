/**
 * @vitest-environment jsdom
 *
 * ⑦ 다종목 합산 요약 카드 — 증권거래세 합계 · 신고 단위 가산세
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase D · A-2)
 *
 * ## 왜 이 파일이 필요한가
 *
 * 엔진은 `totalSecuritiesTransactionTax` 를 **계산하고 anchor 2건이 그 값을 지키는데**
 * (Phase 0 P-3 뮤테이션 실측), **UI 참조가 0건**이었다 — 계산은 맞는데 화면에 안 나왔다.
 * 「dead 필드」가 아니라 **표시 누락**이다.
 *
 * 신고 단위 가산세(Phase A′ 산물)도 결정세액에 **포함만 되고 내역이 안 보였다**.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

afterEach(cleanup);

function itemRes(over: Partial<StockTransferResult> = {}): StockTransferResult {
  return {
    transferIncome: 30_000_000,
    basicDeduction: 2_500_000,
    taxBase: 27_500_000,
    appliedRate: 0.2,
    calculatedTax: 5_500_000,
    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,
    finalTax: 5_500_000,
    localIncomeTax: 550_000,
    ...over,
  } as unknown as StockTransferResult;
}

function agg(over: Partial<StockTransferAggregateResult> = {}): StockTransferAggregateResult {
  return {
    items: [itemRes(), itemRes()],
    totalTransferIncome: 60_000_000,
    basicDeductionByGroup: { stock: 2_500_000, real_estate_and_other_asset: 0 },
    totalTaxBase: 57_500_000,
    totalCalculatedTax: 11_500_000,
    totalUnderReportPenalty: 1_152_000,
    totalLatePaymentPenalty: 68_200,
    electronicFilingCredit: 0,
    totalFinalTax: 12_720_200,
    totalLocalIncomeTax: 1_150_000,
    totalSecuritiesTransactionTax: {
      securitiesTransactionTax: 105_000,
      agriculturalTax: 90_000,
      totalTax: 195_000,
    },
    ...over,
  } as unknown as StockTransferAggregateResult;
}

describe("AS-1 증권거래세 합계가 화면에 나온다 (종전 UI 참조 0건)", () => {
  it("AS-1-1: 합계 195,000 과 내역(증권거래세분·농특세)이 보인다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.getByText("195,000원")).toBeTruthy();
    expect(screen.getByText("105,000원")).toBeTruthy();
    expect(screen.getByText("90,000원")).toBeTruthy();
  });

  it("AS-1-2: **양도소득세와 별도 납부**임을 말한다 — 합계에 더하면 안 된다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.getByText(/별도로 납부/)).toBeTruthy();
    // 납부세액 합계는 양도세 + 지방세만 — 증권거래세는 별도 세목
    expect(screen.getByText("13,870,200원")).toBeTruthy(); // 12,720,200 + 1,150,000
  });

  it("AS-1-3: 증권거래세가 0이면 카드를 만들지 않는다 — 빈 카드로 화면을 늘리지 않는다", () => {
    const zero = agg({
      totalSecuritiesTransactionTax: {
        securitiesTransactionTax: 0,
        agriculturalTax: 0,
        totalTax: 0,
      },
    } as Partial<StockTransferAggregateResult>);
    render(<StockAggregateSummaryCard aggregate={zero} names={["가", "나"]} />);
    expect(screen.queryByText(/증권거래세/)).toBeNull();
  });
});

describe("AS-2 신고 단위 가산세 내역이 보인다 (Phase A′ 산물)", () => {
  it("AS-2-1: 신고불성실·납부지연이 각각 표시된다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.getByText("1,152,000원")).toBeTruthy();
    expect(screen.getByText("68,200원")).toBeTruthy();
  });

  it("AS-2-2: **신고 1건 단위 1회**임을 말한다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.getByText(/신고 1건 단위/)).toBeTruthy();
  });

  it("AS-2-3: 가산세가 0이면 행을 만들지 않는다", () => {
    const zero = agg({ totalUnderReportPenalty: 0, totalLatePaymentPenalty: 0 });
    render(<StockAggregateSummaryCard aggregate={zero} names={["가", "나"]} />);
    expect(screen.queryByText(/신고불성실/)).toBeNull();
  });
});

// ============================================================
// AS-3 — §118의6①1호 한도 0의 **사유**와 이월 부존재
//
// 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md §6.4
//
// 통산으로 B = 0이 된 종목은 한도도 0이 된다(Q-5). 금액만 0으로 보이면 계산 오류로
// 읽히므로 사유를 적어야 한다. 또 §118의6에는 §57②과 같은 **이월공제 규정이 없어**
// 한도 초과분이 그대로 소멸하는데, 그것도 말하지 않으면 「내년에 쓴다」로 오해된다.
// ============================================================

function foreignRes(
  transferIncome: number,
  limit: number,
  applied: number,
  paid: number,
): StockTransferResult {
  return itemRes({
    transferIncome,
    foreignDetail: {
      stockName: "FS",
      countryCode: "US",
      shareCount: 10,
      transferExchangeRate: 1_300,
      acquisitionExchangeRate: 1_200,
      foreignTaxPaidKrw: paid,
      foreignTaxCreditLimit: limit,
      foreignTaxCreditApplied: applied,
      appliedRules: [],
    },
  } as unknown as Partial<StockTransferResult>);
}

describe("AS-3 국외 종목 공제한도 — 0의 사유와 이월 부존재", () => {
  it("AS-3-1: 통산 후 양도소득금액이 0인 종목은 **한도 0의 사유**를 적는다", () => {
    const a = agg({
      items: [foreignRes(0, 0, 0, 4_000_000), foreignRes(30_000_000, 6_000_000, 1_000_000, 1_000_000)],
    } as Partial<StockTransferAggregateResult>);
    render(<StockAggregateSummaryCard aggregate={a} names={["가", "나"]} />);
    expect(screen.getByText(/통산 후 양도소득금액이 0이므로/)).toBeTruthy();
  });

  it("AS-3-2: 🔑 양성 대조군 — 소득이 남은 종목에는 그 사유가 **붙지 않는다**", () => {
    const a = agg({
      items: [foreignRes(30_000_000, 6_000_000, 1_000_000, 1_000_000)],
    } as Partial<StockTransferAggregateResult>);
    render(<StockAggregateSummaryCard aggregate={a} names={["가"]} />);
    expect(screen.queryByText(/통산 후 양도소득금액이 0이므로/)).toBeNull();
  });

  it("AS-3-3: 한도 초과분이 있으면 **이월되지 않는다**고 말한다", () => {
    const a = agg({
      items: [foreignRes(30_000_000, 6_000_000, 6_000_000, 9_000_000)],
    } as Partial<StockTransferAggregateResult>);
    render(<StockAggregateSummaryCard aggregate={a} names={["가"]} />);
    expect(screen.getByText(/이월되지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/필요경비 산입\(2호\)/)).toBeTruthy();
  });

  it("AS-3-4: 초과분이 없으면 이월 안내를 띄우지 않는다 — 없는 문제를 말하지 않는다", () => {
    const a = agg({
      items: [foreignRes(30_000_000, 6_000_000, 1_000_000, 1_000_000)],
    } as Partial<StockTransferAggregateResult>);
    render(<StockAggregateSummaryCard aggregate={a} names={["가"]} />);
    expect(screen.queryByText(/이월되지 않습니다/)).toBeNull();
  });

  it("AS-3-5: 국외 종목이 없으면 §118의6 카드 자체가 없다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.queryByText(/외국납부세액 공제한도/)).toBeNull();
  });
});

// ============================================================
// AS-4 — 배분됐지만 쓰이지 않는 한도를 알린다
//
// 「해당 과세기간의 국외자산」이면 외국납부세액 유무와 무관하게 C(분모)에 들어간다
// (§118의6①1호). 그래서 외국세를 내지 않은 종목도 A의 일부를 가져가고 그 몫은 사라진다.
//
// ⚠️ 2026-09-01 택일이 **과세기간 단위로 확정**돼(계획서 §4.2) 1호·2호가 한 신고에 섞이는
//    일은 없어졌다. 전부 2호면 공제 종목이 없어 카드 자체가 안 나오므로, 이 안내가 걸리는
//    경우는 **외국납부세액이 없는 국외 종목**뿐이다.
// ============================================================

function foreignNoTaxRes(transferIncome: number, unusedLimit: number): StockTransferResult {
  return itemRes({
    transferIncome,
    foreignDetail: {
      stockName: "FX",
      countryCode: "US",
      shareCount: 10,
      transferExchangeRate: 1_300,
      acquisitionExchangeRate: 1_200,
      unusedForeignTaxCreditLimit: unusedLimit,
      appliedRules: [],
    },
  } as unknown as Partial<StockTransferResult>);
}

describe("AS-4 쓰이지 않는 한도 안내", () => {
  const withUnused = () =>
    agg({
      items: [
        foreignNoTaxRes(38_000_000, 7_384_090),
        foreignRes(50_000_000, 9_715_910, 6_000_000, 6_000_000),
      ],
    } as Partial<StockTransferAggregateResult>);

  it("AS-4-1: 배분됐지만 공제에 쓰이지 않는 한도 금액이 보인다", () => {
    render(<StockAggregateSummaryCard aggregate={withUnused()} names={["가", "나"]} />);
    expect(screen.getByText(/7,384,090원은 공제에 쓰이지/)).toBeTruthy();
  });

  it("AS-4-2: 사유(외국납부세액 없음 · 분모에는 포함)를 함께 말한다", () => {
    render(<StockAggregateSummaryCard aggregate={withUnused()} names={["가", "나"]} />);
    expect(screen.getByText(/외국납부세액이 없어 세액공제/)).toBeTruthy();
    expect(screen.getByText(/산식의 분모에/)).toBeTruthy();
  });

  it("AS-4-3: 🔑 양성 대조군 — 전 종목이 공제를 받으면 안내가 없다", () => {
    const allUsed = agg({
      items: [
        foreignRes(50_000_000, 9_750_000, 9_750_000, 12_000_000),
        foreignRes(50_000_000, 9_750_000, 6_000_000, 6_000_000),
      ],
    } as Partial<StockTransferAggregateResult>);
    render(<StockAggregateSummaryCard aggregate={allUsed} names={["가", "나"]} />);
    expect(screen.queryByText(/공제에 쓰이지 않습니다/)).toBeNull();
  });

  it("AS-4-4: 🔑 공제 종목이 하나도 없으면 카드 자체가 없다 — 쓸 사람이 없어 손해가 아니다", () => {
    const noneCredited = agg({
      items: [foreignNoTaxRes(38_000_000, 8_550_000), foreignNoTaxRes(44_000_000, 8_550_000)],
    } as Partial<StockTransferAggregateResult>);
    render(<StockAggregateSummaryCard aggregate={noneCredited} names={["가", "나"]} />);
    expect(screen.queryByText(/외국납부세액 공제한도/)).toBeNull();
    expect(screen.queryByText(/공제에 쓰이지 않습니다/)).toBeNull();
  });
});
