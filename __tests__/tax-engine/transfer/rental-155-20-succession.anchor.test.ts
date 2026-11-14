/**
 * §155⑳ 임대사업 승계 — 동일세대 증여(포괄승계) 목 판정 · 포괄양수 개월 (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` G-3·G-5 · PR-2)
 *
 * - 서면-2022-법규재산-4972[법규과-1281]·사전-2022-법규재산-0744(→기획재정부 재산세제과-1591): 1세대 안 증여(포괄승계)는 증여자 등록 기준으로 ⑳ 판정.
 * - 서면-2020-법규재산-5310[법규과-2305]: 포괄양수 → ㉓1호 1/2 기산일 = 전 임대사업자 등록일.
 * - 조특법 §97의3은 반대 결론(재산세제과-954) — 이 anchor는 ⑳ 경로만 다룬다.
 *
 * 매트릭스 행 번호는 계획서 §3 G-3·G-5 표와 같다. 엔진 개월 계산은 불변(합산은 클라이언트 ④) —
 * 엔진 입력 `rentalMonths`에는 이미 승계분이 합쳐져 있고, `succession`은 echo·고지용이다.
 */
import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { registrationBasis } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/derive";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);

function unit(over: Partial<RentalUnitInput> & { reg: string }): RentalUnitInput {
  const { reg, ...rest } = over;
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
    rentalMonths: 60,
    rentalAutoTermination: false,
    requirementsConfirmed: true,
    isExcluded918Rule: false,
    ...rest,
  } as RentalUnitInput;
}

const donor = (reg: string) => ({
  businessRegistrationDate: d(reg),
  rentalRegistrationDate: d(reg),
  rentalRegisteredDate: d(reg),
});

const ctx = (transferDate: string) =>
  ({ scenario: "A", transferDate: d(transferDate), residenceAcquisitionDate: d("2010-01-01") }) as Parameters<
    typeof checkEligibility
  >[4];

const run = (units: RentalUnitInput[], transferDate: string) => checkEligibility(units, 10, 5, false, ctx(transferDate));

describe("G-3 동일세대 증여 — 목 판정은 증여자 등록 기준", () => {
  // 2019-06 등록 아파트 → 2021-03 배우자 증여·수증자 등록(24 + 36 = 60개월)
  it("3-1 ★ 증여자 신청일 2019-06(가목) → 성립 · 수증자 날짜만이면 마목 아파트 제한으로 불성립", () => {
    const own = run([unit({ reg: "2021-03-01" })], "2024-06-01");
    expect(own.passed).toBe(false);
    expect(own.failReasons.some((f) => f.code === "APARTMENT_RESTRICTED")).toBe(true);

    const gift = run(
      [
        unit({
          reg: "2021-03-01",
          succession: { kind: "household_gift", predecessorMonths: 24 },
          donorRegistration: donor("2019-06-01"),
        }),
      ],
      "2024-06-01",
    );
    expect(gift.passed).toBe(true);
    expect(gift.perUnitVerdict?.[0].derivedArticle).toBe("가");
    expect(gift.perUnitVerdict?.[0].effectiveRegDate).toBe("2019-06-01");
  });

  it("3-2 증여자 날짜를 주 칸에 넣는 우회(구조 입력 도입 전 방식)도 같은 결과 — 성립", () => {
    const r = run([unit({ reg: "2019-06-01" })], "2024-06-01");
    expect(r.passed).toBe(true);
    expect(r.perUnitVerdict?.[0].derivedArticle).toBe("가");
  });

  it("3-3 ★ 2018 단기 → 2021 증여 → 2022 자동말소 → 2024 양도 → 성립(0744 · 말소 호 목·㉓ 대상도 증여자 기준)", () => {
    const r = run(
      [
        unit({
          reg: "2021-03-01",
          rentalMonths: 48,
          halfDutyRentalMonths: 48,
          rentalAutoTermination: true,
          terminatedRegistrationType: "short_term",
          terminationReason: "auto",
          registrationCancellationDate: d("2022-03-01"),
          succession: { kind: "household_gift", predecessorMonths: 36 },
          donorRegistration: donor("2018-03-01"),
        }),
      ],
      "2024-03-01",
    );
    expect(r.passed).toBe(true);
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2022-03-01");
    expect(r.perUnitVerdict?.[0].derivedArticle).toBe("가");
  });

  it("3-3b 같은 사실, 수증자 날짜만이면 불성립(현행 — 마목 아파트 제한)", () => {
    const r = run(
      [
        unit({
          reg: "2021-03-01",
          rentalMonths: 48,
          halfDutyRentalMonths: 48,
          rentalAutoTermination: true,
          terminatedRegistrationType: "short_term",
          terminationReason: "auto",
          registrationCancellationDate: d("2022-03-01"),
        }),
      ],
      "2024-03-01",
    );
    expect(r.passed).toBe(false);
  });

  it("3-6 폐지 유형 안내(말소되지 않은 호의 ㉓ 5년 창 확인 필요)도 증여자 등록일로 판정한다", () => {
    const r = run(
      [unit({ reg: "2021-03-01", succession: { kind: "household_gift", predecessorMonths: 24 }, donorRegistration: donor("2019-06-01") })],
      "2024-06-01",
    );
    expect(r.passed).toBe(true);
    expect(r.notices?.some((n) => n.includes("폐지되는 유형"))).toBe(true);
  });

  it("3-7 D10 — 양도일 현재 등록은 수증자 본인 등록으로 본다(증여자 날짜가 앞서도 본인 등록이 양도 뒤면 불성립)", () => {
    const r = run(
      [unit({ reg: "2024-06-02", succession: { kind: "household_gift", predecessorMonths: 24 }, donorRegistration: donor("2019-06-01") })],
      "2024-06-01",
    );
    expect(r.passed).toBe(false);
    expect(r.failReasons.some((f) => f.code === "REGISTERED_AFTER_TRANSFER")).toBe(true);
  });
});

