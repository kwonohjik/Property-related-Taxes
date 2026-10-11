/**
 * #9 다건 PDF 자산별 표 — 필요경비 행 (2026-10-11).
 *
 * 종전: 양도가액·취득가액·전체 양도차익을 그리면서 필요경비만 빠져 「양도가액 − 취득가액 ≠ 양도차익」이었다.
 * 지금: 엔진 자산별 표시 echo(`PerPropertyBreakdown.necessaryExpense`)를 취득가액 다음 행에 싣는다 — 실 집계 결과로 항등식 확인.
 * 단건 PDF는 엔진 결과에 양도가액·취득가액이 없어(행이 그려지지 않는다) 대상이 아니다.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import { calculateTransferTaxAggregate, type TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}
const item = (id: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput =>
  ({ ...(baseTransferInput() as unknown as TransferTaxItemInput), propertyId: id, propertyLabel: id, propertyType: "land",
    acquisitionDate: new Date("2015-06-01"), transferDate: new Date("2026-06-01"), isOneHousehold: false, householdHousingCount: 0, ...o });

describe("#9 다건 PDF 필요경비 행", () => {
  const agg = calculateTransferTaxAggregate({
    taxYear: 2026, annualBasicDeductionUsed: 0,
    properties: [
      item("실가", { transferPrice: 500_000_000, acquisitionPrice: 300_000_000, expenses: 50_000_000 }),
      item("환산", { transferPrice: 600_000_000, acquisitionPrice: 0, useEstimatedAcquisition: true, standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 400_000_000 }),
    ],
  }, makeMockRates());

  it("전제: 집계 자산별 echo는 양도가액 − 취득가액 − 필요경비 = 양도차익", () => {
    for (const p of agg.properties) {
      expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
    }
  });

  it("자산마다 「필요경비」 행과 그 금액이 그려진다 (실가 50,000,000 · 환산 개산공제 6,000,000)", () => {
    const t = collect(TransferMultiSection({ r: agg as unknown as Record<string, unknown> }));
    expect(t.filter((x) => x === "필요경비").length).toBe(2);
    for (const p of agg.properties) expect(t).toContain(p.necessaryExpense.toLocaleString());
    expect(agg.properties.map((p) => p.necessaryExpense)).toEqual([50_000_000, 6_000_000]);
  });
});
