/**
 * anchor — 종부령 §3①1·2·7·8호 가목 「30호 이상」 상향 가격 구간의 시행 시점.
 * 대통령령 제35352호(2025.2.28.) 신설 · 부칙 제2조① 그 뒤 납세의무 성립분(2025 과세기준일)부터.
 * 2023.9.5.·2024.11.12. 시행본 원문에 30호 구간이 없다(KoreanLaw MCP 2026-11-13).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-price-cap-eras.plan.md §3 P5~P11·C1~C2 · §4-2.
 *
 * 실측(2026-11-13 probe, 변경 전): P5~P10 모두 성립(법문상 불성립).
 */
import { describe, it, expect } from "vitest";
import { validateRentalExclusion } from "@/lib/tax-engine/comprehensive-exclusion";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import type { RentalExclusionInput } from "@/lib/tax-engine/types/comprehensive.types";
import { NA8_NOT_APPLICABLE } from "./_helpers/comprehensive-8na-not-applicable";

const d = (s: string) => new Date(s);
const BASE: RentalExclusionInput = {
  registrationType: "public_support_construction",
  ...NA8_NOT_APPLICABLE,
  rentalRegistrationDate: d("2017-03-01"),
  businessRegistrationDate: d("2017-03-01"),
  rentalStartDate: d("2017-04-01"),
  assessedValue: 1_000_000_000,
  area: 84,
  location: "metro",
  currentRent: 1_000_000,
  isInitialContract: true,
  assessmentDate: d("2025-06-01"),
  ownerType: "individual",
  acquisitionDate: d("2017-01-01"),
  isThirtyPlusUnits: true,
};
const v = (over: Partial<RentalExclusionInput>) => validateRentalExclusion({ ...BASE, ...over });

describe("2024 이하 — 30호 이상이어도 30호 미만 기준", () => {
  it("★ P5 7호 공공지원 건설 30호 이상 12억(2024) → 불성립(상한 9억) + 시행 전 사유", () => {
    const r = v({ assessedValue: 1_200_000_000, assessmentDate: d("2024-06-01") });
    expect(r.isExcluded).toBe(false);
    expect(r.failReasons).toEqual([E.PRICE_EXCEEDED, E.THIRTY_PLUS_TIER_NOT_IN_FORCE]);
  });
  it("★ P6·P7 1호 공공건설 30호 이상 10억(2024·2021) → 불성립", () => {
    expect(v({ registrationType: "public_construction", assessmentDate: d("2024-06-01") }).isExcluded).toBe(false);
    expect(v({ registrationType: "public_construction", assessmentDate: d("2021-06-01") }).isExcluded).toBe(false);
  });
  it("★ P8·P9 2호 공공매입 30호 이상 수도권 9억(2022)·8억(2023) → 불성립(상한 6억)", () => {
    expect(v({ registrationType: "public_purchase", assessedValue: 900_000_000, assessmentDate: d("2022-06-01") }).isExcluded).toBe(false);
    expect(v({ registrationType: "public_purchase", assessedValue: 800_000_000, assessmentDate: d("2023-06-01") }).isExcluded).toBe(false);
  });
  it("★ P10 8호 장기일반 매입 30호 이상 수도권 8억(2023) → 불성립", () => {
    expect(v({ registrationType: "private_purchase_long", assessedValue: 800_000_000, assessmentDate: d("2023-06-01") }).isExcluded).toBe(false);
  });
  it("30호 미만 상한 안이면 2024에도 성립(시행 전 사유 없음)", () => {
    const r = v({ assessedValue: 900_000_000, assessmentDate: d("2024-06-01") });
    expect(r.isExcluded).toBe(true);
  });
});

describe("2025 이후 — 30호 구간 적용(현행 = 문언)", () => {
  it("P11 8호 30호 이상 수도권 8억 · 1호 30호 이상 10억(2025) → 성립", () => {
    expect(v({ registrationType: "private_purchase_long", assessedValue: 800_000_000 }).isExcluded).toBe(true);
    expect(v({ registrationType: "public_construction" }).isExcluded).toBe(true);
  });
  it("2025에 12억 초과면 가격 초과만(시행 전 사유는 붙지 않는다)", () => {
    expect(v({ assessedValue: 1_200_000_001 }).failReasons).toEqual([E.PRICE_EXCEEDED]);
  });
});

describe("대조 — 30호 미만은 연도 무관", () => {
  it("C1 8호 30호 미만 8억(2023) · C2 1호 30호 미만 10억(2023) → 가격 초과만", () => {
    expect(
      v({ registrationType: "private_purchase_long", isThirtyPlusUnits: false, assessedValue: 800_000_000, assessmentDate: d("2023-06-01") }).failReasons,
    ).toEqual([E.PRICE_EXCEEDED]);
    expect(
      v({ registrationType: "public_construction", isThirtyPlusUnits: false, assessmentDate: d("2023-06-01") }).failReasons,
    ).toEqual([E.PRICE_EXCEEDED]);
  });
});
