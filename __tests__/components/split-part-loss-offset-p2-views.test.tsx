/**
 * 파트 양도차손 통산 P2 — 표시(계획서 `transfer-split-part-loss-offset-p2.plan.md` Q-3 「파트를 밝혀 표시」).
 *
 * 다건에서 이익 자산 a가 자기 건물 차손 9,000,000을 다른 자산 b에 주면(영 §167의2①1호 — 같은 세율 먼저) a의 통산 후 소득(470,000,000)이
 * 통산 전 자산 소득(461,000,000 = 토지 + 건물 차손)보다 커진다. 4뷰가 「통산 후 = 통산 전 − 받은 차손」만 전제하면 금액 흐름이 끊긴다.
 * 입력은 엔진 결과를 그대로 먹인다(시드·세액은 엔진 anchor `split-part-loss-offset-p2.anchor.test.ts` M-1과 같다).
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildIncomeFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import { lossOffsetGiverText } from "@/lib/tax-engine/transfer-tax-split-display";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const item = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const rebuild = baseTransferInput({
  propertyType: "housing", transferPrice: 1_000_000_000, transferDate: D("2025-09-01"), acquisitionPrice: 450_000_000, acquisitionCause: "purchase",
  acquisitionDate: D("2025-01-01"), isOneHousehold: false, householdHousingCount: 2, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "estimated",
  landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 300_000_000,
  landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 250_000_000, landAcquisitionDate: D("2022-01-01"),
  standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 200, standardPriceAtAcquisition: 500_000_000, buildingStandardPriceAtAcquisition: 300_000_000,
  landRebuildPriorHouse: { startMode: "since_land", footprintUnchanged: true, demolitionDate: D("2023-05-31") },
} as Partial<TransferTaxInput>);
const shortHouse = baseTransferInput({
  propertyType: "housing", transferPrice: 600_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("2025-03-01"), transferDate: D("2025-09-01"),
  isOneHousehold: false, householdHousingCount: 2, expenses: 0,
} as Partial<TransferTaxInput>);
const agg = calculateTransferTaxAggregate({ taxYear: 2025, properties: [item(rebuild, "a"), item(shortHouse, "b")], annualBasicDeductionUsed: 0 }, makeMockRates());
const [a, b] = agg.properties;

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}

describe("Q-3 파트를 밝혀 표시", () => {
  it("전제: 통산 표 [a 건물] → [b] 9,000,000 · a 통산 전 461,000,000 / 후 470,000,000", () => {
    expect(agg.lossOffsetTable).toEqual([{ fromPropertyId: "a", fromPart: "building", toPropertyId: "b", amount: 9_000_000, scope: "same_group" }]);
    expect([a.income, a.incomeAfterOffset]).toEqual([461_000_000, 470_000_000]);
  });

  it("주는 쪽 이름 — 파트가 있으면 「a 건물」, 자산 한 행이면 이름만", () => {
    expect(lossOffsetGiverText("a", "building")).toBe("a 건물");
    expect(lossOffsetGiverText("a", "non_business_land")).toBe("a 배율 초과 토지");
    expect(lossOffsetGiverText("a", undefined)).toBe("a");
  });

  it("상세명세서 자산 산식: 이익 자산 a는 넘겨준 건물 차손을 되돌려 더한다 — 「이 차손」(차손 자산 문구)이 아니다", () => {
    const f = buildIncomeFormula(a, 9_000_000, ["building"]);
    expect(f).toContain("= 461,000,000 + 9,000,000(건물 양도차손 중 다른 자산의 양도소득금액에서 공제된 몫) = 470,000,000");
    expect(f).not.toContain("이 차손");
    // 받은 쪽 b는 종전 문구 그대로
    expect(buildIncomeFormula(b, 0)).toContain("결손금 통산 9,000,000 = 91,000,000");
  });

  it("신고서 합산표 통산 칸 = 준 몫 − 받은 몫: a +9,000,000 · b −9,000,000 · 합계 0 — 열마다 소득 + 통산 칸 = 통산 후", () => {
    const rows = buildAggregateRows({} as unknown as TransferTaxResult, { properties: agg.properties, aggregated: agg } as unknown as AggregateMeta, undefined);
    const row = rows.find((x) => x.label.startsWith("양도차손 통산"))!.values;
    expect([row.a, row.b, row.total]).toEqual([9_000_000, -9_000_000, 0]);
    for (const p of agg.properties) expect(p.income + (row[p.propertyId] as number)).toBe(p.incomeAfterOffset);
  });

  it("주고받는 자산(c의 차손 20,000,000을 받고 건물 차손 9,000,000을 줌) — 신고서 통산 칸 −11,000,000 · 산식에 둘 다", () => {
    const lossLong = baseTransferInput({
      propertyType: "housing", transferPrice: 480_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("2015-03-01"), transferDate: D("2025-09-01"),
      isOneHousehold: false, householdHousingCount: 2, expenses: 0,
    } as Partial<TransferTaxInput>);
    const g = calculateTransferTaxAggregate(
      { taxYear: 2025, properties: [item(rebuild, "a"), item(shortHouse, "b"), item(lossLong, "c")], annualBasicDeductionUsed: 0 },
      makeMockRates(),
    );
    const rows = buildAggregateRows({} as unknown as TransferTaxResult, { properties: g.properties, aggregated: g } as unknown as AggregateMeta, undefined);
    const row = rows.find((x) => x.label.startsWith("양도차손 통산"))!.values;
    expect(row.a).toBe(-11_000_000);
    for (const p of g.properties) expect(p.income + (row[p.propertyId] as number)).toBe(p.incomeAfterOffset);
    expect(buildIncomeFormula(g.properties[0], 9_000_000, ["building"])).toContain("+ 9,000,000(건물 양도차손 중 다른 자산의 양도소득금액에서 공제된 몫) − 결손금 통산 20,000,000 = 450,000,000");
  });

  it("PDF 통산 표: [a 건물] → [b]", () => {
    const t = collect(TransferMultiSection({ r: agg as unknown as Record<string, unknown> })).join("");
    expect(t).toContain("[a 건물] → [b]");
  });
});
