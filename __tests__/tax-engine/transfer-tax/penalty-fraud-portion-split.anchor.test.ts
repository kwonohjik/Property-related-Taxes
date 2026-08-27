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
import { calculateFilingPenalty } from "@/lib/tax-engine/transfer-tax-penalty";
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
