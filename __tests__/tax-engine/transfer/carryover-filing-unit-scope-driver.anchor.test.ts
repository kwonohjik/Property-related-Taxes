/**
 * anchor: 신고단위 §97의2②3호 판정 드라이버 — 순차 고정점의 규약 (N-1)
 *
 * 엔진 결합 없이 **판정 규칙만** 못으로 박는다(집계는 스텁으로 대체).
 * 세액 자체의 anchor는 `aggregate-carryover-filing-unit-n1.anchor.test.ts`가 맡는다.
 *
 * 규약 3가지:
 *   1. **동률은 적용 유지** — ②3호 단서가 「**적은** 경우」이므로 같으면 ①을 적용한다.
 *   2. **①이 원칙** — 전부 A에서 출발하고, 「적은 경우」에만 B로 내린다.
 *   3. **결정적** — 자산이 서로 영향을 주어 진동하더라도 pass 상한에서 멈추고 같은 답을 낸다.
 *
 * ⛔ 전수 탐색(2ⁿ 최댓값)이 **아니다** — ②3호 문언은 「그 자산에 ①을 적용/미적용」의 2항 비교이지
 *    조합 최적화가 아니다. 최댓값을 찾는 테스트를 여기에 추가하지 말 것.
 */
import { describe, it, expect } from "vitest";
import {
  resolveFilingUnitCarryoverScope,
  type CarryoverScenarioOverrides,
} from "@/lib/tax-engine/transfer-tax-aggregate-carryover-scope";

describe("N-1 · 신고단위 판정 드라이버", () => {
  it("D-1: 적격 자산이 없으면 아무것도 강제하지 않는다", () => {
    let calls = 0;
    const { overrides, comparisons } = resolveFilingUnitCarryoverScope([], () => {
      calls++;
      return 0;
    });
    expect(overrides).toEqual({});
    expect(comparisons.size).toBe(0);
    expect(calls).toBe(0); // 집계를 한 번도 더 돌리지 않는다
  });

  it("D-2: 동률이면 A(적용) 유지 — 「적은 경우」만 배제다", () => {
    const { overrides } = resolveFilingUnitCarryoverScope([0], () => 100_000_000);
    expect(overrides).toEqual({ 0: "A" });
  });

  it("D-3: 적용 쪽이 **적으면** B(배제)", () => {
    const { overrides, comparisons } = resolveFilingUnitCarryoverScope([0], (ov) =>
      ov[0] === "A" ? 90_000_000 : 100_000_000,
    );
    expect(overrides).toEqual({ 0: "B" });
    expect(comparisons.get(0)).toEqual({
      determinedTaxWithCarryover: 90_000_000,
      determinedTaxWithout: 100_000_000,
    });
  });

  it("D-4: 적용 쪽이 크면 A — 자산별로는 뒤집혔을 조합이 여기서 교정된다", () => {
    const { overrides } = resolveFilingUnitCarryoverScope([0], (ov) =>
      ov[0] === "A" ? 120_000_000 : 100_000_000,
    );
    expect(overrides).toEqual({ 0: "A" });
  });

  it("D-5: 자산 2건 — 각각 독립적으로 판정된다", () => {
    const tax = (ov: CarryoverScenarioOverrides) =>
      (ov[0] === "A" ? 50_000_000 : 60_000_000) + (ov[1] === "A" ? 40_000_000 : 30_000_000);
    const { overrides } = resolveFilingUnitCarryoverScope([0, 1], tax);
    // 0번은 A가 적다 → B / 1번은 A가 크다 → A
    expect(overrides).toEqual({ 0: "B", 1: "A" });
  });

  it("D-6: 서로 영향을 주어도 수렴하고, 집계 호출은 자산당 pass 2회를 넘지 않는다", () => {
    // 1번 자산의 유불리가 0번의 선택에 의존하는 구조
    const tax = (ov: CarryoverScenarioOverrides) => {
      const base = ov[0] === "A" ? 100_000_000 : 90_000_000;
      const second = ov[0] === "A" ? (ov[1] === "A" ? 10_000_000 : 20_000_000) : 0;
      return base + second;
    };
    let calls = 0;
    const { overrides } = resolveFilingUnitCarryoverScope([0, 1], (ov) => {
      calls++;
      return tax(ov);
    });
    expect(overrides[0]).toBe("A"); // A(100M) > B(90M) ⇒ 적용 유지
    expect(overrides[1]).toBe("B"); // 0=A 하에서 A(10M) < B(20M) ⇒ 배제
    // 자산 2건 × A/B 2회 × pass 최대 2회 = 8회가 상한
    expect(calls).toBeLessThanOrEqual(8);
  });

  it("D-8: 출발점은 **A(적용)** 여야 한다 — ①이 원칙이고 ②는 예외다", () => {
    /**
     * 출발점이 결과를 가르는 표. B에서 출발하면 두 자산 모두 B에 갇힌다
     * (0번은 1번이 B인 동안 A가 더 적고, 1번은 0번이 B인 동안 A가 더 적다).
     * A에서 출발하면 둘 다 A로 남는다 — 어느 쪽도 「적은 경우」가 아니기 때문이다.
     *
     * | ov0 \ ov1 |  A  |  B  |
     * |---|---|---|
     * | **A** | 100 |  90 |
     * | **B** |  95 | 105 |
     */
    const table: Record<string, number> = {
      "A|A": 100_000_000,
      "A|B": 90_000_000,
      "B|A": 95_000_000,
      "B|B": 105_000_000,
    };
    const { overrides } = resolveFilingUnitCarryoverScope(
      [0, 1],
      (ov) => table[`${ov[0]}|${ov[1]}`],
    );
    // ⚠️ B에서 출발하면 {0:"B", 1:"B"}가 나온다 — 이월과세를 이유 없이 배제하는 방향이다.
    expect(overrides).toEqual({ 0: "A", 1: "A" });
  });

  it("D-7: 진동하는 입력에서도 결정적으로 끝난다 (무한 루프 없음)", () => {
    // 두 자산이 서로 반대를 강요하는 구조
    const tax = (ov: CarryoverScenarioOverrides) =>
      ov[0] === ov[1] ? 100_000_000 : 200_000_000;
    const first = resolveFilingUnitCarryoverScope([0, 1], tax).overrides;
    const second = resolveFilingUnitCarryoverScope([0, 1], tax).overrides;
    expect(first).toEqual(second); // 같은 입력 → 같은 답
    expect(Object.keys(first).sort()).toEqual(["0", "1"]);
  });
});
