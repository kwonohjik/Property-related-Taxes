/**
 * Pre-Do anchor — 계산 결과 선택 출력 (증여세, PR-B1)
 * 설계: docs/02-design/features/selective-print-6tax.ui.design.md §2.1
 *
 * ⚠️ 이 테스트는 `lib/print/gift-print-sections.ts` 구현 전에 작성됨.
 *    모듈 미구현 상태에서 RED(import 실패) → 디자인 환류 기회 확보 후 Do 진입.
 *
 * pdf 채널 (PR-B2 완료) = tax-summary(계산표) + 별지4(filing-form-10·valuation-form·주식2) = 5종.
 *   PR-B1 시점엔 tax-summary 1종, PR-B2에서 별지4 react-pdf 신규/위임 후 승격.
 *   (PR-2 거짓 선택 방지 교훈: 실제 분리 렌더 가능한 노드만 pdf 채널 부여)
 */
import { describe, it, expect } from "vitest";
import {
  GIFT_PRINT_SECTIONS,
  flattenPrintSectionIds,
  pdfEligibleIds,
  resolvePrintVisibilityClass,
  resolveGroupCheckState,
  selectPdfSections,
  type GiftPrintSectionId,
} from "@/lib/print/gift-print-sections";

// 설계 §2.1 기준 leaf 18종 (부동산 부담부증여 + 주식 부담부증여 + 비교 + 동시증여 포함)
const ALL_LEAVES: GiftPrintSectionId[] = [
  "core-result",
  "tax-summary",
  "gen-skip-surcharge",
  "tax-credit",
  "donor-paid-grossup",
  "farmland-reduction",
  "prior-gift",
  "filing-form-10",
  "simultaneous-filing-10",
  "valuation-form",
  "building-std-report",
  "unlisted-stock-besshi",
  "unlisted-stock-simple",
  "listed-stock-besshi",
  "installment",
  "split-payment",
  "warnings",
  "burdened-transfer-tax",
  "burdened-stock-transfer-tax",
  "burdened-gift-comparison",
  "aggregation-excluded",
];

// PDF 채널 (PR-B2): tax-summary(계산표) + 별지4(별지10호·부표1·주식2) = 5종.
const PDF_LEAVES: GiftPrintSectionId[] = [
  "tax-summary",
  "filing-form-10",
  "valuation-form",
  "building-std-report",
  "unlisted-stock-besshi",
  "listed-stock-besshi",
];

describe("증여세 선택 출력 레지스트리 — Pre-Do anchor (PR-B1)", () => {
  // PD-gift-1: 선택 0건 → 모든 leaf print:hidden
  it("PD-gift-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    const selected = new Set<string>();
    for (const id of ALL_LEAVES) {
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  // PD-gift-2: 1개만 선택 → 그것만 출력, 나머지 hidden
  it("PD-gift-2: filing-form-10만 선택하면 그것만 출력, 나머지는 print:hidden", () => {
    const selected = new Set<string>(["filing-form-10"]);
    expect(resolvePrintVisibilityClass("filing-form-10", selected)).toBe("");
    for (const id of ALL_LEAVES) {
      if (id === "filing-form-10") continue;
      expect(resolvePrintVisibilityClass(id, selected)).toBe("print:hidden");
    }
  });

  // PD-gift-3: 트리 평탄화 = 18 leaf, 유니크, group: 접두 없음 (simultaneous-filing-10 추가)
  it("PD-gift-3: flattenPrintSectionIds는 21개 유니크 leaf, group: 접두 없음", () => {
    const ids = flattenPrintSectionIds();
    expect(ids).toHaveLength(ALL_LEAVES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    for (const id of ids) {
      expect(id.startsWith("group:")).toBe(false);
    }
  });

  // PD-gift-4: PDF 채널 5종 (PR-B2 완료) — tax-summary + 별지4.
  it("PD-gift-4: pdfEligibleIds는 pdf 채널 5종 (PR-B2)", () => {
    const ids = pdfEligibleIds();
    expect([...ids].sort()).toEqual([...PDF_LEAVES].sort());
  });

  // PD-gift-5: 그룹 체크 상태(부모 indeterminate)
  it("PD-gift-5: resolveGroupCheckState — all/partial/none 판정", () => {
    const summary = GIFT_PRINT_SECTIONS.find((g) => g.id === "group:summary");
    expect(summary).toBeDefined();
    const leafIds = summary!.children.map((c) => c.id);

    expect(resolveGroupCheckState(summary!, new Set())).toBe("none");
    expect(resolveGroupCheckState(summary!, new Set(["tax-summary"]))).toBe("partial");
    expect(resolveGroupCheckState(summary!, new Set(leafIds))).toBe("all");
  });

  // PD-gift-6: 서버 PDF 선택 변환 (선택 ∩ pdf 채널 ∩ 가용) — PR-B2
  it("PD-gift-6: selectPdfSections — pdf 채널(tax-summary·별지4)만, screen 노드·미가용 제외", () => {
    const available = new Set<GiftPrintSectionId>([
      "tax-summary",
      "core-result",
      "filing-form-10",
    ]);
    // screen 전용(core-result)만 제외, tax-summary·filing-form-10(pdf)은 포함
    expect(
      selectPdfSections(
        new Set(["core-result", "filing-form-10", "tax-summary"]),
        available
      ).sort()
    ).toEqual(["filing-form-10", "tax-summary"]);
    // pdf 채널 미선택(core-result만) → PDF 0건
    expect(
      selectPdfSections(new Set(["core-result"]), available)
    ).toEqual([]);
    // pdf 채널 미가용 → 제외 (tax-summary 선택했으나 available에 없음)
    expect(
      selectPdfSections(new Set(["tax-summary"]), new Set(["core-result"]))
    ).toEqual([]);
    // 선택 0건
    expect(selectPdfSections(new Set(), available)).toEqual([]);
  });

  // 트리 구조 sanity — 그룹 5개, 모든 leaf가 정확히 한 그룹에 속함
  it("트리: 그룹 5개 + 모든 leaf가 정확히 한 그룹에 1회 등장", () => {
    expect(GIFT_PRINT_SECTIONS).toHaveLength(5);
    const seen = new Map<string, number>();
    for (const g of GIFT_PRINT_SECTIONS) {
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
