/**
 * Q-8 ① — 2호 상속 피상속인 등록 사실 ④ `rentalPeriodDatesPayload` · ⑧ `rentalPeriodDatesIssue` (서면-2020-법규재산-1959).
 * 양도 주택 2호 선언과 명부 행이 같은 두 함수를 쓴다.
 */
import { describe, it, expect } from "vitest";
import { rentalPeriodDatesPayload } from "@/lib/calc/tax-incentive-rental-scope";
import { rentalPeriodDatesIssue } from "@/lib/calc/tax-incentive-rental-scope";

const inh = { rentalStartDate: "2019-06-20", isInheritedRental: true, decedentRentalMonths: "39" };
const reg = { decedentBusinessRegistrationDate: "2016-03-10", decedentRentalRegistrationDate: "2016-03-10" };

describe("④ 피상속인 등록 사실", () => {
  it("P-1 상속 + 사업자등록일·신청일 → 3칸 싣는다(등록일 비면 생략)", () => {
    expect(rentalPeriodDatesPayload({ ...inh, ...reg })).toMatchObject({ ...reg, decedentRentalRegisteredDate: undefined });
    expect(rentalPeriodDatesPayload({ ...inh, ...reg, decedentRentalRegisteredDate: "2016-03-15" })).toMatchObject({
      decedentRentalRegisteredDate: "2016-03-15",
    });
  });
  it("P-2 상속 OFF면 stale 값을 싣지 않는다", () => {
    const p = rentalPeriodDatesPayload({ ...inh, ...reg, isInheritedRental: undefined }) as Record<string, unknown>;
    expect(p.decedentBusinessRegistrationDate).toBeUndefined();
    expect(p.decedentRentalRegistrationDate).toBeUndefined();
  });
  it("P-3 반쪽 입력(신청일만)은 싣지 않는다 — ⑧이 막는다", () => {
    const p = rentalPeriodDatesPayload({ ...inh, decedentRentalRegistrationDate: "2016-03-10" }) as Record<string, unknown>;
    expect(p.decedentRentalRegistrationDate).toBeUndefined();
  });
});

describe("⑧ 피상속인 등록 사실", () => {
  it("V-1 비워 두면 통과(선택 칸 — 상속인 등록일로 판정)", () => {
    expect(rentalPeriodDatesIssue(inh)).toBeNull();
  });
  it("V-2 둘 다 있으면 통과", () => {
    expect(rentalPeriodDatesIssue({ ...inh, ...reg })).toBeNull();
  });
  it("V-3 반쪽 입력 → 차단", () => {
    expect(rentalPeriodDatesIssue({ ...inh, decedentBusinessRegistrationDate: "2016-03-10" })).toMatch(/함께 입력/);
    expect(rentalPeriodDatesIssue({ ...inh, decedentRentalRegisteredDate: "2016-03-15" })).toMatch(/함께 입력/);
  });
  it("V-4 등록일 < 신청일 → 차단", () => {
    expect(rentalPeriodDatesIssue({ ...inh, ...reg, decedentRentalRegisteredDate: "2016-03-01" })).toMatch(/등록 신청일 이후/);
  });
  it("V-5 상속 OFF면 stale 반쪽 값은 보지 않는다", () => {
    expect(rentalPeriodDatesIssue({ rentalStartDate: "2019-06-20", decedentBusinessRegistrationDate: "2016-03-10" })).toBeNull();
  });
});
