import { describe, it, expect } from "vitest";
import {
  getFilingDeadline,
  isFilingOverdue,
  derivePenaltyFields,
  type PenaltyDerivationState,
} from "@/lib/calc/filing-deadline";

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

// ============================================================
// derivePenaltyFields — 가산세 cross-field 파생 (useEffect→store 제거 후 순수 함수)
// ============================================================

const OFF: PenaltyDerivationState = {
  enablePenalty: false,
  filingType: "correct",
  penaltyReason: "normal",
  paymentDeadline: "",
  actualPaymentDate: "",
};

const ON_OVERDUE: PenaltyDerivationState = {
  enablePenalty: true,
  filingType: "none",
  penaltyReason: "normal",
  paymentDeadline: "2025-03-31",
  actualPaymentDate: "2025-04-15",
};

describe("derivePenaltyFields — 양도일·신고일 → 가산세 파생", () => {
  it("신고기한 초과 → 무신고 + 지연납부 자동 ON (deadline·신고일 세팅)", () => {
    const patch = derivePenaltyFields("2025-01-10", "2025-04-15", OFF);
    expect(patch).toEqual({
      enablePenalty: true,
      filingType: "none",
      penaltyReason: "normal",
      paymentDeadline: "2025-03-31",
      actualPaymentDate: "2025-04-15",
    });
  });

  it("기존 penaltyReason(fraudulent) 보존", () => {
    const patch = derivePenaltyFields("2025-01-10", "2025-04-15", {
      ...OFF,
      penaltyReason: "fraudulent",
    });
    expect(patch.penaltyReason).toBe("fraudulent");
  });

  it("이미 동일 overdue 상태면 빈 패치 (불필요한 갱신 방지)", () => {
    const patch = derivePenaltyFields("2025-01-10", "2025-04-15", ON_OVERDUE);
    expect(patch).toEqual({});
  });

  it("신고기한 이내 + 현재 ON → 가산세 OFF 패치", () => {
    const patch = derivePenaltyFields("2025-01-10", "2025-03-20", ON_OVERDUE);
    expect(patch).toEqual({
      enablePenalty: false,
      filingType: "correct",
      paymentDeadline: "",
      actualPaymentDate: "",
    });
  });

  it("신고기한 이내 + 현재 OFF → 빈 패치", () => {
    expect(derivePenaltyFields("2025-01-10", "2025-03-20", OFF)).toEqual({});
  });

  it("양도일·신고일 미입력 + 현재 ON → OFF 패치", () => {
    expect(derivePenaltyFields("", "", ON_OVERDUE)).toEqual({
      enablePenalty: false,
      filingType: "correct",
      paymentDeadline: "",
      actualPaymentDate: "",
    });
  });

  it("양도일·신고일 미입력 + 현재 OFF → 빈 패치", () => {
    expect(derivePenaltyFields("", "", OFF)).toEqual({});
  });
});
