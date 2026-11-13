/**
 * ⑤④ 사용승인일(선택) 칸 술어 — 엔진 builtRentalBaseCap과 같은 경계(2021~2024 · 6억 초과 · 2021 민간건설은 등록일).
 */
import { describe, it, expect } from "vitest";
import { asksUsageApprovalDate } from "@/lib/calc/comprehensive-api";

describe("asksUsageApprovalDate", () => {
  it("건설 1·7호 · 2022~2024 · 6억 초과일 때만", () => {
    expect(asksUsageApprovalDate("public_construction", "2023", 700_000_000)).toBe(true);
    expect(asksUsageApprovalDate("private_construction", "2024", 600_000_001)).toBe(true);
    expect(asksUsageApprovalDate("public_support_construction", "2022", 700_000_000)).toBe(true);
    expect(asksUsageApprovalDate("public_construction", "2023", 600_000_000)).toBe(false);
    expect(asksUsageApprovalDate("public_construction", "2025", 700_000_000)).toBe(false);
    expect(asksUsageApprovalDate("public_purchase", "2023", 700_000_000)).toBe(false);
  });
  it("2021은 공공건설만(민간건설은 등록일로 판단)", () => {
    expect(asksUsageApprovalDate("public_construction", "2021", 700_000_000)).toBe(true);
    expect(asksUsageApprovalDate("private_construction", "2021", 700_000_000)).toBe(false);
  });
});
