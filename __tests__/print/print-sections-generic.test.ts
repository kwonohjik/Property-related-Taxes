/**
 * Pre-Do anchor — 선택 출력 공통 제네릭 헬퍼 (PR-A)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §1.1
 *
 * shared 헬퍼가 임의 groups(세목 무관)에 동작하는지 검증.
 * 모듈 미구현 상태 RED → 구현 후 GREEN.
 */
import { describe, it, expect } from "vitest";
import {
  flattenPrintSectionIds,
  pdfEligibleIds,
  selectPdfSections,
  resolveGroupCheckState,
  resolvePrintVisibilityClass,
  type PrintSectionGroup,
} from "@/lib/print/print-sections.types";

// 세목 무관 가짜 트리 (2 그룹 × 4 leaf, pdf 2종)
const FAKE_GROUPS: PrintSectionGroup[] = [
  {
    id: "group:a",
    label: "그룹 A",
    children: [
      { id: "a1", label: "A1", channel: ["screen"] },
      { id: "a2", label: "A2", channel: ["screen", "pdf"] },
    ],
  },
  {
    id: "group:b",
    label: "그룹 B",
    children: [
      { id: "b1", label: "B1", channel: ["screen", "pdf"] },
      { id: "b2", label: "B2", channel: ["screen"] },
    ],
  },
];

describe("선택 출력 공통 제네릭 헬퍼 — Pre-Do anchor", () => {
  it("G-1: flattenPrintSectionIds(groups)는 모든 leaf id를 선언 순서로", () => {
    expect(flattenPrintSectionIds(FAKE_GROUPS)).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("G-2: pdfEligibleIds(groups)는 pdf 채널 leaf만", () => {
    expect(pdfEligibleIds(FAKE_GROUPS)).toEqual(["a2", "b1"]);
  });

  it("G-3: resolvePrintVisibilityClass — 선택됨='', 미선택='print:hidden'", () => {
    const sel = new Set<string>(["a1"]);
    expect(resolvePrintVisibilityClass("a1", sel)).toBe("");
    expect(resolvePrintVisibilityClass("a2", sel)).toBe("print:hidden");
  });

  it("G-4: selectPdfSections(groups, selected, available) — pdf ∩ 선택 ∩ 가용", () => {
    const available = new Set<string>(["a1", "a2", "b1", "b2"]);
    // 화면전용(a1)·미가용 제외, pdf 채널만
    expect(
      selectPdfSections(FAKE_GROUPS, new Set(["a1", "a2", "b1"]), available).sort()
    ).toEqual(["a2", "b1"]);
    // 미가용 제외
    expect(
      selectPdfSections(FAKE_GROUPS, new Set(["a2", "b1"]), new Set(["a2"]))
    ).toEqual(["a2"]);
    // 선택 0건
    expect(selectPdfSections(FAKE_GROUPS, new Set(), available)).toEqual([]);
  });

  it("G-5: resolveGroupCheckState — all/partial/none", () => {
    const ga = FAKE_GROUPS[0];
    expect(resolveGroupCheckState(ga, new Set())).toBe("none");
    expect(resolveGroupCheckState(ga, new Set(["a1"]))).toBe("partial");
    expect(resolveGroupCheckState(ga, new Set(["a1", "a2"]))).toBe("all");
  });
});
