/**
 * 구 임대주택법 등록분 × 말소 전 등록 유형 「장기일반」(= 구 준공공임대주택) — §155㉓1호 1/2 = 60개월.
 * 계획서 `docs/00-pm/rental-155-23-pre2018-long-term-half.plan.md`(Q-1 A · Q-2 (a) 확정 2026-11-16).
 *
 * 근거(원문 실독 2026-11-16):
 * - 민특법 부칙<제13499호> 제3조③(MST 220963): 1호 종전 임대주택법 §6의2 준공공임대주택 → 이 법 준공공임대주택.
 *   단서 「임대의무기간 … 종전의 「임대주택법」을 적용한다」는 1~3호 모두에 걸린다.
 * - 구 임대주택법 시행령 §13①1호(MST 177728): 준공공임대주택 「임대 개시일부터 10년」.
 *
 * 수정 전 실측: 자진말소 30·40·59개월 → 성립(5년 → 30개월 기준) · 등록 + 10년 자동말소일 → 「5년」 종료일 확인 고지.
 * 정면 해석례 없음(taxlaw 8개 검색어 90건 · 2026-11-16).
 */
import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);

/** 2014.3. 구 임대주택법 준공공 등록 · 아파트 매입 · 말소 */
function unit(over: Partial<RentalUnitInput> = {}): RentalUnitInput {
  return {
    businessRegistrationDate: d("2014-03-01"),
    rentalRegistrationDate: d("2014-03-01"),
    rentalRegisteredDate: d("2014-03-01"),
    rentalCategory: "pre_2018",
    rentalAcquisitionType: "purchase",
    isApartment: true,
    region: "seoul-metro",
    standardPriceAtRentalStart: 300_000_000,
    hasMinimum2Units: false,
    rentalMonths: 120,
    requirementsConfirmed: true,
    isExcluded918Rule: false,
    rentalAutoTermination: true,
    terminatedRegistrationType: "long_term_general",
    ...over,
  } as RentalUnitInput;
}

const run = (units: RentalUnitInput[], transferDate: string) =>
  checkEligibility(units, 10, 5, false, {
    scenario: "A",
    transferDate: d(transferDate),
    residenceAcquisitionDate: d("2009-01-01"),
  } as Parameters<typeof checkEligibility>[4]);

const voluntary = (months: number, over: Partial<RentalUnitInput> = {}) =>
  unit({
    terminationReason: "voluntary",
    registrationCancellationDate: d("2021-03-01"),
    rentalMonths: months,
    halfDutyRentalMonths: months,
    ...over,
  });

const joined = (r: ReturnType<typeof run>) => JSON.stringify(r.failReasons ?? []);

describe("구 임대주택법 × 장기일반(구 준공공) 자진말소 × §155㉓1호 1/2 = 60개월", () => {
  it("L-1 59개월 → 불성립 · 문구에 10년·60개월·§13①1호·제3조③1호", () => {
    const r = run([voluntary(59)], "2023-06-01");
    expect(r.passed).toBe(false);
    const j = joined(r);
    expect(j).toContain("10년");
    expect(j).toContain("60개월");
    expect(j).toContain("구 임대주택법 시행령 §13①1호");
    expect(j).toContain("부칙<제13499호> 제3조③1호");
    expect(j).toContain("현재: 59개월");
    expect(j).not.toContain("30개월");
  });

  it("L-1′ 30개월(종전 기준 경계) → 불성립", () => {
    expect(run([voluntary(30)], "2023-06-01").passed).toBe(false);
  });

  it("L-2 60개월 → 성립", () => {
    expect(run([voluntary(60)], "2023-06-01").passed).toBe(true);
  });

  it("L-3 대조: 구법 · 단기 30개월 → 성립(3호 5년 그대로) · 29개월 문구는 5년·30개월·§13①2호", () => {
    expect(run([voluntary(30, { terminatedRegistrationType: "short_term" })], "2023-06-01").passed).toBe(true);
    const j = joined(run([voluntary(29, { terminatedRegistrationType: "short_term" })], "2023-06-01"));
    expect(j).toContain("5년");
    expect(j).toContain("30개월");
    expect(j).toContain("구 임대주택법 시행령 §13①2호");
  });

  it("L-5 대조: 가목(민특법 장기일반) 48개월 → 성립(OH-39 그대로)", () => {
    expect(run([voluntary(48, { rentalCategory: "long_general" })], "2023-06-01").passed).toBe(true);
  });
});

describe("구 임대주택법 × 장기일반 자동말소 종료일 확인 고지 = 10년", () => {
  const auto = (cd: string) =>
    unit({ terminationReason: "auto", registrationCancellationDate: d(cd), rentalMonths: 120, halfDutyRentalMonths: 120 });
  const dateNotice = (r: ReturnType<typeof run>) =>
    (r.notices ?? []).filter((n: string) => n.includes("임대의무기간 종료일을 넣었는지"));

  it("L-4 말소일 = 등록 + 10년(2024-03-01) → 고지 없음", () => {
    expect(dateNotice(run([auto("2024-03-01")], "2024-06-01"))).toHaveLength(0);
  });

  it("L-4′ 말소일 = 등록 + 10년 + 2개월 → 고지에 「10년」·종료일 2024-03-01", () => {
    const n = dateNotice(run([auto("2024-05-02")], "2024-06-01"));
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("임대의무기간 10년");
    expect(n[0]).toContain("2024-03-01");
  });
});
