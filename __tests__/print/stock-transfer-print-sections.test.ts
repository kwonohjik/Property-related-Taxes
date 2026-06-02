/**
 * Pre-Do anchor — 계산 결과 선택 출력 (주식 양도세, PR-F3)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.7
 *
 * ⚠️ 구현 전 작성 — `lib/print/stock-transfer-print-sections.ts` 미존재 시 RED(import 실패).
 *
 * pdf 채널 = 없음 (0종).
 *   ResultPdfDocument에 stock-transfer 섹션 부재(taxType 매칭: transfer·transfer_multi·
 *   acquisition·inheritance·gift·property·comprehensive_property — stock 없음).
 *   PR-2 거짓 선택 방지 → pdf 채널 미부여. 전부 SCREEN(window.print → 브라우저 PDF 저장).
 *   기존 printScoped("full"/"form-table") CSS body scope → PrintSelectionPanel 통일.
 */
import { describe, it, expect } from "vitest";
import {
  STOCK_TRANSFER_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  selectPdfSections,
  type StockTransferPrintSectionId,
} from "@/lib/print/stock-transfer-print-sections";

// 설계 §2.7 기준 leaf 3종
const ALL_LEAVES: StockTransferPrintSectionId[] = [
  "calculation",
  "detail-cards",
  "filing-form",
];

describe("주식 양도세 선택 출력 레지스트리 — Pre-Do anchor (PR-F3)", () => {
  it("PD-st-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-st-2: calculation만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["calculation"]);
    expect(resolvePrintVisibilityClass("calculation", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "calculation") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-st-3: flattenPrintSectionIds는 3개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  it("PD-st-4: pdfEligibleIds는 0종 (서버 PDF 섹션 부재 — 전부 SCREEN)", () => {
    // ResultPdfDocument에 stock-transfer 섹션이 없으므로 어떤 leaf도 pdf 채널 미부여.
    expect(pdfEligibleIds()).toEqual([]);
  });

  it("PD-st-5: resolveGroupCheckState — all/partial/none 판정 (계산 그룹)", () => {
    const calc = STOCK_TRANSFER_PRINT_SECTIONS.find((g) => g.id === "group:calc");
    expect(calc).toBeDefined();
    const leafIds = calc!.children.map((c) => c.id);

    expect(resolveGroupCheckState(calc!, new Set())).toBe("none");
    expect(resolveGroupCheckState(calc!, new Set(["calculation"]))).toBe("partial");
    expect(resolveGroupCheckState(calc!, new Set(leafIds))).toBe("all");
  });

  it("PD-st-6: selectPdfSections — pdf 채널 0이므로 어떤 선택에도 빈 배열", () => {
    const available = new Set<StockTransferPrintSectionId>(ALL_LEAVES);
    expect(selectPdfSections(new Set(ALL_LEAVES), available)).toEqual([]);
    expect(selectPdfSections(new Set(["calculation"]), available)).toEqual([]);
    expect(selectPdfSections(new Set(["filing-form"]), available)).toEqual([]);
    expect(selectPdfSections(new Set(), available)).toEqual([]);
  });

  it("트리: 그룹 2개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(STOCK_TRANSFER_PRINT_SECTIONS).toHaveLength(2);
    const seen = new Map<string, number>();
    for (const g of STOCK_TRANSFER_PRINT_SECTIONS) {
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