describe("G-5 포괄양수 · 승계 echo · 확인 필요 고지", () => {
  it("5-1 포괄양수 — 목·기한은 양수인 본인 날짜(Q-5) + 「확인 필요」 고지, 개월은 입력 그대로", () => {
    const r = run(
      [unit({ reg: "2019-06-01", rentalMonths: 60, succession: { kind: "assumption", predecessorMonths: 24 } })],
      "2024-06-01",
    );
    expect(r.passed).toBe(true);
    expect(r.perUnitVerdict?.[0].succession).toEqual({ kind: "assumption", predecessorMonths: 24 });
    const notice = (r.notices ?? []).find((n) => n.includes("포괄양수"));
    expect(notice).toContain("확인 필요");
    expect(notice).toContain("1호");
  });

  it("5-2 포괄양수여도 목 판정은 본인 날짜 — 2021 등록 아파트는 마목 제한으로 불성립(증여와 다르다)", () => {
    const r = run(
      [unit({ reg: "2021-03-01", rentalMonths: 60, succession: { kind: "assumption", predecessorMonths: 24 } })],
      "2024-06-01",
    );
    expect(r.passed).toBe(false);
    expect(r.failReasons.some((f) => f.code === "APARTMENT_RESTRICTED")).toBe(true);
  });

  it("E-1 증여 echo — 종류·증여자 개월·증여자 날짜 3필드", () => {
    const r = run(
      [
        unit({
          reg: "2021-03-01",
          succession: { kind: "household_gift", predecessorMonths: 24 },
          donorRegistration: {
            businessRegistrationDate: d("2019-05-20"),
            rentalRegistrationDate: d("2019-06-01"),
            rentalRegisteredDate: d("2019-06-10"),
          },
        }),
      ],
      "2024-06-01",
    );
    expect(r.perUnitVerdict?.[0].succession).toEqual({
      kind: "household_gift",
      predecessorMonths: 24,
      donorBusinessRegistrationDate: "2019-05-20",
      donorRentalRegistrationDate: "2019-06-01",
      donorRentalRegisteredDate: "2019-06-10",
    });
  });

  it("E-2 상속 echo — 종류·피상속인 개월만, 포괄양수 고지 없음", () => {
    const r = run([unit({ reg: "2019-06-01", succession: { kind: "inheritance", predecessorMonths: 30 } })], "2024-06-01");
    expect(r.perUnitVerdict?.[0].succession).toEqual({ kind: "inheritance", predecessorMonths: 30 });
    expect((r.notices ?? []).some((n) => n.includes("포괄양수"))).toBe(false);
  });

  it("E-3 승계 없음 — echo 필드 자체가 없다", () => {
    const r = run([unit({ reg: "2019-06-01" })], "2024-06-01");
    expect(r.perUnitVerdict?.[0].succession).toBeUndefined();
  });
});

describe("registrationBasis — 단일 소스", () => {
  const own = unit({ reg: "2021-03-01" });
  it("증여자 등록이 있으면 그 3필드, 없으면 본인 3필드", () => {
    expect(registrationBasis(own).rentalRegistrationDate).toEqual(d("2021-03-01"));
    const g = { ...own, donorRegistration: donor("2019-06-01") };
    expect(registrationBasis(g).rentalRegistrationDate).toEqual(d("2019-06-01"));
    expect(registrationBasis(g).businessRegistrationDate).toEqual(d("2019-06-01"));
  });
});
