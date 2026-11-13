/**
 * anchor — §97의5 상속 임대주택 피상속인 임대기간 합산 (V-13)
 *
 * 계획서 docs/01-plan/features/rental-97-5-inheritance-merge.plan.md §4 (H-1~H-10) · 사용자 결정 2026-11-13 Q-A~Q-E 권장안.
 * 조특령 §97의5③ 「임대기간의 계산에 관하여는 제97조제5항제1호 및 제3호를 준용」 → §97⑤3호 「피상속인의 주택임대기간을
 * 상속인의 주택임대기간에 합산」 (MST 288915 원문). §97의5 정면 해석례 없음 — 같은 준용 구조 해석: 서면인터넷방문상담4팀-3265
 * (구 §97의2) · 서면-2015-부동산-1813(§97의4).
 *
 * 공통: 상속개시일(= 자산 취득일) 2017-06-01 · 상속인 등록·사업자등록·임대개시 2017-07-15 · 양도 2026-03-01 ·
 *       수도권 기준시가 4억 · 국민주택규모 · 매입임대 · 피상속인 등록·임대 2015-03-01.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const years = (r: Rental97Result) => (r.isEligible ? null : (r.ineligibleReasons.find((x) => x.code === "RENTAL_PERIOD_SHORT")?.message ?? ""));

const inh = (o: Partial<{ inheritanceDate: string; decedentRegistrationDate: string; decedentRentalStartDate: string }> = {}) => ({
  inheritanceDate: D(o.inheritanceDate ?? "2017-06-01"),
  decedentRegistrationDate: D(o.decedentRegistrationDate ?? "2015-03-01"),
  decedentRentalStartDate: D(o.decedentRentalStartDate ?? "2015-03-01"),
});

const input = (over: Partial<Rental97EvaluationInput> = {}): Rental97EvaluationInput => ({
  id: "rental_97_5",
  acquisitionDate: D("2017-06-01"),
  registrationDate: D("2017-07-15"),
  rentalStartDate: D("2017-07-15"),
  taxRegistrationDate: D("2017-07-15"),
  isTaxRegistered: true,
  transferDate: D("2026-03-01"),
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  isPurchaseRental: true,
  region: "capital",
  officialPriceAtStart: 400_000_000,
  rentalContinuesToTransfer: true,
  calculatedTax: 50_000_000,
  ...over,
});

const jeonse = (date: string, deposit: number) => ({
  contractDate: D(date),
  contractType: "jeonse" as const,
  deposit,
  monthlyRent: 0,
});

describe("10년 계속 임대 — 피상속인 분 합산 (Q-A)", () => {
  it("H-1 합산 입력 없음 → 상속인 분만(8년) · RENTAL_PERIOD_SHORT (회귀)", () => {
    const r = evaluateRental975(input());
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(years(r)).toContain("계속 임대기간 8년");
  });

  it("🔴 H-2 피상속인 2015-03-01 ~ 상속 2017-06-01 + 상속인 2017-07-15 ~ 양도 → 적격 · 구간 echo", () => {
    const r = evaluateRental975(input({ inheritance975: inh() }));
    expect(r).toMatchObject({
      isEligible: true,
      reductionAmount: 50_000_000,
      rentalPeriod975: {
        decedent: { start: "2015-03-01", end: "2017-06-01" },
        heir: { start: "2017-07-15", end: "2026-03-01" },
      },
    });
  });

  it("H-3 피상속인 2016-03-01 → 양도 2026-03-01 정확히 10년 적격 · 2026-02-28 9년 부적격", () => {
    const i = inh({ decedentRegistrationDate: "2016-03-01", decedentRentalStartDate: "2016-03-01" });
    expect(evaluateRental975(input({ inheritance975: i })).isEligible).toBe(true);
    const r = evaluateRental975(input({ inheritance975: i, transferDate: D("2026-02-28") }));
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(years(r)).toContain("계속 임대기간 9년");
    expect(years(r)).toContain("피상속인 임대기간(2016-03-01~2017-06-01)을 합산했습니다");
  });

  it("피상속인 의제 개시일 = 임대개시일·등록등일 중 늦은 날", () => {
    // 임대 2015-03-01 · 등록 2016-04-01 → 2016-04-01부터 → 양도 2026-03-01은 9년
    const r = evaluateRental975(input({ inheritance975: inh({ decedentRegistrationDate: "2016-04-01" }) }));
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(years(r)).toContain("피상속인 임대기간(2016-04-01~2017-06-01)");
  });
});

describe("상속개시일 ~ 상속인 임대개시 간격 = 공실 (Q-D)", () => {
  const late = (start: string) =>
    input({
      registrationDate: D("2017-08-01"),
      taxRegistrationDate: D("2017-08-01"),
      rentalStartDate: D(start),
      inheritance975: inh(),
    });
  it("H-4 간격 정확히 6개월(2017-06-01 → 2017-12-01) → 계속 · 적격", () => {
    expect(evaluateRental975(late("2017-12-01")).isEligible).toBe(true);
  });
  it("H-4 간격 6개월 초과(→ 2017-12-02) → 끊김 · 가장 긴 구간 8년 · 부적격", () => {
    const r = evaluateRental975(late("2017-12-02"));
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(years(r)).toContain("계속 임대기간 8년");
  });
  it("상속인 임대개시가 상속개시일보다 앞이면 상속개시일부터 센다(간격 없음)", () => {
    const r = evaluateRental975(
      input({ rentalStartDate: D("2016-01-01"), inheritance975: inh() }),
    );
    expect(r).toMatchObject({ isEligible: true, rentalPeriod975: { heir: { start: "2017-07-15" } } });
  });
});

describe("상속인 기준 그대로인 요건", () => {
  it("H-5 상속개시일 2014-12-31 → OUT_OF_PERIOD · 2015-01-01 → 시한 통과", () => {
    const at = (d: string) =>
      input({
        acquisitionDate: D(d),
        registrationDate: D("2015-01-10"),
        rentalStartDate: D("2015-01-10"),
        taxRegistrationDate: D("2015-01-10"),
        inheritance975: inh({ inheritanceDate: d, decedentRegistrationDate: "2013-01-01", decedentRentalStartDate: "2013-01-01" }),
      });
    expect(codes(evaluateRental975(at("2014-12-31")))).toContain("OUT_OF_PERIOD");
    expect(evaluateRental975(at("2015-01-01")).isEligible).toBe(true);
  });
  it("H-6 상속인 등록 2017-09-02(상속개시일 + 3개월 초과) → REGISTRATION_AFTER_3_MONTHS — 피상속인 등록으로 대체하지 않는다", () => {
    const r = evaluateRental975(input({ registrationDate: D("2017-09-02"), inheritance975: inh() }));
    expect(codes(r)).toContain("REGISTRATION_AFTER_3_MONTHS");
  });
  it("H-10 상속개시일 2019-01-01 → OUT_OF_PERIOD", () => {
    const r = evaluateRental975(
      input({
        acquisitionDate: D("2019-01-01"),
        registrationDate: D("2019-01-10"),
        rentalStartDate: D("2019-01-10"),
        taxRegistrationDate: D("2019-01-10"),
        transferDate: D("2030-03-01"),
        inheritance975: inh({ inheritanceDate: "2019-01-01" }),
      }),
    );
    expect(codes(r)).toContain("OUT_OF_PERIOD");
  });
});

describe("공실·임대료 — 피상속인 분에도 적용 (Q-D·Q-E)", () => {
  it("H-7 피상속인 분 공실 5개월 → 계속 적격 · 7개월 → 끊겨 가장 긴 구간 9년 부적격", () => {
    const vac = (end: string) => [{ startDate: D("2016-01-01"), endDate: D(end) }];
    expect(evaluateRental975(input({ inheritance975: inh(), vacancyPeriods: vac("2016-06-01") })).isEligible).toBe(true);
    const r = evaluateRental975(input({ inheritance975: inh(), vacancyPeriods: vac("2016-08-01") }));
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(years(r)).toContain("계속 임대기간 9년");
  });
  it("🔴 피상속인 분 계약의 5% 초과 증액 → 합산하면 RENT_INCREASE_VIOLATED · 합산 없으면 세지 않는다", () => {
    const rentHistory = [jeonse("2015-03-01", 100_000_000), jeonse("2016-03-02", 110_000_000)];
    expect(codes(evaluateRental975(input({ inheritance975: inh(), rentHistory })))).toContain("RENT_INCREASE_VIOLATED");
    expect(codes(evaluateRental975(input({ rentHistory })))).not.toContain("RENT_INCREASE_VIOLATED");
  });
});

describe("H-8 날짜 순서 (§97의4와 같은 조건)", () => {
  it("피상속인 임대개시일 = 상속개시일 → INVALID_INHERITANCE_DATES", () => {
    const r = evaluateRental975(input({ inheritance975: inh({ decedentRentalStartDate: "2017-06-01" }) }));
    expect(codes(r)).toContain("INVALID_INHERITANCE_DATES");
  });
  it("피상속인 등록등일 > 상속개시일 → INVALID_INHERITANCE_DATES", () => {
    const r = evaluateRental975(input({ inheritance975: inh({ decedentRegistrationDate: "2017-07-01" }) }));
    expect(codes(r)).toContain("INVALID_INHERITANCE_DATES");
  });
  it("상속개시일 > 양도일 → INVALID_INHERITANCE_DATES · 합산하지 않는다", () => {
    const r = evaluateRental975(input({ transferDate: D("2017-05-01"), inheritance975: inh() }));
    expect(codes(r)).toContain("INVALID_INHERITANCE_DATES");
  });
});
