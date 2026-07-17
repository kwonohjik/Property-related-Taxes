/**
 * Pre-Do anchor — 계산 결과 선택 출력 (겸용주택 양도세, PR-F4)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.8
 *
 * ⚠️ 구현 전 작성 — `lib/print/mixed-use-print-sections.ts` 미존재 시 RED(import 실패).
 *
 * pdf 채널 = 없음 (0종).
 *   ResultPdfDocument에 mixed-use 전용 섹션 부재(taxType transfer는 calculation만 렌더,
 *   mixedUseDetail 미렌더). PR-2 거짓 선택 방지 → pdf 채널 미부여. 전부 SCREEN(window.print).
 *   기존 자체 printScoped("full"/"form-table") CSS body scope → PrintSelectionPanel 통일.
 *   F4 = 마지막 printScoped 사용처 → CSS scope 규칙·Helpers 정의 제거.
 */
import { describe, it, expect } from "vitest";
import {
  MIXED_USE_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  selectPdfSections,
  type MixedUsePrintSectionId,
} from "@/lib/print/mixed-use-print-sections";

// 설계 §2.8 기준 leaf + 건물 기준시가 계산서(PHD 스냅샷 소속 시) = 4종
const ALL_LEAVES: MixedUsePrintSectionId[] = [
  "calculation",
  "filing-form",
  "detailed-statement",
  "building-std-report",
];

describe("겸용주택 양도세 선택 출력 레지스트리 — Pre-Do anchor (PR-F4)", () => {
  it("PD-mu-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-mu-2: calculation만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["calculation"]);
    expect(resolvePrintVisibilityClass("calculation", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "calculation") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-mu-3: flattenPrintSectionIds는 4개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  it("PD-mu-4: pdfEligibleIds는 0종 (서버 PDF 섹션 부재 — 전부 SCREEN)", () => {
    expect(pdfEligibleIds()).toEqual([]);
  });

  it("PD-mu-5: resolveGroupCheckState — all/partial/none 판정 (신고서식 그룹 3 leaf)", () => {
    const forms = MIXED_USE_PRINT_SECTIONS.find((g) => g.id === "group:forms");
    expect(forms).toBeDefined();
    const leafIds = forms!.children.map((c) => c.id);

    expect(resolveGroupCheckState(forms!, new Set())).toBe("none");
    expect(resolveGroupCheckState(forms!, new Set(["filing-form"]))).toBe("partial");
    expect(resolveGroupCheckState(forms!, new Set(leafIds))).toBe("all");
  });

  it("PD-mu-6: selectPdfSections — pdf 채널 0이므로 어떤 선택에도 빈 배열", () => {
    const available = new Set<MixedUsePrintSectionId>(ALL_LEAVES);
    expect(selectPdfSections(new Set(ALL_LEAVES), available)).toEqual([]);
    expect(selectPdfSections(new Set(["calculation"]), available)).toEqual([]);
    expect(selectPdfSections(new Set(["filing-form"]), available)).toEqual([]);
    expect(selectPdfSections(new Set(), available)).toEqual([]);
  });

  it("트리: 그룹 2개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(MIXED_USE_PRINT_SECTIONS).toHaveLength(2);
    const seen = new Map<string, number>();
    for (const g of MIXED_USE_PRINT_SECTIONS) {
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
