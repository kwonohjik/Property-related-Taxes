/** PR12a anchor 공용 — 판정 메뉴 폼 → ⑧ → ④ → route(⑫⑭) → 결과 화면 렌더(`OneHouseJudgmentResultView`). `_one-house-pr3a-judge-route`는 렌더를 하지 않는다. */
import { render, cleanup } from "@testing-library/react";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { observeRaw } from "./_one-house-pr3a-judge-route";
import type { RulingCase } from "./one-house-rulings/harness";

export async function judgeAndRender(c: RulingCase, renderView = true, keep = false) {
  const o = await observeRaw(c);
  let text = "";
  if (renderView && o.status === 200) {
    const r = render(<OneHouseJudgmentResultView result={o.data} transferDate={(c.form as { transferDate: string }).transferDate} />);
    text = (r.container.textContent ?? "").replace(/\s+/g, " ");
    if (!keep) cleanup();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (o.j ?? {}) as any;
  return {
    ...o,
    j,
    text,
    isExempt: j.isExempt as boolean | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    undeterminedReasons: (j.undetermined ?? []).map((u: any) => `${u.id} :: ${u.reason}`) as string[],
  };
}
