/**
 * anchor: I-4 — §155㉓ 「등록이 말소된 이후(2호 이상이면 **최초로** 등록이 말소되는 장기임대주택의
 *         등록 말소 이후) 5년 이내」를 호별 **말소일**로 판정한다.
 *
 * 법령(DRF 현행 MST 286211 · 신설본 MST 222269 실독 2026-09-28):
 * - §155㉓ 「… 등록이 말소된 경우에는 해당 등록이 말소된 이후(장기임대주택을 2호 이상 임대하는 경우에는
 *   최초로 등록이 말소되는 장기임대주택의 등록 말소 이후를 말한다) 5년 이내에 거주주택을 양도하는 경우에
 *   한정하여 임대기간요건을 갖춘 것으로 보아 제20항을 적용한다. <신설 2020.10.7>」
 * - 부칙<제31083호, 2020.10.7.> 제3조② 「제155조제23항의 개정규정은 2020년 8월 18일 이후부터 이 영 시행
 *   전까지 등록이 말소된 후 거주주택을 양도한 분에 대해서도 적용한다.」
 * - 기획재정부 재산세제과-1308(2022.10.18.) — 「최초로 등록이 말소되는 장기임대주택(거주주택 양도일 현재
 *   최초로 등록이 말소되는 장기임대주택의 보유 여부를 불문한다)」 · 「등록이 말소된 후 취득한 주택을 양도하는
 *   경우 같은 조 제20항이 적용되지 않는 것」 (서면-2021-법규재산-4370 · 기준-2022-법무법인-0088 회신 인용)
 * - 서면-2023-법규재산-2340(법규과-864, 2025.4.24.) — 3채 중 1채 자진말소 후 2채 자동말소 → 최초 말소일 기준
 * - 「~이내」 기한 말일 → 민법 §161(L-1, 사전-2021-법령해석재산-1190)
 */
