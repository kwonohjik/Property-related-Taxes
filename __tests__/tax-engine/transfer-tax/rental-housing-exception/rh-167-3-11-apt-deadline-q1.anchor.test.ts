/**
 * anchor: Q-1 — 가목2)·나목2)·라목8)·마목4) 아파트 양도기한(소득세법 시행령 §167조의3⑪,
 * 대통령령 제36737호 2026.9.30. 공포·2026.10.1. 시행 신설).
 *
 * 법령(DRF 현행 MST 290841 실독 2026-10-01):
 * - §167의3①2호가목2) 「… 아파트 … 인 경우에는 제11항에 따른 기한까지 양도할 것. 다만, 해당 주택이
 *   사목에 해당하는 경우에는 같은 목에 따른 양도기한을 적용한다.」 (나목2)·라목8)·마목4) 동형)
 * - §167의3⑪ 「… 기한은 2027년 12월 31일로 한다. 다만, 해당 주택이 다음 각 호의 어느 하나에 해당하는
 *   주택인 경우에는 2027년 12월 31일과 해당 호에서 정하는 날 중 가장 늦은 날을 그 기한으로 한다.」
 * - §155㉓ 「(… 제167조의3제1항제2호가목2)ㆍ라목8)ㆍ마목4)의 요건은 적용하지 않는다)」
 *
 * §155⑳ 자체 정의 괄호는 가목1)의 등록기한만 비적용할 뿐 가목2)를 언급하지 않는다 — ⑳ 경로(말소 전,
 * 현재 보유 중)는 이 게이트를 **그대로** 받는다. ㉓(말소 후 5년 내) 경로만 명시로 비적용된다.
 */
import { describe, it, expect } from "vitest";
import {
  checkEligibility,
  type EligibilityContext,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

/** 2018-06-01 등록 매입 아파트 → 가목(2020.7.11 전 등록) */
const gaMokApt: RentalUnitInput = {
  businessRegistrationDate: new Date("2018-06-01"),
  rentalRegistrationDate: new Date("2018-06-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: true,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

const ctx = (transferDate: string): EligibilityContext => ({
  scenario: "A",
  transferDate: new Date(transferDate),
  residenceAcquisitionDate: new Date("2010-01-10"),
  priorRentalExemptionHistory: "none",
});

const run = (units: RentalUnitInput[], transferDate: string) =>
  checkEligibility(units, 5, 5, false, ctx(transferDate));

describe("§155⑳ — 가목 아파트 양도기한(§167조의3⑪) Q-1", () => {
  it("거주주택 양도일 2027.12.31(바닥 경계값) → 기한 내, passed", () => {
    const r = run([gaMokApt], "2027-12-31");
    expect(r.passed).toBe(true);
    expect(r.failReasons.some((f) => f.code === "APT_TRANSFER_DEADLINE_EXCEEDED")).toBe(false);
  });

  it("거주주택 양도일 2028.1.1(바닥 다음날) → 연장 없이 기한 초과, passed=false", () => {
    const r = run([gaMokApt], "2028-01-01");
    expect(r.passed).toBe(false);
    expect(r.failReasons.some((f) => f.code === "APT_TRANSFER_DEADLINE_EXCEEDED")).toBe(true);
  });

  it("비아파트(가목)는 2028년 이후 양도해도 이 게이트의 영향을 받지 않는다", () => {
    const r = run([{ ...gaMokApt, isApartment: false }], "2028-01-01");
    expect(r.failReasons.some((f) => f.code === "APT_TRANSFER_DEADLINE_EXCEEDED")).toBe(false);
  });
});

describe("§155㉓(말소 후 5년 내) — 가목2) 요건 비적용 Q-1", () => {
  /** 자진말소(장기일반 8년 → 1/2 = 48개월) · 2021-01-01 말소 · 거주주택 2028-01-01 양도(말소 후 5년 내) */
  const cancelled: RentalUnitInput = {
    ...gaMokApt,
    rentalMonths: 60,
    rentalAutoTermination: true,
    terminatedRegistrationType: "long_term_general",
    registrationCancellationDate: new Date("2021-01-01"),
  };

  it("바닥(2027.12.31)을 넘긴 양도(2028.1.1)도 ㉓ 경로에서는 아파트 양도기한 게이트를 보지 않는다", () => {
    const r = run([cancelled], "2028-01-01");
    expect(r.failReasons.some((f) => f.code === "APT_TRANSFER_DEADLINE_EXCEEDED")).toBe(false);
    // ㉓ 5년 창(말소일 2021-01-01 + 5년 = 2026-01-01)은 이미 지났으므로 다른 사유로는 불통과일 수 있다 —
    // 이 테스트가 보려는 것은 오직 APT_TRANSFER_DEADLINE_EXCEEDED 부재다.
  });

  it("㉓ 5년 창 안(말소 2026-06-01 + 5년 이내 양도 2028-01-01)에서도 게이트 비적용 + passed", () => {
    const withinWindow: RentalUnitInput = {
      ...cancelled,
      registrationCancellationDate: new Date("2026-06-01"),
    };
    const r = run([withinWindow], "2028-01-01");
    expect(r.failReasons.some((f) => f.code === "APT_TRANSFER_DEADLINE_EXCEEDED")).toBe(false);
    expect(r.passed).toBe(true);
  });
});
