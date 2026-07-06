/**
 * 다건 양도세 기납부세액 — 신고일 비교 필터 (§111③).
 *
 * 계획서: docs/02-design/features/multi-transfer-prior-paid-filing-date-logic.plan.md
 *
 * computeAutoPriorPaid = 가장 늦은 신고일(확정신고분)보다 신고일이 빠른 자산들의
 *   standalone 예정신고 세액(국세·지방) 합. 기신고 양도소득금액(§103)과 동일한 필터.
 */
import { describe, it, expect } from "vitest";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { selectPriorFiledIndices, computeAutoPriorPaid } from "@/lib/calc/multi-prior-filed";

function prop(
  filingDate: string,
  national: number,
  local: number,
  over: Partial<PropertyItem["form"]> = {},
): PropertyItem {
  return {
    propertyId: `p-${filingDate}-${national}`,
    propertyLabel: "건",
    completionPercent: 100,
    priorPaidNational: national,
    priorPaidLocal: local,
    form: { filingDate, ...over } as PropertyItem["form"],
  };
}

describe("selectPriorFiledIndices — 신고일 필터", () => {
  it("가장 늦은 신고일보다 빠른 인덱스만(strict <)", () => {
    expect(selectPriorFiledIndices(["2026-02-15", "2026-04-20"])).toEqual([0]);
    expect(selectPriorFiledIndices(["2026-04-20", "2026-02-15"])).toEqual([1]);
  });
  it("A2(P3): 신고일 전부 동일 → 빈 배열(정산 대상 없음)", () => {
    expect(selectPriorFiledIndices(["2026-03-01", "2026-03-01"])).toEqual([]);
  });
  it("P9: 단건 1건 → 빈 배열(그 1건이 확정신고분)", () => {
    expect(selectPriorFiledIndices(["2026-03-01"])).toEqual([]);
  });
  it("빈 신고일은 maxFilingDate 산정·대상에서 제외", () => {
    expect(selectPriorFiledIndices(["", "2026-04-20"])).toEqual([]);
    expect(selectPriorFiledIndices(["2026-02-15", "", "2026-04-20"])).toEqual([0]);
  });
});

describe("computeAutoPriorPaid — 신고일 빠른 자산 예정세액 합", () => {
  it("A1(P1): A(빠름)·B(늦음) → A의 국세·지방만", () => {
    const r = computeAutoPriorPaid([
      prop("2026-02-15", 93_128_478, 9_312_847),
      prop("2026-04-20", 45_872_234, 4_587_223),
    ]);
    expect(r).toEqual({ national: 93_128_478, local: 9_312_847 });
  });
  it("P2: A·B(빠름) + C(가장 늦음) → A+B 합", () => {
    const r = computeAutoPriorPaid([
      prop("2026-01-10", 10_000_000, 1_000_000),
      prop("2026-02-20", 20_000_000, 2_000_000),
      prop("2026-05-31", 99_999_999, 9_999_999),
    ]);
    expect(r).toEqual({ national: 30_000_000, local: 3_000_000 });
  });
  it("A2(P3): 신고일 동일 → 0", () => {
    const r = computeAutoPriorPaid([
      prop("2026-03-01", 10_000_000, 1_000_000),
      prop("2026-03-01", 20_000_000, 2_000_000),
    ]);
    expect(r).toEqual({ national: 0, local: 0 });
  });
  it("P9: 단건 1건 → 0", () => {
    expect(computeAutoPriorPaid([prop("2026-03-01", 12_340_000, 1_234_000)])).toEqual({
      national: 0,
      local: 0,
    });
  });
  it("P6: priorPaidNational 미보유(수동 추가) 자산은 0 기여", () => {
    const manual = prop("2026-01-10", 0, 0);
    delete manual.priorPaidNational;
    delete manual.priorPaidLocal;
    const r = computeAutoPriorPaid([manual, prop("2026-05-31", 50_000_000, 5_000_000)]);
    expect(r).toEqual({ national: 0, local: 0 });
  });
  it("statutoryFilingDeadline fallback(filingDate 미입력)", () => {
    const r = computeAutoPriorPaid([
      prop("", 7_000_000, 700_000, { statutoryFilingDeadline: "2026-02-28" }),
      prop("2026-05-31", 50_000_000, 5_000_000),
    ]);
    expect(r).toEqual({ national: 7_000_000, local: 700_000 });
  });
});
