/**
 * Pre-Do anchor — 계산 결과 선택 출력 (양도세 다중 자산, PR-F2)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.6
 *
 * ⚠️ 구현 전 작성 — `lib/print/multi-transfer-print-sections.ts` 미존재 시 RED(import 실패).
 *
 * pdf 채널 = form-table(신고서 양식)·summary(합산 결과) 2종. TransferMultiSection이 다건 합산 신고서 양식 렌더(form-table 1차 소유, summary 회귀호환 별칭).
 *   기존 자체 printScoped(CSS body scope) → PrintSelectionPanel 통일.
 */
import { describe, it, expect } from "vitest";
import {
  MULTI_TRANSFER_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  selectPdfSections,
  type MultiTransferPrintSectionId,
} from "@/lib/print/multi-transfer-print-sections";

// 설계 §2.6 기준 leaf 7종 (form-table = 상단 합산 신고서 양식 추가)
const ALL_LEAVES: MultiTransferPrintSectionId[] = [
  "form-table",
  "summary",
  "detailed-statement",
  "reduction-recalc",
  "group-tax",
  "loss-offset",
  "per-property",
];

const PDF_LEAVES: MultiTransferPrintSectionId[] = ["form-table", "summary"];

describe("양도세(다중) 선택 출력 레지스트리 — Pre-Do anchor (PR-F2)", () => {
  it("PD-mtr-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-mtr-2: summary만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["summary"]);
    expect(resolvePrintVisibilityClass("summary", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "summary") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-mtr-3: flattenPrintSectionIds는 7개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  it("PD-mtr-4: pdfEligibleIds는 form-table·summary 2종 (신고서 양식 + 합산 계산 대표)", () => {
    const ids = pdfEligibleIds();
    expect([...ids].sort()).toEqual([...PDF_LEAVES].sort());
  });

  it("PD-mtr-5: resolveGroupCheckState — all/partial/none 판정 (합산 그룹)", () => {
    const summary = MULTI_TRANSFER_PRINT_SECTIONS.find((g) => g.id === "group:summary");
    expect(summary).toBeDefined();
    const leafIds = summary!.children.map((c) => c.id);

    expect(resolveGroupCheckState(summary!, new Set())).toBe("none");
    expect(resolveGroupCheckState(summary!, new Set(["summary"]))).toBe("partial");
    expect(resolveGroupCheckState(summary!, new Set(leafIds))).toBe("all");
  });

  it("PD-mtr-6: selectPdfSections — pdf 채널(summary)만, screen 노드·미가용 제외", () => {
    const available = new Set<MultiTransferPrintSectionId>([
      "summary",
      "detailed-statement",
      "per-property",
    ]);
    expect(
      selectPdfSections(new Set(["detailed-statement", "per-property", "summary"]), available)
    ).toEqual(["summary"]);
    expect(selectPdfSections(new Set(["detailed-statement", "per-property"]), available)).toEqual([]);
    expect(
      selectPdfSections(new Set(["summary"]), new Set(["detailed-statement"]))
    ).toEqual([]);
    expect(selectPdfSections(new Set(), available)).toEqual([]);
  });

  it("트리: 그룹 2개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(MULTI_TRANSFER_PRINT_SECTIONS).toHaveLength(2);
    const seen = new Map<string, number>();
    for (const g of MULTI_TRANSFER_PRINT_SECTIONS) {
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
