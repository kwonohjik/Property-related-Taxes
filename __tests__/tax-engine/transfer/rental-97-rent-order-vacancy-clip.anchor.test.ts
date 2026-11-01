/**
 * anchor — 리뷰 게이트(2026-11-01) 결함 3·4
 *
 * 3. 계약 이력 순서 — 두 증액 검증은 「직전 계약」을 배열 앞 칸으로 읽었다. UI·validate·Zod 어디서도 순서를
 *    강제하지 않아, 최신순 입력이면 증액이 감액으로 보여 5% 위반이 숨고, 날짜가 역순인 쌍은 1년 위반으로
 *    잘못 잡혔다 → 엔진이 계약일 오름차순으로 정렬해 판정한다(`sortRentHistory`).
 * 4. 임대기간 공실 — `calculateEffectiveRentalPeriod`가 [임대개시일, 종점] 밖의 공실까지 통째로 뺐다
 *    (§97·§97의2·§97의3·§97의4·레거시 공용). 등록 전 공실 1년 5개월이 10년을 8년으로 만들어 §97의3 70%가 배제됐다.
 *    → 공실을 기간으로 잘라서 보고, 유예(3월) 판정도 잘린 구간으로 한다(§97의5 판정과 같은 기준 — 가정).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import {
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97,
} from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

/** UTC 자정 — 엔진 날짜 상수·API 경로와 같은 축 */
const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const rate = (r: Rental97Result) => (r as unknown as { overrideRate?: number }).overrideRate;
const jeonse = (date: string, deposit: number) => ({ contractDate: D(date), contractType: "jeonse" as const, deposit, monthlyRent: 0 });

