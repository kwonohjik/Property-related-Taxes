/**
 * Pre-Do anchor — 계산 결과 선택 출력 (취득세, PR-C)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.2
 *
 * ⚠️ 구현 전 작성 — `lib/print/acquisition-print-sections.ts` 미존재 시 RED(import 실패).
 *
 * pdf 채널 = tax-detail(계산표 대표) 1종. AcquisitionSection은 단일 계산표라 분리 경계 없음(검토 U1).
 *   별지 없음. 비과세(isExempt)는 전용 화면 → 선택 트리 비대상.
 */
import { describe, it, expect } from "vitest";
import {
  ACQUISITION_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  selectPdfSections,
  type AcquisitionPrintSectionId,
} from "@/lib/print/acquisition-print-sections";

// 설계 §2.2 기준 leaf 11종
const ALL_LEAVES: AcquisitionPrintSectionId[] = [
  "deemed-acquisition",
  "tax-info",
  "tax-detail",
  "surtax-detail",
  "reduction-panel",
  "surcharge-detail",
  "house-count",
  "installment",
  "steps",
  "warnings",
  "legal-basis",
];

// PDF 채널: AcquisitionSection 단일 계산표 대표 tax-detail 1종.
const PDF_LEAVES: AcquisitionPrintSectionId[] = ["tax-detail"];

describe("취득세 선택 출력 레지스트리 — Pre-Do anchor (PR-C)", () => {
  it("PD-acq-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-acq-2: tax-detail만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["tax-detail"]);
    expect(resolvePrintVisibilityClass("tax-detail", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "tax-detail") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  it("PD-acq-3: flattenPrintSectionIds는 11개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  it("PD-acq-4: pdfEligibleIds는 tax-detail 1종 (계산표 대표)", () => {
    const ids = pdfEligibleIds();
    expect([...ids].sort()).toEqual([...PDF_LEAVES].sort());
  });

  it("PD-acq-5: resolveGroupCheckState — all/partial/none 판정", () => {
    const summary = ACQUISITION_PRINT_SECTIONS.find((g) => g.id === "group:summary");
    expect(summary).toBeDefined();
    const leafIds = summary!.children.map((c) => c.id);

    expect(resolveGroupCheckState(summary!, new Set())).toBe("none");
    expect(resolveGroupCheckState(summary!, new Set(["tax-detail"]))).toBe("partial");
    expect(resolveGroupCheckState(summary!, new Set(leafIds))).toBe("all");
  });

  it("PD-acq-6: selectPdfSections — pdf 채널(tax-detail)만, screen 노드·미가용 제외", () => {
    const available = new Set<AcquisitionPrintSectionId>([
      "tax-detail",
      "tax-info",
      "warnings",
    ]);
    // screen 전용(tax-info·warnings) 선택은 PDF에서 제외, tax-detail만 포함
    expect(
      selectPdfSections(new Set(["tax-info", "warnings", "tax-detail"]), available)
    ).toEqual(["tax-detail"]);
    // tax-detail 미선택 → PDF 0건
    expect(selectPdfSections(new Set(["tax-info", "warnings"]), available)).toEqual([]);
    // tax-detail 미가용 → 제외
    expect(
      selectPdfSections(new Set(["tax-detail"]), new Set(["tax-info"]))
    ).toEqual([]);
    expect(selectPdfSections(new Set(), available)).toEqual([]);
  });

  it("트리: 그룹 3개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(ACQUISITION_PRINT_SECTIONS).toHaveLength(3);
    const seen = new Map<string, number>();
    for (const g of ACQUISITION_PRINT_SECTIONS) {
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
