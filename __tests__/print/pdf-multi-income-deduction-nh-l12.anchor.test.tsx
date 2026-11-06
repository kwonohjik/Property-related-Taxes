/**
 * 다건 PDF 섹션(`TransferMultiSection`) — 소득금액 감면대상·감면후 소득금액·농어촌특별세 (L12 probe → anchor).
 * 다건 자산별 행(`PerPropertyBreakdown`)에는 단건 detail(`new993Detail`)이 없고 합산 엔진 적용액(`incomeDeductionReducible`)이 있다.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
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
const allAfter = (t: string[], label: string) => t.flatMap((x, i) => (x === label ? [t[i + 1]] : []));

const N99 = {
  type: "new_99", contractDate99: D("1999-02-01"), standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 150_000_000,
  standardPriceAtTransfer99: 300_000_000, exclusiveAreaSqm99: 84, isResident99: true, isHousingConstructionBusiness99: false, acquisitionType99: "from_builder", firstContract99: "yes",
};
const N993 = {
  type: "new_99_3", contractDate993: D("2002-01-01"), standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 160_000_000,
  standardPriceAtTransfer993: 250_000_000, region993: "outside_speculation", acquisitionType993: "from_builder", firstContract993: "yes",
};
const house = (id: string, reductions: unknown[], acq: string) => ({
  ...baseTransferInput({ propertyType: "housing", isOneHousehold: true, householdHousingCount: 2, transferPrice: 800_000_000, acquisitionPrice: 100_000_000, acquisitionDate: D(acq), transferDate: D("2024-06-01"), reductions } as never),
  propertyId: id, propertyLabel: id,
});
const land = { ...baseTransferInput({ propertyType: "land", isOneHousehold: false, householdHousingCount: 0, transferPrice: 300_000_000, acquisitionPrice: 100_000_000, acquisitionDate: D("2010-01-01"), transferDate: D("2024-06-01") } as never), propertyId: "L", propertyLabel: "L" };
const agg = (...properties: object[]) => calculateTransferTaxAggregate({ taxYear: 2024, annualBasicDeductionUsed: 0, properties } as never, makeMockRates());

describe("다건 PDF — 소득금액차감 감면(§99·§99의3)", () => {
  it.each([
    ["§99", () => agg(house("H", [N99], "1999-06-01"), land)],
    ["§99의3", () => agg(house("H", [N993], "2002-03-01"), land)],
  ])("%s — 합산 신고서 양식·자산별 양식의 소득금액 감면대상·감면후 소득금액·농특세가 합산 엔진 값과 같다", (_n, mk) => {
    const a = mk();
    const applied = a.properties.reduce((s, p) => s + (p.incomeDeductionReducible ?? 0), 0);
    expect(applied).toBeGreaterThan(0);
    expect(a.ruralSurtax).toBeGreaterThan(0);
    const t = collect(TransferMultiSection({ r: a as unknown as Record<string, unknown> }));
    // 합산 양식(1번째) + 자산별 양식(자산 수만큼): 감면대상이 있는 자산은 그 자산 적용액, 없는 자산은 0
    const vals = allAfter(t, "소득금액 감면대상");
    expect(vals[0]).toBe(applied.toLocaleString());
    expect(vals.slice(1)).toEqual(a.properties.map((p) => ((p.incomeDeductionReducible ?? 0) > 0 ? p.incomeDeductionReducible!.toLocaleString() : "0")));
    // 감면후 소득금액 = 통산 후 양도소득금액 − 감면대상 (합산 양식)
    expect(allAfter(t, "감면후 소득금액")[0]).toBe(Math.max(0, a.totalIncomeAfterOffset - applied).toLocaleString());
    // 농어촌특별세 = 합산 엔진 총액 echo
    expect(allAfter(t, "농어촌특별세")[0]).toBe(a.ruralSurtax.toLocaleString());
  });
});
