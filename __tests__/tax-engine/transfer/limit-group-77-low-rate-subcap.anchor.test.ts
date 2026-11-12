/**
 * anchor — §133① «가목/나목 중 큰 금액» 구조: §77 저율분 하위 한도 (계획서 `self-farming-history-rows.plan.md` §9, Q-7 b)
 *
 * 법문 [직접 — KoreanLaw MCP, 조특법 §133①]:
 *  · 연(1호) 2011.1.1.~2015.12.31.: 가목(1억) = §33·§43·§70·**§77(저율 감면율분 한정)**·§77의3·§85의10 / 나목(2억) = 가목 + §69·§69의2·§77(전체)
 *    — 저율 = 2011~2013 «100분의 20 및 100분의 25», 2014~2015 «100분의 15 및 100분의 20» (MST 109448·120467·131389·153922·165311)
 *  · 5개 과세기간(2호) 2011~2015: 나목 = §70 + §77(저율분) 2억, 다목 = §69·§69의2·§70·§77 3억
 *  · 5개 과세기간 2016~2017(MST 177204): 나목 = §70 + §77(«100분의 10 및 100분의 15») + §77의2 2억, 다목 3억. 연 1호는 단일 열거 1억.
 *  · 각 호는 «다음 각 목의 금액 중 **큰 금액**은 감면하지 아니한다» ⇒ 허용 = min(비가목분 + min(가목분, 1억), 2억)
 *    (연) · 5년은 min(비나목분 + min(나목분, 2억), 3억).
 *
 * 구현 = 그룹 한도 앞에 «하위 한도»를 먼저 적용(`subCaps`) — 저율분이 하위 한도를 넘는 부분을 그룹 합계에서 뺀다.
 * 고율분(채권 3·5년 보유 특약 30·40%)은 가목에 없으므로 하위 한도에서 제외한다(`lowRateShare`).
 */
import { describe, it, expect } from "vitest";
import {
  buildLimitGroups,
  applyAnnualLimits,
  applyFiveYearLimits,
} from "@/lib/tax-engine/aggregate-reduction-limits";

const SELF = "self_farming";
const EXPRO = "public_expropriation";
const GB = "gb_designated_land";
const REPL = "replacement_land_comp";
const E = (n: number) => n * 100_000_000;
const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const annual = (year: number, raw: Record<string, number>, share?: Record<string, number>) =>
  applyAnnualLimits(
    new Map(Object.entries(raw)),
    buildLimitGroups(year),
    share ? new Map(Object.entries(share)) : undefined,
  ).cappedByType;

describe("LS-1 연 — 2011~2015: §77 저율분은 가목 1억을 먼저 받는다", () => {
  for (const y of [2011, 2012, 2013, 2014, 2015]) {
    it(`LS-1 ${y}: §77 2.2억 단독 → 1억 (가목 초과 1.2억 > 나목 초과 0.2억)`, () => {
      expect(total(annual(y, { [EXPRO]: E(2.2) }))).toBe(E(1));
    });
    it(`LS-1b ${y}: §77 0.8억 단독 → 0.8억 (가목 이내)`, () => {
      expect(total(annual(y, { [EXPRO]: E(0.8) }))).toBe(E(0.8));
    });
    it(`LS-1c ${y}: 자경 3억 단독 → 2억 (가목에 §69 없음 — 나목 2억)`, () => {
      expect(total(annual(y, { [SELF]: E(3) }))).toBe(E(2));
    });
    it(`LS-1d ${y}: §77 2.26억 + 자경 15억 → 2억 (나목이 큰 금액)`, () => {
      expect(total(annual(y, { [EXPRO]: E(2.26), [SELF]: E(15) }))).toBe(E(2));
    });
    it(`LS-1e ${y}: §77 1.5억 + 자경 0.2억 → 1.2억 (= 1억 + 0.2억)`, () => {
      expect(total(annual(y, { [EXPRO]: E(1.5), [SELF]: E(0.2) }))).toBe(E(1.2));
    });
  }

  it("LS-1f §77의3(gb)도 가목 — §77 0.7억 + §77의3 0.7억 → 1억", () => {
    expect(total(annual(2014, { [EXPRO]: E(0.7), [GB]: E(0.7) }))).toBe(E(1));
  });

  it("LS-1g 고율분(채권 3·5년 보유)은 가목이 아니다 — 저율 몫 0이면 하위 한도 없음 → 나목 2억", () => {
    expect(total(annual(2014, { [EXPRO]: E(2.2) }, { [EXPRO]: 0 }))).toBe(E(2));
  });

  it("LS-1h 저율 몫 50% — 2.2억 중 1.1억만 하위 한도 대상 → 허용 = 2.2 − 0.1 = 2.1 → 나목 2억", () => {
    expect(total(annual(2014, { [EXPRO]: E(2.2) }, { [EXPRO]: 0.5 }))).toBe(E(2));
  });

  it("LS-1i 저율 몫 50%·raw 1.6억 — 저율 0.8억(이내) → 1.6억", () => {
    expect(total(annual(2014, { [EXPRO]: E(1.6) }, { [EXPRO]: 0.5 }))).toBe(E(1.6));
  });
});

