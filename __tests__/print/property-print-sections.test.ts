/**
 * Pre-Do anchor — 계산 결과 선택 출력 (재산세, PR-D)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.3
 *
 * ⚠️ 구현 전 작성 — `lib/print/property-print-sections.ts` 미존재 시 RED(import 실패).
 *
 * pdf 채널 = computed-tax(계산표 대표) 1종. PropertySection은 단일 계산표(검토 U1). 별지 없음.
 */
import { describe, it, expect } from "vitest";
import {
  PROPERTY_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  selectPdfSections,
  type PropertyPrintSectionId,
} from "@/lib/print/property-print-sections";

// 설계 §2.3 기준 leaf 7종
const ALL_LEAVES: PropertyPrintSectionId[] = [
  "tax-base",
  "computed-tax",
  "surtax",
  "total-payable",
  "installment",
  "warnings",
  "legal-basis",
];

const PDF_LEAVES: PropertyPrintSectionId[] = ["computed-tax"];

describe("재산세 선택 출력 레지스트리 — Pre-Do anchor (PR-D)", () => {
  it("PD-prop-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-prop-2: computed-tax만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["computed-tax"]);
    expect(resolvePrintVisibilityClass("computed-tax", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "computed-tax") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-prop-3: flattenPrintSectionIds는 7개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  it("PD-prop-4: pdfEligibleIds는 computed-tax 1종 (계산표 대표)", () => {
    const ids = pdfEligibleIds();
    expect([...ids].sort()).toEqual([...PDF_LEAVES].sort());
  });

  it("PD-prop-5: resolveGroupCheckState — all/partial/none 판정", () => {
    const calc = PROPERTY_PRINT_SECTIONS.find((g) => g.id === "group:calc");
    expect(calc).toBeDefined();
    const leafIds = calc!.children.map((c) => c.id);

    expect(resolveGroupCheckState(calc!, new Set())).toBe("none");
    expect(resolveGroupCheckState(calc!, new Set(["computed-tax"]))).toBe("partial");
    expect(resolveGroupCheckState(calc!, new Set(leafIds))).toBe("all");
  });

  it("PD-prop-6: selectPdfSections — pdf 채널(computed-tax)만, screen 노드·미가용 제외", () => {
    const available = new Set<PropertyPrintSectionId>([
      "computed-tax",
      "tax-base",
      "total-payable",
    ]);
    expect(
      selectPdfSections(new Set(["tax-base", "total-payable", "computed-tax"]), available)
    ).toEqual(["computed-tax"]);
    expect(selectPdfSections(new Set(["tax-base", "total-payable"]), available)).toEqual([]);
    expect(
      selectPdfSections(new Set(["computed-tax"]), new Set(["tax-base"]))
    ).toEqual([]);
    expect(selectPdfSections(new Set(), available)).toEqual([]);
  });

  it("트리: 그룹 2개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(PROPERTY_PRINT_SECTIONS).toHaveLength(2);
    const seen = new Map<string, number>();
    for (const g of PROPERTY_PRINT_SECTIONS) {
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
