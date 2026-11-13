/**
 * anchor — 종부령 §3①7호 나목·8호 가목2) 의무임대기간 8년/10년(대통령령 제31085호 부칙 §3·§4 · 서면-2025-부동산-2158).
 * 계획서: docs/01-plan/features/comprehensive-rental-mandatory-period-8to10.plan.md §4 (M-1~M-4).
 *
 * 실측(2026-11-13 probe, 변경 전): 2017 등록 장기일반·공공지원 8.5~9년 경과에 「의무임대기간(10년) 미충족」 경고(법문상 8년 충족).
 * 경고 문구만 바뀐다 — 성립 여부는 모든 행에서 true.
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(s);
const BASE: RentalExclusionInput = {
  registrationType: "private_purchase_long",
  ...NA8_NOT_APPLICABLE,
  rentalRegistrationDate: d("2017-03-01"),
  rentalStartDate: d("2017-04-01"),
  assessedValue: 300_000_000,
  area: 59,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2026-06-01"),
  ownerType: "individual",
  acquisitionDate: d("2017-01-01"),
};
const run = (over: Partial<RentalExclusionInput>) => {
  const r = validateRentalExclusion({ ...BASE, ...over });
  expect(r.isExcluded).toBe(true);
  return r.warnings ?? [];
};

describe("M-1·M-3 2020.8.18. 전 신청 → 8년", () => {
  it("★ 장기일반 매입·2017 등록·9년 → 경고 없음(변경 전 10년 미충족)", () => {
    expect(run({ actualRentalYears: 9 })).toEqual([]);
  });
  it("★ 공공지원 매입 8.5년 · 공공지원 건설 9년 → 경고 없음", () => {
    expect(run({ registrationType: "public_support_purchase", actualRentalYears: 8.5 })).toEqual([]);
    expect(run({ registrationType: "public_support_construction", actualRentalYears: 9, area: 84 })).toEqual([]);
  });
  it("8년 미만이면 「8년」 경고 + 부칙 근거", () => {
    const w = run({ actualRentalYears: 7 });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/의무임대기간\(8년\) 미충족/);
    expect(w[0]).toMatch(/대통령령 제31085호 부칙 제3조·제4조/);
    expect(w[0]).not.toMatch(/확인 필요/);
  });
  it("등록일이 8.18. 이후여도 신청일이 8.17. 이전이면 8년", () => {
    const w = run({ rentalRegistrationDate: d("2020-08-25"), rentalApplicationDate: d("2020-08-17"), actualRentalYears: 7 });
    expect(w[0]).toMatch(/의무임대기간\(8년\)/);
  });
});

describe("M-2·M-4 2020.8.18. 이후 신청 → 10년", () => {
  it("신청일 2020-08-18 → 10년(확인 필요 문구 없음)", () => {
    const w = run({ rentalRegistrationDate: d("2020-08-25"), rentalApplicationDate: d("2020-08-18"), actualRentalYears: 9 });
    expect(w[0]).toMatch(/의무임대기간\(10년\)/);
    expect(w[0]).not.toMatch(/확인 필요/);
  });
  it("신청일 모름 · 등록일 2021 → 10년 + 「8.17. 이전 신청이면 8년」 안내", () => {
    const w = run({ rentalRegistrationDate: d("2021-03-01"), acquisitionDate: d("2018-01-01"), actualRentalYears: 5 });
    expect(w[0]).toMatch(/의무임대기간\(10년\)/);
    expect(w[0]).toMatch(/2020\.8\.17\. 이전이면 의무임대기간은 8년.*확인 필요/);
  });
});

describe("다른 유형은 그대로", () => {
  it("2호(구법) 5년 · 11호 6년 — 부칙 근거 문구 없음", () => {
    const w2 = run({
      registrationType: "private_purchase_short",
      businessRegistrationDate: d("2017-03-01"),
      actualRentalYears: 4,
    });
    expect(w2[0]).toMatch(/의무임대기간\(5년\)/);
    expect(w2[0]).not.toMatch(/제31085호/);
  });
});
