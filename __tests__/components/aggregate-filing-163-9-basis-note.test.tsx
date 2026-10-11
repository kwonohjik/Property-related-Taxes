/**
 * #11 합산(다건·함께 양도) 신고서·PDF — 영 §163⑨ 단서 채택 각주 (2026-10-11).
 *
 * 단건 신고서(split 열)·계산명세서는 「취득가액 = 많은 금액(평가액, 영 §164④ 가액)」 각주를 붙이는데, 합산 신고서와 합산 PDF만 없어
 * 취득가액 칸이 평가액이 아닌 채택값인데 그 이유가 보이지 않았다. 지금: 같은 leaf(`splitAcqBasisView`·`splitAcqBasisFormula`)·같은 문구.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTaxAggregate, type AggregateTransferInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);
/** 토지 1988 상속(§163⑨ 단서 1호) — 평가액 3억 < 영 §164④ 가액 4억 → 4억 채택. */
const input = (o: Partial<TransferTaxInput> = {}): TransferTaxInput => baseTransferInput({
  propertyType: "housing", transferPrice: 1_200_000_000, transferDate: D("2026-06-30"), acquisitionDate: D("2018-03-02"),
  acquisitionCause: "purchase", isOneHousehold: false, householdHousingCount: 2, isSeparateAcquisition: true,
  landAcqMode: "actual", buildingAcqMode: "actual", landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000,
  landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000, landAcquisitionPrice: 300_000_000,
  buildingAcquisitionPrice: 400_000_000, landAcquisitionDate: D("1988-05-01"), landAcquisitionCause: "inheritance",
  landDecedentAcquisitionDate: D("1960-01-01"), landSec164Value: 400_000_000, ...o,
});
const FORM = { transferDate: "2026-06-30", contractTotalPrice: "1200000000",
  assets: [{ acquisitionDate: "2018-03-02", landAcquisitionDate: "1988-05-01", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;
function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}
const NOTE = "토지 취득가액 = 많은 금액(상속개시일 평가액 300,000,000, 영 §164④ 가액 400,000,000) = 400,000,000 (소득세법 시행령 §163조 제9항 단서 1호)";
const run = (o: Partial<TransferTaxInput> = {}) =>
  calculateTransferTaxAggregate(
    { taxYear: 2026, properties: [{ ...input(o), propertyId: "primary", propertyLabel: "건1" }], annualBasicDeductionUsed: 0 } as unknown as AggregateTransferInput,
    makeMockRates(),
  );
const acqRowOf = (agg: ReturnType<typeof run>) => {
  const fr = aggregateToFilingResult(agg);
  const meta = { properties: agg.properties, aggregated: agg };
  const rows = buildRows(fr, deriveColumns(fr, meta).mode, FORM, undefined, 1_200_000_000, undefined, undefined, meta);
  return (rows as unknown as Array<{ key?: string; label?: string; notes?: Record<string, string> }>).find((r) => r.label === "취득가액");
};

describe("#11 합산 신고서·PDF — §163⑨ 단서 채택 각주", () => {
  it("합산 신고서 취득가액 행에 자산 열 각주가 붙는다(단건과 같은 문구)", () => {
    const agg = run();
    expect(agg.properties[0].splitDetail!.land.acquisitionBasis!.adopted).toBe("sec164");
    const row = acqRowOf(agg);
    expect(Object.values(row?.notes ?? {})).toContain(NOTE);
  });
  it("합산 PDF 자산별 표에도 같은 각주", () => {
    const t = collect(TransferMultiSection({ r: run() as unknown as Record<string, unknown> }));
    expect(t.some((x) => x.includes(NOTE))).toBe(true);
  });
  it("부정형 짝 — 단서 구간 밖(2015 상속)은 각주 없음", () => {
    const row = acqRowOf(run({ landAcquisitionDate: D("2015-05-01"), landSec164Value: undefined }));
    expect(row?.notes).toBeUndefined();
  });
});
