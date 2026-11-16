/**
 * V-10 — 2020.8.18. 전 멸실 임대주택 × 법률 제17482호 부칙 제7조 간주 자동말소 × §155㉓
 * (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` V-10 · 사용자 결정 2026-11-16 「멸실 질문 신설」·「⑳만」).
 *
 * 서면-2022-법규재산-3118[법규과-3158, 2024.12.18.] → 기획재정부 조세정책과-2231(2024.12.9.): 임대의무기간이 2020.8.18. 전에 지났으나
 * 그 전에 재건축으로 멸실된 임대주택은 부칙 제7조에 따라 자동말소된 것으로 볼 수 없어 소령 §155㉓을 적용할 수 없다(제1안).
 * 수정 전 실측(master 39fcec768): 말소일을 종료일·2020-08-18·멸실일 어느 것으로 넣어도 `passed=true`.
 */
import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { needsPreAddendaDemolitionAnswer } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/termination-window";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);

/** 단기 2015-03-01 등록 · 4년 의무기간 2019-03-01 종료(3118 사실관계의 축약) */
function unit(cancelled: string, over: Partial<RentalUnitInput> = {}): RentalUnitInput {
  return {
    businessRegistrationDate: d("2015-03-01"),
    rentalRegistrationDate: d("2015-03-01"),
    rentalRegisteredDate: d("2015-03-01"),
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    isApartment: false,
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
    ...over,
  } as RentalUnitInput;
}

const ctx = { scenario: "A", transferDate: d("2024-06-01"), residenceAcquisitionDate: d("2010-01-01") } as Parameters<
  typeof checkEligibility
>[4];
const run = (u: RentalUnitInput) => checkEligibility([u], 10, 5, false, ctx);
const messages = (u: RentalUnitInput) => run(u).failReasons.map((f) => f.message).join("\n");

describe("V-10 2020.8.18. 전 멸실 → 부칙 제7조 간주 말소 아님 → ㉓ 미적용", () => {
  it.each(["2019-03-01", "2020-08-18", "2020-04-15"])(
    "D-1 ★ 멸실 「예」 · 말소일 %s 입력 → 불성립(2231 사유) — 수정 전 성립",
    (cancelled) => {
      const u = unit(cancelled, { preAddendaDemolished: true });
      expect(run(u).passed).toBe(false);
      expect(messages(u)).toContain("2020.8.18. 전에 멸실된 임대주택은 법률 제17482호 민간임대주택에 관한 특별법 부칙 제7조에 따라 자동말소된 것으로 볼 수 없어");
      expect(messages(u)).toContain("기획재정부 조세정책과-2231");
    },
  );

  it("D-2 ★ 멸실 여부 미제공(모름) → 불성립 + 확인 필요", () => {
    const u = unit("2019-03-01");
    expect(run(u).passed).toBe(false);
    expect(messages(u)).toContain("멸실됐는지 입력하지 않아");
    expect(messages(u)).toContain("확인 필요");
  });

  it("D-3 짝 — 멸실 「아니오」 → 종전대로 성립(간주 2020-08-18 · 기한 2025-08-18)", () => {
    const r = run(unit("2019-03-01", { preAddendaDemolished: false }));
    expect(r.passed).toBe(true);
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2020-08-18");
    expect(r.cancellationWindow?.deadline).toBe("2025-08-18");
  });

  it("D-4 범위 밖 — 2020-08-19 이후 자동말소는 묻지 않는다(미제공이어도 성립)", () => {
    const u = unit("2019-03-01", {
      businessRegistrationDate: d("2018-03-01"),
      rentalRegistrationDate: d("2018-03-01"),
      rentalRegisteredDate: d("2018-03-01"),
      registrationCancellationDate: d("2022-03-01"),
    });
    expect(run(u).passed).toBe(true);
    expect(messages(u)).not.toContain("멸실");
  });

  it("D-5 범위 밖 — 자진말소·폐지 유형 아님(장기일반 비아파트)에는 V-10 사유를 내지 않는다", () => {
    expect(messages(unit("2020-06-01", { terminationReason: "voluntary" }))).not.toContain("멸실");
    expect(messages(unit("2019-03-01", { terminatedRegistrationType: "long_term_general" }))).not.toContain("멸실");
  });

  it("D-6 술어 경계 — 2020-08-18 포함 · 2020-08-19 제외 · 폐지 유형만", () => {
    const f = { terminationReason: "auto", terminatedRegistrationType: "short_term", isApartment: false, rentalAcquisitionType: "purchase" };
    expect(needsPreAddendaDemolitionAnswer(f, Date.UTC(2020, 7, 18))).toBe(true);
    expect(needsPreAddendaDemolitionAnswer(f, Date.UTC(2020, 7, 19))).toBe(false);
    expect(needsPreAddendaDemolitionAnswer({ ...f, terminatedRegistrationType: "long_term_general", isApartment: true }, Date.UTC(2019, 0, 1))).toBe(true);
    expect(needsPreAddendaDemolitionAnswer({ ...f, terminatedRegistrationType: "long_term_general" }, Date.UTC(2019, 0, 1))).toBe(false);
    expect(needsPreAddendaDemolitionAnswer({ ...f, terminationReason: "voluntary" }, Date.UTC(2019, 0, 1))).toBe(false);
  });
});
