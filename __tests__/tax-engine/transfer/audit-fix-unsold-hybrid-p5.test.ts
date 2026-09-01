/**
 * 감사 확정 결함 회귀 — unsold-hybrid-p5.ts:71 (date-boundary-drift, redux-unsold-hybrid)
 *
 * §98 "5년 이상 보유" 판정 heldAtLeast5Years가 setFullYear를 써서 윤년(2/29) 취득일의
 * 5년 만료일을 1일 뒤로 밀었다(2/29+5년 → 3/1 롤오버). 코드베이스 관례(new-99-3
 * isWithin5YearsCheck, date-fns addYears)와 민법 §160③(응당일 없으면 말일 만료)에 위배.
 *
 * 기대값은 민법 §160③에서 독립 도출:
 *   취득일 1996-02-29의 만 5년 만료일 = 2001년에 2/29 부재 → 말일 2001-02-28.
 *   → 2001-02-28 양도 = 만 5년 충족(적격), 2001-02-27 양도 = 5년 미만(부적격).
 * (setFullYear 버그는 만료일을 2001-03-01로 밀어 2001-02-28 양도를 부당하게 거부했다.)
 *
 * 실행: npx vitest run __tests__/tax-engine/transfer/audit-fix-unsold-hybrid-p5.test.ts
 */
import { describe, it, expect } from "vitest";
import { evaluateUnsold98, type Unsold98Input } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";

// 취득일 1996-02-29 (§98 트랙1 1995.11.1~1997.12.31 창 내), 홀딩기간 외 모든 요건 충족.
const baseInput = (transferDate: Date): Unsold98Input => ({
  transferDate,
  acquisitionDate: new Date("1996-02-29"),
  isResident: true,
  isNationalScale: true,
  isOutsideSeoul: true,
  isUnsoldConfirmed: true,
  isNotRentalHousing: true, // 령 §98①1호 괄호 — 민간·공공임대주택 제외 (CA-06)
  isFirstBuyerNoOccupancy: true,
  rentedFor5Years: true,
});

describe("[audit unsold-hybrid-p5:71] §98 heldAtLeast5Years 윤년 경계 (민법 §160③)", () => {
  it("취득 1996-02-29 + 양도 2001-02-28 → 만 5년 충족 → §98 적격(세율 20% 특례)", () => {
    // 민법 §160③: 2001년 2/29 부재 → 만 5년 만료일 = 말일 2001-02-28. 당일 양도는 5년 이상 보유.
    const result = evaluateUnsold98(baseInput(new Date("2001-02-28")));
    expect(result.isEligible).toBe(true);
    expect(result.ineligibleReasons).toEqual([]);
    expect(result.effectCategory).toBe("flat_rate_20");
  });

  it("취득 1996-02-29 + 양도 2001-02-27 → 5년 미만 → HOLDING_PERIOD_SHORT", () => {
    const result = evaluateUnsold98(baseInput(new Date("2001-02-27")));
    expect(result.isEligible).toBe(false);
    expect(result.ineligibleReasons.some((r) => r.code === "HOLDING_PERIOD_SHORT")).toBe(true);
  });

  it("취득 1996-02-29 + 양도 2001-03-01 → 5년 초과 → §98 적격 (버그 유무 무관 sanity)", () => {
    const result = evaluateUnsold98(baseInput(new Date("2001-03-01")));
    expect(result.isEligible).toBe(true);
  });
});
