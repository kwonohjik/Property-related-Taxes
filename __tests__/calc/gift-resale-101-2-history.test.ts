/**
 * §101② 이력 후보 선별(P4) — 순수 함수. resultData 형태 5종 · determinedTax 이상값 · 정렬.
 */
import { describe, it, expect } from "vitest";
import { buildGiftResaleCandidates, extractGiftResaleDeterminedTax } from "@/lib/calc/gift-resale-101-2-history";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(over: Partial<CalculationRecord> & { id?: string }): CalculationRecord {
  return {
    id: "r1",
    userId: "u1",
    taxType: "transfer",
    title: "양도세 — 서울",
    inputData: {},
    resultData: {},
    taxLawVersion: "2026-01-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as CalculationRecord;
}

const single = (determinedTax: unknown) => ({ mode: "single", result: { determinedTax, penaltyTax: 7 } });

describe("extractGiftResaleDeterminedTax", () => {
  it("단건 + 정수 결정세액 → ok (가산세는 더하지 않는다)", () => {
    expect(extractGiftResaleDeterminedTax(rec({ resultData: single(42_555_000) }))).toEqual({ ok: true, determinedTax: 42_555_000 });
  });

  it("결정세액 0도 후보다(0 이상)", () => {
    expect(extractGiftResaleDeterminedTax(rec({ resultData: single(0) }))).toEqual({ ok: true, determinedTax: 0 });
  });

  it("일괄양도 → bundled", () => {
    const r = rec({ resultData: { mode: "bundled", aggregated: { determinedTax: 100 }, apportionment: {} } });
    expect(extractGiftResaleDeterminedTax(r)).toEqual({ ok: false, reason: "bundled" });
  });

  it("겸용주택 → mixed_use", () => {
    expect(extractGiftResaleDeterminedTax(rec({ resultData: { mode: "mixed-use", result: {} } }))).toEqual({ ok: false, reason: "mixed_use" });
  });

  it("다건(mode 없이 AggregateTransferResult 직접 저장) → multi", () => {
    const r = rec({ resultData: { groupTaxes: [], calculatedTaxByGroups: 1, determinedTax: 5 } });
    expect(extractGiftResaleDeterminedTax(r)).toEqual({ ok: false, reason: "multi" });
  });

  it("양도세가 아닌 세목 → not_transfer", () => {
    expect(extractGiftResaleDeterminedTax(rec({ taxType: "gift", resultData: single(1) }))).toEqual({ ok: false, reason: "not_transfer" });
  });

  it.each([
    ["음수", single(-1)],
    ["소수", single(1000.5)],
    ["문자열", single("1000")],
    ["NaN", single(Number.NaN)],
    ["누락", { mode: "single", result: { penaltyTax: 0 } }],
    ["result 누락", { mode: "single" }],
    ["result null", { mode: "single", result: null }],
    ["알 수 없는 형태", { foo: 1 }],
    ["빈 객체", {}],
  ])("단건이어도 결정세액 %s → no_determined_tax", (_label, resultData) => {
    expect(extractGiftResaleDeterminedTax(rec({ resultData: resultData as Record<string, unknown> }))).toEqual({
      ok: false,
      reason: "no_determined_tax",
    });
  });
});

describe("buildGiftResaleCandidates", () => {
  it("ok인 것만 모으고 createdAt 최신순으로 정렬한다", () => {
    const records = [
      rec({ id: "old", createdAt: "2026-01-01T00:00:00.000Z", resultData: single(1) }),
      rec({ id: "bundled", createdAt: "2026-05-01T00:00:00.000Z", resultData: { mode: "bundled", aggregated: {} } }),
      rec({ id: "new", createdAt: "2026-03-01T00:00:00.000Z", resultData: single(3) }),
      rec({ id: "neg", createdAt: "2026-04-01T00:00:00.000Z", resultData: single(-5) }),
      rec({ id: "gift", createdAt: "2026-06-01T00:00:00.000Z", taxType: "gift", resultData: single(9) }),
      rec({ id: "mid", createdAt: "2026-02-01T00:00:00.000Z", resultData: single(2) }),
    ];
    const out = buildGiftResaleCandidates(records);
    expect(out.map((c) => c.record.id)).toEqual(["new", "mid", "old"]);
    expect(out.map((c) => c.determinedTax)).toEqual([3, 2, 1]);
  });

  it("빈 이력 → 빈 배열", () => {
    expect(buildGiftResaleCandidates([])).toEqual([]);
  });
});
