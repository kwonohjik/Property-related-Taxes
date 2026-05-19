import { describe, it, expect, beforeEach } from "vitest";
import { deduplicate, __resetDedup, __getInFlightCount } from "@/lib/kiwoom/dedup";

describe("dedup — anchor", () => {
  beforeEach(() => __resetDedup());

  // K-DEDUP-01: 동일 키 동시 호출 → 1회만 fn 실행
  it("K-DEDUP-01: 동일 키 2회 동시 호출 → fn 1회만 실행 + 동일 Promise 공유", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return "result";
    };

    const [a, b] = await Promise.all([
      deduplicate("k1", fn),
      deduplicate("k1", fn),
    ]);

    expect(calls).toBe(1);
    expect(a).toBe("result");
    expect(b).toBe("result");
    expect(__getInFlightCount()).toBe(0);
  });

  // K-DEDUP-02: 다른 키 → 별도 실행
  it("K-DEDUP-02: 다른 키 → 각각 별도 실행", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return calls;
    };

    const [a, b] = await Promise.all([
      deduplicate("k1", fn),
      deduplicate("k2", fn),
    ]);

    expect(calls).toBe(2);
    expect(new Set([a, b])).toEqual(new Set([1, 2]));
  });

  // K-DEDUP-03: 완료 후 다음 호출은 새로 실행
  it("K-DEDUP-03: 완료 후 동일 키 재호출 → 다시 실행", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return calls;
    };

    await deduplicate("k1", fn);
    await deduplicate("k1", fn);
    expect(calls).toBe(2);
  });
});
