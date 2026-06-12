import { describe, it, expect } from "vitest";
import {
  getFilingDeadline,
  isFilingOverdue,
  derivePenaltyFields,
  isAllBurdenedGift,
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

describe("getFilingDeadline — 부담부증여 §105①3호 3개월", () => {
  it("양도일 2025-01-10 + 부담부증여 → 신고기한 2025-04-30", () => {
    expect(getFilingDeadline("2025-01-10", true)).toBe("2025-04-30");
  });

  it("양도일 2025-12-20 + 부담부증여 → 신고기한 2026-03-31 (해 넘김)", () => {
    expect(getFilingDeadline("2025-12-20", true)).toBe("2026-03-31");
  });

  it("양도일 2025-11-15 + 부담부증여 → 신고기한 2026-02-28 (2월 말일)", () => {
    expect(getFilingDeadline("2025-11-15", true)).toBe("2026-02-28");
  });

  it("isFilingOverdue — 2개월 초과·3개월 이내 신고는 부담부증여만 기한 내", () => {
    // 양도 2025-01-10, 신고 2025-04-15: 일반 기한(03-31) 초과, 부담부증여 기한(04-30) 이내
    expect(isFilingOverdue("2025-01-10", "2025-04-15")).toBe(true);
    expect(isFilingOverdue("2025-01-10", "2025-04-15", true)).toBe(false);
  });
});

describe("isAllBurdenedGift — §105①3호 적용 판정", () => {
  it("전 자산 부담부증여 → true", () => {
    expect(isAllBurdenedGift([{ transferType: "burdened_gift" }])).toBe(true);
    expect(
      isAllBurdenedGift([
        { transferType: "burdened_gift" },
        { transferType: "burdened_gift" },
      ]),
    ).toBe(true);
  });

  it("일반·혼합 일괄양도 → false (일반분 기한 2개월이 더 이르므로 2개월 기준)", () => {
    expect(isAllBurdenedGift([{ transferType: undefined }])).toBe(false);
    expect(
      isAllBurdenedGift([
        { transferType: "burdened_gift" },
        { transferType: undefined },
      ]),
    ).toBe(false);
  });

  it("빈 배열·undefined → false", () => {
    expect(isAllBurdenedGift([])).toBe(false);
    expect(isAllBurdenedGift(undefined)).toBe(false);
  });
});

describe("derivePenaltyFields — 부담부증여 3개월 기한 연동", () => {
  it("2개월 초과·3개월 이내 신고: 일반은 가산세 ON, 부담부증여는 OFF 유지", () => {
    const general = derivePenaltyFields("2025-01-10", "2025-04-15", OFF);
    expect(general.enablePenalty).toBe(true);
    expect(general.paymentDeadline).toBe("2025-03-31");

    const burdened = derivePenaltyFields("2025-01-10", "2025-04-15", OFF, true);
    expect(burdened).toEqual({});
  });

  it("3개월도 초과: 부담부증여 기한(3개월 말일)으로 paymentDeadline 세팅", () => {
    const patch = derivePenaltyFields("2025-01-10", "2025-05-15", OFF, true);
    expect(patch.enablePenalty).toBe(true);
    expect(patch.paymentDeadline).toBe("2025-04-30");
    expect(patch.actualPaymentDate).toBe("2025-05-15");
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

  it("이미 ON + 수동 신고유형(under) → filingType 보존, 날짜 파생값만 갱신", () => {
    const patch = derivePenaltyFields("2025-02-10", "2025-05-15", {
      ...ON_OVERDUE,
      filingType: "under",
      penaltyReason: "fraudulent",
    });
    // filingType·penaltyReason은 패치에 없음(보존), 새 양도일 기준 deadline만 갱신
    expect(patch).toEqual({
      paymentDeadline: "2025-04-30",
      actualPaymentDate: "2025-05-15",
    });
  });

  it("이미 ON + 날짜 파생값도 동일 → 빈 패치 (수동 filingType 무관)", () => {
    const patch = derivePenaltyFields("2025-01-10", "2025-04-15", {
      ...ON_OVERDUE,
      filingType: "under",
    });
    expect(patch).toEqual({});
  });

  it("신고기한 이내 + 현재 ON → 가산세 OFF 패치 (penaltyReason도 normal 리셋)", () => {
    const patch = derivePenaltyFields("2025-01-10", "2025-03-20", {
      ...ON_OVERDUE,
      penaltyReason: "fraudulent",
    });
    expect(patch).toEqual({
      enablePenalty: false,
      filingType: "correct",
      penaltyReason: "normal",
      paymentDeadline: "",
      actualPaymentDate: "",
    });
  });

  it("신고기한 이내 + 현재 OFF → 빈 패치", () => {
    expect(derivePenaltyFields("2025-01-10", "2025-03-20", OFF)).toEqual({});
  });

  it("OFF인데 stale penaltyReason(fraudulent) 잔류 → 리셋 패치", () => {
    const patch = derivePenaltyFields("2025-01-10", "2025-03-20", {
      ...OFF,
      penaltyReason: "fraudulent",
    });
    expect(patch.penaltyReason).toBe("normal");
  });

  it("양도일·신고일 미입력 + 현재 ON → OFF 패치", () => {
    expect(derivePenaltyFields("", "", ON_OVERDUE)).toEqual({
      enablePenalty: false,
      filingType: "correct",
      penaltyReason: "normal",
      paymentDeadline: "",
      actualPaymentDate: "",
    });
  });

  it("양도일·신고일 미입력 + 현재 OFF → 빈 패치", () => {
    expect(derivePenaltyFields("", "", OFF)).toEqual({});
  });
});