/** §97의3 — 취득·등록·임대개시·사업자등록 모두 2015-01-01 (안분 불필요), 양도 2026-07-01 */
const BASE_973: Rental97EvaluationInput = {
  id: "rental_97_3",
  acquisitionDate: D("2015-01-01"),
  registrationDate: D("2015-01-01"),
  rentalStartDate: D("2015-01-01"),
  taxRegistrationDate: D("2015-01-01"),
  transferDate: D("2026-07-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: true,
  officialPriceAtStart: 300_000_000,
  isNationalHousingScale: true,
  region: "capital",
  rentalContinuesToTransfer: true,
};

/** §97의5 — 취득 2018-07-01, 세 기산 축 2018-08-01, 양도 2029-01-01 */
const BASE_975: Rental97EvaluationInput = {
  id: "rental_97_5",
  acquisitionDate: D("2018-07-01"),
  registrationDate: D("2018-08-01"),
  rentalStartDate: D("2018-08-01"),
  taxRegistrationDate: D("2018-08-01"),
  transferDate: D("2029-01-01"),
  isPurchaseRental: true,
  isTaxRegistered: true,
  rentIncreaseViolated: true,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 320_000_000,
  rentalContinuesToTransfer: true,
  calculatedTax: 50_000_000,
};

/** §97의4 가목 수도권 5억 · 2016-03-01 → 2024-06-01 */
const BASE_974: Rental97EvaluationInput = {
  id: "rental_97_4",
  acquisitionDate: D("2016-01-01"),
  registrationDate: D("2016-03-01"),
  rentalStartDate: D("2016-03-01"),
  transferDate: D("2024-06-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: true,
  rental974Category: "purchase_a",
  region: "capital",
  officialPriceAtStart: 500_000_000,
};

describe("3. 계약 이력은 계약일 순으로 정렬해 판정한다", () => {
  it("🔴 §97의3 최신순 입력 [2021-06-01 1.1억, 2020-03-01 1억] → 10% 증액 위반 (종전: 감액으로 보여 적격)", () => {
    const r = evaluateRental973({ ...BASE_973, rentHistory: [jeonse("2021-06-01", 110_000_000), jeonse("2020-03-01", 100_000_000)] });
    expect(codes(r)).toEqual(["RENT_INCREASE_VIOLATED"]);
  });

  it("🔴 §97의3 역순 쌍 [2021-06-01 1억, 2020-03-01 1.04억] → 실제로는 감액이라 적격 (종전: 1년 위반 오탐)", () => {
    const r = evaluateRental973({ ...BASE_973, rentHistory: [jeonse("2021-06-01", 100_000_000), jeonse("2020-03-01", 104_000_000)] });
    expect(r.isEligible).toBe(true);
  });

  it("🔴 §97의5 최신순 입력도 같다", () => {
    const r = evaluateRental975({ ...BASE_975, rentHistory: [jeonse("2021-06-01", 110_000_000), jeonse("2020-03-01", 100_000_000)] });
    expect(codes(r)).toEqual(["RENT_INCREASE_VIOLATED"]);
  });

  it("🔴 §97의4 최신순 입력 [2021-06-01 1.1억, 2019-03-01 1억] → 기준 계약 2019-03-01 이후라 5% 위반", () => {
    const r = evaluateRental974({ ...BASE_974, rentHistory: [jeonse("2021-06-01", 110_000_000), jeonse("2019-03-01", 100_000_000)] });
    expect(codes(r)).toEqual(["RENT_INCREASE_VIOLATED"]);
  });

  it("§97의4 기준 계약 날짜도 정렬 후 직전 계약으로 본다 — 기준 2019-02-11(시행 전)이면 판정하지 않는다", () => {
    const r = evaluateRental974({ ...BASE_974, rentHistory: [jeonse("2021-06-01", 110_000_000), jeonse("2019-02-11", 100_000_000)] });
    expect(r.isEligible).toBe(true);
  });
});

describe("4. 공실은 [임대개시일, 종점]으로 잘라서 차감한다", () => {
  it("헬퍼 — 임대개시 전 공실(2013-01-01~2014-06-01)은 차감하지 않는다: 2015-01-01~2025-01-02 = 10년", () => {
    expect(
      calculateEffectiveRentalPeriod(
        D("2015-01-01"),
        D("2025-01-02"),
        [{ startDate: D("2013-01-01"), endDate: D("2014-06-01") }],
        RENTAL_VACANCY_GRACE_MONTHS_97,
      ),
    ).toBe(10);
  });

  it("헬퍼 — 기간 안 4개월 공실은 여전히 차감한다(기준선)", () => {
    expect(
      calculateEffectiveRentalPeriod(
        D("2015-01-01"),
        D("2025-01-02"),
        [{ startDate: D("2016-01-01"), endDate: D("2016-05-01") }],
        RENTAL_VACANCY_GRACE_MONTHS_97,
      ),
    ).toBe(9);
  });

  it("헬퍼 — 임대개시를 걸친 공실은 기간 안 부분(2개월)만 보고 3월 유예 이내라 차감하지 않는다", () => {
    expect(
      calculateEffectiveRentalPeriod(
        D("2015-01-01"),
        D("2025-01-02"),
        [{ startDate: D("2014-06-01"), endDate: D("2015-03-01") }],
        RENTAL_VACANCY_GRACE_MONTHS_97,
      ),
    ).toBe(10);
  });

  it("🔴 §97의3 — 등록 전 공실이 있어도 10년 → 70% (종전: 8년으로 RENTAL_PERIOD_SHORT)", () => {
    const r = evaluateRental973({
      ...BASE_973,
      rentIncreaseViolated: false,
      transferDate: D("2025-01-02"),
      vacancyPeriods: [{ startDate: D("2013-01-01"), endDate: D("2014-06-01") }],
    });
    expect(rate(r)).toBe(0.7);
  });

  it("🔴 §97의3 — 임대 종료 후 공실(종료일~양도일)은 차감하지 않는다 → 10년 70% (종전: 9년)", () => {
    const r = evaluateRental973({
      ...BASE_973,
      rentIncreaseViolated: false,
      transferDate: D("2025-09-01"),
      rentalContinuesToTransfer: false,
      rentalEndDate: D("2025-01-02"),
      stdPriceAtAcquisition: 300_000_000,
      stdPriceAtRentalEnd: 450_000_000,
      stdPriceAtTransfer: 500_000_000,
      vacancyPeriods: [{ startDate: D("2025-01-02"), endDate: D("2025-09-01") }],
    });
    expect(rate(r)).toBe(0.7);
  });
});
