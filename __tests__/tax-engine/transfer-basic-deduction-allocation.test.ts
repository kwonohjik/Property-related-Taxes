/**
 * 다건 양도세 기본공제 배분 전략 3종 — 서로 다른 결과 검증.
 *
 * FIRST(입력 순서 우선) vs EARLIEST_TRANSFER(양도일 빠른 순)는 UI에서 별개 옵션이므로
 * 입력 순서 ≠ 양도일 순인 케이스에서 배분 결과가 달라야 한다. (allocateBasicDeduction)
 */
import { describe, it, expect } from "vitest";
import { allocateBasicDeduction } from "@/lib/tax-engine/transfer-tax-aggregate-helpers";

// idx 0 = 입력 첫 번째(양도일 늦음), idx 1 = 입력 두 번째(양도일 이름). 둘 다 progressive·동일 세율.
const eligible = [
  { idx: 0, rateGroup: "progressive" as const, income: 100_000_000, transferDate: new Date("2026-05-01"), rate: 0.35 },
  { idx: 1, rateGroup: "progressive" as const, income: 100_000_000, transferDate: new Date("2026-02-01"), rate: 0.35 },
];
const AVAILABLE = 2_500_000;

describe("allocateBasicDeduction — 3 전략 구분", () => {
  it("FIRST: 입력 첫 번째 자산(idx 0)에 배분", () => {
    const r = allocateBasicDeduction(eligible, AVAILABLE, "FIRST");
    expect(r).toEqual([{ idx: 0, amount: AVAILABLE }]);
  });

  it("EARLIEST_TRANSFER: 양도일 이른 자산(idx 1)에 배분", () => {
    const r = allocateBasicDeduction(eligible, AVAILABLE, "EARLIEST_TRANSFER");
    expect(r).toEqual([{ idx: 1, amount: AVAILABLE }]);
  });

  it("FIRST ≠ EARLIEST_TRANSFER (입력순서≠양도일순일 때)", () => {
    const first = allocateBasicDeduction(eligible, AVAILABLE, "FIRST");
    const earliest = allocateBasicDeduction(eligible, AVAILABLE, "EARLIEST_TRANSFER");
    expect(first[0].idx).not.toBe(earliest[0].idx);
  });

  it("MAX_BENEFIT: 세율 높은 자산 우선(동일 세율이면 income)", () => {
    const mixed = [
      { idx: 0, rateGroup: "progressive" as const, income: 50_000_000, transferDate: new Date("2026-01-01"), rate: 0.24 },
      { idx: 1, rateGroup: "short_term" as const, income: 50_000_000, transferDate: new Date("2026-06-01"), rate: 0.5 },
    ];
    const r = allocateBasicDeduction(mixed, AVAILABLE, "MAX_BENEFIT");
    expect(r).toEqual([{ idx: 1, amount: AVAILABLE }]); // short_term(중과) 우선
  });
});
