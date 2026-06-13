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
  selectPdfSections,
  type PrintSectionId,
} from "@/lib/print/inheritance-print-sections";

// 설계 §1·§2 기준 leaf 19종 (§74 징수유예 + 비과세 내역 exemption-detail 추가. 부표3·별지5·별지1은 화면 단일 카드 → deduction-besshi 1 leaf 통합)
const ALL_LEAVES: PrintSectionId[] = [
  "tax-summary",
  "exemption-detail",
  "cultural-heritage-deferral",
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
  "unlisted-stock-simple",
  "listed-stock-besshi",
  "installment-guide",
  "split-payment",
  "payment-in-kind",
  "warnings",
];

// PDF 채널: 현존 PDF 표현 노드(요약·상속인별) + 별지 5종 통합(PR-3a/3b).
const PDF_LEAVES: PrintSectionId[] = [
  "tax-summary",
  "heir-allocation-summary",
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

  // PD-3: 트리 평탄화 = 19 leaf, 유니크, group: 접두 없음
  it("PD-3: flattenPrintSectionIds는 19개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length); // 유니크
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  // PD-4: PDF 채널 = 현존 PDF 표현 가능 노드(요약·상속인별 집계)
  it("PD-4: pdfEligibleIds는 PDF 채널 노드와 정확히 일치 (PR-2)", () => {
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

  // PD-6: 서버 PDF 선택 변환 (선택 ∩ pdf 채널 ∩ 가용) — PR-2
  it("PD-6: selectPdfSections — pdf 채널 노드만, 비채널·미가용 제외", () => {
    const available = new Set<PrintSectionId>([
      "tax-summary",
      "heir-allocation-summary",
      "filing-form-9",
      "source-data",
    ]);
    // 화면 전용 노드(source-data) 선택은 PDF에서 제외, pdf 채널(filing-form-9·tax-summary)은 포함
    expect(
      selectPdfSections(
        new Set(["source-data", "filing-form-9", "tax-summary"]),
        available
      ).sort()
    ).toEqual(["filing-form-9", "tax-summary"]);
    // pdf 채널 둘 다 선택
    expect(
      selectPdfSections(
        new Set(["tax-summary", "heir-allocation-summary"]),
        available
      ).sort()
    ).toEqual(["heir-allocation-summary", "tax-summary"]);
    // 미가용은 제외
    expect(
      selectPdfSections(new Set(["heir-allocation-summary"]), new Set(["tax-summary"]))
    ).toEqual([]);
    // 선택 0건
    expect(selectPdfSections(new Set(), available)).toEqual([]);
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