describe("LS-2 연 — 하위 한도가 없는 해", () => {
  it("LS-2-1 2016·2017: 1호 단일 열거 연 1억 — §77 단독 1억 (가목 구분 없음)", () => {
    expect(total(annual(2016, { [EXPRO]: E(2.2) }))).toBe(E(1));
    expect(total(annual(2017, { [EXPRO]: E(2.2) }))).toBe(E(1));
  });
  it("LS-2-2 2018~2024: 연 1억 단일", () => {
    expect(total(annual(2018, { [EXPRO]: E(2.2) }))).toBe(E(1));
    expect(total(annual(2024, { [SELF]: E(2.2) }))).toBe(E(1));
  });
  it("LS-2-3 2025+: §77 별도 그룹 연 2억 — 하위 한도 없음", () => {
    expect(total(annual(2025, { [EXPRO]: E(2.2) }))).toBe(E(2));
  });
});

describe("LS-5 2009-03-16~2010-12-31 — 연 가목 §77 (2009: 전체 감면율 · 2010: 저율 20·25%) · 5년 열거에서 §77 제외", () => {
  // 법문 [직접 — KoreanLaw MCP]: 2009.1.30.(MST 91272)·2009.10.2.(MST 92377) §133① —
  //   1호 가목 1억 = §33·§43·§70·§77(감면율 한정 없음)·§77의3 / 나목 2억 / 2호 가목 §70 1억 · 나목 «제69조와 제70조» 3억 (§77 없음).
  //   2010.1.1.(MST 98336)·2010.12.27.(MST 109448) — 1호 가목 §77(100분의 20 및 100분의 25) / 2호 나목 «제69조, 제70조 또는
  //   제77조(100분의 40 및 100분의 50의 감면율을 적용받는 경우에 한한다)» 3억 — 저율 §77은 5년 열거에 없다.
  for (const y of [2009, 2010]) {
    it(`LS-5-1 ${y}: §77 2.2억 단독 → 1억 (가목)`, () => {
      expect(total(annual(y, { [EXPRO]: E(2.2) }))).toBe(E(1));
    });
    it(`LS-5-2 ${y}: §77 2.26억 + 자경 15억 → 2억 (나목이 큰 금액)`, () => {
      expect(total(annual(y, { [EXPRO]: E(2.26), [SELF]: E(15) }))).toBe(E(2));
    });
    it(`LS-5-3 ${y}: §77의3(gb)도 가목 — §77 0.7억 + §77의3 0.7억 → 1억`, () => {
      expect(total(annual(y, { [EXPRO]: E(0.7), [GB]: E(0.7) }))).toBe(E(1));
    });
  }
  it("LS-5-4 2009는 가목이 §77 전체(감면율 한정 없음) — 저율 몫 0이어도 하위 한도가 걸린다", () => {
    expect(total(annual(2009, { [EXPRO]: E(2.2) }, { [EXPRO]: 0 }))).toBe(E(1));
  });
  it("LS-5-5 2010은 저율(20·25%)만 가목 — 저율 몫 0이면 하위 한도 없음 → 나목 2억", () => {
    expect(total(annual(2010, { [EXPRO]: E(2.2) }, { [EXPRO]: 0 }))).toBe(E(2));
  });

  const five = (year: number, cur: Record<string, number>, prior: { year: number; type: string; amount: number }[]) =>
    applyFiveYearLimits(new Map(Object.entries(cur)), prior, year, buildLimitGroups(year)).fiveYearCappedByType;
  for (const y of [2009, 2010]) {
    it(`LS-5-6 ${y} 5년: 과거 §77 3억이 있어도 당해 자경은 5년 3억에 영향받지 않는다 (§77 저율은 5년 열거에 없음)`, () => {
      expect(total(five(y, { [SELF]: E(1) }, [{ year: y - 1, type: EXPRO, amount: E(3) }]))).toBe(E(1));
    });
    it(`LS-5-7 ${y} 5년: 당해 §77은 5년 한도를 받지 않는다 — 과거 자경 2.8억 + 당해 §77 1억 → 1억`, () => {
      expect(total(five(y, { [EXPRO]: E(1) }, [{ year: y - 1, type: SELF, amount: E(2.8) }]))).toBe(E(1));
    });
    it(`LS-5-8 ${y} 5년: 자경은 3억 한도 — 과거 자경 2.5억 + 당해 자경 1억 → 0.5억`, () => {
      expect(total(five(y, { [SELF]: E(1) }, [{ year: y - 1, type: SELF, amount: E(2.5) }]))).toBe(E(0.5));
    });
  }
  it("LS-5-9 2011은 5년 열거에 §77(저율) 포함 — 과거 §77 3억이면 당해 자경 0 (경계 대조군)", () => {
    expect(total(five(2011, { [SELF]: E(1) }, [{ year: 2010, type: EXPRO, amount: E(3) }]))).toBe(0);
  });
});

