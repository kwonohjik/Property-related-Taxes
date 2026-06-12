/**
 * Pre-Do anchor — 계산 결과 선택 출력 (종합부동산세, PR-E)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.4
 *
 * ⚠️ 구현 전 작성 — `lib/print/comprehensive-print-sections.ts` 미존재 시 RED(import 실패).
 *
 * pdf 채널 = housing-tax(주택분 계산표 대표) 1종. ComprehensiveSection은 주택분 계산표만(토지분 PDF 없음, 검토 U1).
 */
import { describe, it, expect } from "vitest";
import {
  COMPREHENSIVE_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  selectPdfSections,
  type ComprehensivePrintSectionId,
} from "@/lib/print/comprehensive-print-sections";

// 설계 §2.4 기준 leaf 7종 + 사례12 신고서 서식 4종 + 산출근거 카드 3종(주택+토지2) = 14종
const ALL_LEAVES: ComprehensivePrintSectionId[] = [
  "aggregation-exclusion",
  "housing-tax-base",
  "housing-tax",
  "aggregate-land",
  "separate-land",
  "grand-total",
  "warnings",
  "filing-form-main",
  "filing-form-buppyo3",
  "filing-form-buppyo5",
  "filing-form-buppyo5sub",
  "housing-payable-calc",
  "land-agg-payable-calc",
  "land-sep-payable-calc",
];

const PDF_LEAVES: ComprehensivePrintSectionId[] = ["housing-tax"];

describe("종부세 선택 출력 레지스트리 — Pre-Do anchor (PR-E)", () => {
  it("PD-comp-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-comp-2: housing-tax만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["housing-tax"]);
    expect(resolvePrintVisibilityClass("housing-tax", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "housing-tax") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-comp-3: flattenPrintSectionIds는 7개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  it("PD-comp-4: pdfEligibleIds는 housing-tax 1종 (주택분 계산표 대표)", () => {
    const ids = pdfEligibleIds();
    expect([...ids].sort()).toEqual([...PDF_LEAVES].sort());
  });

  it("PD-comp-5: resolveGroupCheckState — all/partial/none 판정 (주택분 그룹)", () => {
    const housing = COMPREHENSIVE_PRINT_SECTIONS.find((g) => g.id === "group:housing");
    expect(housing).toBeDefined();
    const leafIds = housing!.children.map((c) => c.id);

    expect(resolveGroupCheckState(housing!, new Set())).toBe("none");
    expect(resolveGroupCheckState(housing!, new Set(["housing-tax"]))).toBe("partial");
    expect(resolveGroupCheckState(housing!, new Set(leafIds))).toBe("all");
  });

  it("PD-comp-6: selectPdfSections — pdf 채널(housing-tax)만, screen 노드·미가용 제외", () => {
    const available = new Set<ComprehensivePrintSectionId>([
      "housing-tax",
      "housing-tax-base",
      "grand-total",
    ]);
    expect(
      selectPdfSections(new Set(["housing-tax-base", "grand-total", "housing-tax"]), available)
    ).toEqual(["housing-tax"]);
    expect(selectPdfSections(new Set(["housing-tax-base", "grand-total"]), available)).toEqual([]);
    expect(
      selectPdfSections(new Set(["housing-tax"]), new Set(["grand-total"]))
    ).toEqual([]);
    expect(selectPdfSections(new Set(), available)).toEqual([]);
  });

  it("트리: 그룹 7개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(COMPREHENSIVE_PRINT_SECTIONS).toHaveLength(7); // 산출근거 3 leaf는 group:payable-calc 1개로 묶임
    const seen = new Map<string, number>();
    for (const g of COMPREHENSIVE_PRINT_SECTIONS) {
      expect(g.id.startsWith("group:")).toBe(true);
      for (const child of g.children) {
        seen.set(child.id, (seen.get(child.id) ?? 0) + 1);
      }
    }
    for (const id of ALL_LEAVES) {
      expect(seen.get(id)).toBe(1);
    }
  });
});
