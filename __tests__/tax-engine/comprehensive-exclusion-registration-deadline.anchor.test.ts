/**
 * anchor — 종부령 §3① 각 호 외의 부분 「임대사업자로서 … 과세기준일 현재 임대」 + 후단 「과세기준일 현재 임대를 개시한 자가
 * 법 제8조제3항에 따른 주택의 보유현황 신고기간 종료일까지 임대사업자로서 사업자등록을 하는 경우에는 … 한 것으로 본다」.
 *
 * - 신고기간 종료일 = 그해 9.30.(종부법 §8③) · 토요일·공휴일이면 다음 날(민법 §161).
 * - 지자체 등록일 > 종료일 → 불성립 · 과세기준일 < 등록일 ≤ 종료일 → 성립 + 확인 필요(계획서 Q-4 a).
 * - 대상은 민간 유형만(Q-8 a) · 10·11호는 2026 과세기준일부터(2025 이하는 `shortTerm6yEraIssues`가 판정).
 *
 * 실측(2026-11-16 · 변경 전 route probe P12): 8호 2025 과세연도 · 등록 2025-10-01·2026-01-10 → 성립(과소과세 2,159,170원).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-tax-defects-3.plan.md §2.1·§3 A15
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(s);
/** 8호 장기일반 민간매입 · 2025 과세기준일 · 2025.3. 임대개시 */
const BASE: RentalExclusionInput = {
  ...NA8_NOT_APPLICABLE,
  registrationType: "private_purchase_long",
  rentalRegistrationDate: d("2025-02-20"),
  rentalApplicationDate: d("2025-02-15"),
  rentalStartDate: d("2025-03-01"),
  acquisitionDate: d("2016-01-01"),
  assessedValue: 500_000_000,
  area: 59,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
  ownerType: "individual",
};
const run = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });
const LATE = COMPREHENSIVE_EXCL.REGISTERED_AFTER_FILING_DEADLINE;
const DEEMED = COMPREHENSIVE_EXCL.REGISTERED_AFTER_ASSESSMENT_DEEMED;

describe("A15 — 보유현황 신고기간 종료일까지 등록", () => {
  it("A15-1 과세기준일 전 등록 → 성립 · 경고 없음(불변)", () => {
    const r = run({});
    expect(r.isExcluded).toBe(true);
    expect(r.warnings).toBeUndefined();
  });

  it("A15-2 ★ 2025-09-30 등록 → 성립 + 확인 필요", () => {
    const r = run({ rentalRegistrationDate: d("2025-09-30") });
    expect(r.isExcluded).toBe(true);
    expect(r.warnings).toEqual([DEEMED]);
  });

  it("A15-3 ★ 2025-10-01·2026-01-10 등록 → 불성립(첫 사유)", () => {
    for (const reg of ["2025-10-01", "2026-01-10"]) {
      const r = run({ rentalRegistrationDate: d(reg) });
      expect(r.isExcluded).toBe(false);
      expect(r.reason).toBe(LATE);
    }
  });

  it("A15-4 ★ 2023: 9.30.(토·추석 다음 날)~10.3. 연휴 → 10.4.까지 성립 · 10.5. 불성립", () => {
    const y = { assessmentDate: d("2023-06-01"), rentalStartDate: d("2023-03-01"), rentalApplicationDate: d("2023-06-20") };
    expect(run({ ...y, rentalRegistrationDate: d("2023-10-04") })).toMatchObject({ isExcluded: true, warnings: [DEEMED] });
    expect(run({ ...y, rentalRegistrationDate: d("2023-10-05") }).reason).toBe(LATE);
  });

  it("A15-5 2020: 추석·개천절·주말 → 10.5.까지 성립 · 10.6. 불성립 / 2018: 9.30.(일) → 10.1.", () => {
    // 2020은 8호 나목3)·4)(2020.7.11. 이후) 판정과 무관한 비아파트·변경신고 없음 픽스처
    const y20 = { assessmentDate: d("2020-06-01"), rentalStartDate: d("2020-03-01"), rentalApplicationDate: d("2020-06-20") };
    expect(run({ ...y20, rentalRegistrationDate: d("2020-10-05") }).isExcluded).toBe(true);
    expect(run({ ...y20, rentalRegistrationDate: d("2020-10-06") }).failReasons).toContain(LATE);
    const y18 = { assessmentDate: d("2018-06-01"), rentalStartDate: d("2018-03-01"), rentalApplicationDate: d("2018-06-20") };
    expect(run({ ...y18, rentalRegistrationDate: d("2018-10-01") }).failReasons ?? []).not.toContain(LATE);
    expect(run({ ...y18, rentalRegistrationDate: d("2018-10-02") }).failReasons).toContain(LATE);
  });

  it("A15-6 11호 2025: 기존 2025 특례 사유 하나만(이중 보고 없음)", () => {
    const r = run({ registrationType: "private_short_term_6y_purchase", rentalRegistrationDate: d("2025-10-01"), assessedValue: 300_000_000 });
    expect(r.failReasons).toEqual([COMPREHENSIVE_EXCL.SHORT_TERM_6Y_2025_REGISTERED_LATE]);
  });

  it("A15-6′ 11호 2026: 새 판정이 본다", () => {
    const r = run({
      registrationType: "private_short_term_6y_purchase",
      assessmentDate: d("2026-06-01"),
      rentalRegistrationDate: d("2026-10-01"),
      assessedValue: 300_000_000,
    });
    expect(r.failReasons).toContain(LATE);
  });

  it("A15-7 공공매입(공공주택사업자)은 대상 밖 → 판정 불변", () => {
    const r = run({ registrationType: "public_purchase", rentalRegistrationDate: d("2025-10-01") });
    expect(r.failReasons ?? []).not.toContain(LATE);
    expect(r.warnings ?? []).not.toContain(DEEMED);
  });

  it("A15-8 2호 2017 등록(2018.4.2. 상한 통과) → 성립(불변)", () => {
    const r = run({
      registrationType: "private_purchase_short",
      rentalRegistrationDate: d("2017-06-01"),
      businessRegistrationDate: d("2017-06-01"),
      rentalStartDate: d("2017-07-01"),
    });
    expect(r.isExcluded).toBe(true);
  });
});
