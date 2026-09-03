/**
 * anchor: G-07 **B2** — 상속·증여 부정행위 축 (「국세기본법」 §47의2①1호 · §47의3①1호)
 *
 * 계획서 `docs/00-pm/inheritance-gift-penalty-g07.plan.md` §8.3.
 *
 * ## 고정하는 계약
 *
 * 1. **무신고 40%·역외 60%** — §47의2①1호. 1호·2호는 「비율을 곱한 금액」이라 각 목 구조가
 *    없다 ⇒ 무신고에는 가목·나목 **분해가 없다**.
 * 2. **과소신고는 가목 + 나목의 합** — §47의3①1호. 부정행위분만 40%(역외 60%)이고 나머지에는
 *    10%가 붙는다. 미입력이면 전액 부정(정본과 같은 하위 호환).
 * 3. 🔴 **§47의3④1호는 네 목이 같지 않다** — 다목·라목에만 「부정행위인 경우는 제외한다」
 *    단서가 있고, **그 두 단서가 가리키는 부정행위조차 서로 다르다**:
 *      · 다목 — 「부정행위로 **상속세 및 증여세**의 과세표준을 과소신고한 경우」 ⇒ `penaltyReason`
 *      · 라목 — 「부정행위로 인하여 **법인세**의 과세표준·세액을 결정·경정하는 경우」 ⇒ 별도 사실
 *    가목·나목에는 단서가 없다 — 부정행위여도 적용제외가 성립한다.
 * 4. **§48②2호 감면은 40%·60%에도 걸린다** — 감면 대상이 「제47조의2에 따른 가산세」 전체다.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceGiftFilingPenalty } from "@/lib/tax-engine/inheritance-gift-penalty";
import type { InheritanceGiftPenaltyInput } from "@/lib/tax-engine/inheritance-gift-penalty";

const DETERMINED = 100_000_000;

function run(input: InheritanceGiftPenaltyInput) {
  return calcInheritanceGiftFilingPenalty(DETERMINED, input);
}

// ────────────────────────────────────────────────────────────────────────────
// §47의2① — 무신고
// ────────────────────────────────────────────────────────────────────────────

describe("B2-1 무신고 — §47의2①1호 부정 40% · 역외 60%", () => {
  it.each([
    ["normal", 0.2, 20_000_000, "2호 그 밖"],
    ["fraudulent", 0.4, 40_000_000, "1호 부정행위"],
    ["offshore_fraud", 0.6, 60_000_000, "1호 괄호 역외거래"],
  ] as const)("B2-1-1: %s → %s (%s — %s)", (reason, rate, penalty, _clause) => {
    const r = run({ filingStatus: "none", penaltyReason: reason });
    expect(r.penaltyRate).toBe(rate);
    expect(r.filingPenalty).toBe(penalty);
  });

  it("B2-1-2: 미지정이면 일반율 — B1 수치가 그대로 유지된다 (하위 호환)", () => {
    expect(run({ filingStatus: "none" }).filingPenalty).toBe(20_000_000);
  });

  it("B2-1-3: ⛔ 무신고에는 가목·나목 분해가 없다 — 「비율을 곱한 금액」이다", () => {
    const r = run({
      filingStatus: "none",
      penaltyReason: "fraudulent",
      fraudulentPortion: 30_000_000, // 넘겨도 무시돼야 한다
    });
    expect(r.fraudSplit).toBeUndefined();
    expect(r.filingPenalty).toBe(40_000_000); // 전액 40%
  });
});

// ────────────────────────────────────────────────────────────────────────────
// §48②2호 × 부정행위
// ────────────────────────────────────────────────────────────────────────────

describe("B2-2 기한후신고 — 40%·60%에도 §48②2호 감면이 걸린다", () => {
  const LATE = {
    filingStatus: "late",
    statutoryDeadline: "2025-04-30",
    actualFilingDate: "2025-05-20", // 1개월 이내 → 50%
  } as const;

  it("B2-2-1: 🔴 부정행위 40% × 감면 50% = 20,000,000", () => {
    const r = run({ ...LATE, penaltyReason: "fraudulent" });
    expect(r.grossPenalty).toBe(40_000_000);
    expect(r.reductionRate).toBe(0.5);
    expect(r.filingPenalty).toBe(20_000_000);
  });

  it("B2-2-2: 역외 60% × 감면 50% = 30,000,000", () => {
    const r = run({ ...LATE, penaltyReason: "offshore_fraud" });
    expect(r.grossPenalty).toBe(60_000_000);
    expect(r.filingPenalty).toBe(30_000_000);
  });

  it("B2-2-3: 🔑 감면 대상은 §47의2 가산세 **전체** — 일반율과 같은 비율로 줄어든다", () => {
    const normal = run({ ...LATE, penaltyReason: "normal" });
    const fraud = run({ ...LATE, penaltyReason: "fraudulent" });
    expect(normal.reductionRate).toBe(fraud.reductionRate);
    expect(fraud.filingPenalty / fraud.grossPenalty).toBeCloseTo(
      normal.filingPenalty / normal.grossPenalty,
      10,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// §47의3①1호 — 과소신고 가목·나목
// ────────────────────────────────────────────────────────────────────────────

describe("B2-3 과소신고 — §47의3①1호 가목 + 나목의 합", () => {
  const UNDER = {
    filingStatus: "on_time",
    isUnderReported: true,
    originalFiledTax: 40_000_000, // base = 100,000,000 − 40,000,000 = 60,000,000
  } as const;

  it("B2-3-1: 일반 → base × 10%", () => {
    const r = run({ ...UNDER, penaltyReason: "normal" });
    expect(r.penaltyBase).toBe(60_000_000);
    expect(r.filingPenalty).toBe(6_000_000);
    expect(r.fraudSplit).toBeUndefined();
  });

  it("B2-3-2: 🔴 부정행위분 일부 입력 → 가목 40% + 나목 10%", () => {
    const r = run({ ...UNDER, penaltyReason: "fraudulent", fraudulentPortion: 20_000_000 });
    expect(r.fraudSplit).toEqual({
      fraudBase: 20_000_000,
      fraudRate: 0.4,
      normalBase: 40_000_000,
      normalRate: 0.1,
    });
    // 가목 8,000,000 + 나목 4,000,000
    expect(r.filingPenalty).toBe(12_000_000);
  });

  it("B2-3-3: 🔑 미입력이면 전액 부정 — 두 값이 실제로 갈린다", () => {
    const split = run({ ...UNDER, penaltyReason: "fraudulent", fraudulentPortion: 20_000_000 });
    const whole = run({ ...UNDER, penaltyReason: "fraudulent" });
    expect(whole.fraudSplit).toBeUndefined();
    expect(whole.filingPenalty).toBe(24_000_000); // 60,000,000 × 40%
    expect(split.filingPenalty).toBeLessThan(whole.filingPenalty);
  });

  it("B2-3-4: 0원 입력은 「부정행위분 없음」 — 전액에 나목 10%", () => {
    const r = run({ ...UNDER, penaltyReason: "fraudulent", fraudulentPortion: 0 });
    expect(r.fraudSplit!.fraudBase).toBe(0);
    expect(r.filingPenalty).toBe(6_000_000);
  });

  it("B2-3-5: 역외 60% — 가목만 60%이고 나목은 그대로 10%", () => {
    const r = run({ ...UNDER, penaltyReason: "offshore_fraud", fraudulentPortion: 20_000_000 });
    expect(r.fraudSplit!.fraudRate).toBe(0.6);
    expect(r.fraudSplit!.normalRate).toBe(0.1);
    expect(r.filingPenalty).toBe(12_000_000 + 4_000_000);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 🔴 §47의3④1호 — 목마다 단서가 다르다
// ────────────────────────────────────────────────────────────────────────────

describe("B2-4 적용제외 × 부정행위 — 네 목이 같지 않다", () => {
  const UNDER = {
    filingStatus: "on_time",
    isUnderReported: true,
    originalFiledTax: 40_000_000,
  } as const;

  it.each([["ownership_dispute", "가목"], ["deduction_error", "나목"]] as const)(
    "B2-4-1: %s(%s)는 단서가 없다 — 부정행위여도 적용제외가 성립한다",
    (exclusion, _mok) => {
      const r = run({ ...UNDER, underReportExclusion: exclusion, penaltyReason: "fraudulent" });
      expect(r.filingPenalty).toBe(0);
      expect(r.exclusionApplied).toBe(exclusion);
      expect(r.exclusionOverriddenByFraud).toBeUndefined();
    },
  );

  it("B2-4-2: 🔴 다목 — 부정행위면 적용제외가 **성립하지 않는다** (§47의3④1호 다목 괄호)", () => {
    const normal = run({ ...UNDER, underReportExclusion: "supplementary_valuation" });
    expect(normal.filingPenalty).toBe(0); // 일반이면 제외 성립

    const fraud = run({
      ...UNDER,
      underReportExclusion: "supplementary_valuation",
      penaltyReason: "fraudulent",
    });
    expect(fraud.exclusionApplied).toBeUndefined();
    expect(fraud.exclusionOverriddenByFraud).toBe("supplementary_valuation");
    expect(fraud.filingPenalty).toBe(24_000_000); // 60,000,000 × 40%
  });

  it("B2-4-3: 🔴 라목 단서는 **법인세 쪽 사실**이라 `penaltyReason`으로 대체되지 않는다", () => {
    // 이 신고가 부정행위라도 라목 단서는 걸리지 않는다 — 단서가 말하는 부정행위가 다르다.
    const ownFraud = run({
      ...UNDER,
      underReportExclusion: "corporate_adjustment",
      penaltyReason: "fraudulent",
    });
    expect(ownFraud.filingPenalty).toBe(0);
    expect(ownFraud.exclusionApplied).toBe("corporate_adjustment");

    // 법인세 경정이 부정행위에 기인해야 비로소 단서에 걸린다.
    const corpFraud = run({
      ...UNDER,
      underReportExclusion: "corporate_adjustment",
      corporateAdjustmentByFraud: true,
    });
    expect(corpFraud.exclusionOverriddenByFraud).toBe("corporate_adjustment");
    expect(corpFraud.filingPenalty).toBe(6_000_000); // 일반율 10%
  });

  it("B2-4-4: ⛔ 라목 단서는 **다른 목에는 걸리지 않는다**", () => {
    const r = run({
      ...UNDER,
      underReportExclusion: "supplementary_valuation",
      corporateAdjustmentByFraud: true,
    });
    expect(r.filingPenalty).toBe(0);
    expect(r.exclusionApplied).toBe("supplementary_valuation");
  });

  it("B2-4-5: 단서로 배제되면 그 사유를 결과에 남긴다 — 「왜 제외가 안 됐는지」", () => {
    const r = run({
      ...UNDER,
      underReportExclusion: "supplementary_valuation",
      penaltyReason: "offshore_fraud",
    });
    expect(r.steps[0].label).toBe("적용제외 불성립");
    expect(r.steps[0].legalBasis).toBe("국세기본법 §47의3④1호");
  });
});
