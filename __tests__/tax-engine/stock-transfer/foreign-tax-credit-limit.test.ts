/**
 * §118의6①1호 공제한도 A × B / C — 순수 함수 단위 테스트
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (Phase 2 · §5 매트릭스)
 *
 * A = Σ incomeTax (기본공제 **후** 과세표준 × §104①12호 세율)
 * B = 종목별 incomeAfterOffset (§102② 통산 **후** · 기본공제 **전**)
 * C = Σ B
 */

import { describe, it, expect } from "vitest";
import {
  computeForeignTaxCreditLimits,
  type ForeignTaxCreditLimitInput,
} from "@/lib/tax-engine/stock-transfer/foreign-tax-credit-limit";

/** 종목 1건 — B, 산출세액, 외국납부세액 */
function row(
  incomeAfterOffset: number,
  incomeTax: number,
  foreignTaxPaidKrw = 0,
): ForeignTaxCreditLimitInput {
  return { incomeAfterOffset, incomeTax, foreignTaxPaidKrw };
}

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

// ============================================================
// L 시리즈 — 한도 산식
// ============================================================

describe("L-1 [양성 대조군] 단건은 B = C라 한도 = A — 종전 단건 동작과 같다", () => {
  const out = computeForeignTaxCreditLimits([row(50_000_000, 10_000_000, 8_000_000)]);

  it("한도 = 산출세액 전액", () => {
    expect(out[0].limit).toBe(10_000_000);
  });

  it("공제 = min(외국세, 한도)", () => {
    expect(out[0].applied).toBe(8_000_000);
  });

  it("외국세가 한도를 넘으면 한도까지만", () => {
    const over = computeForeignTaxCreditLimits([row(50_000_000, 10_000_000, 30_000_000)]);
    expect(over[0].applied).toBe(10_000_000);
  });
});

describe("L-2 2종목 동액 이익 — 한도가 절반씩 (계획서 §3 발현 예)", () => {
  /**
   * 각 양도소득금액 50,000,000 → C = 100,000,000
   * §103② 기본공제 250만은 먼저 양도한 종목1에 → 과세표준 47,500,000 / 50,000,000
   * A = 9,500,000 + 10,000,000 = 19,500,000
   * 한도ᵢ = 19,500,000 × 50,000,000 / 100,000,000 = 9,750,000
   */
  const out = computeForeignTaxCreditLimits([
    row(50_000_000, 9_500_000, 12_000_000),
    row(50_000_000, 10_000_000, 0),
  ]);

  it("종목1 한도 = 9,750,000 (A 전액 19,500,000이 **아니다**)", () => {
    expect(out[0].limit).toBe(9_750_000);
    expect(out[0].limit).not.toBe(19_500_000);
  });

  it("종목2 한도도 9,750,000 — 외국세가 0이라 공제는 0", () => {
    expect(out[1].limit).toBe(9_750_000);
    expect(out[1].applied).toBe(0);
  });

  it("공제 9,750,000 — 현행(한도 전액)이면 12,000,000이라 2,250,000 과대", () => {
    expect(out[0].applied).toBe(9_750_000);
  });

  it("Σ 한도 = A", () => {
    expect(sum(out.map((o) => o.limit))).toBe(19_500_000);
  });
});

describe("L-3 이익 3:1 — 한도가 3:1로 갈린다", () => {
  // B = 75,000,000 / 25,000,000 → C = 100,000,000 · A = 20,000,000
  const out = computeForeignTaxCreditLimits([
    row(75_000_000, 15_000_000, 20_000_000),
    row(25_000_000, 5_000_000, 20_000_000),
  ]);

  it("한도 15,000,000 : 5,000,000", () => {
    expect(out.map((o) => o.limit)).toEqual([15_000_000, 5_000_000]);
  });

  it("각 종목이 자기 한도까지만 — 풀링되지 않는다 (B = 「해당 국외자산」)", () => {
    expect(out.map((o) => o.applied)).toEqual([15_000_000, 5_000_000]);
  });
});

