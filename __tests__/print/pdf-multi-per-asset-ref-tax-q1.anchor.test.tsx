/**
 * 다건 PDF 자산별 양식 — «산출세액 기여분 (참고)»·«결정세액 기여분 (참고)»가 화면과 같은 값(refCalculatedTax·refDeterminedTax)이다.
 * 계획서 docs/00-pm/multi-per-asset-display-followup.plan.md (Q-1 a).
 *
 * 종전에는 «결정세액 기여분»이 건별 `determinedTax`(단건 엔진 skipBasicDeduction 결과 — 기본공제 전)를 읽어 감면 없는 1건에서도
 * 합산 결정보다 기본공제 × 한계세율만큼 컸고(+1,000,000), «산출세액 기여분»은 `p.calculatedTax`(PerPropertyBreakdown에 없는 키)를 읽어 한 번도 뜨지 않았다.
 * 일반건물 분할 카드(토지·건물 파트)는 화면이 참고 세액을 숨기는 규칙(`gb-part-card.ts`)을 따라 두 행을 싣지 않는다.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

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

const farm = (id: string, over: Record<string, unknown>) => ({
  ...baseTransferInput({ propertyType: "land", isOneHousehold: false, householdHousingCount: 0, ...over }),
  propertyId: id,
  propertyLabel: id,
});
const agg = (...properties: object[]) => calculateTransferTaxAggregate({ taxYear: 2023, annualBasicDeductionUsed: 0, properties } as never, makeMockRates());
const pdf = (a: unknown) => collect(TransferMultiSection({ r: a as Record<string, unknown> }));

const A = () => farm("A", {
  transferPrice: 826_000_000, acquisitionPrice: 200_000_000, acquisitionDate: new Date("1995-05-24"), transferDate: new Date("2023-05-01"),
  reductions: [{ type: "self_farming", farmingYears: 30 }],
});
const B = () => farm("B", {
  transferPrice: 500_000_000, acquisitionPrice: 100_000_000, acquisitionDate: new Date("2005-02-18"), transferDate: new Date("2023-05-01"),
  reductions: [{ type: "self_farming", farmingYears: 15 }],
});
const PLAIN = () => farm("P", { transferPrice: 400_000_000, acquisitionPrice: 100_000_000, acquisitionDate: new Date("2010-01-01"), transferDate: new Date("2023-05-01") });

describe("다건 PDF 자산별 양식 — 산출/결정세액 기여분(참고) = refCalculatedTax / refDeterminedTax", () => {
  it("감면 없는 1건 — 건별 determinedTax(기본공제 전)가 아니라 refDeterminedTax", () => {
    const a = agg(PLAIN() as never);
    const p = a.properties[0];
    expect(p.determinedTax, "전제: 건별 determinedTax는 refDeterminedTax와 다르다").not.toBe(p.refDeterminedTax);
    const t = pdf(a);
    expect(allAfter(t, "산출세액 기여분 (참고)")).toEqual([p.refCalculatedTax.toLocaleString()]);
    expect(allAfter(t, "결정세액 기여분 (참고)")).toEqual([p.refDeterminedTax.toLocaleString()]);
  });

  it("자경농지 2건 — 자산마다 (산출 · 배분 감면 기준 결정)", () => {
    const a = agg(A() as never, B() as never);
    const [pa] = a.properties;
    expect(pa.refDeterminedTax).toBe(87_326_355); // #3162 관측값 (산출 148,340,000 − 배분 61,013,645)
    const t = pdf(a);
    expect(allAfter(t, "산출세액 기여분 (참고)")).toEqual(a.properties.map((p) => p.refCalculatedTax.toLocaleString()));
    expect(allAfter(t, "결정세액 기여분 (참고)")).toEqual(a.properties.map((p) => p.refDeterminedTax.toLocaleString()));
  });

  it("옛 결과(refCalculatedTax·refDeterminedTax 없음)는 두 행을 싣지 않는다 — NaN을 찍지 않는다", () => {
    const a = agg(A() as never, B() as never);
    const stale = {
      ...a,
      properties: a.properties.map((p) => {
        const q = { ...p } as Record<string, unknown>;
        delete q.refCalculatedTax;
        delete q.refDeterminedTax;
        return q;
      }),
    };
    const t = pdf(stale);
    expect(allAfter(t, "산출세액 기여분 (참고)")).toEqual([]);
    expect(allAfter(t, "결정세액 기여분 (참고)")).toEqual([]);
    expect(t.some((x) => x === "NaN")).toBe(false);
  });

  it("일반건물 분할 카드(generalBuildingDetailsByAsset에 부모 id가 있는 land#·building# 파트)는 두 행을 싣지 않는다", () => {
    const a = agg(PLAIN() as never);
    // 일반건물 분할 결과 모양을 합성한다 — 파트 id는 `<카드>#<부모 자산 id>`, 부모 id가 자산별 상세의 키다
    const part = (id: string) => ({ ...a.properties[0], propertyId: id });
    const gb = {
      ...a,
      properties: [{ ...a.properties[0], propertyId: "P" }, part("land#G"), part("building#G")],
      generalBuildingDetailsByAsset: { G: {} },
    };
    const t = pdf(gb);
    // 일반 자산 P 1건의 행만 남는다
    expect(allAfter(t, "산출세액 기여분 (참고)")).toHaveLength(1);
    expect(allAfter(t, "결정세액 기여분 (참고)")).toHaveLength(1);
  });
});
