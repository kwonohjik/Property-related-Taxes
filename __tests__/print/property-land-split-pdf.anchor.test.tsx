/**
 * 재산세 PDF — 토지 분류별 세액표(land-split) 섹션이 계산표(computed-tax)와 독립으로 렌더되는 스모크.
 * (PropertySection이 선택 id별로 갈라지는지 — react-pdf 렌더가 던지지 않는다.)
 */
import { it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";
import { calculatePropertyTax } from "@/lib/tax-engine/property-tax";
it("land-split · computed-tax · 전체 선택 모두 PDF 렌더 성공", async () => {
  const r = calculatePropertyTax({ objectType: "land", landTaxType: "comprehensive_aggregate", publishedPrice: 300_000_000, otherComprehensiveValue: 100_000_000 } as never);
  for (const ids of [undefined, ["land-split"], ["computed-tax"]]) {
    const buf = await renderToBuffer(<ResultPdfDocument taxType="property" taxTypeLabel="재산세" createdAt="2026-11-25" resultData={r as never} selectedSectionIds={ids} />);
    expect(buf.length).toBeGreaterThan(1000);
  }
});