import { describe, it, expect } from "vitest";
import {
  checkEligibility,
  type EligibilityContext,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

/** 2018-06-01 등록 매입 비아파트 → 가목(소득세법 임대기간요건 5년) */
const registered: RentalUnitInput = {
  businessRegistrationDate: new Date("2018-06-01"),
  rentalRegistrationDate: new Date("2018-06-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

/** 자진말소(단기 4년 → 1/2 = 24개월) · 30개월 임대 — 소득세법 5년은 못 채웠다(㉓으로만 풀린다) */
const cancelled = (date?: string, patch: Partial<RentalUnitInput> = {}): RentalUnitInput => ({
  ...registered,
  rentalMonths: 30,
  rentalAutoTermination: true,
  terminatedRegistrationType: "short_term",
  ...(date ? { registrationCancellationDate: new Date(date) } : {}),
  ...patch,
});

const ctx = (transferDate: string, residenceAcquisitionDate = "2015-01-10"): EligibilityContext => ({
  scenario: "A",
  transferDate: new Date(transferDate),
  residenceAcquisitionDate: new Date(residenceAcquisitionDate),
  priorRentalExemptionHistory: "none",
});

const run = (units: RentalUnitInput[], transferDate: string, acq?: string) =>
  checkEligibility(units, 5, 5, false, ctx(transferDate, acq));

const codes = (e: ReturnType<typeof run>) => e.failReasons.map((f) => [f.unitIndex, f.code]);
const messages = (e: ReturnType<typeof run>) => e.failReasons.map((f) => f.message).join("\n");

describe("I4-1 단일 말소 — 말소일부터 5년(초일 불산입) 경계 ±1일", () => {
  // 2021-03-03 말소 → 역상 말일 2026-03-03(화) — 연장 없음
  it("말일 당일 양도 → ㉓ 충족", () => {
    const e = run([cancelled("2021-03-03")], "2026-03-03");
    expect(e.passed).toBe(true);
    expect(e.cancellationWindow).toEqual({
      firstCancellationDate: "2021-03-03",
      firstUnitIndex: 0,
      calendarEnd: "2026-03-03",
      deadline: "2026-03-03",
      withinDeadline: true,
    });
  });
  it("말일 다음날 양도 → ㉓ 불충족(말소 주택은 양도일 현재 임대 중이 아니다)", () => {
    const e = run([cancelled("2021-03-03")], "2026-03-04");
    expect(e.passed).toBe(false);
    expect(codes(e)).toEqual([[0, "RENTAL_TERMINATION_RESTRICTED"]]);
    expect(messages(e)).toContain("2026-03-03");
    expect(e.cancellationWindow?.withinDeadline).toBe(false);
  });
});

describe("I4-2 민법 §161 — 말일이 토요일·공휴일이면 익일", () => {
  it("말일 2026-03-07(토) → 2026-03-09(월)까지 연장: 03-09 충족 / 03-10 불충족", () => {
    const on = run([cancelled("2021-03-07")], "2026-03-09");
    expect(on.passed).toBe(true);
    expect(on.cancellationWindow?.calendarEnd).toBe("2026-03-07");
    expect(on.cancellationWindow?.deadline).toBe("2026-03-09");
    expect(on.cancellationWindow?.deadlineNote).toContain("토요일·공휴일");
    expect(run([cancelled("2021-03-07")], "2026-03-10").passed).toBe(false);
  });
  it("말일 2025-10-03(개천절) → 추석·한글날 연휴를 건너 2025-10-10: 10-10 충족 / 10-11 불충족", () => {
    expect(run([cancelled("2020-10-03")], "2025-10-10").passed).toBe(true);
    expect(run([cancelled("2020-10-03")], "2025-10-11").passed).toBe(false);
  });
});

describe("I4-3 2호 이상 — 최초 말소일이 기한을 정한다(재산세제과-1308 · 법규과-864)", () => {
  // 1호 2020-09-01 말소(기한 2025-09-01 월) · 2호 2023-01-10 말소(자기 기한이면 2028-01-10)
  const units = () => [cancelled("2023-01-10"), cancelled("2020-09-01")];
  it("최초 말소일 기한 당일 → 충족", () => {
    const e = run(units(), "2025-09-01");
    expect(e.passed).toBe(true);
    expect(e.cancellationWindow?.firstCancellationDate).toBe("2020-09-01");
    expect(e.cancellationWindow?.firstUnitIndex).toBe(1);
  });
  it("🔴 짝: 나중 말소 호(2호)의 5년은 남았지만 최초 말소 호 기한이 지났다 → 두 호 모두 불충족", () => {
    const e = run(units(), "2025-09-02");
    expect(e.passed).toBe(false);
    expect(codes(e)).toEqual([
      [0, "RENTAL_TERMINATION_RESTRICTED"],
      [1, "RENTAL_TERMINATION_RESTRICTED"],
    ]);
    expect(messages(e)).toContain("최초");
  });
  it("말소 호 + 등록 유지 호 — 기한은 말소 호 기준, 유지 호는 그대로 ⑳ 판정", () => {
    expect(run([registered, cancelled("2021-01-05")], "2026-01-05").passed).toBe(true);
    const e = run([registered, cancelled("2021-01-05")], "2026-01-06");
    expect(e.passed).toBe(false);
    expect(codes(e)).toEqual([[1, "RENTAL_TERMINATION_RESTRICTED"]]);
  });
});

describe("I4-4 입력이 모자라면 판정하지 않는다(침묵 비과세 금지)", () => {
  it("구 기록 — 말소 표시만 있고 말소일이 없다 → 불충족 + 말소일 입력 요구", () => {
    const e = run([cancelled(undefined)], "2024-06-01");
    expect(e.passed).toBe(false);
    expect(codes(e)).toEqual([[0, "RENTAL_TERMINATION_RESTRICTED"]]);
    expect(messages(e)).toContain("말소일");
    expect(e.cancellationWindow).toBeUndefined();
  });
  it("소득세법 임대기간(5년)을 채운 말소 호도 5년 창 밖이면 불충족(⑳2호 — 양도일 현재 등록·임대 중 아님)", () => {
    const full = cancelled("2020-09-01", { rentalMonths: 72 });
    expect(run([full], "2025-09-01").passed).toBe(true);
    expect(run([full], "2025-09-02").passed).toBe(false);
  });
  it("말소일이 2020-08-18 전 → ㉓ 대상 아님(부칙<제31083호> 제3조② · 법률 제17482호 시행일)", () => {
    const e = run([cancelled("2020-08-17")], "2021-06-01");
    expect(e.passed).toBe(false);
    expect(messages(e)).toContain("2020.8.18");
    expect(run([cancelled("2020-08-18")], "2021-06-01").passed).toBe(true);
  });
  it("말소 후 취득한 거주주택 → ⑳ 미적용(재산세제과-1308) / 말소 전 취득은 충족(짝)", () => {
    const after = run([cancelled("2021-03-03")], "2024-06-01", "2021-03-04");
    expect(after.passed).toBe(false);
    expect(messages(after)).toContain("재산세제과-1308");
    expect(run([cancelled("2021-03-03")], "2024-06-01", "2021-03-03").passed).toBe(true);
  });
});

describe("I4-5 OH-39(자진말소 1/2) 회귀 — 기한 안이면 종전 결론 그대로", () => {
  const t = (months: number, type: RentalUnitInput["terminatedRegistrationType"]) =>
    cancelled("2021-03-03", { rentalMonths: months, terminatedRegistrationType: type });
  it("단기 24 충족 / 23 불충족 · 장기일반 48 충족 / 47 불충족", () => {
    expect(run([t(24, "short_term")], "2024-06-01").passed).toBe(true);
    expect(codes(run([t(23, "short_term")], "2024-06-01"))).toEqual([[0, "RENTAL_TERMINATION_RESTRICTED"]]);
    expect(run([t(48, "long_term_general")], "2024-06-01").passed).toBe(true);
    expect(messages(run([t(47, "long_term_general")], "2024-06-01"))).toContain("임대의무기간(8년)의 1/2(48개월)");
  });
  it("㉓으로 통과한 호는 ㉑(㉒ 추징) 대상이 아니다", () => {
    expect(run([t(30, "short_term")], "2024-06-01").periodPendingUnitIndexes).toEqual([]);
  });
});

describe("I4-6 고지 — 기한과 「이미 처분·전환한 주택이 먼저 말소됐다면」", () => {
  it("㉓을 적용하면 기한 고지를 싣는다 / 말소 호가 없으면 싣지 않는다", () => {
    const e = run([cancelled("2021-03-07")], "2026-03-09");
    const n = (e.notices ?? []).join("\n");
    expect(n).toContain("2026-03-09");
    expect(n).toContain("재산세제과-1308");
    expect(run([registered], "2024-06-01").notices ?? []).toEqual([]);
  });
});
