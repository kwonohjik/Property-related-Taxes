/**
 * anchor — 집계 농특세 「미판정」 step (#3098 남은 확인 필요, 그룹 Z)
 *
 * 단건은 판정표(`RURAL_SURTAX_TABLE`)에 없는 감면 유형이면 「농어촌특별세 — 미판정」 step을 남긴다(침묵 금지).
 * 집계 `computeAggregateTaxCreditRuralSurtax`는 같은 유형을 조용히 0으로 처리하고 step을 남기지 않았다.
 * 수정: 단건 3경로와 같은 단일 소스 `ruralSurtaxUnknownStep`으로 집계도 step을 남긴다 — 세액 불변.
 *
 * 판정표에 없는 유형은 실입력으로는 만들 수 없다(`rural-surtax-table-covers-reduction-ids` anchor가 전수 강제) —
 * 그래서 집계 함수를 직접 호출한다.
 */
import { describe, it, expect } from "vitest";
import { computeAggregateTaxCreditRuralSurtax } from "@/lib/tax-engine/transfer-tax-aggregate-reduction-step";
import { resolveTaxCreditRuralSurtax, ruralSurtaxUnknownStep, RURAL_SURTAX_UNKNOWN_LABEL } from "@/lib/tax-engine/transfer-tax-rural-surtax";
import type { CalculationStep } from "@/lib/tax-engine/transfer-tax";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const rec = (reductionTypeApplied: string | undefined): Any => ({ result: { reductionTypeApplied }, item: {} });

describe("집계 농특세 — 판정표에 없는 감면 유형은 「미판정」 step을 남긴다", () => {
  it("미판정 유형 1건: step 1개, 세액 0, 과세 대상 감면세액 0", () => {
    const steps: CalculationStep[] = [];
    const out = computeAggregateTaxCreditRuralSurtax([rec("not_in_table_x")], new Map([[0, 5_000_000]]), steps);
    expect(out).toEqual({ surtax: 0, taxableReduction: 0 });
    expect(steps).toHaveLength(1);
    expect(steps[0].label).toBe(RURAL_SURTAX_UNKNOWN_LABEL);
    expect(steps[0].amount).toBe(0);
  });
  it("단건과 같은 문구(단일 소스) — 판정 사유가 formula에 그대로", () => {
    const steps: CalculationStep[] = [];
    computeAggregateTaxCreditRuralSurtax([rec("not_in_table_x")], new Map([[0, 5_000_000]]), steps);
    const verdict = resolveTaxCreditRuralSurtax({ reductionTypeApplied: "not_in_table_x", reductionAmount: 5_000_000 });
    expect(verdict.verdict).toBe("unknown");
    expect(steps[0]).toEqual(ruralSurtaxUnknownStep(verdict));
  });
  it("세액 불변: 과세 유형과 섞여도 과세 몫만 20%이고 미판정 몫은 더해지지 않는다", () => {
    const steps: CalculationStep[] = [];
    const out = computeAggregateTaxCreditRuralSurtax(
      [rec("not_in_table_x"), rec("replacement_land_comp")],
      new Map([[0, 5_000_000], [1, 10_000_000]]),
      steps,
    );
    expect(out).toEqual({ surtax: 2_000_000, taxableReduction: 10_000_000 });
    expect(steps.filter((s) => s.label === RURAL_SURTAX_UNKNOWN_LABEL)).toHaveLength(1);
    expect(steps.some((s) => s.label === "농어촌특별세 (감면세액 × 20%)" && s.amount === 2_000_000)).toBe(true);
  });
  it("대조군: 비과세(§69)·감면 없음은 step을 남기지 않는다", () => {
    const steps: CalculationStep[] = [];
    computeAggregateTaxCreditRuralSurtax([rec("self_farming"), rec(undefined)], new Map([[0, 5_000_000], [1, 0]]), steps);
    expect(steps).toHaveLength(0);
  });
});
