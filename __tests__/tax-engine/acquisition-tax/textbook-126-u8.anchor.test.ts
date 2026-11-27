/**
 * 취득세 교재 대조 U8 — §28의3②1호 단서 미성년자 판정은 나이로도 한다 (교재 p9: 미성년자는 소득이 있어도 부모 세대)
 *
 * 종전: `isMinor` 플래그만 봐서 18세 자녀가 플래그 없이 들어오면 1호 별도 세대로 인정했다(직접 API 경로).
 */
import { describe, it, expect } from "vitest";
import { isSeparateHousehold, isMinorMember } from "../../../lib/tax-engine/house-count/household";
import type { HouseholdMember } from "../../../lib/tax-engine/house-count/types";

const child = (age: number, extra: Partial<HouseholdMember> = {}): HouseholdMember => ({
  relation: "child",
  age,
  income12Months: 30_000_000,
  medianIncome: 50_000_000,
  hasIndependentLivelihood: true,
  ...extra,
});

describe("U8 미성년 판정 — 플래그 또는 만 19세 미만", () => {
  it("18세(플래그 없음) → 미성년 → 1호 별도 세대 아님", () => {
    expect(isMinorMember(child(18))).toBe(true);
    expect(isSeparateHousehold({ members: [child(18)] }).isSeparate).toBe(false);
  });

  it("19세 → 성년 → 소득 요건 충족 시 별도 세대", () => {
    expect(isMinorMember(child(19))).toBe(false);
    expect(isSeparateHousehold({ members: [child(19)] }).isSeparate).toBe(true);
  });

  it("플래그가 미성년이면 나이와 무관하게 미성년", () => {
    expect(isSeparateHousehold({ members: [child(20, { isMinor: true })] }).isSeparate).toBe(false);
  });
});
