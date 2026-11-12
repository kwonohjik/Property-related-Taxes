/**
 * anchor — 종부령 §3①1호 단서(민간건설임대)·2호 단서(민간매입임대) 「2018년 3월 31일 이전에 … 임대사업자 등록과
 * 사업자등록(사업자등록등)을 한 주택으로 한정」.
 *
 * - 신설: 대통령령 제28645호(2018.2.13. 시행) · 부칙 제2조 「이 영 시행 이후 납세의무가 성립하는 분부터」 → 2018 과세기준일부터.
 * - 3.31.은 토요일 — 국세기본법 §5로 4.2.(서면-2021-법규재산-3280이 같은 문언의 소령 §167의3 가목에 그렇게 봄 · 종부령 직접 해석 없음).
 *   지자체 날짜는 등록일(같은 회신 — 신청일 아님).
 * - 세무서 사업자등록일을 모르면 단서 요건 불확인 → 합산배제 불성립(「모름」은 혜택 불성립 원칙).
 * - 공공건설·공공매입(같은 1호·2호)과 장기일반(7·8호)·단기 6년(10·11호)은 이 단서 밖.
 *
 * 실측(2026-11-12 probe, 변경 전): 1호 민간건설·2호 민간매입 2019-01-15 등록 → isExcluded true.
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";

const d = (s: string) => new Date(s);
const BASE: RentalExclusionInput = {
  registrationType: "private_purchase_short",
  rentalRegistrationDate: d("2017-06-01"),
  businessRegistrationDate: d("2017-06-01"),
  rentalStartDate: d("2017-07-01"),
  assessedValue: 300_000_000,
  area: 59,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
};
const run = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

describe("2018.3.31. 사업자등록등 상한 — 1호·2호 민간", () => {
  for (const t of ["private_purchase_short", "private_construction"] as const) {
    it(`RC-1 ★ ${t}: 지자체 2019-01-15 등록 → 불성립`, () => {
      const r = run({ registrationType: t, rentalRegistrationDate: d("2019-01-15") });
      expect(r.isExcluded).toBe(false);
      expect(r.failReasons).toContain(COMPREHENSIVE_EXCL.REGISTERED_AFTER_2018_03_31);
    });
  }

  it("RC-2 세무서 사업자등록만 늦어도(2018-05-01) 불성립", () => {
    expect(run({ businessRegistrationDate: d("2018-05-01") }).isExcluded).toBe(false);
  });

  it("RC-3 경계 — 두 등록 2018-04-02(국세기본법 §5)는 성립 · 4.3.은 불성립", () => {
    expect(run({ rentalRegistrationDate: d("2018-04-02"), businessRegistrationDate: d("2018-04-02") }).isExcluded).toBe(true);
    expect(run({ rentalRegistrationDate: d("2018-04-03") }).isExcluded).toBe(false);
  });

  it("RC-4 ★ 세무서 사업자등록일 미입력 → 불성립(확인 불가)", () => {
    const r = run({ businessRegistrationDate: undefined });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toContain(COMPREHENSIVE_EXCL.BUSINESS_REGISTRATION_DATE_UNKNOWN);
  });

  it("RC-5 2017 과세기준일(단서 신설 전)에는 보지 않는다", () => {
    expect(run({ rentalRegistrationDate: d("2017-03-01"), businessRegistrationDate: undefined, rentalStartDate: d("2017-03-01"), assessmentDate: d("2017-06-01") }).isExcluded).toBe(true);
  });

  it("RC-6 단서 밖 유형(공공매입·공공건설·장기일반 8호)은 2019 등록이어도 이 사유 없음", () => {
    for (const t of ["public_purchase", "public_construction", "private_purchase_long"] as const) {
      const r = run({ registrationType: t, rentalRegistrationDate: d("2019-01-15"), businessRegistrationDate: undefined });
      expect(r.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.REGISTERED_AFTER_2018_03_31);
      expect(r.failReasons ?? []).not.toContain(COMPREHENSIVE_EXCL.BUSINESS_REGISTRATION_DATE_UNKNOWN);
    }
  });
});
