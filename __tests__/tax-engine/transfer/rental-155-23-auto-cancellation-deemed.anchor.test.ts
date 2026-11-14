/**
 * §155㉓ 자동말소일 간주 — 법률 제17482호 민간임대주택에 관한 특별법 부칙 제7조 (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` G-8 · PR-1)
 *
 * 부칙 제7조: 「…종전의 제2조제6호에 따른 단기민간임대주택 또는 제2조제5호에 따른 장기일반임대주택 중 아파트를 임대하는
 * 민간매입임대주택의 임대의무기간이 이 법 시행일 전에 경과된 경우에는 이 법 시행일에 그 임대주택의 등록이 말소된 것으로 본다.」
 * 민특법 §6⑤: 폐지 유형은 「임대의무기간이 종료한 날 등록이 말소된다」 — 말소일 = 의무기간 종료일(등록증 처리일 아님).
 * 사전-2025-법규재산-0972[법규과-2992](2025.12.23.): 2020.8.18. 전 경과 → 2020.8.18. 말소, 처리일(2020.12.) 아님.
 *
 * 매트릭스 행 번호는 계획서 §3 G-8 표와 같다.
 */
import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);

function unit(over: Partial<RentalUnitInput> & { reg: string; cancelled: string }): RentalUnitInput {
  const { reg, cancelled, ...rest } = over;
  return {
    businessRegistrationDate: d(reg),
    rentalRegistrationDate: d(reg),
    rentalRegisteredDate: d(reg),
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    isApartment: true,
    region: "seoul-metro",
    standardPriceAtRentalStart: 300_000_000,
    hasMinimum2Units: false,
    rentalMonths: 48,
    halfDutyRentalMonths: 48,
    rentalAutoTermination: true,
    terminatedRegistrationType: "short_term",
    terminationReason: "auto",
    registrationCancellationDate: d(cancelled),
    requirementsConfirmed: true,
    isExcluded918Rule: false,
    ...rest,
  } as RentalUnitInput;
}

const ctx = (transferDate: string) =>
  ({ scenario: "A", transferDate: d(transferDate), residenceAcquisitionDate: d("2010-01-01") }) as Parameters<
    typeof checkEligibility
  >[4];

const run = (units: RentalUnitInput[], transferDate: string) => checkEligibility(units, 10, 5, false, ctx(transferDate));

describe("G-8 자동말소 2020.8.18. 전 종료 → 2020.8.18. 말소 간주 (부칙 제7조)", () => {
  it("8-1 단기 2016 등록·종료일 2020-06-01 입력, 2024-03-01 양도 → 성립(기한 2025-08-18)", () => {
    const r = run([unit({ reg: "2016-06-01", cancelled: "2020-06-01" })], "2024-03-01");
    expect(r.passed).toBe(true);
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2020-08-18");
    expect(r.cancellationWindow?.deadline).toBe("2025-08-18");
    expect(r.notices?.some((n) => n.includes("부칙 제7조"))).toBe(true);
  });

  it("8-2 종료일 2017-05-01, 2024-06-01 양도 → 성립", () => {
    const r = run([unit({ reg: "2013-05-01", cancelled: "2017-05-01" })], "2024-06-01");
    expect(r.passed).toBe(true);
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2020-08-18");
  });

  it("8-3 종료일 2017-05-01, 2025-08-19 양도 → 간주 후에도 기한 경과로 불성립", () => {
    const r = run([unit({ reg: "2013-05-01", cancelled: "2017-05-01" })], "2025-08-19");
    expect(r.passed).toBe(false);
    expect(r.failReasons.some((f) => f.message.includes("2025-08-18"))).toBe(true);
  });

  it("8-4 2020-08-18 입력 → 성립(불변) · 간주 고지 없음", () => {
    const r = run([unit({ reg: "2016-08-18", cancelled: "2020-08-18" })], "2024-06-01");
    expect(r.passed).toBe(true);
    expect(r.notices?.some((n) => n.includes("부칙 제7조")) ?? false).toBe(false);
  });

  it("8-7 자진말소 2020-06-01 → 불성립(불변 — 자진말소는 간주 대상 아님)", () => {
    const r = run([unit({ reg: "2016-06-01", cancelled: "2020-06-01", terminationReason: "voluntary" })], "2024-03-01");
    expect(r.passed).toBe(false);
    expect(r.failReasons.some((f) => f.message.includes("2020.8.18. 전"))).toBe(true);
  });

  it("8-8 말소 사유 미선택 2020-06-01 → 불성립(모름=불리)", () => {
    const r = run([unit({ reg: "2016-06-01", cancelled: "2020-06-01", terminationReason: undefined })], "2024-03-01");
    expect(r.passed).toBe(false);
  });

  it("8-9 2호(A auto 2019-05-01 · B auto 2022-03-01), 2025-06-01 양도 → 최초 말소일 = A 간주 2020-08-18, 성립", () => {
    const r = run(
      [unit({ reg: "2015-05-01", cancelled: "2019-05-01" }), unit({ reg: "2018-03-01", cancelled: "2022-03-01" })],
      "2025-06-01",
    );
    expect(r.passed).toBe(true);
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2020-08-18");
    expect(r.cancellationWindow?.firstUnitIndex).toBe(0);
  });

  it("8-10 8-9와 같고 2025-09-01 양도 → 최초 말소일 간주 기준 기한 경과로 불성립", () => {
    const r = run(
      [unit({ reg: "2015-05-01", cancelled: "2019-05-01" }), unit({ reg: "2018-03-01", cancelled: "2022-03-01" })],
      "2025-09-01",
    );
    expect(r.passed).toBe(false);
    expect(r.cancellationWindow?.deadline).toBe("2025-08-18");
  });

  it("8-11 비대상 유형(장기일반 비아파트) 자동말소 2019 입력 → 간주하지 않음(부칙 §5① 유형 아님)", () => {
    const r = run(
      [unit({ reg: "2011-05-01", cancelled: "2019-05-01", isApartment: false, terminatedRegistrationType: "long_term_general" })],
      "2024-03-01",
    );
    expect(r.cancellationWindow?.firstCancellationDate === "2020-08-18").toBe(false);
  });
});

describe("G-8 등록증 처리일 오입력 고지 (Q-9 — 값은 바꾸지 않는다)", () => {
  it("8-6 단기 2017-08-10 등록 → 종료 추정 2021-08-10, 입력 2021-10-20(처리일) → 성립 유지 + 확인 필요 고지", () => {
    const r = run([unit({ reg: "2017-08-10", cancelled: "2021-10-20" })], "2026-09-01");
    expect(r.passed).toBe(true);
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2021-10-20");
    expect(r.notices?.some((n) => n.includes("임대의무기간 종료일"))).toBe(true);
  });

  it("8-5 종료일 그대로(2021-08-10) 입력 → 기한 경과 불성립, 오입력 고지 없음", () => {
    const r = run([unit({ reg: "2017-08-10", cancelled: "2021-08-10" })], "2026-09-01");
    expect(r.passed).toBe(false);
    expect(r.notices?.some((n) => n.includes("등록증")) ?? false).toBe(false);
  });
});
