import { describe, expect, it } from "vitest";
import {
  extractTotalTax,
  extractResultSummaryItems,
} from "@/components/history/HistoryDetailDrawer";

describe("extractTotalTax — Bug B 회귀 보호", () => {
  it("Anchor 4-a: 증여세·상속세 finalTax(top-level)", () => {
    expect(extractTotalTax({ finalTax: 12_345_678 })).toBe("12,345,678");
  });

  it("Anchor 4-b: 양도세 result.totalTax 회귀", () => {
    expect(extractTotalTax({ result: { totalTax: 9_876 } })).toBe("9,876");
  });

  it("Anchor 4-c: 취득세 top-level totalTax 회귀", () => {
    expect(extractTotalTax({ totalTax: 5_000 })).toBe("5,000");
  });

  // 재산세·종부세는 결과 객체를 최상위에 직접 저장 — totalTax가 아닌 totalPayable/grandTotal.
  // (이전 'totalTax 회귀' 주석이 잘못 가정해 "납부세액: -" 버그가 테스트로 안 잡혔음)
  it("Anchor 4-h: 재산세 top-level totalPayable", () => {
    expect(extractTotalTax({ totalPayable: 1_234_567, determinedTax: 1_000_000 })).toBe(
      "1,234,567"
    );
  });

  it("Anchor 4-i: 종부세 top-level grandTotal", () => {
    expect(extractTotalTax({ grandTotal: 9_876_543, totalHousingTax: 8_000_000 })).toBe(
      "9,876,543"
    );
  });

  it("Anchor 4-j: 재산세 비과세 우선", () => {
    expect(extractTotalTax({ isExempt: true, totalPayable: 0 })).toBe("비과세");
  });

  it("Anchor 4-d: bundled aggregated.totalTax 회귀", () => {
    expect(extractTotalTax({ aggregated: { totalTax: 1_000 } })).toBe("1,000");
  });

  it("Anchor 4-e: 미매칭은 '-' (회귀)", () => {
    expect(extractTotalTax({})).toBe("-");
  });

  it("Anchor 4-f: result.finalTax(중첩) 케이스", () => {
    expect(extractTotalTax({ result: { finalTax: 7_777 } })).toBe("7,777");
  });

  it("Anchor 4-g: 비과세 우선 (회귀)", () => {
    expect(extractTotalTax({ result: { isExempt: true } })).toBe("비과세");
  });
});

describe("extractResultSummaryItems — taxType 분기 (Bug B 확장)", () => {
  it("Anchor 5-a: 증여세 finalTax/computedTax/taxBase 노출", () => {
    const items = extractResultSummaryItems(
      { finalTax: 100, computedTax: 200, taxBase: 1000, grossGiftValue: 5000 },
      "gift"
    );
    expect(items.find((i) => i.label === "결정세액")?.value).toBe("100");
    expect(items.find((i) => i.label === "산출세액")?.value).toBe("200");
    expect(items.find((i) => i.label === "과세표준")?.value).toBe("1,000");
    expect(items.find((i) => i.label === "증여재산가액")?.value).toBe("5,000");
  });

  it("Anchor 5-b: 상속세 finalTax 노출", () => {
    const items = extractResultSummaryItems(
      { finalTax: 999, computedTax: 1_500, grossEstateValue: 10_000 },
      "inheritance"
    );
    expect(items.find((i) => i.label === "결정세액")?.value).toBe("999");
    expect(items.find((i) => i.label === "상속재산가액")?.value).toBe("10,000");
  });

  it("Anchor 5-c: 양도세 회귀", () => {
    const items = extractResultSummaryItems(
      { result: { totalTax: 50, calculatedTax: 60, taxBase: 1000 } },
      "transfer"
    );
    expect(items.find((i) => i.label === "납부세액")?.value).toBe("50");
    expect(items.find((i) => i.label === "산출세액")?.value).toBe("60");
  });

  it("Anchor 5-e: 재산세 과세표준·본세·부가세·납부세액 노출", () => {
    const items = extractResultSummaryItems(
      { taxBase: 100_000_000, determinedTax: 140_000, totalSurtax: 28_000, totalPayable: 168_000 },
      "property"
    );
    expect(items.find((i) => i.label === "과세표준")?.value).toBe("100,000,000");
    expect(items.find((i) => i.label === "본세(결정세액)")?.value).toBe("140,000");
    expect(items.find((i) => i.label === "부가세 합계")?.value).toBe("28,000");
    expect(items.find((i) => i.label === "납부세액")?.value).toBe("168,000");
  });

  it("Anchor 5-f: 종부세 grandTotal 노출", () => {
    const items = extractResultSummaryItems(
      { totalHousingTax: 8_000_000, grandTotal: 9_876_543 },
      "comprehensive_property"
    );
    expect(items.find((i) => i.label === "납부세액")?.value).toBe("9,876,543");
    expect(items.find((i) => i.label === "주택분 종부세")?.value).toBe("8,000,000");
  });

  it("Anchor 5-d: 비과세 우선 (회귀)", () => {
    const items = extractResultSummaryItems(
      { result: { isExempt: true, finalTax: 100 } },
      "gift"
    );
    expect(items.find((i) => i.label === "과세 여부")?.value).toBe("비과세");
    expect(items.find((i) => i.label === "결정세액")).toBeUndefined();
  });
});
