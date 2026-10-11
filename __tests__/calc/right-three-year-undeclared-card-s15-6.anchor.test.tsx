/**
 * S15-6 anchor — 3년 경과 예외 카드의 미선택 안내는 엔진 결론(미선언 → §89② 배제 = 과세)과 같은 뜻이어야 한다.
 *
 * 2026-10-08부터 엔진은 미선언을 「모름 → 혜택 불성립 + 확인 필요」로 과세 처리하고(`one-house/pending.ts` 고지) 「해당 없음」 명시 선언과
 * 같은 세액을 낸다. 카드의 「종전대로 계산」은 비과세 유지를 암시해 반대로 안내했다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RightThreeYearExceptionSection } from "@/components/calc/transfer/RightThreeYearExceptionSection";
import { buildCaseForm } from "./one-house-rulings/harness";
import { mkCase } from "./_one-house-pr3a-judge-route";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import g106 from "./one-house-rulings/cases/G106.json";

afterEach(cleanup);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base = (g106 as any[]).find((x) => x.id === "G106-era");
const withKind = (kind: string) =>
  mkCase(base.today, { ...base.form, rightThreeYearExceptionKind: kind, rightMovedInWithin3Years: undefined, rightResidedOneYearOrMore: undefined });
const cardOf = (kind: string) => {
  const { container } = render(<RightThreeYearExceptionSection form={buildCaseForm(withKind(kind)) as unknown as TransferFormData} onChange={() => {}} />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
};

describe("S15-6 미선택 안내 = 엔진 결론", () => {
  it("미선택이면 엔진은 과세 — 카드도 과세로 계산한다고 안내한다 (「종전대로」 아님)", async () => {
    const o = await judgeAndRender(withKind(""), false);
    expect(o.isExempt).toBe(false);
    expect(o.undeterminedReasons.some((r) => r.startsWith("89-2-three-year-exception-undeclared"))).toBe(true);
    const t = cardOf("");
    expect(t).not.toContain("종전대로");
    expect(t).toContain("선택하지 않으면 예외 없이 과세로 계산하고 결과에 확인 안내를 남깁니다");
  });
  it("엔진 고지와 카드가 같은 뜻의 말을 쓴다 — 「예외 없이 과세」", async () => {
    const o = await judgeAndRender(withKind(""), false);
    const reason = o.undeterminedReasons.find((r) => r.startsWith("89-2-three-year-exception-undeclared")) ?? "";
    expect(reason).toContain("예외 없이 과세로");
    expect(cardOf("")).toContain("예외 없이 과세로");
  });
  it("긍정 짝: 「해당 없음」 명시 선언은 같은 과세이지만 확인 안내도 카드 안내도 없다", async () => {
    const o = await judgeAndRender(withKind("none"), false);
    expect(o.isExempt).toBe(false);
    expect(o.undeterminedReasons.some((r) => r.startsWith("89-2-three-year-exception-undeclared"))).toBe(false);
    expect(cardOf("none")).not.toContain("선택하지 않으면");
  });
});
