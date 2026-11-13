/**
 * 다건 PDF 「합산 신고서 양식」 — 비과세 × 양도차손일 때 «총 양도차익 · 비과세 양도차익 · 과세대상 양도차익»이 화면 요약 카드와 같다.
 * 계획서 `docs/00-pm/exempt-loss-pdf-multi-measure.plan.md` Q-1 a (#3337 후속).
 *
 * 종전: PDF가 `aggGains.exempt > 0`일 때만 세 줄을 냈다. #3337이 비과세 gross의 0 바닥을 걷어 비과세 양도차익이 음수가 되자
 * 손실 자산이 낀 다건은 else 가지(`r.totalTransferGain`)로 빠져 «총 양도차익 200,000,000» 한 줄만 찍었다 — 화면 요약 카드는
 * «양도차익 0 · 비과세 양도차익 200,000,000 · 과세대상 200,000,000». 세액·양도소득금액은 불변(표시 전용).
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import { sumAssetGains } from "@/components/calc/results/transfer/exempt-gross-gain";
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
/** 라벨 바로 뒤 값 — 비과세 행은 부호 문자열(`- `)이 값 앞에 따로 붙으므로 그 경우 둘을 이어 읽는다. */
function rowValue(t: string[], label: string): string | undefined {
  const i = t.indexOf(label);
  if (i < 0) return undefined;
  return t[i + 1] === "- " ? `- ${t[i + 2]}` : t[i + 1];
}
const base = (id: string, over: L) => ({ ...baseTransferInput({ isOneHousehold: false, householdHousingCount: 0, ...over }), propertyId: id, propertyLabel: id });
const LAND = () => base("L", { propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 100_000_000, acquisitionDate: new Date("2015-01-01"), transferDate: new Date("2023-05-01") });
const house = (id: string, transferPrice: number, acquisitionPrice: number) => base(id, { propertyType: "housing", isOneHousehold: true, householdHousingCount: 1, transferPrice, acquisitionPrice, acquisitionDate: new Date("2015-01-01"), transferDate: new Date("2023-05-01"), residencePeriodMonths: 96 });
const agg = (...properties: object[]) => calculateTransferTaxAggregate({ taxYear: 2023, annualBasicDeductionUsed: 0, properties } as never, makeMockRates()) as unknown as L;
const pdf = (a: L) => collect(TransferMultiSection({ r: a }));
const won = (n: number) => n.toLocaleString();

describe("다건 PDF 합산 양식 — 비과세 × 양도차손", () => {
  it("PL-1 🔑 토지 + 비과세 손실 주택 → 총 양도차익 0 · 비과세 200,000,000 · 과세대상 200,000,000 (종전: 총 양도차익 200,000,000 한 줄)", () => {
    const a = agg(LAND(), house("H", 500_000_000, 700_000_000));
    const sg = sumAssetGains(a.properties);
    expect(sg).toEqual({ gross: 0, exempt: -200_000_000, taxable: 200_000_000 });
    const t = pdf(a);
    expect(rowValue(t, "총 양도차익")).toBe("0");
    expect(rowValue(t, "비과세 양도차익")).toBe(won(200_000_000)); // 화면 카드와 같이 부호를 뒤집어 찍는다(총 0 − (−200,000,000) = 200,000,000)
    expect(rowValue(t, "과세대상 양도차익")).toBe(won(200_000_000));
    expect(rowValue(t, "통산 후 양도소득금액")).toBe(won(168_000_000)); // 불변
    expect(rowValue(t, "결정세액")).toBe(won(42_950_000)); // 불변
  });

  it("PL-2 짝 — 비과세 × 양(+) 차익은 종전 표기 그대로 «- N»", () => {
    const a = agg(LAND(), house("H", 500_000_000, 300_000_000));
    const sg = sumAssetGains(a.properties);
    expect(sg).toEqual({ gross: 400_000_000, exempt: 200_000_000, taxable: 200_000_000 });
    const t = pdf(a);
    expect(rowValue(t, "총 양도차익")).toBe(won(400_000_000));
    expect(rowValue(t, "비과세 양도차익")).toBe(`- ${won(200_000_000)}`);
    expect(rowValue(t, "과세대상 양도차익")).toBe(won(200_000_000));
  });

  it("PL-3 혼합 — 비과세 손실(−200,000,000) + 비과세 양(+)(+200,000,000) + 토지 → 비과세 순합 0이라 화면 카드처럼 한 줄 «총 양도차익 200,000,000»", () => {
    const a = agg(LAND(), house("H1", 500_000_000, 700_000_000), house("H2", 600_000_000, 400_000_000));
    const sg = sumAssetGains(a.properties);
    expect(sg).toEqual({ gross: 200_000_000, exempt: 0, taxable: 200_000_000 });
    const t = pdf(a);
    expect(rowValue(t, "총 양도차익")).toBe(won(200_000_000));
    expect(t).not.toContain("비과세 양도차익");
  });

  it("PL-4 비과세 손실만 있는 다건 → 총 양도차익 −200,000,000 · 비과세 200,000,000 · 과세대상 0", () => {
    const a = agg(house("H", 500_000_000, 700_000_000), house("H2", 100_000_000, 100_000_000));
    const sg = sumAssetGains(a.properties);
    const t = pdf(a);
    expect(sg).toEqual({ gross: -200_000_000, exempt: -200_000_000, taxable: 0 });
    expect(rowValue(t, "총 양도차익")).toBe(`-${won(200_000_000)}`);
    expect(rowValue(t, "비과세 양도차익")).toBe(won(200_000_000));
    expect(rowValue(t, "과세대상 양도차익")).toBe("0");
  });

  it("PL-5 과세 자산만(비과세 없음) → 종전 한 줄 «총 양도차익» 그대로, 비과세·과세대상 행 없음", () => {
    const a = agg(LAND());
    const t = pdf(a);
    expect(rowValue(t, "총 양도차익")).toBe(won(200_000_000));
    expect(t).not.toContain("비과세 양도차익");
    expect(t).not.toContain("과세대상 양도차익");
  });
});
