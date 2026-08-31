/**
 * anchor — §133 한도 그룹 구성의 **양도연도 분기** (D7-03)
 *
 * 결함: `buildLimitGroups`가 **연도와 무관하게 항상 두 그룹**(자경 / §77 계열)을 만들고
 * 금액만 연도로 갈랐다. 그러나 §77 계열의 **별도 한도(§133②)는 2025년 개정으로 신설**된 것이다.
 *
 * 조문 실측 (KoreanLaw MCP, MST 267555):
 * - `efYd=20250101` §133① — 「제33조, 제43조, 제66조부터 제69조까지, …, 제70조,
 *   **제77조, 제77조의2, 제77조의3**, 제85조의10 …에 따라 감면받을 양도소득세액의 **합계액**」
 *   이 **과세기간별 1억원**(1호). §133②는 **토지분할 의제**이지 한도 규정이 아니다.
 *   ⇒ 개정 전에는 자경(§69)과 수용(§77)이 **하나의 1억원을 공유**한다.
 * - `efYd=20250401` — §133①에서 §77 계열이 **삭제**되고 §133②가 신설(연 2억 / 5년 3억),
 *   종전 ②(토지분할)는 ③으로 밀린다.
 *
 * ⇒ 개정 전 양도에 두 그룹을 주면 각각 1억씩 **최대 1억원 과다감면**.
 *
 * 5년 누적도 구성이 다르다 — 개정 전 §133①2호나목은
 * 「제66조부터 제69조까지, 제69조의2부터 제69조의4까지, 제70조, **제77조 또는 제77조의2**」로
 * **§77의3이 빠져 있다**. §77의3에 5년 한도를 씌우면 법 근거 없는 불리 적용이 된다.
 *
 * ⚠️ 연도 경계는 감면율(§77①)·한도(§133②)와 **같은 개정 패키지**이므로 기존 코드와 같은
 *    `transferYear >= 2025`를 쓴다(부칙 「시행일이 속하는 과세연도부터」 —
 *    `docs/00-pm/transfer-expropriation-77-133-2025-amendment.plan.md:7`).
 */
import { describe, it, expect } from "vitest";
import {
  buildLimitGroups,
  lookupLimit,
  applyAnnualLimits,
  applyFiveYearLimits,
} from "@/lib/tax-engine/aggregate-reduction-limits";

const SELF = "self_farming";
const EXPRO = "public_expropriation";
const GB = "gb_designated_land";
const REPL = "replacement_land_comp";

describe("개정 전(≤2024) — §133① 하나의 1억원을 공유한다", () => {
  const groups = buildLimitGroups(2024);

  it("자경과 §77 계열이 같은 그룹에 든다", () => {
    const self = lookupLimit(SELF, groups);
    const expro = lookupLimit(EXPRO, groups);
    expect(self.groupTypes).toEqual(expro.groupTypes);
    expect(self.annualLimit).toBe(100_000_000);
    expect(expro.annualLimit).toBe(100_000_000);
  });

  it("근거는 §133①이다 — §133②는 그 시점에 토지분할 의제였다", () => {
    expect(lookupLimit(EXPRO, groups).legalBasis).toContain("§133 ①");
    expect(lookupLimit(EXPRO, groups).legalBasis).not.toContain("§133②");
  });

  it("🔴 자경 1억 + 수용 1억이면 합계 1억으로 잘린다 (종전에는 2억이 통과했다)", () => {
    const raw = new Map([[SELF, 100_000_000], [EXPRO, 100_000_000]]);
    const { cappedByType } = applyAnnualLimits(raw, groups);
    const total = (cappedByType.get(SELF) ?? 0) + (cappedByType.get(EXPRO) ?? 0);
    expect(total).toBe(100_000_000);
  });

  it("§77의3은 5년 누적 한도를 받지 않는다 — ①2호나목 미열거", () => {
    const annual = new Map([[GB, 100_000_000]]);
    const { fiveYearCappedByType } = applyFiveYearLimits(
      annual,
      [{ year: 2023, type: GB, amount: 200_000_000 }],
      2024,
      groups,
    );
    // 나목에 §77의3이 없으므로 과거 2억을 썼어도 당해분이 잘리지 않는다.
    expect(fiveYearCappedByType.get(GB)).toBe(100_000_000);
  });

  it("§77의2는 5년 누적 2억을 자경과 공유한다 — ①2호나목 열거", () => {
    const annual = new Map([[REPL, 100_000_000]]);
    const { fiveYearCappedByType } = applyFiveYearLimits(
      annual,
      [{ year: 2023, type: SELF, amount: 150_000_000 }],
      2024,
      groups,
    );
    expect(fiveYearCappedByType.get(REPL)).toBe(50_000_000);
  });
});

describe("개정 후(2025+) — §133②가 §77 계열을 별도 한도군으로 가른다", () => {
  const groups = buildLimitGroups(2025);

  it("자경과 §77 계열이 서로 다른 그룹이다", () => {
    expect(lookupLimit(SELF, groups).groupTypes).not.toEqual(
      lookupLimit(EXPRO, groups).groupTypes,
    );
    expect(lookupLimit(SELF, groups).annualLimit).toBe(100_000_000);
    expect(lookupLimit(EXPRO, groups).annualLimit).toBe(200_000_000);
  });

  it("자경 1억 + 수용 2억이 각자 한도까지 통과한다", () => {
    const raw = new Map([[SELF, 100_000_000], [EXPRO, 200_000_000]]);
    const { cappedByType } = applyAnnualLimits(raw, groups);
    expect(cappedByType.get(SELF)).toBe(100_000_000);
    expect(cappedByType.get(EXPRO)).toBe(200_000_000);
  });

  it("§77 계열 세 유형이 모두 §133② 그룹에 든다 (#048 회귀 방지)", () => {
    for (const t of [EXPRO, GB, REPL]) {
      expect(lookupLimit(t, groups).groupTypes.length, t).toBeGreaterThan(0);
      expect(lookupLimit(t, groups).legalBasis, t).toContain("§133②");
    }
  });

  it("§77 계열 5년 누적은 3억이다", () => {
    const annual = new Map([[EXPRO, 200_000_000]]);
    const { fiveYearCappedByType } = applyFiveYearLimits(
      annual,
      [{ year: 2024, type: EXPRO, amount: 200_000_000 }],
      2025,
      groups,
    );
    expect(fiveYearCappedByType.get(EXPRO)).toBe(100_000_000);
  });
});
