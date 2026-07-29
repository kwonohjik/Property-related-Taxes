/**
 * Anchor — M-15·M-17 상속·증여 신고기한 말일 기산 (상증법 §67·§68)
 *
 * - M-15 §68① 증여: 증여받은 날이 속하는 "달의 말일부터" 3개월. 종전 증여일에 직접 +3개월 →
 *     최대 30일 이르게 계산. getGiftFilingDueDates는 endOfMonth 기산.
 * - M-17 §67 상속: §67① 말일 + 6개월, §67④ 비거주자 9개월. 종전 filing-form-9-data는
 *     decedentType 분기 없이 항상 6개월.
 */
import { describe, it, expect } from "vitest";
import {
  getGiftFilingDueDates,
  getInheritanceFilingDueDates,
} from "@/lib/calc/inheritance-gift-filing-deadline";

describe("M-15 증여 신고기한 §68① 말일 기산", () => {
  it("[M15-A] 2024-01-15 증여 → 1월 말일(31) + 3개월 = 2024-04-30 (종전 증여일+3=04-15)", () => {
    expect(getGiftFilingDueDates("2024-01-15")).toEqual({
      filing: "2024-04-30",
      installment: "2024-06-30", // 분납 +2개월 §70②
    });
  });

  it("[M15-B] 2024-11-20 증여 → 11월 말일(30) + 3개월 = 2025-02-28 (연도 경계·비윤년)", () => {
    expect(getGiftFilingDueDates("2024-11-20")!.filing).toBe("2025-02-28");
  });

  it("[M15-C] giftDate 미입력 → undefined", () => {
    expect(getGiftFilingDueDates(undefined)).toBeUndefined();
    expect(getGiftFilingDueDates("")).toBeUndefined();
  });
});

describe("M-17 상속 신고기한 §67 말일 기산 + 비거주자 9개월", () => {
  it("[M17-RESIDENT] 2024-03-15 상속·거주자 → 3월 말일 + 6개월 = 2024-09-30", () => {
    expect(getInheritanceFilingDueDates("2024-03-15", "resident")).toEqual({
      filing: "2024-09-30",
      installment: "2024-11-30",
    });
  });

  it("[M17-NONRESIDENT] 2024-03-15 상속·비거주자 → 3월 말일 + 9개월 = 2024-12-31 (§67④)", () => {
    expect(getInheritanceFilingDueDates("2024-03-15", "non_resident").filing).toBe(
      "2024-12-31",
    );
  });

  it("[M17-BACKCOMPAT] decedentType 미입력 → 6개월 (기존 동작 유지)", () => {
    expect(getInheritanceFilingDueDates("2024-03-15").filing).toBe("2024-09-30");
  });

  it("[M17-EMPTY] deathDate 미입력 → 빈 문자열", () => {
    expect(getInheritanceFilingDueDates("")).toEqual({ filing: "", installment: "" });
  });
});
