/**
 * 겸용주택 §163⑨ 단서 자산 합계 비교 leaf (PR-6) — 후보 선택 규칙만 본다(계산은 가짜 `run`).
 * 동점이면 ① > ② > ③(Q-5) · 자산 합계(Q-15) · ①은 두 칸 다 있을 때만(Q-19) · 이긴 후보의 계산 결과를 그대로(Q-20).
 */
import { describe, it, expect } from "vitest";
import { calcMixedSec163_9Compare } from "@/lib/tax-engine/mixed-use-sec163-9-compare";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

type Pair = [number, number];
/** 후보별 (주택, 상가) 취득가액 — 가짜 run이 입력 플래그로 어느 후보 계산인지 가려 돌려준다. */
function fakeRun(c: { reported: Pair; standard: Pair; converted: Pair }) {
  const calls: string[] = [];
  const run = (a: MixedUseAssetInput): MixedUseGainBreakdown => {
    const kind = !(a.acquisitionByInheritance || a.acquisitionByGift)
      ? "converted"
      : a.housingInheritedValue !== undefined
        ? "reported"
        : "standard";
    calls.push(kind);
    if (kind !== "converted") expect(a.inheritedValuesAsIs).toBe(true);
    expect(a.sec163_9Compare).toBeUndefined();
    const [h, cm] = c[kind];
    return { housingPart: { estimatedAcquisitionPrice: h }, commercialPart: { estimatedAcquisitionPrice: cm }, tag: kind } as unknown as MixedUseGainBreakdown;
  };
  return { run, calls };
}
const base = (over: Partial<MixedUseAssetInput>) =>
  ({ housingInheritedValue: 1, commercialInheritedValue: 1, ...over }) as MixedUseAssetInput;
const tagOf = (r: MixedUseGainBreakdown) => (r as unknown as { tag: string }).tag;

describe("의제취득일 전(pre_deemed)", () => {
  const cmp = { era: "pre_deemed", cause: "inheritance" } as const;

  it("자산 합계로 고른다 — 주택은 ①이 크지만 합계는 ③이 크면 ③", () => {
    const { run } = fakeRun({ reported: [500, 100], standard: [400, 200], converted: [420, 210] });
    const r = calcMixedSec163_9Compare(base({ sec163_9Compare: cmp }), run);
    expect(tagOf(r)).toBe("converted");
    expect(r.sec163_9Comparison).toMatchObject({ selected: "converted", reported: { total: 600 }, standard: { total: 600 }, converted: { total: 630 } });
  });

  it("동점 ① = ② = ③ → ①", () => {
    const { run } = fakeRun({ reported: [300, 300], standard: [400, 200], converted: [350, 250] });
    expect(tagOf(calcMixedSec163_9Compare(base({ sec163_9Compare: cmp }), run))).toBe("reported");
  });

  it("동점 ② = ③ > ① → ②", () => {
    const { run } = fakeRun({ reported: [100, 100], standard: [400, 200], converted: [350, 250] });
    expect(tagOf(calcMixedSec163_9Compare(base({ sec163_9Compare: cmp }), run))).toBe("standard");
  });

  it("③이 1원이라도 크면 ③", () => {
    const { run } = fakeRun({ reported: [300, 300], standard: [400, 200], converted: [350, 251] });
    expect(tagOf(calcMixedSec163_9Compare(base({ sec163_9Compare: cmp }), run))).toBe("converted");
  });

  it("① 두 칸이 모두 비면 ① 후보 없음 — ①로 계산하지 않는다", () => {
    const { run, calls } = fakeRun({ reported: [9e9, 9e9], standard: [400, 200], converted: [100, 100] });
    const r = calcMixedSec163_9Compare(base({ sec163_9Compare: cmp, housingInheritedValue: undefined, commercialInheritedValue: undefined }), run);
    expect(tagOf(r)).toBe("standard");
    expect(r.sec163_9Comparison?.reported).toBeNull();
    expect(calls).not.toContain("reported");
  });

  it("🔴 ① 한 칸만 → 조용히 버리지 않고 멈춘다(⑧·⑫가 먼저 막는다)", () => {
    const { run } = fakeRun({ reported: [1, 1], standard: [1, 1], converted: [1, 1] });
    expect(() => calcMixedSec163_9Compare(base({ sec163_9Compare: cmp, commercialInheritedValue: undefined }), run)).toThrow(/모두 입력하거나 모두 비워/);
  });

  it("보유 중 용도변경 → ③만 쓰고 이유를 남긴다(①② 계산 안 함)", () => {
    const { run, calls } = fakeRun({ reported: [9e9, 9e9], standard: [9e9, 9e9], converted: [1, 1] });
    const r = calcMixedSec163_9Compare(base({ sec163_9Compare: cmp, partialUsageChange: { direction: "house_to_commercial" } as never }), run);
    expect(calls).toEqual(["converted"]);
    expect(r.sec163_9Comparison).toMatchObject({ selected: "converted", uncomparedReason: expect.stringMatching(/용도변경/) });
  });

  it("증여는 증여 플래그로 다시 계산한다", () => {
    let gift = false;
    const run = (a: MixedUseAssetInput) => {
      if (a.acquisitionByGift) gift = true;
      expect(a.acquisitionByInheritance).not.toBe(true);
      return { housingPart: { estimatedAcquisitionPrice: 1 }, commercialPart: { estimatedAcquisitionPrice: 1 } } as unknown as MixedUseGainBreakdown;
    };
    calcMixedSec163_9Compare(base({ sec163_9Compare: { era: "pre_deemed", cause: "gift" } }), run);
    expect(gift).toBe(true);
  });
});

describe("1985 이후 공시 전(clause) — ③은 비교하지 않는다", () => {
  it("③이 커도 계산하지 않는다 · ① vs ②", () => {
    const { run, calls } = fakeRun({ reported: [100, 100], standard: [400, 200], converted: [9e9, 9e9] });
    const r = calcMixedSec163_9Compare(base({ sec163_9Compare: { era: "clause", cause: "inheritance" } }), run);
    expect(calls).not.toContain("converted");
    expect(tagOf(r)).toBe("standard");
    expect(r.sec163_9Comparison?.converted).toBeNull();
  });
});

it("비교 구간이 없으면 한 번만 그대로 계산한다", () => {
  const { run, calls } = fakeRun({ reported: [1, 1], standard: [1, 1], converted: [1, 1] });
  const asset = base({ acquisitionByInheritance: true });
  const out: string[] = [];
  calcMixedSec163_9Compare(asset, (a) => (out.push("x"), run({ ...a, inheritedValuesAsIs: true })));
  expect(out).toEqual(["x"]);
  expect(calls).toHaveLength(1);
});
