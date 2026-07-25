/**
 * §155⑳ 요건 판정 — 능동형 UI 개편 후 파생·회귀 anchor
 *
 * 등록기준일 = max(세무서 §168, 지자체 민특법§5).
 * 의무임대기간: 매입 장기 ≤2020.7.10=5·~8.17=8·이후=10 / 단기(아·자)=6 / 구법=5.
 * 기준시가 상한: 가/마/구법=6억·3억(지역) / 다·자=6억 / 바=9억 / 아=4억·2억(지역).
 * 회귀: F1(아목 4억 cap)·F2(바목 9억 cap)·F3(건설 규모)·F4(단기4년 제거).
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";
import {
  checkEligibility,
  deriveEffectiveRegDate,
  deriveRentalArticle,
  deriveRequiredYears,
  deriveStdPriceCap,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const makeUnit = (overrides: Partial<RentalUnitInput>): RentalUnitInput => ({
  businessRegistrationDate: new Date("2019-01-01"),
  rentalRegistrationDate: new Date("2019-01-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "non-metro",
  isRegulatedAreaNewAcq: false,
  standardPriceAtRentalStart: 200_000_000,
  landAreaM2: undefined,
  totalFloorAreaM2: undefined,
  hasMinimum2Units: false,
  rentalMonths: 120,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
  ...overrides,
});

// ============================================================
// deriveEffectiveRegDate — 둘 중 늦은 날
// ============================================================

describe("deriveEffectiveRegDate — max(세무서, 지자체)", () => {
  it("지자체가 늦으면 지자체일", () => {
    const u = makeUnit({
      businessRegistrationDate: new Date("2020-06-01"),
      rentalRegistrationDate: new Date("2020-09-01"),
    });
    expect(deriveEffectiveRegDate(u)?.toISOString().slice(0, 10)).toBe("2020-09-01");
  });
  it("세무서가 늦으면 세무서일", () => {
    const u = makeUnit({
      businessRegistrationDate: new Date("2020-09-01"),
      rentalRegistrationDate: new Date("2020-06-01"),
    });
    expect(deriveEffectiveRegDate(u)?.toISOString().slice(0, 10)).toBe("2020-09-01");
  });
  it("하나라도 Invalid Date → null (사업자등록등 미완비)", () => {
    const u = makeUnit({ businessRegistrationDate: new Date("invalid") });
    expect(deriveEffectiveRegDate(u)).toBeNull();
  });
});

// ============================================================
// deriveRentalArticle / deriveRequiredYears — tier 경계
// ============================================================

describe("도출 목·의무기간 tier (등록기준일 경계)", () => {
  const art = (cat: RentalUnitInput["rentalCategory"], acq: "purchase" | "construction", d: string) =>
    deriveRentalArticle(cat, acq, new Date(d));
  const yr = (cat: RentalUnitInput["rentalCategory"], acq: "purchase" | "construction", d: string) =>
    deriveRequiredYears(art(cat, acq, d), new Date(d));

  it("매입 장기 2020.7.10 → 가목 5년", () => {
    expect(art("long_general", "purchase", "2020-07-10")).toBe("가");
    expect(yr("long_general", "purchase", "2020-07-10")).toBe(5);
  });
  it("매입 장기 2020.7.11 → 마목 8년", () => {
    expect(art("long_general", "purchase", "2020-07-11")).toBe("마");
    expect(yr("long_general", "purchase", "2020-07-11")).toBe(8);
  });
  it("매입 장기 2020.8.18 → 마목 10년", () => {
    expect(yr("long_general", "purchase", "2020-08-18")).toBe(10);
  });
  it("건설 장기 2020.7.10 → 다목 5년 / 2020.8.18 → 바목 10년", () => {
    expect(art("long_general", "construction", "2020-07-10")).toBe("다");
    expect(yr("long_general", "construction", "2020-07-10")).toBe(5);
    expect(art("long_general", "construction", "2020-08-18")).toBe("바");
    expect(yr("long_general", "construction", "2020-08-18")).toBe(10);
  });
  it("단기6년 매입 → 아목 6년 / 건설 → 자목 6년", () => {
    expect(art("short_6y", "purchase", "2025-07-01")).toBe("아");
    expect(yr("short_6y", "purchase", "2025-07-01")).toBe(6);
    expect(art("short_6y", "construction", "2025-07-01")).toBe("자");
    expect(yr("short_6y", "construction", "2025-07-01")).toBe(6);
  });
  it("구법 → 5년", () => {
    expect(art("pre_2018", "purchase", "2017-01-01")).toBe("구법");
    expect(yr("pre_2018", "purchase", "2017-01-01")).toBe(5);
  });
});

// ============================================================
// deriveStdPriceCap — 유형·지역별 (F1·F2 핵심)
// ============================================================

describe("기준시가 상한 — 유형·지역·등록일 (rental-article/rules 위임)", () => {
  const D = (s: string) => new Date(s);
  it("가/마 수도권 6억·비수도권 3억", () => {
    expect(deriveStdPriceCap("마", "seoul-metro", D("2021-01-01"))).toBe(600_000_000);
    expect(deriveStdPriceCap("마", "non-metro", D("2021-01-01"))).toBe(300_000_000);
  });
  it("F1 — 아목 수도권 4억·비수도권 2억 (구 6억/3억 아님)", () => {
    expect(deriveStdPriceCap("아", "seoul-metro", D("2025-07-01"))).toBe(400_000_000);
    expect(deriveStdPriceCap("아", "non-metro", D("2025-07-01"))).toBe(200_000_000);
  });
  it("F5 — 바목 2025.2.28 경계: 이전 6억·이후 9억", () => {
    expect(deriveStdPriceCap("바", "seoul-metro", D("2025-02-27"))).toBe(600_000_000);
    expect(deriveStdPriceCap("바", "seoul-metro", D("2025-02-28"))).toBe(900_000_000);
  });
  it("다/자 6억 지역무관", () => {
    expect(deriveStdPriceCap("다", "non-metro", D("2017-01-01"))).toBe(600_000_000);
    expect(deriveStdPriceCap("자", "non-metro", D("2025-07-01"))).toBe(600_000_000);
  });
});

// ============================================================
// checkEligibility — 통합 회귀 (F1~F4)
// ============================================================

describe("checkEligibility — 회귀 anchor", () => {
  it("F1: 아목 수도권 4.1억 → 배제 (구 엔진은 6억 cap으로 통과했음)", () => {
    const u = makeUnit({
      rentalCategory: "short_6y",
      rentalAcquisitionType: "purchase",
      businessRegistrationDate: new Date("2025-07-01"),
      rentalRegistrationDate: new Date("2025-07-01"),
      region: "seoul-metro",
      isRegulatedAreaNewAcq: false,
      standardPriceAtRentalStart: 410_000_000,
      hasMinimum2Units: false,
      rentalMonths: 72,
    });
    const r = checkEligibility([u], 5, 5);
    expect(r.passed).toBe(false);
    expect(r.failReasons.find((f) => f.code === "STANDARD_PRICE_EXCEEDED")).toBeDefined();
  });

  it("F1 경계: 아목 수도권 4.0억 → 통과", () => {
    const u = makeUnit({
      rentalCategory: "short_6y",
      businessRegistrationDate: new Date("2025-07-01"),
      rentalRegistrationDate: new Date("2025-07-01"),
      region: "seoul-metro",
      isRegulatedAreaNewAcq: false,
      standardPriceAtRentalStart: 400_000_000,
      hasMinimum2Units: false,
      rentalMonths: 72,
    });
    expect(checkEligibility([u], 5, 5).passed).toBe(true);
  });

  it("F5: 바목 건설 2021등록 7억 → 6억 cap 초과 배제 (2025.2.28 이전)", () => {
    const u = makeUnit({
      rentalCategory: "long_general",
      rentalAcquisitionType: "construction",
      businessRegistrationDate: new Date("2021-03-01"),
      rentalRegistrationDate: new Date("2021-03-01"),
      region: "seoul-metro",
      isRegulatedAreaNewAcq: false,
      standardPriceAtRentalStart: 700_000_000,
      landAreaM2: 200,
      totalFloorAreaM2: 140,
      hasMinimum2Units: true,
      rentalMonths: 120,
    });
    const r = checkEligibility([u], 5, 5);
    expect(r.passed).toBe(false);
    expect(r.failReasons.find((f) => f.code === "STANDARD_PRICE_EXCEEDED")).toBeDefined();
  });

  it("F5: 바목 건설 2025.3등록 7억 → 9억 cap 통과 (2025.2.28 이후)", () => {
    const u = makeUnit({
      rentalCategory: "long_general",
      rentalAcquisitionType: "construction",
      businessRegistrationDate: new Date("2025-03-01"),
      rentalRegistrationDate: new Date("2025-03-01"),
      region: "seoul-metro",
      isRegulatedAreaNewAcq: false,
      standardPriceAtRentalStart: 700_000_000,
      landAreaM2: 200,
      totalFloorAreaM2: 140,
      hasMinimum2Units: true,
      rentalMonths: 120,
    });
    expect(checkEligibility([u], 5, 5).passed).toBe(true);
  });

  it("F3: 건설 면적 미입력 → SIZE_REQUIRED 배제 (침묵 통과 차단)", () => {
    const u = makeUnit({
      rentalCategory: "long_general",
      rentalAcquisitionType: "construction",
      businessRegistrationDate: new Date("2021-03-01"),
      rentalRegistrationDate: new Date("2021-03-01"),
      region: "seoul-metro",
      isRegulatedAreaNewAcq: false,
      standardPriceAtRentalStart: 500_000_000,
      hasMinimum2Units: true,
      rentalMonths: 120,
    });
    const r = checkEligibility([u], 5, 5);
    expect(r.passed).toBe(false);
    expect(r.failReasons.find((f) => f.code === "SIZE_REQUIRED")).toBeDefined();
  });

  it("F3: 건설 대지 300㎡ → SIZE_EXCEEDED 배제", () => {
    const u = makeUnit({
      rentalCategory: "long_general",
      rentalAcquisitionType: "construction",
      businessRegistrationDate: new Date("2021-03-01"),
      rentalRegistrationDate: new Date("2021-03-01"),
      region: "seoul-metro",
      isRegulatedAreaNewAcq: false,
      standardPriceAtRentalStart: 500_000_000,
      landAreaM2: 300,
      totalFloorAreaM2: 140,
      hasMinimum2Units: true,
      rentalMonths: 120,
    });
    const r = checkEligibility([u], 5, 5);
    expect(r.failReasons.find((f) => f.code === "SIZE_EXCEEDED")).toBeDefined();
  });

  it("등록 하나만 입력 → BOTH_REG_REQUIRED 배제", () => {
    const u = makeUnit({ businessRegistrationDate: new Date("invalid") });
    const r = checkEligibility([u], 5, 5);
    expect(r.failReasons.find((f) => f.code === "BOTH_REG_REQUIRED")).toBeDefined();
  });

  it("아목 조정대상지역 신규취득 → SHORT_TERM_REGULATED 배제", () => {
    const u = makeUnit({
      rentalCategory: "short_6y",
      businessRegistrationDate: new Date("2025-07-01"),
      rentalRegistrationDate: new Date("2025-07-01"),
      region: "seoul-metro",
      standardPriceAtRentalStart: 300_000_000,
      isRegulatedAreaNewAcq: true,
      rentalMonths: 72,
    });
    expect(checkEligibility([u], 5, 5).failReasons.find((f) => f.code === "SHORT_TERM_REGULATED")).toBeDefined();
  });

  it("F6 회귀: 바목(건설 장기) 아파트 → 제한 아님(통과) — 구 blanket 제한 정정", () => {
    const u = makeUnit({
      rentalCategory: "long_general",
      rentalAcquisitionType: "construction",
      businessRegistrationDate: new Date("2021-03-01"),
      rentalRegistrationDate: new Date("2021-03-01"),
      region: "seoul-metro",
      isApartment: true, // 건설 장기 아파트 — 허용
      standardPriceAtRentalStart: 500_000_000, // 6억 이하(2021등록 바목 cap) — 아파트 검증에 집중
      landAreaM2: 200,
      totalFloorAreaM2: 140,
      hasMinimum2Units: true,
      rentalMonths: 120,
    });
    const r = checkEligibility([u], 5, 5);
    expect(r.passed).toBe(true);
    expect(r.failReasons.find((f) => f.code === "APARTMENT_RESTRICTED")).toBeUndefined();
  });

  it("F6 회귀: 다목(건설 5년) 아파트 → 제한 아님", () => {
    const u = makeUnit({
      rentalCategory: "long_general",
      rentalAcquisitionType: "construction",
      businessRegistrationDate: new Date("2017-01-01"),
      rentalRegistrationDate: new Date("2017-01-01"),
      region: "seoul-metro",
      isApartment: true,
      standardPriceAtRentalStart: 500_000_000,
      landAreaM2: 200,
      totalFloorAreaM2: 140,
      hasMinimum2Units: true,
      rentalMonths: 72,
    });
    expect(checkEligibility([u], 5, 5).failReasons.find((f) => f.code === "APARTMENT_RESTRICTED")).toBeUndefined();
  });

  it("아·자(단기) 아파트 → APARTMENT_RESTRICTED 유지", () => {
    const u = makeUnit({
      rentalCategory: "short_6y",
      rentalAcquisitionType: "purchase",
      businessRegistrationDate: new Date("2025-07-01"),
      rentalRegistrationDate: new Date("2025-07-01"),
      region: "seoul-metro",
      isApartment: true,
      standardPriceAtRentalStart: 300_000_000,
      rentalMonths: 72,
    });
    expect(checkEligibility([u], 5, 5).failReasons.find((f) => f.code === "APARTMENT_RESTRICTED")).toBeDefined();
  });

  it("2020.7.11 이후 등록 아파트(매입 장기) → APARTMENT_RESTRICTED", () => {
    const u = makeUnit({
      businessRegistrationDate: new Date("2020-08-18"),
      rentalRegistrationDate: new Date("2020-08-18"),
      isApartment: true,
      region: "non-metro",
      isRegulatedAreaNewAcq: false,
      rentalMonths: 120,
    });
    expect(checkEligibility([u], 5, 5).failReasons.find((f) => f.code === "APARTMENT_RESTRICTED")).toBeDefined();
  });

  it("perUnitVerdict echo — 도출 목·의무기간·cap 노출", () => {
    const u = makeUnit({
      businessRegistrationDate: new Date("2020-08-18"),
      rentalRegistrationDate: new Date("2020-08-18"),
      region: "seoul-metro",
      isRegulatedAreaNewAcq: false,
      rentalMonths: 120,
    });
    const v = checkEligibility([u], 5, 5).perUnitVerdict?.[0];
    expect(v?.derivedArticle).toBe("마");
    expect(v?.requiredYears).toBe(10);
    expect(v?.stdPriceCap).toBe(600_000_000);
    expect(v?.effectiveRegDate).toBe("2020-08-18");
  });

  it("2호 중 1호라도 통과하면 passed=true", () => {
    const failUnit = makeUnit({ rentalMonths: 12 });
    const passUnit = makeUnit({ rentalMonths: 120 });
    expect(checkEligibility([failUnit, passUnit], 5, 5).passed).toBe(true);
  });
});

// ============================================================
// calculateRentalHousingException — 미충족 시 applied=false
// ============================================================

describe("calculateRentalHousingException — 미충족 시 applied=false", () => {
  it("의무임대기간 미충족 → applied=false", () => {
    const input: RentalHousingExceptionInput = {
      applyException: true,
      scenario: "A",
      rentalUnits: [
        makeUnit({
          businessRegistrationDate: new Date("2020-08-18"),
          rentalRegistrationDate: new Date("2020-08-18"),
          rentalMonths: 60, // 5년 — 10년 미충족
        }),
      ],
    };
    const result = calculateRentalHousingException(input, 100_000_000, 800_000_000, 10, 5, 5, 5);
    expect(result.applied).toBe(false);
    expect(result.eligibility.passed).toBe(false);
  });
});
