/**
 * 종부세 PDF 주택분 계산표 — 기본공제가 0이면 «- 0»이 아니라 «0».
 * 법인 §9②3호(`corporate_special`)는 기본공제 0원(종부세법 §8①2호)이라 법인 기본 유형(일반법인)에서 도달한다.
 * 양도세 PDF 행(#3341)과 같은 `> 0 ? "- 값" : "0"` 가드. 표시 전용 — 과세표준·세액 불변.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateComprehensiveTax } from "@/lib/tax-engine/comprehensive-tax";
import { ResultPdfDocument } from "@/lib/pdf/ResultPdfDocument";

type L = Record<string, unknown>;
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
/** 라벨 바로 뒤 값 — 부호 문자열(`- `)이 값 앞에 따로 붙으면 이어 읽는다. */
function rowValue(t: string[], label: string): string | undefined {
  const i = t.indexOf(label);
  if (i < 0) return undefined;
  return t[i + 1] === "- " ? `- ${t[i + 2]}` : t[i + 1];
}
const props = (v: number) => [{ propertyId: "p1", assessedValue: v, exclusionType: "none" as const }];
const render = (input: object) => {
  const r = calculateComprehensiveTax(input as never) as unknown as L;
  return { r, t: collect(ResultPdfDocument({ taxType: "comprehensive_property", taxTypeLabel: "종부세", createdAt: "2026-11-14", resultData: r })) };
};

describe("종부세 PDF 기본공제 행 — 0 표기", () => {
  it("CBD-1 법인 일반법인(기본공제 0원) → «0» (- 0 아님)", () => {
    const { r, t } = render({ assessmentYear: 2024, taxpayerType: "corporate", corporateHousingType: "general_corp", isOneHouseOwner: false, properties: props(2_000_000_000) });
    expect(r.basicDeduction).toBe(0);
    expect(rowValue(t, "기본공제")).toBe("0");
  });
  it("CBD-2 대조: 개인 일반은 «- 900,000,000»", () => {
    const { r, t } = render({ assessmentYear: 2024, isOneHouseOwner: false, properties: props(2_000_000_000) });
    expect(r.basicDeduction).toBe(900_000_000);
    expect(rowValue(t, "기본공제")).toBe("- 900,000,000");
  });
});
