/**
 * 단건 환산 §97②2호 단서(swap) — 신고서·결과 화면이 «양도차익 계산에서 실제로 뺀 값»을 싣는가 (2026-10-07)
 *
 * 단서면 엔진은 당회차 환산취득가액을 차감하지 않고 개산공제도 쓰지 않는다(필요경비 = 실비 전액).
 * 종전 표시는 echo(환산·개산공제)를 그대로 실어 「양도가액 − 취득가액 − 필요경비 = 양도차익」이 깨졌다.
 *
 * 공통: 코스피 대주주 · 2,000주 × 200,000 = 400,000,000 · 환산 80,000,000(20,000/100,000) · 실비 100,000,000
 *   SD-1  신고서 단건 단서 — 11행 0(라벨에 80,000,000 미차감) · 16행 100,000,000 · 17행 없음 · 18 = 07 − 11 − 14
 *         (종전 11행 80,000,000 · 16행 99,600,000 · 17행 400,000 · 18행 300,000,000 ≠ 220,000,000)
 *   SD-2  신고서 단서 + 기신고 합산(§94①4다) — 11행 = 기신고분 450,000,000 · 11-2 당회차분 0 · 18 = 07 − 11 − 14
 *   SD-3  신고서 단서 아님 — 종전 그대로(11행 환산 80,000,000 · 17행 개산공제 400,000)
 *   SD-4  결과 화면 단서 + 기신고 — 취득가액 450,000,000 · 당회차분 0 · 환산 80,000,000 차감 제외 보조 행
 *   SD-5  환산 산식 카드 2종(거래정지 취득측 · 상장 후)은 기신고 합산 시에도 당회차 금액으로 산식을 맺는다(합산 530,000,000 아님)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { buildRows, deriveColumns } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import { StockTransferTaxResultView } from "@/components/calc/results/StockTransferTaxResultView";
import { EstimatedValuationBreakdown } from "@/components/calc/results/StockTransferTaxResultViewHelpers";
import { PostListingDetailCard } from "@/components/calc/results/PostListingDetailCard";

/* jsdom에는 IndexedDB가 없다 — 결과뷰 머리말 훅의 Dexie 접근을 끊는다 */
vi.mock("@/lib/storage/calculation-repository", () => ({ calculationRepository: { count: async () => 0, list: async () => [] } }));
vi.mock("@/lib/storage/use-user-profile", () => ({ useUserProfile: () => ({ profile: null }) }));

afterEach(cleanup);

const D = (s: string) => new Date(s);
function input(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi", isMajorShareholder: true, selfShareRatio: 0.2, selfMarketCap: 0, isLargestShareholderGroup: false,
    combinedShareRatio: 0.2, combinedMarketCap: 0, priorYearEndDate: D("2024-12-31"), isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false, isHeavyRealEstateForValuation: false, isSmallMediumEnterprise: false, isMidsizeEnterprise: false,
    isListedSmallShareholder: false, isVentureCompany: false, isKOTCTrading: false, acquisitionDate: D("2010-06-01"),
    transferDate: D("2025-12-01"), shareCount: 2000, acquisitionCause: "purchase", transferPriceMode: "actual", perShareTransferPrice: 200_000,
    acquisitionMode: "estimated", acquisitionStdMode: "monthly_avg", transferDatePriceAvg1Month: 100_000, acquisitionDatePriceAvg1Month: 20_000,
    acquiredBeforeListing: false, tradingHaltAtTransfer: false, bookLost: false, expenseMode: "actual", actualExpenses: 100_000_000,
    filingType: "preliminary", filingDate: D("2026-02-28"), isElectronicFiling: false, filingViolation: "none", isFraudulent: false,
    isInternationalTransaction: false, realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}
/** §94①4다 요건 충족 + 기신고 1건(600,000,000 / 450,000,000 / 1,500,000) */
const BLOCK_PRIOR = {
  selfShareRatio: 0.7, totalIssuedShares: 100_000, isQualifyingBlockShareholder: true, blockShareholderRealEstateRatio: 0.65,
  blockShareholderOwnershipRatio: 0.7, cumulativeTransferRatio: 0.7, aggregationFirstTransferDate: D("2023-06-20"),
  priorTransferPrice: 600_000_000, priorAcquisitionPrice: 450_000_000, priorExpenses: 1_500_000, priorShareCount: 30_000,
  priorAggregationSourceCount: 1,
} as Partial<StockTransferInput>;

function rows(r: ReturnType<typeof calculateStockTransferTax>) {
  const all = buildRows(r, deriveColumns(r).columns);
  const row = (p: string) => all.find((x) => x.label.startsWith(p))!;
  const v = (p: string) => row(p).values.total;
  return { row, v };
}

