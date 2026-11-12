/**
 * 다주택 중과배제 장기임대주택 임대기간 — 임대개시일 날짜 계산 anchor
 * (계획서 `docs/01-plan/features/surcharge-rental-period-dates.plan.md` §6).
 *
 * - 2호: 소득세법 시행령 §167의3③ — 사업자등록등을 하고 임대주택으로 등록하여 임대하는 날부터 임대 개시로 본다(자름).
 * - 3호: ③의 대상이 아니다 — 입력한 임대개시일 그대로(자르지 않음).
 * - 2호 상속: 조특령 §97⑤3호(③ 준용) — 피상속인 임대개월을 더한다.
 * - 개시일이 없으면 연수(`rentalPeriodYears`) — 직접 API·⑳ 카드 명부 행.
 */
import { describe, it, expect } from "vitest";
import {
  calcLongTermRentalPeriodYears,
  calcTaxIncentiveRentalPeriodYears,
  isLongTermRentalHousingExempt,
  isLongTermRentalDutyPeriodPending,
} from "@/lib/tax-engine/multi-house-surcharge-count";
import { makeHouse } from "../_helpers/multi-house-mock";

const TRANSFER = new Date("2020-06-01");

/** 가목 — 2016-01-01 등록(2018.3.31. 이전) · 수도권 6억 이하 · 5% 충족 · 개시 2014-01-01 */
const gaMok = (over: Parameters<typeof makeHouse>[1] = {}) =>
  makeHouse("h2", {
    isLongTermRental: true,
    rentalType: "A",
    isRegisteredRental: true,
    rentalRegistrationDate: new Date("2016-01-01"),
    businessRegistrationDate: new Date("2016-01-01"),
    rentalStartDate: new Date("2014-01-01"),
    rentalStartOfficialPrice: 300_000_000,
    rentIncreaseUnder5Pct: true,
    ...over,
  });

describe("2호 — 등록일로 자른다(소령 §167의3③)", () => {
  it("SR-1 ★ 개시 2014-01-01 · 등록 2016-01-01 · 양도 2020-06-01 → 53개월(4.4년) → 가목 5년 미달 · ④ 대상", () => {
    const h = gaMok();
    expect(calcLongTermRentalPeriodYears(h, TRANSFER) * 12).toBe(53);
    expect(isLongTermRentalHousingExempt(h, TRANSFER)).toBe(false);
    expect(isLongTermRentalDutyPeriodPending(h, TRANSFER)).toBe(true);
  });

  it("SR-1 대조 — 같은 주택을 연수 6으로만 넣으면(종전 화면 입력) 중과배제", () => {
    const h = gaMok({ rentalStartDate: undefined, rentalPeriodYears: 6 });
    expect(isLongTermRentalHousingExempt(h, TRANSFER)).toBe(true);
  });

  it("SR-2 등록일이 개시일보다 앞이면 개시일부터 — 77개월 → 중과배제", () => {
    const h = gaMok({
      rentalRegistrationDate: new Date("2013-06-01"),
      businessRegistrationDate: new Date("2013-06-01"),
    });
    expect(calcLongTermRentalPeriodYears(h, TRANSFER) * 12).toBe(77);
    expect(isLongTermRentalHousingExempt(h, TRANSFER)).toBe(true);
  });

  it("SR-2b 늦은 쪽 등록일 — 세무서 2016-07-01 · 지자체 2016-01-01 → 2016-07-01부터 47개월", () => {
    const h = gaMok({ businessRegistrationDate: new Date("2016-07-01") });
    expect(calcLongTermRentalPeriodYears(h, TRANSFER) * 12).toBe(47);
  });

  it("SR-7 임대 종료일(Q-1)이 양도일보다 앞이면 종료일까지 — 종료 2019-01-01 → 36개월", () => {
    const h = gaMok({ rentalEndDate: new Date("2019-01-01") });
    expect(calcLongTermRentalPeriodYears(h, TRANSFER) * 12).toBe(36);
  });

  it("SR-7b 임대 종료일이 양도일보다 뒤면 양도일까지", () => {
    const h = gaMok({ rentalEndDate: new Date("2023-01-01") });
    expect(calcLongTermRentalPeriodYears(h, TRANSFER) * 12).toBe(53);
  });

  it("SR-6 ★ 상속 — 피상속인 24개월 + 상속인(개시 2018-01-01 · 등록 2018-01-01 · 양도 2021-01-01) 36개월 = 5년 → 가목 충족", () => {
    const h = gaMok({
      rentalRegistrationDate: new Date("2018-01-01"),
      businessRegistrationDate: new Date("2018-01-01"),
      rentalStartDate: new Date("2018-01-01"),
      decedentRentalMonths: 24,
    });
    const at = new Date("2021-01-01");
    expect(calcLongTermRentalPeriodYears(h, at)).toBe(5);
    expect(isLongTermRentalHousingExempt(h, at)).toBe(true);
  });
});

describe("3호 — 자르지 않는다 · 연수 fallback", () => {
  it("SR-3 ★ 3호는 등록일과 무관하게 개시일부터 — 6년", () => {
    const h = makeHouse("h2", {
      isTaxIncentiveRental: true,
      isNationalSizeHousing: true,
      rentalRegistrationDate: new Date("2016-01-01"),
      businessRegistrationDate: new Date("2016-01-01"),
      rentalStartDate: new Date("2014-01-01"),
      decedentRentalMonths: 24,
    });
    expect(calcTaxIncentiveRentalPeriodYears(h, TRANSFER)).toBe(6);
  });

  it("SR-4 개시일 없음 + 연수 6(직접 API) → 6 (2호·3호 모두)", () => {
    const h = makeHouse("h2", { isLongTermRental: true, rentalPeriodYears: 6 });
    expect(calcLongTermRentalPeriodYears(h, TRANSFER)).toBe(6);
    expect(calcTaxIncentiveRentalPeriodYears(h, TRANSFER)).toBe(6);
  });

  it("SR-4b 개시일·연수 모두 없음 → 0", () => {
    const h = makeHouse("h2", { isLongTermRental: true });
    expect(calcLongTermRentalPeriodYears(h, TRANSFER)).toBe(0);
    expect(calcTaxIncentiveRentalPeriodYears(h, TRANSFER)).toBe(0);
  });
});
