/**
 * anchor: 국세기본법 §47조의3①1호 — **가목 + 나목 합산**
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Track C)
 *
 * ## 법문 (KoreanLaw 축자 · MST 288571 시행 2026-08-11)
 *
 * > 1. 부정행위로 과소신고하거나 초과신고한 경우: **다음 각 목의 금액을 합한 금액**
 * >    가. **부정행위로 인한** 과소신고납부세액등의 100분의 40(역외거래에서 발생한 부정행위로
 * >        인한 경우에는 100분의 60)에 상당하는 금액
 * >    나. 과소신고납부세액등에서 **부정행위로 인한 과소신고납부세액등을 뺀 금액**의
 * >        100분의 10에 상당하는 금액
 *
 * 종전 구현은 **전액에 단일 비율**(40%/60%)을 곱했다 — 부정행위분이 일부인 신고에서
 * 나머지에도 40%가 붙어 **납세자에게 불리**했다.
 *
 * ## 무신고(§47조의2)에는 가목·나목이 없다
 *
 * §47조의2① 은 「그 신고로 납부하여야 할 세액에 다음 각 호의 구분에 따른 **비율을 곱한** 금액」이라
 * 분해가 없다(1호 40%[역외 60%] · 2호 20%). ⇒ 분해는 **과소신고·초과환급신고 전용**이다.
 *
 * ## 하위 호환
 *
 * `fraudulentPortion` 미입력이면 **base 전액을 부정행위분으로** 본다 — 종전 동작과 같다.
 * 그래야 이미 계산된 신고서·저장 이력의 세액이 입력 없이 바뀌지 않는다.
 */

import { describe, it, expect } from "vitest";
import {
  calculateFilingPenalty,
  formatFilingPenaltyFormula,
  formatFilingPenaltyLabel,
} from "@/lib/tax-engine/transfer-tax-penalty";
import type { FilingPenaltyInput } from "@/lib/tax-engine/transfer-tax-penalty";

/** 결정세액 100,000,000 · 차감 없음 → 과소신고납부세액등 = 100,000,000 */
function base(o: Partial<FilingPenaltyInput> = {}): FilingPenaltyInput {
  return {
    determinedTax: 100_000_000,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "under",
    penaltyReason: "fraudulent",
    ...o,
  };
}

describe("FS-1 과소신고 부정 — 가목 + 나목", () => {
  it("FS-1-1: 부정분 30,000,000 → 30,000,000×40% + 70,000,000×10% = 19,000,000", () => {
    const r = calculateFilingPenalty(base({ fraudulentPortion: 30_000_000 }));
    expect(r.filingPenalty).toBe(19_000_000);
  });

  it("FS-1-2: 역외 부정분 30,000,000 → 30,000,000×60% + 70,000,000×10% = 25,000,000", () => {
    const r = calculateFilingPenalty(
      base({ penaltyReason: "offshore_fraud", fraudulentPortion: 30_000_000 }),
    );
    expect(r.filingPenalty).toBe(25_000_000);
  });

  it("FS-1-3: 부정분 = 전액이면 종전과 같다 (100,000,000 × 40%)", () => {
    const r = calculateFilingPenalty(base({ fraudulentPortion: 100_000_000 }));
    expect(r.filingPenalty).toBe(40_000_000);
  });

  it("FS-1-4: 부정분 0 이면 전액 나목 10% — 「부정행위」로 선언해도 분이 없으면 가중이 없다", () => {
    const r = calculateFilingPenalty(base({ fraudulentPortion: 0 }));
    expect(r.filingPenalty).toBe(10_000_000);
  });

  it("FS-1-5: 부정분이 base 를 넘으면 base 로 clamp — 나목은 0", () => {
    const r = calculateFilingPenalty(base({ fraudulentPortion: 999_000_000 }));
    expect(r.filingPenalty).toBe(40_000_000);
  });

  it("FS-1-6: 분해 내역을 결과에 싣는다 — 화면이 「전액 × 40%」로 오해하지 않게", () => {
    const r = calculateFilingPenalty(base({ fraudulentPortion: 30_000_000 }));
    expect(r.fraudSplit).toEqual({
      fraudBase: 30_000_000,
      fraudRate: 0.4,
      normalBase: 70_000_000,
      normalRate: 0.1,
    });
  });
});

