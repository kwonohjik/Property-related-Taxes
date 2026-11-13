/**
 * anchor — §97의3 상속 임대주택 피상속인 임대기간 합산 (V-14)
 *
 * 계획서 docs/01-plan/features/rental-97-3-inheritance-merge.plan.md §4 (M-1~M-13) · 사용자 지시 2026-11-13 「구현 시작해」 → Q-0~Q-6 권장안.
 * 조특령 §97의3④ 「임대기간의 계산에 관하여는 제97조제5항제1호ㆍ제3호 및 제5호를 준용」 → §97⑤3호 「피상속인의 주택임대기간을
 * 상속인의 주택임대기간에 합산」 (MST 288915 원문). 령 ② 「등록 기간 동안 통산하여 10년」 — 일수 통산(Q-0 A).
 * §97의3 정면 해석례 없음 — 관련 서면-2019-부동산-0810은 합산 여부를 답하지 않았다.
 *
 * 공통: 상속개시일(= 자산 취득일) 2019-01-01 · 상속인 등록·사업자등록·임대개시 2019-02-01 · 매입임대 · 수도권 · 국민주택규모 ·
 *       기준시가 한도 4억 · 기준시가 취득 4억 / 상속인 개시 4.5억 / 양도 9억 · 피상속인 등록·임대 2016-05-01.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
import { mergedRentalYears97 } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import { RENTAL_VACANCY_GRACE_MONTHS_97 } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const shortMsg = (r: Rental97Result) =>
  r.isEligible ? "" : (r.ineligibleReasons.find((x) => x.code === "RENTAL_PERIOD_SHORT")?.message ?? "");
const lthd = (r: Rental97Result) => r as Extract<Rental97Result, { isEligible: true; effectCategory: "long_term_holding_special" }>;

const inh = (o: Partial<{ inheritanceDate: string; decedentRegistrationDate: string; decedentRentalStartDate: string }> = {}) => ({
  inheritanceDate: D(o.inheritanceDate ?? "2019-01-01"),
  decedentRegistrationDate: D(o.decedentRegistrationDate ?? "2016-05-01"),
  decedentRentalStartDate: D(o.decedentRentalStartDate ?? "2016-05-01"),
});

const input = (over: Partial<Rental97EvaluationInput> = {}): Rental97EvaluationInput => ({
  id: "rental_97_3",
  acquisitionDate: D("2019-01-01"),
  registrationDate: D("2019-02-01"),
  rentalStartDate: D("2019-02-01"),
  taxRegistrationDate: D("2019-02-01"),
  isTaxRegistered: true,
  transferDate: D("2026-05-01"),
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 400_000_000,
  stdPriceAtAcquisition: 400_000_000,
  stdPriceAtRentalStart: 450_000_000,
  stdPriceAtTransfer: 900_000_000,
  rentalContinuesToTransfer: true,
  ...over,
});

describe("임대기간 — 피상속인 분 일수 통산 (Q-0 A)", () => {
  it("M-1 합산 입력 없음 → 상속인 분만 7년 · RENTAL_PERIOD_SHORT (회귀)", () => {
    const r = evaluateRental973(input());
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(shortMsg(r)).toContain("임대기간 7년");
  });

  it("🔴 M-2 피상속인 2016-05-01~2019-01-01 + 상속인 2019-02-01~2026-05-01 → 9년 · 2022 전 등록 8년 이상 50% · 구간 echo", () => {
    const r = evaluateRental973(input({ inheritance973: inh() }));
    expect(r).toMatchObject({
      isEligible: true,
      overrideRate: 0.5,
      eligibleRentalYears: 9,
      rentalPeriod973: {
        decedent: { start: "2016-05-01", end: "2019-01-01" },
        heir: { start: "2019-02-01", end: "2026-05-01" },
      },
    });
  });

  it("M-3 양도 2026-06-01 → 합산 10년 → 70%", () => {
    const r = evaluateRental973(input({ inheritance973: inh(), transferDate: D("2026-06-01") }));
    expect(r).toMatchObject({ isEligible: true, overrideRate: 0.7, eligibleRentalYears: 10 });
  });

  it("M-4 양도 2026-04-30 → 9년 → 50%", () => {
    const r = evaluateRental973(input({ inheritance973: inh(), transferDate: D("2026-04-30") }));
    expect(r).toMatchObject({ isEligible: true, overrideRate: 0.5, eligibleRentalYears: 9 });
  });

  it("M-5 상속개시일 ~ 상속인 개시 간격은 세지 않는다 — 간격 3개월(2019-04-01)·3개월 초과(2019-04-02) 모두 9년", () => {
    const at = (d: string) =>
      evaluateRental973(
        input({ registrationDate: D(d), rentalStartDate: D(d), taxRegistrationDate: D(d), transferDate: D("2026-07-01"), inheritance973: inh() }),
      );
    expect(at("2019-04-01")).toMatchObject({ eligibleRentalYears: 9 });
    expect(at("2019-04-02")).toMatchObject({ eligibleRentalYears: 9 });
  });

  it("피상속인 의제 개시일 = 임대개시일·등록등일 중 늦은 날 — 등록 2017-05-01이면 1년 줄어 8년", () => {
    const r = evaluateRental973(input({ inheritance973: inh({ decedentRegistrationDate: "2017-05-01" }) }));
    expect(r).toMatchObject({ isEligible: true, eligibleRentalYears: 8, rentalPeriod973: { decedent: { start: "2017-05-01" } } });
  });

  it("미달이면 메시지에 합산 구간을 밝힌다", () => {
    const r = evaluateRental973(input({ inheritance973: inh({ decedentRegistrationDate: "2018-06-01", decedentRentalStartDate: "2018-06-01" }) }));
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(shortMsg(r)).toContain("피상속인 임대기간(2018-06-01~2019-01-01)을 합산했습니다");
  });
});

describe("상속인 기준 그대로인 요건 (Q-1)", () => {
  it("M-6 상속인 2021-03-01 등록 매입임대 → PURCHASE_RENTAL_REG_DEADLINE — 피상속인 2016 등록으로 대체하지 않는다", () => {
    const r = evaluateRental973(
      input({ registrationDate: D("2021-03-01"), rentalStartDate: D("2021-03-01"), taxRegistrationDate: D("2021-03-01"), transferDate: D("2030-01-01"), inheritance973: inh() }),
    );
    expect(codes(r)).toContain("PURCHASE_RENTAL_REG_DEADLINE");
  });
  it("M-7 상속인 2023-02-01 등록 · 건설임대 아님 → NOT_PRIVATE_CONSTRUCTION_RENTAL", () => {
    const r = evaluateRental973(
      input({ registrationDate: D("2023-02-01"), rentalStartDate: D("2023-02-01"), taxRegistrationDate: D("2023-02-01"), transferDate: D("2030-01-01"), inheritance973: inh() }),
    );
    expect(codes(r)).toContain("NOT_PRIVATE_CONSTRUCTION_RENTAL");
  });
});

describe("임대료 5% — 피상속인 분 계약부터 (Q-4)", () => {
  const jeonse = (date: string, deposit: number) => ({ contractDate: D(date), contractType: "jeonse" as const, deposit, monthlyRent: 0 });
  const rentHistory = [jeonse("2016-05-01", 100_000_000), jeonse("2018-06-01", 120_000_000)];
  it("🔴 M-8 피상속인 시기 2018-06 전세 +20% → 합산하면 RENT_INCREASE_VIOLATED · 합산 없으면 세지 않는다", () => {
    expect(codes(evaluateRental973(input({ inheritance973: inh(), rentHistory })))).toContain("RENT_INCREASE_VIOLATED");
    expect(codes(evaluateRental973(input({ rentHistory })))).not.toContain("RENT_INCREASE_VIOLATED");
  });
});

describe("변경신고와 함께 쓸 수 없다 (Q-2)", () => {
  it("M-9 상속 합산 + 단기→장기 변경신고 → INHERITANCE_WITH_SHORT_TERM_CONVERSION · 합산하지 않는다", () => {
    const r = evaluateRental973(
      input({ inheritance973: inh(), shortTermConversion: { reportedDate: D("2019-06-01"), acceptedDate: D("2019-06-10") } }),
    );
    expect(codes(r)).toContain("INHERITANCE_WITH_SHORT_TERM_CONVERSION");
  });
});

describe("M-10 날짜 순서", () => {
  it("피상속인 임대개시일 = 상속개시일 → INVALID_INHERITANCE_DATES", () => {
    expect(codes(evaluateRental973(input({ inheritance973: inh({ decedentRentalStartDate: "2019-01-01" }) })))).toContain("INVALID_INHERITANCE_DATES");
  });
  it("피상속인 등록등일 > 상속개시일 → INVALID_INHERITANCE_DATES", () => {
    expect(codes(evaluateRental973(input({ inheritance973: inh({ decedentRegistrationDate: "2019-03-01" }) })))).toContain("INVALID_INHERITANCE_DATES");
  });
  it("상속개시일 > 양도일 → INVALID_INHERITANCE_DATES", () => {
    expect(codes(evaluateRental973(input({ inheritance973: inh({ inheritanceDate: "2026-06-01" }) })))).toContain("INVALID_INHERITANCE_DATES");
  });
});

describe("안분 ⑤ — 합산된 임대기간 개시일 = 피상속인 의제 개시일 (Q-3 Y)", () => {
  it("🔴 M-11 계속 임대 → 합산 없으면 (9−4.5)/(9−4) = 4.5/5 · 합산하면 1", () => {
    const own = lthd(evaluateRental973(input({ transferDate: D("2029-03-01") })));
    expect(own.rentalGainFraction).toEqual({ num: 450_000_000, den: 500_000_000 });
    const merged = lthd(evaluateRental973(input({ transferDate: D("2029-03-01"), inheritance973: inh() })));
    expect(merged.rentalGainRatio).toBe(1);
  });
  it("M-12 조기 종료(종료일 기준시가 8억) → 합산 없으면 (8−4.5)/5 · 합산하면 C = E로 (8−4)/5", () => {
    const early = { transferDate: D("2030-03-01"), rentalContinuesToTransfer: false, rentalEndDate: D("2029-03-01"), stdPriceAtRentalEnd: 800_000_000 };
    expect(lthd(evaluateRental973(input(early))).rentalGainFraction).toEqual({ num: 350_000_000, den: 500_000_000 });
    expect(lthd(evaluateRental973(input({ ...early, inheritance973: inh() }))).rentalGainFraction).toEqual({ num: 400_000_000, den: 500_000_000 });
  });
});

describe("M-13 공실 3개월 — 피상속인 분에도 같은 규칙 (령 §97⑤5호 → 조특칙 §44)", () => {
  it("피상속인 분 공실 4개월은 빼고 2개월은 세다 — 양도 2026-06-01(합산 10년 0개월)", () => {
    const vac = (s: string, e: string) => [{ startDate: D(s), endDate: D(e) }];
    const base = { transferDate: D("2026-06-01"), inheritance973: inh() };
    expect(evaluateRental973(input({ ...base, vacancyPeriods: vac("2017-01-01", "2017-03-01") }))).toMatchObject({ eligibleRentalYears: 10 });
    expect(evaluateRental973(input({ ...base, vacancyPeriods: vac("2017-01-01", "2017-05-01") }))).toMatchObject({ eligibleRentalYears: 9 });
  });
  it("상속개시일에 걸친 공실은 두 조각으로 나눠 판정 — 2018-11-01~2019-03-15(전체 4.5개월 · 조각 2개월·1.5개월)은 세다", () => {
    const r = evaluateRental973(
      input({ transferDate: D("2026-06-01"), inheritance973: inh(), vacancyPeriods: [{ startDate: D("2018-11-01"), endDate: D("2019-03-15") }] }),
    );
    expect(r).toMatchObject({ eligibleRentalYears: 10 });
  });
});

describe("V-3 공용 헬퍼 = §97의4 인라인 합산 (같은 입력 · 같은 연수)", () => {
  // §97의4 상속 anchor(`rental-97-4-effective-start-inherit-autocancel.anchor.test.ts` R-3)와 같은 사실관계
  const INH4 = { inheritanceDate: D("2016-01-01"), decedentRegistrationDate: D("2012-01-01"), decedentRentalStartDate: D("2012-01-01") };
  const vacs = [
    [],
    [{ startDate: D("2013-02-01"), endDate: D("2013-07-01") }],
    [{ startDate: D("2015-11-01"), endDate: D("2016-08-15") }],
    [{ startDate: D("2017-01-01"), endDate: D("2017-03-20") }, { startDate: D("2019-01-01"), endDate: D("2019-06-01") }],
  ];
  const cases = ["2020-07-01", "2021-12-31", "2023-03-15"].flatMap((t) => vacs.map((v, i) => [t, i, v] as const));
  it.each(cases)("양도 %s · 공실 세트 %i", (t, _i, v) => {
    const r974 = evaluateRental974({
      id: "rental_97_4", acquisitionDate: D("2013-01-01"), isTaxRegistered: true, rentIncreaseViolated: false,
      rental974Category: "purchase_a", region: "capital", officialPriceAtStart: 300_000_000,
      rentalStartDate: D("2016-07-01"), registrationDate: D("2016-07-01"), taxRegistrationDate: D("2016-07-01"),
      transferDate: D(t), vacancyPeriods: v, inheritance974: INH4,
    } as Rental97EvaluationInput);
    const years974 = r974.isEligible
      ? (r974 as { eligibleRentalYears: number }).eligibleRentalYears
      : Number(/임대기간 (\d+)년/.exec(r974.ineligibleReasons.map((x) => x.message).join(" "))?.[1]);
    expect(Number.isFinite(years974)).toBe(true);
    expect(mergedRentalYears97(D("2016-07-01"), D(t), INH4, v, RENTAL_VACANCY_GRACE_MONTHS_97).years).toBe(years974);
  });
});