describe("L-4 3종목 중 1종목 손실 — **통산 후** B로 안분", () => {
  /**
   * 통산 전: +60,000,000 / −20,000,000 / +40,000,000
   * 통산 후(호출자 책임): 손실이 이익에 배분되어 예컨대 +45,000,000 / 0 / +35,000,000
   *   → C = 80,000,000 · A = 16,000,000 (80,000,000 × 20%, 기본공제 무시한 단순 예)
   */
  const out = computeForeignTaxCreditLimits([
    row(45_000_000, 9_000_000, 5_000_000),
    row(0, 0, 3_000_000),
    row(35_000_000, 7_000_000, 5_000_000),
  ]);

  it("손실(통산 후 0) 종목은 한도 0 — 외국세를 냈어도 공제 0 (Q-5)", () => {
    expect(out[1].limit).toBe(0);
    expect(out[1].applied).toBe(0);
  });

  it("이익 종목만 A를 나눠 갖는다 — 9,000,000 : 7,000,000", () => {
    expect(out[0].limit).toBe(9_000_000);
    expect(out[2].limit).toBe(7_000_000);
  });

  it("Σ 한도 = A", () => {
    expect(sum(out.map((o) => o.limit))).toBe(16_000_000);
  });
});

describe("L-5 국내주식이 섞여도 C에 들어가지 않는다 — 호출자가 국외만 넘긴다", () => {
  /**
   * 이 함수는 **국외 종목만** 받는다(C = 「국외자산에 대한 양도소득금액」).
   * 국내주식은 A에도 C에도 들어가지 않는다 — 다만 §103①2호 공동 기본공제 배분을 통해
   * 국외 종목의 **과세표준**(⇒ incomeTax ⇒ A)에는 간접 영향을 준다. 그 영향은 호출자가 이미
   * 반영해 `incomeTax`로 넘긴다.
   */
  const out = computeForeignTaxCreditLimits([
    row(50_000_000, 9_500_000, 6_000_000),  // 국외 — 기본공제 250만을 받은 종목
    row(50_000_000, 10_000_000, 0),         // 국외
  ]);

  it("A는 넘겨받은 incomeTax의 합이다 — 국내 종목 세액이 섞이지 않는다", () => {
    expect(sum(out.map((o) => o.limit))).toBe(19_500_000);
  });
});

// ============================================================
// Z 시리즈 — 경계
// ============================================================

describe("Z-1 전 종목 손실 (C ≤ 0) — 0 나눗셈 없이 한도 0", () => {
  it("C = 0 · A = 0", () => {
    const out = computeForeignTaxCreditLimits([row(0, 0, 1_000_000), row(0, 0, 2_000_000)]);
    expect(out.map((o) => o.limit)).toEqual([0, 0]);
    expect(out.map((o) => o.applied)).toEqual([0, 0]);
  });

  it("음수 C가 들어와도 NaN·Infinity가 나오지 않는다", () => {
    const out = computeForeignTaxCreditLimits([row(-5_000_000, 0, 1_000_000)]);
    expect(out[0].limit).toBe(0);
    expect(Number.isFinite(out[0].limit)).toBe(true);
  });

  it("빈 배열", () => {
    expect(computeForeignTaxCreditLimits([])).toEqual([]);
  });

  it("🔑 C = 0인데 **양수 B가 2건 이상** — BigInt 0 나눗셈으로 throw하지 않는다", () => {
    // ⚠️ 이 구성이 guard의 유일한 실제 진입 경로다. B가 전부 ≤ 0이면 루프가 통째로 skip돼
    //    나눗셈에 도달조차 안 하므로, guard를 지워도 Z-1의 다른 케이스는 통과한다
    //    (2026-08-12 mutation M-4 실측으로 발견). 양수 2건 + 상쇄 음수라야 C = 0에서
    //    나눗셈까지 간다.
    expect(() =>
      computeForeignTaxCreditLimits([
        row(10_000_000, 2_000_000, 500_000),
        row(10_000_000, 2_000_000, 500_000),
        row(-20_000_000, 0, 0),
      ]),
    ).not.toThrow();

    const out = computeForeignTaxCreditLimits([
      row(10_000_000, 2_000_000, 500_000),
      row(10_000_000, 2_000_000, 500_000),
      row(-20_000_000, 0, 0),
    ]);
    expect(out.every((o) => Number.isFinite(o.limit))).toBe(true);
    expect(sum(out.map((o) => o.limit))).toBe(0);
  });
});

