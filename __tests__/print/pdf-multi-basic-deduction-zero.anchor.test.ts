/**
 * 다건 PDF 「합산 신고서 양식」 — 기본공제가 0이면 «- 0»이 아니라 «0»으로 찍는다.
 * 단건 PDF(`ResultPdfTransferSections.tsx` 단건 기본공제 행)는 이미 `> 0 ? "- 값" : "0"` 가드가 있었고, 다건 행만 빠져 있었다.
 * 표시 전용 — 세액·과세표준 불변.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
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
/** 라벨 바로 뒤 값 — 부호 문자열(`- `)이 값 앞에 따로 붙으므로 그 경우 둘을 이어 읽는다. */
function rowValue(t: string[], label: string): string | undefined {
  const i = t.indexOf(label);
  if (i < 0) return undefined;
  return t[i + 1] === "- " ? `- ${t[i + 2]}` : t[i + 1];
}
const land = (id: string, transferPrice: number, acquisitionPrice: number) =>
  ({ ...baseTransferInput({ isOneHousehold: false, householdHousingCount: 0, propertyType: "land", transferPrice, acquisitionPrice, acquisitionDate: new Date("2015-01-01"), transferDate: new Date("2023-05-01") }), propertyId: id, propertyLabel: id });
const agg = (...properties: object[]) => calculateTransferTaxAggregate({ taxYear: 2023, annualBasicDeductionUsed: 0, properties } as never, makeMockRates()) as unknown as L;
const pdf = (a: L) => collect(TransferMultiSection({ r: a }));
const LABEL = "기본공제 (§103)";

describe("다건 PDF 기본공제 행 — 0 표기", () => {
  it("BD-1 양도차손만 있어 기본공제 0이면 «0» (- 0 아님)", () => {
    const a = agg(land("L1", 100_000_000, 300_000_000));
    expect(a.basicDeduction).toBe(0);
    expect(rowValue(pdf(a), LABEL)).toBe("0");
  });
  it("BD-2 대조: 양도차익이 있어 기본공제가 있으면 «- 2,500,000»", () => {
    const a = agg(land("L1", 300_000_000, 100_000_000));
    expect(a.basicDeduction).toBe(2_500_000);
    expect(rowValue(pdf(a), LABEL)).toBe("- 2,500,000");
  });
});
