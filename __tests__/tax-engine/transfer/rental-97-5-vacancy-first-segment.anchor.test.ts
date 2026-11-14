/**
 * anchor — 조특법 §97의5①2호 「등록 후 10년 이상 계속하여」 · 6개월 초과 공실 = 첫 구간 판정
 * (`docs/01-plan/features/rental-97-5-vacancy-break.plan.md` · 교재 2차 대조 G5-1 · Q-1 a · Q-2 a, 사용자 결정 2026-11-14)
 *
 * - 기산일부터 첫 6개월 초과 공실이 시작되기 전까지가 10년 이상이어야 한다(교재 384·392·393쪽).
 * - 10년을 채운 뒤의 공실은 판정에 넣지 않는다(교재 389쪽 · 서면-2017-법령해석재산-1253).
 * - 상속 합산(Q-2 a): 합산 판정과 상속인 단독 판정 중 첫 구간이 긴 쪽 — 합산을 켜서 끄는 것보다 불리해지지 않는다.
 *   상속인 단독으로 판정하면 합산하지 않은 것과 같다(피상속인 분 임대료·구간 echo도 쓰지 않는다).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { evaluateContinuousRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5-period";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const text = (r: Rental97Result) => (r.isEligible ? "" : r.ineligibleReasons.map((x) => x.message).join(" "));
const v = (s: string, e: string) => ({ startDate: D(s), endDate: D(e) });

/** 임대개시 2015-09-01 → 양도 2027-07-01 (11년 10개월) — continuity-purchase anchor의 BASE와 같다 */
const BASE: Rental97EvaluationInput = {
  id: "rental_97_5",
  acquisitionDate: D("2015-06-01"),
  registrationDate: D("2015-08-01"),
  rentalStartDate: D("2015-09-01"),
  transferDate: D("2027-07-01"),
  isPurchaseRental: true,
  taxRegistrationDate: D("2015-08-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 320_000_000,
  rentalContinuesToTransfer: true,
  calculatedTax: 50_000_000,
};
const run = (over: Partial<Rental97EvaluationInput>) => evaluateRental975({ ...BASE, ...over });

describe("Q-1 a — 기산일부터 첫 구간", () => {
  it("C1 공실 없음 → 적격", () => {
    expect(run({}).isEligible).toBe(true);
  });

  it("C2 7개월 공실(2017-01~2017-08) → 첫 구간 1년 · 부적격", () => {
    const r = run({ vacancyPeriods: [v("2017-01-01", "2017-08-01")] });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(text(r)).toContain("계속 임대기간 1년");
    expect(text(r)).toContain("2015-09-01~2017-01-01");
  });

  it("🔴 C3 1년 공실(2016-01~2017-01) 뒤 10년 6개월 임대 → 부적격 (종전 「가장 긴 구간」은 적격)", () => {
    const r = run({ vacancyPeriods: [v("2016-01-01", "2017-01-01")] });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(text(r)).toContain("계속 임대기간 0년");
  });

  it("C4 10년 연속 뒤 양도 직전 7개월 공실 → 적격 (1253)", () => {
    expect(run({ vacancyPeriods: [v("2026-12-01", "2027-07-01")] }).isEligible).toBe(true);
  });

  it("C5 선행 10년 4개월 뒤 중간 7개월 공실 → 적격", () => {
    expect(run({ vacancyPeriods: [v("2026-01-01", "2026-08-01")] }).isEligible).toBe(true);
  });

  it("C6 정확히 6개월 · C7 3개월+4개월(4965) → 계속 임대 · 적격", () => {
    expect(run({ vacancyPeriods: [v("2017-01-01", "2017-07-01")] }).isEligible).toBe(true);
    expect(run({ vacancyPeriods: [v("2018-05-01", "2018-08-01"), v("2020-08-01", "2020-12-01")] }).isEligible).toBe(true);
  });

  it("C8 3년 5개월 공실 전부를 수용 간주기간이 덮음 → 적격", () => {
    const r = run({
      vacancyPeriods: [v("2018-01-01", "2021-06-01")],
      deemedRentalPeriods: [{ reason: "expropriation", startDate: D("2018-01-01"), endDate: D("2021-06-01") }],
    });
    expect(r.isEligible).toBe(true);
  });

  it("C9 9년 11개월 시점 7개월 공실 → 첫 구간 9년 · 부적격", () => {
    const r = run({ vacancyPeriods: [v("2025-08-01", "2026-03-01")] });
    expect(text(r)).toContain("계속 임대기간 9년");
  });

  it("경계 — 첫 단절이 정확히 10년째 날(2025-09-01) 시작 → 적격 · 하루 전(2025-08-31) → 부적격", () => {
    expect(run({ vacancyPeriods: [v("2025-09-01", "2026-04-01")] }).isEligible).toBe(true);
    expect(codes(run({ vacancyPeriods: [v("2025-08-31", "2026-04-01")] }))).toEqual(["RENTAL_PERIOD_SHORT"]);
  });

  it("leaf — countedSegment는 기산일~첫 단절 시작, 기산일에 단절이 시작하면 0년", () => {
    const r = evaluateContinuousRental975({
      start: D("2015-09-01"),
      end: D("2027-07-01"),
      vacancyPeriods: [v("2016-01-01", "2017-01-01")],
      deemedRentalPeriods: [],
    });
    expect(r.countedSegment).toEqual({ start: D("2015-09-01"), end: D("2016-01-01") });
    expect(r.years).toBe(0);
    expect(r.breaks).toHaveLength(1);
    const atStart = evaluateContinuousRental975({
      start: D("2015-09-01"),
      end: D("2027-07-01"),
      vacancyPeriods: [v("2015-09-01", "2016-06-01")],
      deemedRentalPeriods: [],
    });
    expect(atStart.years).toBe(0);
  });
});

describe("Q-2 a — 상속 합산과 상속인 단독 중 첫 구간이 긴 쪽", () => {
  /** 사망 2015-06-01(카드 취득일) · 피상속인 등록 2015-02-01 · 개시 2015-03-01 · 상속인 개시 2016-01-01 · 양도 2026-03-01 */
  const H: Partial<Rental97EvaluationInput> = {
    acquisitionDate: D("2015-06-01"),
    registrationDate: D("2015-08-01"),
    taxRegistrationDate: D("2015-08-01"),
    rentalStartDate: D("2016-01-01"),
    transferDate: D("2026-03-01"),
  };
  const inh = {
    inheritanceDate: D("2015-06-01"),
    decedentRegistrationDate: D("2015-02-01"),
    decedentRentalStartDate: D("2015-03-01"),
  };
  const jeonse = (date: string, deposit: number) => ({
    contractDate: D(date),
    contractType: "jeonse" as const,
    deposit,
    monthlyRent: 0,
  });

  it("H1 합산 OFF — 상속인 10년 2개월 → 적격", () => {
    expect(run(H).isEligible).toBe(true);
  });

  it("🔴 H2 합산 ON · 상속 간격 7개월 → 상속인 단독 판정으로 적격 (합산 OFF보다 불리하지 않다)", () => {
    const r = run({ ...H, inheritance975: inh });
    expect(r.isEligible).toBe(true);
    // 상속인 단독 판정이면 합산 구간 echo가 없다
    expect((r as unknown as { rentalPeriod975?: unknown }).rentalPeriod975).toBeUndefined();
  });

  it("🔴 H2′ 상속인 단독 판정이면 피상속인 분 임대료 증액도 세지 않는다 (합산 OFF와 같다)", () => {
    const rentHistory = [jeonse("2015-03-01", 100_000_000), jeonse("2015-05-01", 110_000_000)];
    expect(codes(run({ ...H, inheritance975: inh, rentHistory }))).not.toContain("RENT_INCREASE_VIOLATED");
    // 대조군 — 합산으로 판정하는 H3 사안이면 같은 피상속인 분 증액을 센다
    const merged = run({ ...H, rentalStartDate: D("2015-11-01"), transferDate: D("2025-09-01"), inheritance975: inh, rentHistory });
    expect(codes(merged)).toContain("RENT_INCREASE_VIOLATED");
  });

  it("H3 합산 ON · 간격 5개월(상속인 개시 2015-11-01 · 양도 2025-09-01) → 합산으로 적격 · 구간 echo", () => {
    // 합산 10년 6개월 − 간격 153일(G5-2 차감) = 10년 1개월 · 상속인 단독 9년 10개월
    const r = run({ ...H, rentalStartDate: D("2015-11-01"), transferDate: D("2025-09-01"), inheritance975: inh });
    expect(r.isEligible).toBe(true);
    expect((r as unknown as { rentalPeriod975?: { decedent: { start: string } } }).rentalPeriod975?.decedent.start).toBe(
      "2015-03-01",
    );
  });
});

/**
 * G5-2 — 6개월 이내 공실은 끊지 않되 그 일수를 10년에서 뺀다 (교재 384쪽 본문 「해당 공실기간 만큼 더 임대하여」 ·
 * 사용자 결정 2026-11-14). 조특령 §97의5①1호 「계속하여 임대한 것으로 본다」보다 불리한 정책이다 — 재제안 금지.
 */
describe("G5-2 — 6개월 이내 공실 일수 차감", () => {
  /** 임대개시 2015-09-01 → 양도 2025-10-01 (10년 1개월) */
  const TEN_Y1M = { transferDate: D("2025-10-01") };

  it("🔴 10년 1개월 임대 중 5개월 공실 → 9년 8개월 · 부적격 (종전 「계속 임대로 봄」은 적격)", () => {
    const r = run({ ...TEN_Y1M, vacancyPeriods: [v("2020-01-01", "2020-06-01")] });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(text(r)).toContain("계속 임대기간 9년");
    expect(text(r)).toContain("6개월 이내 공실 152일");
    expect(text(r)).not.toContain("끊겼습니다");
  });

  it("공실이 없으면 10년 1개월 → 적격 (기준선)", () => {
    expect(run(TEN_Y1M).isEligible).toBe(true);
  });

  it("11년 10개월 임대 중 5개월 공실 → 11년 5개월 · 적격", () => {
    expect(run({ vacancyPeriods: [v("2020-01-01", "2020-06-01")] }).isEligible).toBe(true);
  });

  it("교재 384쪽 사례(10년 중 5개월 공실 4번) → 20개월을 빼 부적격 — 교재 사례와 다르다(본문 우선 정책)", () => {
    const r = run({
      transferDate: D("2025-09-01"),
      vacancyPeriods: [
        v("2017-01-01", "2017-06-01"),
        v("2019-01-01", "2019-06-01"),
        v("2021-01-01", "2021-06-01"),
        v("2023-01-01", "2023-06-01"),
      ],
    });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(text(r)).toContain("계속 임대기간 8년");
  });

  it("겹친 공실은 한 번만 뺀다", () => {
    const leaf = (vac: { startDate: Date; endDate: Date }[]) =>
      evaluateContinuousRental975({ start: D("2015-09-01"), end: D("2027-07-01"), vacancyPeriods: vac, deemedRentalPeriods: [] });
    const once = leaf([v("2020-01-01", "2020-06-01")]);
    const overlapped = leaf([v("2020-01-01", "2020-06-01"), v("2020-03-01", "2020-06-01")]);
    expect(once.graceVacancyDays).toBe(152);
    expect(overlapped.graceVacancyDays).toBe(152);
  });

  it("수용 간주기간과 겹친 공실 부분은 빼지 않는다 (간주기간은 임대로 본다)", () => {
    const r = evaluateContinuousRental975({
      start: D("2015-09-01"),
      end: D("2025-10-01"),
      vacancyPeriods: [v("2020-01-01", "2020-06-01")],
      deemedRentalPeriods: [{ reason: "expropriation", startDate: D("2020-01-01"), endDate: D("2020-06-01") }],
    });
    expect(r.graceVacancyDays).toBe(0);
    expect(r.years).toBe(10);
  });

  it("첫 단절 뒤의 짧은 공실은 셀 구간 밖이라 빼지 않는다", () => {
    const r = evaluateContinuousRental975({
      start: D("2015-09-01"),
      end: D("2027-07-01"),
      vacancyPeriods: [v("2026-01-01", "2026-08-01"), v("2026-10-01", "2026-12-01")],
      deemedRentalPeriods: [],
    });
    expect(r.graceVacancyDays).toBe(0);
    expect(r.years).toBe(10);
  });
});
