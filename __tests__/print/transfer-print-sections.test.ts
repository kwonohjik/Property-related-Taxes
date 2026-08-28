/**
 * Pre-Do anchor — 계산 결과 선택 출력 (양도세 단일 자산, PR-F1)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.5
 *
 * ⚠️ 구현 전 작성 — `lib/print/transfer-print-sections.ts` 미존재 시 RED(import 실패).
 *
 * pdf 채널 = calculation(핵심 결과 + 계산 내역) 1종. TransferSection이 계산 내역 흐름(검토 U1).
 *   기존 printScoped(CSS body scope) → PrintSelectionPanel 통일. scope 5종이 leaf.
 */
import { describe, it, expect } from "vitest";
import {
  TRANSFER_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  selectPdfSections,
  type TransferPrintSectionId,
} from "@/lib/print/transfer-print-sections";

// 설계 §2.5 기준 leaf (printScoped scope → leaf) — #062로 allocation·detail-cards 추가
const ALL_LEAVES: TransferPrintSectionId[] = [
  "form-table",
  "detailed-statement",
  "calculation",
  // 🆕 #062 — 종전에는 이 자리의 블록들이 PrintSection 밖이라 선택이 걸리지 않았다.
  "allocation",
  "detail-cards",
  "phd",
  "split-detail",
  // 부담부증여 무상이전분의 증여세 신고서(별지 제10호). 화면은 기준시가 계산서 바로 위.
  "gift-filing-form",
  "building-std-report",
];

const PDF_LEAVES: TransferPrintSectionId[] = ["calculation", "building-std-report"];

describe("양도세(단일) 선택 출력 레지스트리 — Pre-Do anchor (PR-F1)", () => {
  it("PD-tr-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-tr-2: calculation만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["calculation"]);
    expect(resolvePrintVisibilityClass("calculation", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "calculation") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-tr-3: flattenPrintSectionIds는 7개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  it("PD-tr-4: pdfEligibleIds는 calculation·building-std-report 2종", () => {
    const ids = pdfEligibleIds();
    expect([...ids].sort()).toEqual([...PDF_LEAVES].sort());
  });

  it("PD-tr-5: resolveGroupCheckState — all/partial/none 판정 (계산 그룹)", () => {
    const calc = TRANSFER_PRINT_SECTIONS.find((g) => g.id === "group:calc");
    expect(calc).toBeDefined();
    const leafIds = calc!.children.map((c) => c.id);

    expect(resolveGroupCheckState(calc!, new Set())).toBe("none");
    expect(resolveGroupCheckState(calc!, new Set(["calculation"]))).toBe("partial");
    expect(resolveGroupCheckState(calc!, new Set(leafIds))).toBe("all");
  });

  it("PD-tr-6: selectPdfSections — pdf 채널(calculation)만, screen 노드·미가용 제외", () => {
    const available = new Set<TransferPrintSectionId>([
      "calculation",
      "form-table",
      "detailed-statement",
    ]);
    expect(
      selectPdfSections(new Set(["form-table", "detailed-statement", "calculation"]), available)
    ).toEqual(["calculation"]);
    expect(selectPdfSections(new Set(["form-table", "detailed-statement"]), available)).toEqual([]);
    expect(
      selectPdfSections(new Set(["calculation"]), new Set(["form-table"]))
    ).toEqual([]);
    expect(selectPdfSections(new Set(), available)).toEqual([]);
  });

  it("트리: 그룹 2개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(TRANSFER_PRINT_SECTIONS).toHaveLength(2);
    const seen = new Map<string, number>();
    for (const g of TRANSFER_PRINT_SECTIONS) {
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
