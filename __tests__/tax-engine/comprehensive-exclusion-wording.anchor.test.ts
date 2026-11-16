/**
 * 종부세 합산배제 문구 3건 anchor — T-05 2호 성립 사유 · T-17a 말소 불성립 사유 · T-17b 추징 경고.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-wording-3.plan.md (Q-1~Q-5 권장안 · 2026-11-17)
 * 판정·세액은 바꾸지 않는다 — 문자열만 고정한다.
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** 2호 — 2017 지자체·세무서 등록 · 수도권 5억 · 2025 과세 */
const HO2: RentalExclusionInput = {
  registrationType: "private_purchase_short",
  rentalRegistrationDate: d("2017-01-02"),
  businessRegistrationDate: d("2017-01-02"),
  rentalStartDate: d("2017-02-01"),
  assessedValue: 500_000_000,
  area: 75,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
};

/** 8호 — 2021 등록 · 수도권 5억 · 2025 과세 (의무기간 10년) */
const HO8: RentalExclusionInput = {
  ...HO2,
  registrationType: "private_purchase_long",
  ...NA8_NOT_APPLICABLE,
  rentalRegistrationDate: d("2021-01-04"),
  rentalApplicationDate: d("2021-01-04"),
  businessRegistrationDate: d("2021-01-04"),
  rentalStartDate: d("2021-02-01"),
};

describe("T-05 — 2호 성립 사유에 「구법」 없음", () => {
  it("2호 성립 → 「(2018.3.31. 이전 등록)」", () => {
    const r = validateRentalExclusion(HO2);
    expect(r.isExcluded).toBe(true);
    expect(r.reason).toBe("종합부동산세법 §8②1호, 시행령 §3①2호 (2018.3.31. 이전 등록)");
  });
});

describe("T-17a — 말소 불성립 사유 = 과세기준일 현재 등록 말소(§3①)", () => {
  const expected = "과세기준일(6월 1일 — 당일 포함)까지 임대사업자 등록이 말소됨 — 합산배제 제외 (종합부동산세법 시행령 §3①)";
  it("상수 문구 고정", () => {
    expect(E.REGISTRATION_REVOKED).toBe(expected);
  });
  it.each([
    ["2호 · 의무기간(5년) 경과 뒤 말소", { ...HO2, registrationRevokedDate: d("2024-03-01") }],
    ["8호 · 의무기간 안 말소", { ...HO8, registrationRevokedDate: d("2024-03-01") }],
    ["8호 · 6.1. 당일 말소", { ...HO8, registrationRevokedDate: d("2025-06-01") }],
  ] as const)("%s → [REGISTRATION_REVOKED]", (_, input) => {
    const r = validateRentalExclusion(input);
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([expected]);
  });
  it("6.2. 말소 → 그해 성립(문구 변경이 판정을 바꾸지 않는다)", () => {
    expect(validateRentalExclusion({ ...HO8, registrationRevokedDate: d("2025-06-02") }).isExcluded).toBe(true);
  });
});

describe("T-17b — 의무기간 미충족 경고 = 추징 사유 + 자진·자동말소 단서", () => {
  const warn = validateRentalExclusion({ ...HO8, actualRentalYears: 4 }).warnings ?? [];
  const text = warn.join("\n");

  it("성립 유지 + 경고 1건 · 머리 문구 유지", () => {
    expect(warn).toHaveLength(1);
    expect(warn[0].startsWith("의무임대기간(10년) 미충족 — 현재 4년 경과 (")).toBe(true);
  });
  it("추징 근거·대상 금액·§3⑦5호 제외", () => {
    expect(text).toContain("경감받은 세액과 이자상당가산액을 추징합니다 (종합부동산세법 §17⑤, 종합부동산세법 시행령 §10①)");
    expect(text).toContain("협의매수·수용 등 종합부동산세법 시행령 §3⑦5호 사유는 제외");
  });
  it("자진·자동말소 단서는 종전 장기일반 아파트 매입·단기민간임대에 한정", () => {
    expect(text).toContain(
      "종전 장기일반 아파트 매입임대·단기민간임대가 민간임대주택에 관한 특별법 §6①11호·⑤에 따라 자진말소·자동말소된 경우에 한해 추징하지 않습니다 (종합부동산세법 시행령 §10③2호).",
    );
  });
  it("옛 문구 「소급 추징」·「의무기간 충족 전 등록 말소 시」 없음", () => {
    expect(text).not.toContain("소급");
    expect(text).not.toContain("의무기간 충족 전 등록 말소 시");
  });
  it("경과 ≥ 의무기간 → 경고 없음(조건 불변)", () => {
    expect(validateRentalExclusion({ ...HO8, actualRentalYears: 10 }).warnings).toBeUndefined();
  });
});