describe("LS-3 5개 과세기간 — 나목(§70 + §77 저율분 2억) 후 다목 3억", () => {
  const five = (year: number, cur: Record<string, number>, prior: { year: number; type: string; amount: number }[], share?: Record<string, number>) =>
    applyFiveYearLimits(
      new Map(Object.entries(cur)),
      prior,
      year,
      buildLimitGroups(year),
      share ? new Map(Object.entries(share)) : undefined,
    ).fiveYearCappedByType;

  it("LS-3-1 2014: 과거 §77 1.5억 + 당해 §77 1억 → 0.5억 (나목 2억)", () => {
    const r = five(2014, { [EXPRO]: E(1) }, [{ year: 2012, type: EXPRO, amount: E(1.5) }]);
    expect(total(r)).toBe(E(0.5));
  });
  it("LS-3-2 2014: 과거 자경 2.5억 + 당해 §77 1억 → 0.5억 (다목 3억만 — 나목은 §69 제외)", () => {
    const r = five(2014, { [EXPRO]: E(1) }, [{ year: 2012, type: SELF, amount: E(2.5) }]);
    expect(total(r)).toBe(E(0.5));
  });
  it("LS-3-3 2014: 과거 §77 1억 + 자경 1.5억, 당해 자경 1억 → 0.5억 (다목 3억)", () => {
    const r = five(2014, { [SELF]: E(1) }, [
      { year: 2012, type: EXPRO, amount: E(1) },
      { year: 2013, type: SELF, amount: E(1.5) },
    ]);
    expect(total(r)).toBe(E(0.5));
  });
  it("LS-3-4 2014: 과거 §77 1.8억 + 당해 §77 1억 + 당해 자경 1억 → §77 0.2억 + 자경 …", () => {
    // 나목(§77 저율) 잔여 0.2억 → §77 0.2억. 다목 3억 잔여 = 3 − 1.8 = 1.2억 → 0.2 + 자경 1.0 = 1.2억.
    const r = five(2014, { [EXPRO]: E(1), [SELF]: E(1) }, [{ year: 2013, type: EXPRO, amount: E(1.8) }]);
    expect(total(r)).toBe(E(1.2));
  });
  it("LS-3-5 2016·2017: 나목에 §77의2 포함 — 과거 §77의2 1.5억 + 당해 §77 1억 → 0.5억", () => {
    const r = five(2016, { [EXPRO]: E(1) }, [{ year: 2014, type: REPL, amount: E(1.5) }]);
    expect(total(r)).toBe(E(0.5));
  });
  it("LS-3-6 2016: 과거 자경 2.5억 + 당해 §77 1억 → 0.5억 (다목 3억)", () => {
    const r = five(2016, { [EXPRO]: E(1) }, [{ year: 2014, type: SELF, amount: E(2.5) }]);
    expect(total(r)).toBe(E(0.5));
  });
  it("LS-3-7 2018+: 5년 2억 단일 — 하위 한도 없음 (종전 동작)", () => {
    const r = five(2018, { [EXPRO]: E(1) }, [{ year: 2016, type: SELF, amount: E(1.5) }]);
    expect(total(r)).toBe(E(0.5));
  });
  it("LS-3-8 고율 몫 0 — 나목 하위 한도를 건너뛴다 (과거 §77 1.5억 + 당해 §77 1억 → 다목 3억 이내 → 1억)", () => {
    const r = five(2014, { [EXPRO]: E(1) }, [{ year: 2012, type: EXPRO, amount: E(1.5) }], { [EXPRO]: 0 });
    expect(total(r)).toBe(E(1));
  });
});

describe("LS-4 buildLimitGroups 구성", () => {
  it("LS-4-1 하위 한도 정의는 2009~2017에만 있다", () => {
    const has = (y: number) => buildLimitGroups(y).some((g) => (g.subCaps?.length ?? 0) > 0);
    expect([2008, 2009, 2010, 2011, 2015, 2016, 2017, 2018, 2024, 2025].map(has)).toEqual([false, true, true, true, true, true, true, false, false, false]);
  });
});