describe("SD-1 신고서 — 단건 단서", () => {
  const r = calculateStockTransferTax(input());
  it("전제 — 단서 적용 · 환산 80,000,000 · 양도소득금액 300,000,000", () => {
    expect([r.swapApplied, r.ownAcquisitionPrice, r.expenses, r.transferIncome]).toEqual([true, 80_000_000, 100_000_000, 300_000_000]);
  });
  it("11행 0 · 16행 실비 전액 · 17행 없음 · 18 = 07 − 11 − 14", () => {
    const { row, v } = rows(r);
    expect(v("11. 취득가액")).toBe(0);
    expect(row("11. 취득가액").label).toContain("환산취득가액 80,000,000 미차감");
    expect(v("16.")).toBe(100_000_000);
    expect(v("17.")).toBeNull();
    expect(v("18. 양도차익")).toBe((v("07. 양도가액") as number) - (v("11. 취득가액") as number) - (v("14. 필요경비") as number));
  });
});

describe("SD-2 신고서 — 단서 + 기신고 합산", () => {
  const r = calculateStockTransferTax(input(BLOCK_PRIOR));
  it("11행 = 기신고분 450,000,000 · 11-2 당회차분 0 · 18 = 07 − 11 − 14", () => {
    expect(r.swapApplied).toBe(true);
    const { v } = rows(r);
    expect([v("11. 취득가액"), v("11-1."), v("11-2.")]).toEqual([450_000_000, 450_000_000, 0]);
    expect(v("18. 양도차익")).toBe(448_500_000);
    expect(v("18. 양도차익")).toBe((v("07. 양도가액") as number) - (v("11. 취득가액") as number) - (v("14. 필요경비") as number));
  });
});

describe("SD-3 신고서 — 단서 아님(회귀 없음)", () => {
  it("11행 환산 80,000,000 · 17행 개산공제 400,000 · 18 = 07 − 11 − 14", () => {
    const r = calculateStockTransferTax(input({ actualExpenses: 1_000_000 }));
    expect(r.swapApplied).toBe(false);
    const { row, v } = rows(r);
    expect(row("11. 취득가액").label).toBe("11. 취득가액 (② = 환산취득가액)");
    expect([v("11. 취득가액"), v("17.")]).toEqual([80_000_000, 400_000]);
    expect(v("18. 양도차익")).toBe((v("07. 양도가액") as number) - (v("11. 취득가액") as number) - (v("14. 필요경비") as number));
  });
});

describe("SD-4 결과 화면 — 단서 + 기신고 합산", () => {
  it("취득가액 450,000,000 · 당회차분 0 · 환산 80,000,000 은 차감 제외 보조 행", () => {
    const r = calculateStockTransferTax(input(BLOCK_PRIOR));
    const { container } = render(
      <StockTransferTaxResultView result={r} shareCount={2000} filingViolation="none" isFraudulent={false} isInternationalTransaction={false} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("취득가액 (환산 — 차감 제외)");
    expect(text).toContain("취득가액450,000,000");
    expect(text).toContain("환산취득가액 (§97②2호 단서 — 차감 제외)80,000,000");
  });
});

describe("SD-5 환산 산식 카드 — 기신고 합산 시 당회차 금액", () => {
  // 카드 렌더 조건만 덧씌운 결과(엔진 금액 echo 는 SD-2 실계산 그대로: 합산 1,000,000,000 / 530,000,000 · 당회차 400,000,000 / 80,000,000)
  const r = calculateStockTransferTax(input(BLOCK_PRIOR));
  it("거래정지 취득측 환산 카드", () => {
    const { container } = render(
      <EstimatedValuationBreakdown
        result={{ ...r, valuationDetail: { ...r.valuationDetail, method: "halt_acquisition_conversion", conversionAcqStdPerShare: 20_000, conversionTransferStd: 100_000 } } as never}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("환산취득가 = 양도가액");
    expect(text).toContain("80,000,000");
    expect(text).not.toContain("530,000,000");
  });
  it("상장 후 환산 카드", () => {
    const { container } = render(
      <PostListingDetailCard result={{ ...r, acquiredBeforeListing: true, postListingDetail: { finalPerShareValue: 20_000, conversionRatio: 0.2, listingYearPerShareValue: 100_000, acquisitionYearPerShareValue: 20_000 } } as never} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("400,000,000");
    expect(text).toContain("80,000,000");
    expect(text).not.toContain("530,000,000");
    expect(text).not.toContain("1,000,000,000");
  });
});
