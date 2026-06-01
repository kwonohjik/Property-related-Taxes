/**
 * Pre-Do anchor — 계산 결과 선택 출력 (상속세)
 * 설계: docs/02-design/features/selective-print.design.md §8
 *
 * ⚠️ 이 테스트는 `lib/print/inheritance-print-sections.ts` 구현 전에 작성됨.
 *    모듈 미구현 상태에서 RED(import 실패) → 디자인 환류 기회 확보 후 Do 진입.
 */
import { describe, it, expect } from "vitest";
import {
  INHERITANCE_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  type PrintSectionId,
} from "@/lib/print/inheritance-print-sections";

// 설계 §1·§2 기준 leaf 17종 (부표3·별지5·별지1은 화면 단일 카드 구조 → deduction-besshi 1 leaf 통합)
const ALL_LEAVES: PrintSectionId[] = [
  "core-result",
  "tax-summary",
  "heir-allocation-summary",
  "deduction-breakdown",
  "allocation-breakdown",
  "source-data",
  "prior-gift-filing",
  "corporate-exemption",
  "debt-allocation",
  "filing-form-9",
  "besshi-buppyo-2",
  "deduction-besshi",
  "valuation-detail",
  "unlisted-stock-besshi",
  "listed-stock-besshi",
  "installment-guide",
  "warnings",
];

// 별지 5종 (channel: pdf)
const PDF_LEAVES: PrintSectionId[] = [
  "filing-form-9",
  "besshi-buppyo-2",
  "deduction-besshi",
  "unlisted-stock-besshi",
  "listed-stock-besshi",
];

describe("선택 출력 레지스트리 — Pre-Do anchor", () => {
  // PD-1: 선택 0건 → 모든 leaf print:hidden
  it("PD-1: 선택 0건이면 모든 섹션이 print:hidden (인쇄에서 제외)", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  // PD-2: 1개만 선택 → 그것만 출력, 나머지 hidden
  it("PD-2: filing-form-9만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["filing-form-9"]);
    expect(resolvePrintVisibilityClass("filing-form-9", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "filing-form-9") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  // PD-3: 트리 평탄화 = 17 leaf, 유니크, group: 접두 없음
  it("PD-3: flattenPrintSectionIds는 17개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length); // 유니크
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  // PD-4: PDF 채널 = 별지 5종 정확히
  it("PD-4: pdfEligibleIds는 별지 5종과 정확히 일치", () => {
    const ids = pdfEligibleIds();
    expect([...ids].sort()).toEqual([...PDF_LEAVES].sort());
  });

  // PD-5: 그룹 체크 상태(부모 indeterminate)
  it("PD-5: resolveGroupCheckState — all/partial/none 판정", () => {
    const forms = INHERITANCE_PRINT_SECTIONS.find((g) => g.id === "group:forms");
    expect(forms).toBeDefined();
    const formLeafIds = forms!.children.map((c) => c.id);

    // none
    expect(resolveGroupCheckState(forms!, new Set())).toBe("none");
    // partial (자식 1개만)
    expect(resolveGroupCheckState(forms!, new Set(["filing-form-9"]))).toBe("partial");
    // all (자식 전부)
    expect(resolveGroupCheckState(forms!, new Set(formLeafIds))).toBe("all");
  });

  // 트리 구조 sanity — 그룹 5개, 모든 leaf가 정확히 한 그룹에 속함
  it("트리: 그룹 5개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(INHERITANCE_PRINT_SECTIONS).toHaveLength(5);
    const seen = new Map<string, number>();
    for (const g of INHERITANCE_PRINT_SECTIONS) {
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
