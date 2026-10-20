/**
 * AI 호출 1회 비용 추정 — 토큰 종류별 정가(100만 토큰당 달러) 곱의 합.
 */
import { describe, it, expect } from "vitest";
import { estimateUsageCostUsd } from "@/lib/one-house-ai/usage-cost";

const M = 1_000_000;

describe("estimateUsageCostUsd", () => {
  it("Opus 5.5 — 입력 4 · 출력 20 · 캐시 읽기 0.2 · 캐시 쓰기(1시간) 8달러", () => {
    const one = (k: "input" | "output" | "cacheRead" | "cacheWrite") =>
      estimateUsageCostUsd("claude-opus-5-5", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [k]: M });
    expect([one("input"), one("output"), one("cacheRead"), one("cacheWrite")]).toEqual([4, 20, 0.2, 8]);
  });

  it("종류별 금액을 더한다", () => {
    // 0.008 + 0.006 + 0.016 + 0.08
    const cost = estimateUsageCostUsd("claude-opus-5-5", { input: 2000, cacheRead: 30000, cacheWrite: 2000, output: 4000 });
    expect(cost).toBeCloseTo(0.11, 10);
  });

  it("단가표에 없는 모델은 금액을 내지 않는다", () => {
    expect(estimateUsageCostUsd("claude-other", { input: M, cacheRead: 0, cacheWrite: 0, output: M })).toBeNull();
  });
});
