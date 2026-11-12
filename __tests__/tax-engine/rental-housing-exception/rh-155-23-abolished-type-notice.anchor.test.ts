/**
 * anchor — §155㉓ 폐지되는 유형 호만 등록·임대 중일 때 「먼저 말소된 호」 확인 필요 고지(사용자 결정 2026-11-12 · 세액 무변경).
 *
 * 교재 사례: 자동말소된 A를 먼저 양도하고 폐지되는 유형 B(장기일반 아파트 매입)만 남은 상태에서 거주주택 양도 → 최초 말소일(A)부터
 * 5년 이내여야 한다. 계산기는 이미 양도·전환한 호를 입력받지 않아(판정 사례집 E183 「inexpressible」) 종전에는 B만 넣으면
 * 고지 없이 통과했다(throwaway probe 2026-11-12). 남은 호가 모두 폐지되지 않는 유형이면 ㉓ 양도기한 제한이 없다
 * (기획재정부 재산세제과-1420, 2024.12.11. · 서면-2021-법규재산-8212[법규과-35], 2023.1.5.) — 고지하지 않는다.
 *
 * | # | 주장 |
 * |---|---|
 * | AB-1 | 장기일반 아파트 매입(2019-06-01 등록) 1호 · 말소 없음 · 통과 → 고지 1건, 판정 불변 |
 * | AB-2 | 같은 호가 비아파트(폐지되지 않는 유형)면 고지 없음 |
 * | AB-3 | 말소 호가 있어 기존 ㉓ 창 고지가 나가면 이 고지는 겹쳐 내지 않는다 |
 * | AB-4 | 특례 불성립(거주 2년 미충족)이면 고지하지 않는다 — 결론을 가르지 않는다 |
 * | AB-5 | 양도일 맥락이 없는 직접 호출은 고지하지 않는다(종전 동작) |
 */
import { describe, it, expect } from "vitest";
import { checkEligibility, type EligibilityContext } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const unit = (regDate: string, o: Partial<RentalUnitInput> = {}): RentalUnitInput => ({
  businessRegistrationDate: new Date(regDate),
  rentalRegistrationDate: new Date(regDate),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "non-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 200_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
  ...o,
});
const ctx = (transfer = "2027-06-01"): EligibilityContext =>
  ({
    scenario: "A",
    transferDate: new Date(transfer),
    residenceAcquisitionDate: new Date("2010-01-01"),
    priorRentalExemptionHistory: "none",
  }) as EligibilityContext;
const abolishedNotices = (n: readonly string[] | undefined) => (n ?? []).filter((s) => s.includes("폐지되는 유형"));
const APT = { isApartment: true };

describe("§155㉓ 폐지되는 유형 — 먼저 말소된 호 확인 필요 고지", () => {
  it("AB-1 ★ 장기일반 아파트 매입 · 말소 없음 → 고지 1건 · 판정 불변(통과)", () => {
    const r = checkEligibility([unit("2019-06-01", APT)], 10, 10, false, ctx());
    expect(r.passed).toBe(true);
    const n = abolishedNotices(r.notices);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("이미 양도했거나 거주주택으로 전환한 장기임대주택이 먼저 자진·자동말소됐다면 그 최초 말소일부터 5년 이내에");
    expect(n[0]).toContain("기획재정부 재산세제과-1308, 2022.10.18.");
    expect(n[0]).toContain("(확인 필요)");
  });

  it("AB-2 비아파트(폐지되지 않는 유형)면 고지 없음", () => {
    const r = checkEligibility([unit("2019-06-01")], 10, 10, false, ctx());
    expect(r.passed).toBe(true);
    expect(abolishedNotices(r.notices)).toEqual([]);
  });

  it("AB-3 말소 호가 있어 기존 ㉓ 창 고지가 나가면 겹쳐 내지 않는다", () => {
    const r = checkEligibility(
      [
        unit("2019-06-01", APT),
        unit("2015-01-01", { ...APT, rentalAutoTermination: true, registrationCancellationDate: new Date("2023-01-01") }),
      ],
      10,
      10,
      false,
      ctx(),
    );
    expect(r.passed).toBe(true);
    expect((r.notices ?? []).some((s) => s.includes("최초 말소일 2023-01-01"))).toBe(true);
    expect(abolishedNotices(r.notices)).toEqual([]);
  });

  it("AB-4 특례 불성립(거주 1년)이면 고지하지 않는다", () => {
    const r = checkEligibility([unit("2019-06-01", APT)], 10, 1, false, ctx());
    expect(r.passed).toBe(false);
    expect(abolishedNotices(r.notices)).toEqual([]);
  });

  it("AB-5 양도일 맥락 없는 직접 호출은 고지하지 않는다", () => {
    const r = checkEligibility([unit("2019-06-01", APT)], 10, 10);
    expect(abolishedNotices(r.notices)).toEqual([]);
  });
});
