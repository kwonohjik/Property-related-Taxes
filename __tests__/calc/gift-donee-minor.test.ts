import { describe, it, expect } from "vitest";
import {
  computeAutoMinor,
  resolveIsMinorDonee,
} from "@/lib/calc/gift-donee-minor";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";

/**
 * 수증자 주민번호 미성년 자동판정 anchor.
 * 증여일 = 2026-02-09 기준 (plan §7 케이스 매트릭스).
 * 주민번호 앞 7자리: YYMMDD + 세기/성별코드. code 3 = 2000년대 남.
 */
describe("computeAutoMinor — 만 19세 경계", () => {
  // Pre-Do anchor — 가장 먼저 실증 (differenceInYears 거동 확정)
  it("A-3 경계 생일 전날: 2007-02-10생, 증여일 2026-02-09 → 만 18세 → 미성년 true", () => {
    expect(computeAutoMinor("0702103XXXXXX", "2026-02-09")).toBe(true);
  });

  it("A-4 경계 생일 당일: 2007-02-09생, 증여일 2026-02-09 → 만 19세 도달 → 성년 false", () => {
    expect(computeAutoMinor("0702093XXXXXX", "2026-02-09")).toBe(false);
  });

  it("A-1 미성년(여유): 2010-05-01생 → 만 15세 → true", () => {
    expect(computeAutoMinor("1005013XXXXXX", "2026-02-09")).toBe(true);
  });

  it("A-2 성년(여유): 2005-01-01생 → 만 21세 → false", () => {
    expect(computeAutoMinor("0501013XXXXXX", "2026-02-09")).toBe(false);
  });

  it("A-5 파싱 실패: 'abc' → null", () => {
    expect(computeAutoMinor("abc", "2026-02-09")).toBe(null);
  });

  it("A-7 증여일 미입력 → null", () => {
    expect(computeAutoMinor("1005013XXXXXX", undefined)).toBe(null);
  });
});

describe("resolveIsMinorDonee — 자동판정 우선 + 수동 fallback (D-1)", () => {
  it("자동판정 성공(미성년) → true (수동값 무관)", () => {
    expect(
      resolveIsMinorDonee({
        doneeResidentNumber: "1005013XXXXXX",
        giftDate: "2026-02-09",
        isMinorDonee: false,
      }),
    ).toBe(true);
  });

  it("A-5 파싱 실패 → 수동 fallback(true)", () => {
    expect(
      resolveIsMinorDonee({
        doneeResidentNumber: "abc",
        giftDate: "2026-02-09",
        isMinorDonee: true,
      }),
    ).toBe(true);
  });

  it("A-6 미입력 → 수동 fallback(false default)", () => {
    expect(
      resolveIsMinorDonee({
        doneeResidentNumber: "",
        giftDate: "2026-02-09",
        isMinorDonee: false,
      }),
    ).toBe(false);
  });
});

describe("buildGiftTaxInput — 자동판정 → 엔진 input 3곳(:47·:85·:96) 동기화", () => {
  it("A-8 미성년 주민번호 + 직계존속 → isMinorDonee·donorRelation·deductionInput.donorRelation 모두 minor", () => {
    const input = buildGiftTaxInput({
      ...INITIAL_FORM,
      donor: "father",
      doneeResidentNumber: "1005013XXXXXX", // 2010-05-01 → 미성년
      giftDate: "2026-02-09",
      isMinorDonee: false, // 수동 false인데 자동판정 우선
    });
    expect(input.isMinorDonee).toBe(true); // :96 — §57 할증 경로
    expect(input.donorRelation).toBe("lineal_ascendant_minor"); // :85
    expect(input.deductionInput.donorRelation).toBe("lineal_ascendant_minor"); // :47 — §53 공제 2천만
  });

  it("A-9 자동판정이 수동값 override — 성년 주민번호 + 수동 true → false", () => {
    const input = buildGiftTaxInput({
      ...INITIAL_FORM,
      donor: "father",
      doneeResidentNumber: "0501013XXXXXX", // 2005-01-01 → 성년
      giftDate: "2026-02-09",
      isMinorDonee: true, // 수동 true이나 자동판정(성년)이 override
    });
    expect(input.isMinorDonee).toBe(false);
    expect(input.donorRelation).toBe("lineal_ascendant_adult");
    expect(input.deductionInput.donorRelation).toBe("lineal_ascendant_adult");
  });
});
