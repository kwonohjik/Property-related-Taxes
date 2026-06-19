import { describe, it, expect } from "vitest";
import { evaluateExemptions } from "@/lib/tax-engine/exemption-evaluator";

/**
 * 증여세 비과세 category 가드 — 상속세 비과세(inh_*)가 증여 계산에 적용되지 않아야 한다.
 * 계획서 gift-exemption-category-fix.plan.md §3-3 / §6 (계산버그 수정 anchor).
 */
describe("evaluateExemptions category 가드", () => {
  const INH_ITEM = { ruleId: "inh_state_bequest", claimedAmount: 100_000_000 };
  const GIFT_ITEM = { ruleId: "gift_veterans_benefit", claimedAmount: 50_000_000 };

  it("[버그 수정] 증여 맥락에서 상속세 inh_* 항목은 차감 0", () => {
    const r = evaluateExemptions([INH_ITEM], 500_000_000, "gift");
    expect(r.totalExemptAmount).toBe(0);
    expect(r.itemResults).toHaveLength(0);
  });

  it("증여 맥락에서 gift_* 항목은 정상 차감", () => {
    const r = evaluateExemptions([GIFT_ITEM], 500_000_000, "gift");
    expect(r.totalExemptAmount).toBeGreaterThan(0);
    expect(r.itemResults.length).toBeGreaterThan(0);
  });

  it("상속 맥락에서 inh_* 항목은 정상 차감(회귀 0)", () => {
    const r = evaluateExemptions([INH_ITEM], 500_000_000, "inheritance");
    expect(r.totalExemptAmount).toBe(100_000_000);
  });

  it("category 미지정(기존 호출) — 가드 미적용(하위호환)", () => {
    const r = evaluateExemptions([INH_ITEM], 500_000_000);
    expect(r.totalExemptAmount).toBe(100_000_000);
  });
});
