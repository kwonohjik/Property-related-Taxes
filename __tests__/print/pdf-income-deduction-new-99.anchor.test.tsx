/**
 * NH-53 — 결과 PDF 신고서 양식의 「소득금액 감면대상」이 `new993Detail`만 읽어 §99(신축주택) 차감이 0으로 찍혔다.
 *
 * 화면 신고서 표(`FilingFormTableHelpers.ts` ⑳)는 소득금액차감방식 11개 조문 합(`incomeDeductionReducible`)을 쓴다.
 * PDF도 같은 헬퍼를 써야 「소득금액 감면대상」·「감면후 소득금액」이 화면과 같다. 세액(과세표준·결정세액)은 엔진 값이라 원래 같다.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { incomeDeductionReducible } from "@/components/calc/results/transfer/reduction-eligible-income";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);

/** react-pdf 트리를 순회해 텍스트를 모은다 (`display-rental-exception.ui.test.tsx`와 같은 방식). */
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

// §99 1호(주택건설사업자 분양) — 1998.6.1. 계약, 1999.1.1. 취득, 5년 이내가 아닌 양도(안분)
const R99 = {
  type: "new_99" as const, contractDate99: D("1998-06-01"), acquisitionType99: "from_builder" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 300_000_000, standardPriceAtTransfer99: 500_000_000, exclusiveAreaSqm99: 84,
};

function run() {
  const i = baseTransferInput({
    transferPrice: 800_000_000, acquisitionPrice: 100_000_000, acquisitionDate: D("1999-01-01"), transferDate: D("2021-08-01"),
    householdHousingCount: 2, residencePeriodMonths: 0, reductions: [R99],
  } as never);
  return calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
}

describe("NH-53 PDF 신고서 — §99 소득금액 감면대상", () => {
  it("§99 차감액이 PDF에 찍히고 화면 헬퍼 값과 같다", () => {
    const r = run();
    expect(r.new99Detail?.isEligible).toBe(true);
    const deduction = r.new99Detail!.reducibleTransferIncome;
    expect(deduction).toBeGreaterThan(0);
    expect(incomeDeductionReducible(r)).toBe(deduction);

    const t = collect(TransferSection({ r: r as unknown as Record<string, unknown> }));
    expect(after(t, "소득금액 감면대상")).toBe(deduction.toLocaleString());
    const income = Number(after(t, "양도소득금액")!.replace(/,/g, ""));
    expect(after(t, "감면후 소득금액")).toBe((income - deduction).toLocaleString());
  });
});
