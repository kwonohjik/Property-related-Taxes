/**
 * A-4·A-5 anchor — §94①3 가목 1)·2) 조문 배정과 표시 라벨
 *
 * 조문 (KoreanLaw MCP 실측 · 소득세법 mst 280405, 시행 2026-07-01):
 *   가. 주권상장법인의 주식등으로서 다음의 어느 하나에 해당하는 주식등
 *     1) … **대주주가 양도하는** 주식등
 *     2) 1)에 따른 **대주주에 해당하지 아니하는 자**가 **증권시장에서의 거래에 의하지 아니하고**
 *        양도하는 주식등
 *
 * ⇒ 축은 「대주주인가」 + 「장내인가」다.
 *   · 대주주               → 가목 1)
 *   · 비대주주 · 장외      → 가목 2)
 *   · 비대주주 · **장내**  → §94①3 **어느 목에도 해당하지 않는다**(과세대상이 아니어서 비과세)
 *
 * 종전 결함:
 *   (1) 표시 라벨이 서로 **뒤바뀌어** 있었다 — 1)에 「비대주주 장외」, 2)에 「대주주」.
 *   (2) 비대주주 장외·장내 **둘 다** `①3가1)`(대주주 조항)로 배정돼 있었다.
 *   그래서 신고서 01행(「가목1) — 상장 비대주주 장외」)과 02행(「상장 비대주주 (장내)」)이
 *   서로 모순되는 화면이 나왔다.
 *
 * 안전망 실측:
 *   P-2 — 두 라벨을 서로 교환해도 반응하는 테스트 **0건**.
 *   P-3 — `appliedSection94`를 전 분기에서 고정하면 9건이 실패하나 **전부 값 단언이고
 *         세액 단언은 0건**이었다 ⇒ 「세액 무영향」이 실행으로 확증됐다.
 *
 * 계획서: docs/00-pm/stock-transfer-stale-result-and-conversion-display.plan.md §3
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { buildRows } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import type { StockTransferInput, StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function base(over: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    priorYearEndDate: new Date("2025-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2020-07-01"),
    transferDate: new Date("2026-02-26"),
    shareCount: 5_000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 8_950,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 3_000,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    ...over,
  } as StockTransferInput;
}

describe("A-5 — 조문 배정이 사실관계와 일치한다", () => {
  it("A-5-1: 대주주 → 가목 1)", () => {
    const r = calculateStockTransferTax(base({ selfShareRatio: 0.15, isMajorShareholder: true }));
    expect(r.taxCategory).toBe("listed_major");
    expect(r.appliedSection94).toBe("①3가1)");
  });

  it("A-5-2: 비대주주 · 장외 → 가목 2)", () => {
    const r = calculateStockTransferTax(base({ isOnMarketTransaction: false }));
    expect(r.taxCategory).toBe("listed_off_market_non_major");
    expect(r.appliedSection94).toBe("①3가2)");
    expect(r.isExempt).toBe(false);
  });

  it("A-5-3: 비대주주 · 장내 → 해당없음 (과세대상 아님 = 비과세)", () => {
    const r = calculateStockTransferTax(base({ isOnMarketTransaction: true }));
    expect(r.taxCategory).toBe("listed_non_major_in_market");
    expect(r.appliedSection94).toBe("해당없음");
    expect(r.isExempt).toBe(true);
  });

  it("A-5-4: 조문 배정이 바뀌어도 세액은 불변이다 (P-3 확증의 anchor화)", () => {
    const offMarket = calculateStockTransferTax(base({ isOnMarketTransaction: false }));
    // 가목 2)로 배정이 바뀐 뒤에도 종전 세액 그대로
    expect(offMarket.transferPrice).toBe(44_750_000);
    expect(offMarket.acquisitionPrice).toBe(15_000_000);
    expect(offMarket.finalTax).toBeGreaterThan(0);
  });
});

describe("A-4 — 신고서 01행 라벨이 조문과 일치한다", () => {
  function row01(result: StockTransferResult): string {
    const rows = buildRows(result, [{ key: "total", label: "합계" }]);
    return String(rows[0]?.values.total ?? "");
  }

  it("A-4-1: 대주주 → 「가목1) — 상장 대주주」", () => {
    const label = row01(calculateStockTransferTax(base({ selfShareRatio: 0.15, isMajorShareholder: true })));
    expect(label).toContain("가목1)");
    expect(label).toContain("대주주");
    expect(label).not.toContain("비대주주");
  });

  it("A-4-2: 비대주주 장외 → 「가목2) — 상장 비대주주 장외」", () => {
    const label = row01(calculateStockTransferTax(base({ isOnMarketTransaction: false })));
    expect(label).toContain("가목2)");
    expect(label).toContain("비대주주");
    expect(label).toContain("장외");
  });

  it("A-4-3: 비대주주 장내 → 01행과 02행이 서로 모순되지 않는다", () => {
    const r = calculateStockTransferTax(base({ isOnMarketTransaction: true }));
    const rows = buildRows(r, [{ key: "total", label: "합계" }]);
    const s94 = String(rows[0]?.values.total ?? "");   // 01. 적용 조문
    const category = String(rows[1]?.values.total ?? ""); // 02. 과세 분류

    // 종전 결함: 01행이 「장외」, 02행이 「(장내)」로 정반대를 말했다.
    expect(category).toContain("장내");
    expect(s94).not.toContain("장외");
  });
});
