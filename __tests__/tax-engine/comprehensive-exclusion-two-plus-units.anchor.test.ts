/**
 * 종부령 §3①1·3·7·10호 「다음 각 목의 요건을 모두 갖춘 주택이 2호 이상인 경우 그 주택」 anchor.
 * 호수(qualifyingUnitCount)는 사용자가 센다 — 1·7·10호는 같은 시·도(§3⑤), 3호는 전국. 모름 = 불성립 + 확인 필요.
 * 2·6·8·11호에는 이 문언이 없다(6호는 5호 이상 — 6호 anchor).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-two-plus-units.plan.md §4
 * ⚠️ BASE에 호수를 넣지 않는다 — 넣으면 「모름」 게이트가 가려진다.
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** 1호 민간건설 — 2017 등록·사업자등록(단서 충족) · 4억 · 85㎡ · 2025 과세 */
const BASE: RentalExclusionInput = {
  registrationType: "private_construction",
  ...NA8_NOT_APPLICABLE,
  rentalRegistrationDate: d("2017-01-01"),
  businessRegistrationDate: d("2017-01-01"),
  rentalStartDate: d("2020-02-01"),
  assessedValue: 400_000_000,
  area: 80,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
};
const v = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

/** 각 호를 다른 목은 모두 충족하는 입력으로 */
const TYPES: [string, Partial<RentalExclusionInput>][] = [
  ["1호 민간건설", {}],
  ["1호 공공건설", { registrationType: "public_construction" }],
  ["3호 기존임대", { registrationType: "existing_rental", rentalRegistrationDate: d("2003-01-01"), assessedValue: 250_000_000 }],
  ["7호 공공지원 건설", { registrationType: "public_support_construction", rentalRegistrationDate: d("2021-01-01") }],
  ["10호 단기 건설", { registrationType: "private_short_term_6y_construction", rentalRegistrationDate: d("2025-03-01"), isApartment: false }],
];

describe("§3①1·3·7·10호 「2호 이상」", () => {
  it.each(TYPES)("★ %s — 1호뿐이면 불성립 + 2호 미만 사유", (_, over) => {
    const r = v({ ...over, qualifyingUnitCount: 1 });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([COMPREHENSIVE_EXCL.TWO_PLUS_UNITS_UNDER_2]);
  });

  it.each(TYPES)("%s — 2호면 성립(경계 포함)", (_, over) => {
    expect(v({ ...over, qualifyingUnitCount: 2 }).isExcluded).toBe(true);
  });

  it.each(TYPES)("★ %s — 호수 모름 → 불성립 + 확인 필요", (_, over) => {
    const r = v(over);
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([COMPREHENSIVE_EXCL.TWO_PLUS_UNITS_UNKNOWN]);
  });

  it("0호도 2호 미만", () => {
    expect(v({ qualifyingUnitCount: 0 }).failReasons).toEqual([COMPREHENSIVE_EXCL.TWO_PLUS_UNITS_UNDER_2]);
  });

  it("2·8·11호는 호수를 묻지 않는다 — 호수 없이 성립", () => {
    expect(v({ registrationType: "private_purchase_short" }).isExcluded).toBe(true);
    expect(v({ registrationType: "private_purchase_long", rentalRegistrationDate: d("2021-01-01") }).isExcluded).toBe(true);
    expect(
      v({
        registrationType: "private_short_term_6y_purchase",
        rentalRegistrationDate: d("2025-03-01"),
        assessedValue: 300_000_000,
        isApartment: false,
      }).isExcluded,
    ).toBe(true);
  });
});