describe("Z-2 C > 0인데 특정 종목 B = 0 — 그 종목만 한도 0", () => {
  const out = computeForeignTaxCreditLimits([
    row(0, 0, 4_000_000),
    row(30_000_000, 6_000_000, 1_000_000),
  ]);

  it("B = 0 종목 한도 0", () => {
    expect(out[0].limit).toBe(0);
  });

  it("나머지가 A 전액을 갖는다", () => {
    expect(out[1].limit).toBe(6_000_000);
  });
});

describe("Z-3 절사 잔차 — 마지막 **양수 B** 종목이 흡수해 Σ = A", () => {
  /**
   * A = 1,000,000 · B = 1 / 1 / 1 → C = 3
   * floor(1,000,000 × 1 / 3) = 333,333 씩 → 앞 2건 666,666 · 마지막이 333,334를 흡수
   */
  const out = computeForeignTaxCreditLimits([
    row(1, 400_000, 999_999_999),
    row(1, 300_000, 999_999_999),
    row(1, 300_000, 999_999_999),
  ]);

  it("Σ 한도 = A (1원도 새지 않는다)", () => {
    expect(sum(out.map((o) => o.limit))).toBe(1_000_000);
  });

  it("잔차는 마지막 양수 B가 흡수 — 333,333 / 333,333 / 333,334", () => {
    expect(out.map((o) => o.limit)).toEqual([333_333, 333_333, 333_334]);
  });

  it("🔑 마지막이 B = 0이면 그 앞의 **양수** 종목이 흡수한다 (배열 끝이 아니다)", () => {
    // ⚠️ 잔차가 **실제로 남는** 구성이어야 이 단언이 판별력을 갖는다.
    //    B가 2건이면 A를 정확히 이등분해 잔차가 0이라, 잔액을 배열 끝에 줘도 0이 되어
    //    변이를 놓친다(2026-08-12 mutation M-3 실측으로 발견). 그래서 **양수 3건 + 0 1건**이다.
    //    올바른 동작: 잔차 1원을 **index 2**(마지막 양수)가 흡수하고 index 3은 0을 유지한다.
    const withTrailingZero = computeForeignTaxCreditLimits([
      row(1, 400_000, 0),
      row(1, 300_000, 0),
      row(1, 300_000, 0),
      row(0, 0, 5_000_000),   // B = 0 — 잔액을 받으면 안 된다
    ]);
    expect(withTrailingZero[3].limit).toBe(0);
    expect(withTrailingZero[3].applied).toBe(0);
    expect(withTrailingZero[2].limit).toBe(333_334);   // 잔차 1원 흡수
    expect(sum(withTrailingZero.map((o) => o.limit))).toBe(1_000_000);
  });
});

describe("Z-4 불변식 — Σ 한도는 어떤 입력에서도 A를 넘지 않는다", () => {
  it("통산 전 값(음수 B 혼입)이 들어와도 Σ ≤ A", () => {
    // 호출자 계약 위반 상황. C = 30,000,000 인데 ΣB⁺ = 80,000,000 이라
    // clamp가 없으면 개별 몫이 A를 넘는다.
    const A = 6_000_000;
    const out = computeForeignTaxCreditLimits([
      row(50_000_000, 4_000_000, 99_000_000),
      row(30_000_000, 2_000_000, 99_000_000),
      row(-50_000_000, 0, 0),
    ]);
    expect(sum(out.map((o) => o.limit))).toBeLessThanOrEqual(A);
    expect(sum(out.map((o) => o.applied))).toBeLessThanOrEqual(A);
  });
});
