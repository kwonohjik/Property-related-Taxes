import { describe, it, expect } from "vitest";
import { getFilingDeadline, isFilingOverdue } from "@/lib/calc/filing-deadline";

describe("getFilingDeadline — 양도일 속한 달의 말일 + 2개월", () => {
  it("양도일 2025-01-10 → 신고기한 2025-03-31", () => {
    expect(getFilingDeadline("2025-01-10")).toBe("2025-03-31");
  });

  it("양도일 2025-05-15 → 신고기한 2025-07-31", () => {
    expect(getFilingDeadline("2025-05-15")).toBe("2025-07-31");
  });

  it("양도일 2025-12-20 → 신고기한 2026-02-28 (해 넘김)", () => {
    expect(getFilingDeadline("2025-12-20")).toBe("2026-02-28");
  });

  it("양도일 2024-12-20 → 신고기한 2025-02-28 (윤년 직전)", () => {
    expect(getFilingDeadline("2024-12-20")).toBe("2025-02-28");
  });

  it("양도일 2027-12-01 → 신고기한 2028-02-29 (윤년 2월 말일)", () => {
    expect(getFilingDeadline("2027-12-01")).toBe("2028-02-29");
  });

  it("빈 문자열 입력 시 빈 문자열 반환", () => {
    expect(getFilingDeadline("")).toBe("");
  });

  it("잘못된 형식 입력 시 빈 문자열 반환", () => {
    expect(getFilingDeadline("invalid")).toBe("");
  });
});

describe("isFilingOverdue — 신고일 vs 신고기한 비교", () => {
  it("신고일이 신고기한 이내 → false", () => {
    expect(isFilingOverdue("2025-01-10", "2025-03-31")).toBe(false);
    expect(isFilingOverdue("2025-01-10", "2025-02-15")).toBe(false);
  });

  it("신고일이 신고기한 초과 → true", () => {
    expect(isFilingOverdue("2025-01-10", "2025-04-01")).toBe(true);
    expect(isFilingOverdue("2025-01-10", "2025-05-15")).toBe(true);
  });

  it("신고일 비어있으면 false", () => {
    expect(isFilingOverdue("2025-01-10", "")).toBe(false);
  });
});
