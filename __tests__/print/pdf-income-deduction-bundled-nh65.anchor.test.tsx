/**
 * NH-65 — 함께 양도·다건 결과 PDF 신고서의 「소득금액 감면대상」이 0으로 찍혔다.
 *
 * PDF는 집계 어댑터(`aggregateToFilingResult`)의 결과를 받는데, 어댑터는 단건 detail(`new99Detail` 등)을 담지 않아
 * `incomeDeductionReducible(result)`(NH-53 — 단건 PDF 기준)가 항상 0이었다. 화면 신고서 표 합계는 합산 엔진 자산별 적용액
 * (`PerPropertyBreakdown.incomeDeductionReducible`)의 합을 쓴다 — PDF도 같은 합을 쓴다. 금액은 mock 세율.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);
function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") {
    try { collect((el.type as (p: unknown) => unknown)(el.props), out); } catch { /* 렌더 불가 노드 */ }
    return out;
  }
  collect((el.props ?? {}).children, out);
  return out;
}
const after = (t: string[], label: string) => { const i = t.indexOf(label); return i >= 0 ? t[i + 1] : undefined; };

const N99 = {
  type: "new_99", contractDate99: D("1999-02-01"), standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 150_000_000,
  standardPriceAtTransfer99: 300_000_000, exclusiveAreaSqm99: 84, isResident99: true, isHousingConstructionBusiness99: false, acquisitionType99: "from_builder",
};
const N993 = {
  type: "new_99_3", contractDate993: D("2002-01-01"), standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 160_000_000,
  standardPriceAtTransfer993: 250_000_000, region993: "outside_speculation", acquisitionType993: "from_builder",
};
const house = (id: string, reductions: unknown[], acq: string) => ({
  ...baseTransferInput({ propertyType: "housing", isOneHousehold: true, householdHousingCount: 2, transferPrice: 800_000_000, acquisitionPrice: 100_000_000, acquisitionDate: D(acq), transferDate: D("2024-06-01"), reductions } as never),
  propertyId: id, propertyLabel: id,
});
const land = { ...baseTransferInput({ propertyType: "land", isOneHousehold: false, householdHousingCount: 0, transferPrice: 300_000_000, acquisitionPrice: 100_000_000, acquisitionDate: D("2010-01-01"), transferDate: D("2024-06-01") } as never), propertyId: "L", propertyLabel: "L" };
const agg = (...properties: object[]) => calculateTransferTaxAggregate({ taxYear: 2024, annualBasicDeductionUsed: 0, properties } as never, makeMockRates()) as never as Parameters<typeof aggregateToFilingResult>[0];

describe("NH-65 함께 양도 PDF — 소득금액 감면대상", () => {
  it.each([
    ["§99", () => agg(house("H", [N99], "1999-06-01"), land)],
    ["§99의3", () => agg(house("H", [N993], "2002-03-01"), land)],
  ])("💰 %s — 합산 엔진 자산별 적용액 합이 찍히고 0이 아니다", (_n, mk) => {
    const a = mk();
    const applied = a.properties.reduce((s, p) => s + (p.incomeDeductionReducible ?? 0), 0);
    expect(applied).toBeGreaterThan(0);
    const t = collect(TransferSection({ r: aggregateToFilingResult(a) as unknown as Record<string, unknown> }));
    expect(after(t, "소득금액 감면대상")).toBe(applied.toLocaleString());
  });
});
