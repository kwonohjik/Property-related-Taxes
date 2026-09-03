/**
 * G-05 — 기한 후 신고 무신고가산세 감면 (「국세기본법」 §48②2호 · §48②3호라목)
 *
 * 리뷰 `docs/reviews/penalty-code-review-2026-09.md` §G-05.
 *
 * ## 고정하는 계약
 *
 * 1. **라목이 2호를 지배한다** — 「제2호에도 불구하고」. 예정신고를 하지 않고 확정신고기한
 *    이내에 기한 후 신고를 하면 경과기간과 무관하게 **일률 50%**다. 2호의 체감표(50/30/20)는
 *    확정신고기한을 **넘긴 뒤에야** 등장한다.
 * 2. **§47의2 무신고 전용** — 과소신고(§47의3)·초과환급에는 붙지 않는다.
 * 3. **배제 단서** — 「결정할 것을 미리 알고」면 감면 0.
 * 4. **표시 산식이 표시 금액을 재현한다** — 감면이 붙었는데 「기준 × 20%」만 적으면
 *    G-04·G-06과 같은 표시 드리프트가 된다.
 */

import { describe, it, expect } from "vitest";
import {
  calculateFilingPenalty,
  formatFilingPenaltyFormula,
  formatFilingPenaltyLabel,
} from "@/lib/tax-engine/transfer-tax-penalty";
import { resolveLateFilingReduction } from "@/lib/tax-engine/late-filing-reduction";
import { getFilingDeadline } from "@/lib/calc/filing-deadline";
import { deriveStatutoryDeadline } from "@/lib/calc/transfer-amendment-helpers";

/** 리뷰 §G-05 재현 격자 — 양도 2025-01-10 · 결정세액 1억 */
const TRANSFER_DATE = "2025-01-10";
const DETERMINED = 100_000_000;

/** 예정신고기한 §105①1호 = 2025-03-31 · 확정신고기한 §110① = 2026-05-31 */
const PRELIM_DEADLINE = getFilingDeadline(TRANSFER_DATE);
const FINAL_DEADLINE = deriveStatutoryDeadline(TRANSFER_DATE);

function run(filingDate: string, notified = false, withFinal = true) {
  return calculateFilingPenalty({
    determinedTax: DETERMINED,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "none",
    penaltyReason: "normal",
    lateFiling: {
      statutoryDeadline: PRELIM_DEADLINE,
      actualFilingDate: filingDate,
      finalReturnDeadline: withFinal ? FINAL_DEADLINE : undefined,
      priorAssessmentNotified: notified,
    },
  });
}

describe("G05-0 기한 파생 — 두 기한이 실제로 다르다", () => {
  it("G05-0-1: 예정신고기한 2025-03-31 · 확정신고기한 2026-05-31", () => {
    expect(PRELIM_DEADLINE).toBe("2025-03-31");
    expect(FINAL_DEADLINE).toBe("2026-05-31");
  });
});

describe("G05-1 §48②3호라목 — 확정신고기한 이내는 일률 50%", () => {
  it("G05-1-1: 🔴 리뷰 재현 — 신고일 2025-04-15 → 20,000,000 이 아니라 10,000,000", () => {
    const r = run("2025-04-15");
    expect(r.grossFilingPenalty).toBe(20_000_000);
    expect(r.lateFilingReductionRate).toBe(0.5);
    expect(r.lateFilingReductionAmount).toBe(10_000_000);
    expect(r.filingPenalty).toBe(10_000_000);
  });

  it("G05-1-2: ⭐ 6개월을 넘겨도 확정신고기한 이내면 50% — 2호였다면 0%였다", () => {
    // 예정신고기한 + 8개월. §48②2호 표라면 「6개월 초과 → 감면 없음」이다.
    const r = run("2025-11-30");
    expect(r.lateFilingReductionRate).toBe(0.5);
    expect(r.filingPenalty).toBe(10_000_000);

    // 구별력 — 라목 축(확정신고기한)을 빼면 2호로 내려가 감면이 사라진다.
    const without = run("2025-11-30", false, false);
    expect(without.lateFilingReductionRate).toBe(0);
    expect(without.filingPenalty).toBe(20_000_000);
  });

  it("G05-1-3: 확정신고기한 당일(2026-05-31)까지는 라목 — 「까지」는 경계 포함", () => {
    expect(run("2026-05-31").lateFilingReductionRate).toBe(0.5);
  });
});

describe("G05-2 §48②2호 — 확정신고기한을 넘긴 뒤의 체감표", () => {
  it("G05-2-1: 확정신고기한 초과 + 예정신고기한 후 6개월 초과 → 감면 없음", () => {
    const r = run("2026-06-01");
    expect(r.lateFilingReductionRate).toBe(0);
    expect(r.filingPenalty).toBe(20_000_000);
  });

  it.each([
    ["2025-04-15", 0.5, "1개월 이내 — 가목"],
    ["2025-06-20", 0.3, "1개월 초과 3개월 이내 — 나목"],
    ["2025-09-20", 0.2, "3개월 초과 6개월 이내 — 다목"],
    ["2025-11-30", 0, "6개월 초과 — 감면 없음"],
  ])(
    "G05-2-2: 라목 미적용(확정신고기한 축 없음) 시 신고일 %s → %s (%s)",
    (filed, rate) => {
      expect(run(filed as string, false, false).lateFilingReductionRate).toBe(rate);
    },
  );

  it("G05-2-3: ⛔ §48②1호(수정신고 90/75/50/30/20/10%) 표와 혼용되지 않는다", () => {
    // 1개월 이내는 2호 50%다. 1호였다면 90%였다.
    expect(run("2025-04-15", false, false).lateFilingReductionRate).toBe(0.5);
    expect(run("2025-04-15", false, false).lateFilingReductionRate).not.toBe(0.9);
  });
});

