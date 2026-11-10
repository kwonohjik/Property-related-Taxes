/**
 * @vitest-environment jsdom
 *
 * 다종목 합산 — 대주주 §104①11호 가목 2) «3억원» 구간 합산 보정의 **화면 표시** anchor
 *
 * 계획서: docs/00-pm/stock-major-shareholder-bracket-unit.plan.md (Q-2 a)
 *
 * 합계 산출세액이 종목별 단독 산출의 합과 달라지므로(엔진: `major-bracket-group-aggregate.anchor.test.ts`),
 * 화면은 그 차이를 숨기면 안 된다 — 결과 카드는 이유와 금액을, 신고서 표는 합계 열에만 보정 행을 보여 준다.
 * 실제 엔진 결과를 그대로 렌더한다(손으로 만든 픽스처가 엔진과 어긋나는 것을 막는다).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";
import { buildRows, deriveColumns } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";

afterEach(cleanup);

function major(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2025-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 5_000_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 1_000_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}

const two = calculateStockTransferTaxAggregate(
  [major({ transferDate: new Date("2025-03-01") }), major({ transferDate: new Date("2025-06-01") })],
  "aggregate",
);
const oneMajorOneNon = calculateStockTransferTaxAggregate(
  [
    major({ transferDate: new Date("2025-03-01") }),
    major({ isMajorShareholder: false, selfShareRatio: 0, transferDate: new Date("2025-06-01") }),
  ],
  "aggregate",
);

describe("MD-1 결과 카드 — 보정이 있을 때만 이유와 금액을 보여 준다", () => {
  it("MD-1-1 보정이 있으면 제목·합산 세액·종목별 합·차이가 보인다", () => {
    const { container } = render(<StockAggregateSummaryCard aggregate={two} names={["가", "나"]} />);
    const text = container.textContent ?? "";
    expect(text).toContain("대주주 «3억원» 구간 합산");
    expect(text).toContain("184,375,000원"); // 합산 후 1회 적용
    expect(text).toContain("169,375,000원"); // 종목별 단순 합
    expect(text).toContain("15,000,000원"); // 보정액
    expect(text).toContain("종목에는 나누지 않습니다");
  });

  it("MD-1-2 합계 행(tfoot)은 보정 포함 값 184,375,000원이다", () => {
    const { container } = render(<StockAggregateSummaryCard aggregate={two} names={["가", "나"]} />);
    expect(container.querySelector("tfoot")?.textContent).toContain("184,375,000원");
  });

  it("MD-1-3 종목 행은 단독 산출 그대로다(84,375,000원·85,000,000원)", () => {
    const { container } = render(<StockAggregateSummaryCard aggregate={two} names={["가", "나"]} />);
    const tbody = container.querySelector("tbody")?.textContent ?? "";
    expect(tbody).toContain("84,375,000원");
    expect(tbody).toContain("85,000,000원");
  });

  it("MD-1-4 보정이 없는 입력(대주주 + 비대주주)에는 안내 카드가 없다", () => {
    expect(oneMajorOneNon.majorProgressiveGroupTax).toBeUndefined();
    render(<StockAggregateSummaryCard aggregate={oneMajorOneNon} names={["가", "나"]} />);
    expect(screen.queryByText(/대주주 «3억원» 구간 합산/)).toBeNull();
  });
});

describe("MD-2 신고서 표 — 합계 열에만 24-3 보정 행, 25행 합계와 이어진다", () => {
  const meta = { items: two.items, aggregated: two };
  const { columns } = deriveColumns(two.items[0], meta);
  const all = buildRows(two.items[0], columns, meta);
  const row = (p: string) => all.find((x) => x.label.startsWith(p));
  const itemKeys = columns.filter((c) => c.key !== "total").map((c) => c.key);

  it("MD-2-1 24-3 행이 있고 합계 열 = 15,000,000, 종목 열은 비어 있다", () => {
    const r = row("24-3.");
    expect(r).toBeDefined();
    expect(r!.values.total).toBe(15_000_000);
    for (const k of itemKeys) expect(r!.values[k] ?? null).toBeNull();
  });

  it("MD-2-2 Σ 종목 열 25행 + 24-3 = 25행 합계 열 (184,375,000)", () => {
    const r25 = row("25.")!;
    const itemSum = itemKeys.reduce((s, k) => s + (Number(r25.values[k]) || 0), 0);
    expect(itemSum).toBe(169_375_000);
    expect(itemSum + Number(row("24-3.")!.values.total)).toBe(Number(r25.values.total));
    expect(r25.values.total).toBe(184_375_000);
  });

  it("MD-2-4 영 §168② 차감 행과 함께 나와도 합계 열에서 24-1 + 24-2 + 24-3 = 25가 성립한다", () => {
    // 기타자산 다목(§168② 대주주 기납부세액 차감 대상) 1건 + 대주주 주식 2건. 기타자산이 1건이라 §104⑤ 비교는 없다.
    const y = { priorYearEndDate: new Date("2025-12-31"), filingDate: new Date("2026-04-30") };
    const withCredit = calculateStockTransferTaxAggregate(
      [
        major({
          ...y,
          marketType: "other_asset",
          isQualifyingBlockShareholder: true,
          blockShareholderRealEstateRatio: 0.65,
          blockShareholderOwnershipRatio: 0.7,
          cumulativeTransferRatio: 0.7,
          aggregationFirstTransferDate: new Date("2023-06-20"),
          selfShareRatio: 0.7,
          isSmallMediumEnterprise: true,
          acquisitionDate: new Date("2003-02-17"),
          transferDate: new Date("2026-02-26"),
          shareCount: 70_000,
          perShareTransferPrice: 30_000,
          perShareAcquisitionPrice: 15_000,
          actualExpenses: 5_000_000,
          totalIssuedShares: 100_000,
          priorMajorShareholderTax: 29_200_000,
        }),
        major({ ...y, transferDate: new Date("2026-03-01") }),
        major({ ...y, transferDate: new Date("2026-06-01") }),
      ],
      "aggregate",
    );
    expect(withCredit.totalClause168_2Deducted).toBeGreaterThan(0);
    expect(withCredit.majorProgressiveGroupTax?.adjustment).toBe(15_000_000);
    const m = { items: withCredit.items, aggregated: withCredit };
    const cols = deriveColumns(withCredit.items[0], m).columns;
    const rs = buildRows(withCredit.items[0], cols, m);
    const t = (p: string) => Number(rs.find((x) => x.label.startsWith(p))!.values.total);
    expect(t("24-1.") + t("24-2.") + t("24-3.")).toBe(t("25."));
    expect(t("25.")).toBe(withCredit.totalCalculatedTax);
  });

  it("MD-2-3 보정이 없으면 24-3 행이 없다", () => {
    const m = { items: oneMajorOneNon.items, aggregated: oneMajorOneNon };
    const cols = deriveColumns(oneMajorOneNon.items[0], m).columns;
    const rows2 = buildRows(oneMajorOneNon.items[0], cols, m);
    expect(rows2.some((x) => x.label.startsWith("24-3."))).toBe(false);
  });
});
