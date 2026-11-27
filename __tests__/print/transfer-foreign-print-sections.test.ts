/**
 * 계산 결과 선택 출력 — 국외 부동산 레지스트리 (U2)
 * pdf 채널 = 0종 (ResultPdfDocument에 국외 부동산 섹션 없음 — 거짓 선택 방지).
 */
import { describe, it, expect } from "vitest";
import {
  TRANSFER_FOREIGN_PRINT_SECTIONS,
  flattenTransferForeignPrintIds,
  type TransferForeignPrintSectionId,
} from "@/lib/print/transfer-foreign-print-sections";
import { pdfEligibleIds, resolvePrintVisibilityClass } from "@/lib/print/print-sections.types";

// ⚠️ union에서 파생되지 않는다 — leaf를 늘리면 여기도 늘린다. 아래 PD-fre-3이 레지스트리와의 일치를 강제한다.
const ALL_LEAVES: TransferForeignPrintSectionId[] = ["summary", "asset-gain", "tax-calc", "notices"];

describe("국외 부동산 선택 출력 레지스트리", () => {
  it("PD-fre-1: 선택 0건이면 모든 섹션이 print:hidden", () => {
    for (const id of ALL_LEAVES) expect(resolvePrintVisibilityClass(id, new Set())).toBe("print:hidden");
  });

  it("PD-fre-2: 선택한 것만 출력", () => {
    const sel = new Set<string>(["tax-calc"]);
    expect(resolvePrintVisibilityClass("tax-calc", sel)).toBe("");
    expect(resolvePrintVisibilityClass("summary", sel)).toBe("print:hidden");
  });

  it("PD-fre-3: leaf는 ALL_LEAVES와 일치하고 중복이 없으며 group: 접두가 없다", () => {
    const ids = flattenTransferForeignPrintIds();
    expect([...ids].sort()).toEqual([...ALL_LEAVES].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((i) => i.startsWith("group:"))).toBe(false);
    for (const g of TRANSFER_FOREIGN_PRINT_SECTIONS) expect(g.id.startsWith("group:")).toBe(true);
  });

  it("PD-fre-4: pdf 채널 0종 — 서버 PDF에 없는 서식을 PDF로 고르게 두지 않는다", () => {
    expect(pdfEligibleIds(TRANSFER_FOREIGN_PRINT_SECTIONS)).toEqual([]);
  });

  it("PD-fre-5: 결과 카드가 렌더하는 data-print-id 전부가 레지스트리 leaf다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/calc/results/foreign-realestate/ForeignRealEstateResultCard.tsx", "utf8");
    const used = [...src.matchAll(/<PrintSection id="([a-z-]+)"/g)].map((m) => m[1]).sort();
    expect(used).toEqual([...ALL_LEAVES].sort());
  });
});
