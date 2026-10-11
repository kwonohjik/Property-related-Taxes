/**
 * S06-2 anchor — 1세대가 아니면 「소득세법 시행령」 §155⑳ 특례(→ §154①)를 적용할 수 없다 → 과세.
 *
 * 근거: §155⑳ 본문의 주체는 「…그 밖의 1주택을 국내에 소유하고 있는 **1세대가**」이고 효과는 「제154조제1항을 적용한다」다.
 * §154①도 「1세대가 양도일 현재 국내에 1주택을 보유」를 요건으로 한다(MST 290841 원문 확인). 일반 경로의
 * `checkExemption`은 `!isOneHousehold`면 즉시 과세지만(설계서 OH-16b), STEP 2.5(⑳)는 진입 게이트가 미등기뿐이라
 * 1세대 비해당 세대도 계산기가 전액 비과세로 냈다 — 같은 입력을 판정 메뉴는 과세로 답했다.
 *
 * 고치는 곳은 엔진 STEP 2.5 한 곳이다(API 직접 호출까지 막는다). ⑤ 거주기간 카드(③)는 1세대 OFF에서 거주기간의
 * **유일한 입력 경로**라 게이트하지 않는다 — 아래 UI 짝이 그 사실을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, withToday } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";
import cases from "./one-house-rulings/cases/E177.json";

const base = (cases as RulingCase[]).find((c) => c.id === "E177-era")!;
function mk(isOneHousehold: boolean): RulingCase {
  const asset = { ...(base.form!.asset as Record<string, unknown>) };
  return {
    ...base,
    form: { ...base.form!, isOneHousehold, asset: { ...asset, fixedAcquisitionPrice: "300000000", addressJibun: "서울특별시 종로구 청운동 1" } },
  };
}

describe("S06-2 STEP 2.5 1세대 게이트", () => {
  it("1세대 OFF + ⑳ A 충족 → 계산기 과세 · ⑳ 미적용 · 사유는 1세대 요건", async () => {
    const c = mk(false);
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.issues).toEqual([]);
      expect(r.status).toBe(200);
      expect(r.r.rentalHousingExceptionDetail?.applied).not.toBe(true);
      expect(r.isExempt).toBe(false);
      expect(r.totalTax).toBeGreaterThan(0);
      const step = (r.r.steps as { label: string; formula: string }[]).find((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 적용 불가");
      expect(step?.formula).toMatch(/1세대/);
    });
  });
  it("[긍정 짝] 1세대 ON + ⑳ A 충족 → 비과세(같은 입력에서 1세대만 다르다)", async () => {
    const c = mk(true);
    await withToday(c.today, async () => {
      const r = await runCalc(handoff(buildCaseForm(c)));
      expect(r.isExempt).toBe(true);
      expect(r.totalTax).toBe(0);
    });
  });
});