describe("FS-2 하위 호환 — 미입력이면 종전 동작", () => {
  it("FS-2-1: `fraudulentPortion` 미입력 → 전액 부정 40% (기존 신고서 세액 불변)", () => {
    const r = calculateFilingPenalty(base());
    expect(r.filingPenalty).toBe(40_000_000);
    expect(r.fraudSplit).toBeUndefined();
  });

  it("FS-2-2: 일반 과소신고(normal)는 분해와 무관하게 10%", () => {
    const r = calculateFilingPenalty(base({ penaltyReason: "normal", fraudulentPortion: 30_000_000 }));
    expect(r.filingPenalty).toBe(10_000_000);
  });
});

describe("FS-3 무신고에는 가목·나목이 없다 (§47조의2①)", () => {
  it("FS-3-1: 무신고 부정 — 부정분을 넣어도 전액 40%", () => {
    const r = calculateFilingPenalty(
      base({ filingType: "none", fraudulentPortion: 30_000_000 }),
    );
    expect(r.filingPenalty).toBe(40_000_000);
    expect(r.fraudSplit).toBeUndefined();
  });

  it("FS-3-2: 무신고 일반 — 20%", () => {
    const r = calculateFilingPenalty(base({ filingType: "none", penaltyReason: "normal" }));
    expect(r.filingPenalty).toBe(20_000_000);
  });
});

describe("FS-4 초과환급신고도 §47조의3 대상이라 분해된다", () => {
  it("FS-4-1: excess_refund + 부정분 30,000,000 → 19,000,000", () => {
    const r = calculateFilingPenalty(
      base({ filingType: "excess_refund", fraudulentPortion: 30_000_000 }),
    );
    expect(r.filingPenalty).toBe(19_000_000);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 🔴 FS-5 (G-06, 2026-09-03): 표시 산식이 표시 금액을 재현해야 한다
//
// 혼합 시 `penaltyRate`는 **실효세율**이다. 종전 표시 계층은 그것을 `toFixed(0)`으로
// 정수 %로 반올림해 「기준금액 × 20%」로 적었고, 그 산식을 그대로 계산하면
// 20,000,000이 나와 실제 금액 19,900,000과 100,000 어긋났다.
// 또 국세기본법에 없는 「20% 과소신고 가산세」로 읽혔다.
// ────────────────────────────────────────────────────────────────────────────

describe("FS-5 표시 산식 — 가목·나목 분해 (G-06)", () => {
  it("FS-5-1: 혼합이면 라벨에 실효세율을 쓰지 않는다", () => {
    const r = calculateFilingPenalty(base({ fraudulentPortion: 33_000_000 }));
    expect(r.fraudSplit).toBeDefined();
    expect(formatFilingPenaltyLabel(r)).toBe("신고불성실가산세 (가목·나목 혼합)");
    // 종전 표기(실효세율 반올림 「20%」)를 명시적으로 배제한다
    expect(formatFilingPenaltyLabel(r)).not.toContain("20%");
  });

  it("FS-5-2: 혼합 산식의 각 항 합이 실제 금액과 일치한다", () => {
    const r = calculateFilingPenalty(base({ fraudulentPortion: 33_000_000 }));
    // 가목 33,000,000 × 40% = 13,200,000 · 나목 67,000,000 × 10% = 6,700,000
    expect(r.filingPenalty).toBe(19_900_000);

    const formula = formatFilingPenaltyFormula(r);
    expect(formula).toContain("가목 33,000,000 × 40% = 13,200,000");
    expect(formula).toContain("나목 67,000,000 × 10% = 6,700,000");

    // 산식에 적힌 항들을 더하면 표시 금액이 나온다 (자기모순 방지)
    const parts = [...formula.matchAll(/= ([\d,]+)/g)].map((m) =>
      Number(m[1].replace(/,/g, "")),
    );
    expect(parts.reduce((a, b) => a + b, 0)).toBe(r.filingPenalty);
  });

  it("FS-5-3: 혼합이 아니면 종전 단일 세율 표기를 유지한다", () => {
    const r = calculateFilingPenalty(base({ penaltyReason: "normal" }));
    expect(r.fraudSplit).toBeUndefined();
    expect(formatFilingPenaltyLabel(r)).toBe("신고불성실가산세 (10%)");
    expect(formatFilingPenaltyFormula(r)).toBe("납부세액 100,000,000 × 10%");
  });
});
