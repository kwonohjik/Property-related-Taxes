/**
 * anchor R23 — 수정신고 「**정당한 사유 면제**(국세기본법 §48①2호)」는 신고불성실가산세를 **0**으로 만든다.
 *
 * ## 종전 결함 — 라디오가 「가산세 0」이라 말하고 엔진은 전액을 부과했다
 *
 * ⑤ `AmendmentBlock.tsx:224-228`이 「정당한 사유 면제 (국세기본법 §48①2호) / 증액보상금 등 —
 * **가산세 0**」 라디오를 주고 store 기본값도 `underReductionMode: "exempt"`
 * (`calc-wizard-store.ts:153` · `multi-transfer-tax-store.ts:102`)인데,
 * `computeAmendment`의 첫 분기가 **모드를 보지 않았다**:
 *
 * ```
 * if (applyUnderReportingPenalty && additionalTax > 0) { … rate = mode === "auto_48_2" ? … : 0 }
 * else if (applyUnderReportingPenalty && mode === "exempt") { … amount: 0 }
 * ```
 *
 * `exempt`도 첫 분기로 들어와 **감면율 0 = 전액**이 됐고, `else if`의 면제 분기는
 * `additionalTax <= 0`일 때만 도달해 **의미 있는 경우에 한 번도 실행되지 않았다**.
 *
 * | 추가납부 20,000,000 · normal(10%) · exempt | 종전 | 정정 |
 * |---|---|---|
 * | `underReportingPenalty` | **2,000,000** | **0** |
 * | `totalPayable` | 22,000,000 | 20,000,000 |
 *
 * ## 근거 — 「국세기본법」 §48①2호
 *
 * > 정부는 … 가산세를 부과하지 아니한다. … 2. 납세자가 의무를 이행하지 아니한 데 **정당한 사유가 있는 때**
 *
 * 「부과하지 아니한다」이므로 §48②의 **감면율**(10~90%)과 층이 다르다 — 면제는 전액 0이다.
 *
 * ## 🔴 기존 anchor 1건을 뒤집었다 (약화가 아니다)
 *
 * `amendment.test.ts` A2가 `exempt`에서 전액 2,000,000을 단언해 **결함을 고정**하고 있었다.
 * 「가산세 ON이면 10%가 붙는다」는 축은 A2b(`auto_48_2` · 2년 초과 → 감면 0%)로 옮겨 보존했다.
 * [[feedback_anchor_correction_legal_priority]]
 *
 * ## 침묵하지 않는다
 *
 * 면제 시에도 `steps`에 「신고불성실가산세 (정당한 사유 면제) · §48①2호 — 면제 · 0」이 남고
 * 결과 카드가 산출근거로 인쇄한다(`AmendmentResultCard.tsx:178-189`).
 * 그래서 store 기본값 `"exempt"`는 **그대로 둔다** — 0이 근거와 함께 보인다.
 */
import { describe, it, expect } from "vitest";
import { computeAmendment } from "@/lib/tax-engine/transfer-tax-amendment";
import type { AmendmentInput } from "@/lib/tax-engine/types/transfer-amendment.types";

const base = (o?: Partial<AmendmentInput>): AmendmentInput => ({
  originalDeterminedTax: 30_000_000,
  applyUnderReportingPenalty: true,
  underReportingReason: "normal",
  underReductionMode: "exempt",
  applyLatePaymentPenalty: false,
  ...o,
});

/** 결정세액 50,000,000 − 당초 30,000,000 = 추가납부 20,000,000 */
const DETERMINED = 50_000_000;

describe("R23 · 정당한 사유 면제(§48①2호) — 신고불성실가산세 0", () => {
  it("🔴 면제 모드에서 가산세가 0이다 — 종전에는 2,000,000이었다", () => {
    const r = computeAmendment(base(), DETERMINED);
    expect(r.additionalTax).toBe(20_000_000);
    expect(r.underReportingPenalty).toBe(0);
  });

  it("🔴 총 납부세액에 가산세가 섞이지 않는다", () => {
    const r = computeAmendment(base(), DETERMINED);
    expect(r.totalPayable).toBe(20_000_000);
  });

  it("부정행위(40%)·역외(60%)에서도 면제가 이긴다", () => {
    for (const reason of ["fraudulent", "offshore_fraud"] as const) {
      const r = computeAmendment(base({ underReportingReason: reason }), DETERMINED);
      expect(r.underReportingPenalty).toBe(0);
      expect(r.totalPayable).toBe(20_000_000);
    }
  });

  it("🔑 침묵하지 않는다 — 산출근거에 면제 사실과 조문이 남는다", () => {
    const r = computeAmendment(base(), DETERMINED);
    const step = r.steps.find((s) => s.label.includes("정당한 사유 면제"));
    expect(step).toBeDefined();
    expect(step!.amount).toBe(0);
    expect(step!.legalBasis).toContain("48");
  });

  it("면제 모드에는 §48② 감면율 라벨이 붙지 않는다", () => {
    const r = computeAmendment(base(), DETERMINED);
    expect(r.underReportingReductionRate).toBe(0);
    expect(r.steps.some((s) => s.formula?.includes("감면"))).toBe(false);
  });
});

describe("🔴 대조군 — auto_48_2(§48② 자진수정 감면) 경로는 무변경", () => {
  it("2년 초과 → 감면 0% → 전액 2,000,000 (「10%가 붙는다」 축 보존)", () => {
    const r = computeAmendment(
      base({
        underReductionMode: "auto_48_2",
        statutoryFilingDeadline: new Date("2022-05-31"),
        amendedFilingDate: new Date("2025-05-31"),
      }),
      DETERMINED,
    );
    expect(r.underReportingReductionRate).toBe(0);
    expect(r.underReportingPenalty).toBe(2_000_000);
    expect(r.totalPayable).toBe(22_000_000);
  });

  it("1개월 이내 → 90% 감면 → 200,000", () => {
    const r = computeAmendment(
      base({
        underReductionMode: "auto_48_2",
        statutoryFilingDeadline: new Date("2024-05-31"),
        amendedFilingDate: new Date("2024-06-20"),
      }),
      DETERMINED,
    );
    expect(r.underReportingReductionRate).toBe(0.9);
    expect(r.underReportingPenalty).toBe(200_000);
  });
});

describe("대조군 — 면제는 다른 축을 건드리지 않는다", () => {
  it("가산세 토글 OFF면 면제 step도 없다", () => {
    const r = computeAmendment(base({ applyUnderReportingPenalty: false }), DETERMINED);
    expect(r.underReportingPenalty).toBe(0);
    expect(r.steps.some((s) => s.label.includes("정당한 사유 면제"))).toBe(false);
  });

  it("🔑 납부지연가산세(§47의4)는 면제 축과 무관하게 그대로 부과된다", () => {
    const r = computeAmendment(
      base({
        applyLatePaymentPenalty: true,
        statutoryFilingDeadline: new Date("2023-05-31"),
        amendedPaymentDate: new Date("2026-06-30"),
      }),
      DETERMINED,
    );
    expect(r.underReportingPenalty).toBe(0);
    expect(r.latePaymentPenalty).toBe(4_950_000);
    expect(r.totalPayable).toBe(24_950_000);
  });

  it("추가납부세액이 0이면 아무 가산세도 없다", () => {
    const r = computeAmendment(base(), 30_000_000);
    expect(r.additionalTax).toBe(0);
    expect(r.underReportingPenalty).toBe(0);
    expect(r.totalPayable).toBe(0);
  });
});