describe("G05-3 배제·게이트", () => {
  it("G05-3-1: 🔴 「결정할 것을 미리 알고」 신고하면 감면 배제 (두 조문 공통 괄호)", () => {
    const r = run("2025-04-15", true);
    expect(r.lateFilingReductionRate).toBe(0);
    expect(r.filingPenalty).toBe(20_000_000);
  });

  it("G05-3-2: ⛔ 과소신고(§47의3)에는 붙지 않는다 — 두 조문 모두 §47의2 전용", () => {
    const r = calculateFilingPenalty({
      determinedTax: DETERMINED,
      reductionAmount: 0,
      priorPaidTax: 0,
      originalFiledTax: 0,
      excessRefundAmount: 0,
      interestSurcharge: 0,
      filingType: "under",
      penaltyReason: "normal",
      lateFiling: {
        statutoryDeadline: PRELIM_DEADLINE,
        actualFilingDate: "2025-04-15",
        finalReturnDeadline: FINAL_DEADLINE,
      },
    });
    expect(r.lateFilingReductionRate).toBe(0);
    expect(r.filingPenalty).toBe(10_000_000); // 1억 × 10%
  });

  it("G05-3-3: 기한 내 신고면 감면 축이 열려 있어도 0 — 기한 후 신고가 아니다", () => {
    expect(run("2025-03-20").lateFilingReductionRate).toBe(0);
  });

  it("G05-3-4: `lateFiling` 미제공이면 종전 동작(전액) 그대로 — 하위 호환", () => {
    const r = calculateFilingPenalty({
      determinedTax: DETERMINED,
      reductionAmount: 0,
      priorPaidTax: 0,
      originalFiledTax: 0,
      excessRefundAmount: 0,
      interestSurcharge: 0,
      filingType: "none",
      penaltyReason: "normal",
    });
    expect(r.filingPenalty).toBe(20_000_000);
    expect(r.grossFilingPenalty).toBe(20_000_000);
    expect(r.lateFilingReductionRate).toBe(0);
  });

  it("G05-3-5: 부정행위 40%에도 감면이 걸린다 — §48②은 §47의2 가산세 전체가 대상", () => {
    const r = calculateFilingPenalty({
      determinedTax: DETERMINED,
      reductionAmount: 0,
      priorPaidTax: 0,
      originalFiledTax: 0,
      excessRefundAmount: 0,
      interestSurcharge: 0,
      filingType: "none",
      penaltyReason: "fraudulent",
      lateFiling: {
        statutoryDeadline: PRELIM_DEADLINE,
        actualFilingDate: "2025-04-15",
        finalReturnDeadline: FINAL_DEADLINE,
      },
    });
    expect(r.grossFilingPenalty).toBe(40_000_000);
    expect(r.filingPenalty).toBe(20_000_000);
  });
});

describe("G05-4 표시 산식이 표시 금액을 재현한다", () => {
  it("G05-4-1: 라벨에 감면율이 드러난다", () => {
    expect(formatFilingPenaltyLabel(run("2025-04-15"))).toBe(
      "신고불성실가산세 (20% · 기한 후 신고 감면 50%)",
    );
  });

  it("G05-4-2: 🔴 산식의 마지막 수치가 금액과 일치한다", () => {
    const r = run("2025-04-15");
    const formula = formatFilingPenaltyFormula(r);
    expect(formula).toContain("100,000,000 × 20% = 20,000,000");
    expect(formula).toContain("− 감면 50% 10,000,000");
    // 자기일관 — 산식이 말하는 감면 전·감면액의 차가 실제 금액이다.
    expect(r.grossFilingPenalty - r.lateFilingReductionAmount).toBe(r.filingPenalty);
  });

  it("G05-4-3: 감면이 없으면 산식이 종전 그대로다", () => {
    expect(formatFilingPenaltyFormula(run("2025-04-15", true))).toBe(
      "납부세액 100,000,000 × 20%",
    );
  });
});

describe("G05-5 공용 leaf 계약", () => {
  it("G05-5-1: 확정신고기한을 넘기지 않으면 라목이 성립하지 않는다 (상속·증여 계약)", () => {
    const r = resolveLateFilingReduction({
      statutoryDeadline: "2025-04-30",
      actualFilingDate: "2025-12-20",
    });
    expect(r.rate).toBe(0);
    expect(r.ruleRef).toBe("");
  });

  it("G05-5-2: 적용 조문이 결과에 실린다 — 라목 vs 2호를 구별할 수 있다", () => {
    expect(
      resolveLateFilingReduction({
        statutoryDeadline: PRELIM_DEADLINE,
        actualFilingDate: "2025-11-30",
        finalReturnDeadline: FINAL_DEADLINE,
      }).ruleRef,
    ).toContain("§48②3호라목");
    expect(
      resolveLateFilingReduction({
        statutoryDeadline: PRELIM_DEADLINE,
        actualFilingDate: "2025-04-15",
      }).ruleRef,
    ).toContain("§48②2호");
  });

  it("G05-5-3: Date 객체와 ISO 문자열이 같은 답을 낸다", () => {
    const asString = resolveLateFilingReduction({
      statutoryDeadline: "2025-03-31",
      actualFilingDate: "2025-04-15",
    });
    const asDate = resolveLateFilingReduction({
      statutoryDeadline: new Date("2025-03-31"),
      actualFilingDate: new Date("2025-04-15"),
    });
    expect(asDate.rate).toBe(asString.rate);
  });
});
