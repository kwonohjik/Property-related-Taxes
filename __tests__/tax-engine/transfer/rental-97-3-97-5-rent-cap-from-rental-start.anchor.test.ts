/**
 * anchor — §97의3·§97의5 임대료 증액 제한은 **임대개시일부터** (2026-11-01, 사용자 확인)
 *
 * 법 §97의3①2호 「임대기간 중 …」, §97의5①3호 「임대기간 중 제97조의3제1항제2호의 요건을 준수할 것」
 *   → 령 §97의3③1호(5% 한도·1년 이내 재증액 금지).
 * 임대개시일 = 령 §97의3④·§97의5③ 「사업자등록과 임대사업자등록을 하고 … 등록하여 임대하는 날」
 *   = **임대사업자 등록일 · 세무서 사업자등록일 · 실제 임대개시일 중 가장 늦은 날** (`rental97EffectiveStart`).
 *
 * 종전 평가기는 계약 이력 전체를 판정해, 등록 전 계약 사이의 증액까지 5% 위반으로 잡았다.
 * §97의4는 다르다 — 소령 §167의3 문언이 개정으로 생겨 계약일 시행일 게이트를 쓴다
 *   (`rental-97-4-rent-interval.anchor.test.ts`).
 *
 * 판정 단위: **증액한 계약**의 체결·갱신일이 기산일 이후인가. 비교 기준(직전 계약)은 기산일 전 계약이어도 된다
 *   — 등록 당시 존속하던 계약의 임대료가 첫 기준이다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { rental97EffectiveStart } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(`${s}T00:00:00`);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const jeonse = (date: string, deposit: number) => ({ contractDate: D(date), contractType: "jeonse" as const, deposit, monthlyRent: 0 });

/** 2017-07-31 계약 1억 → 2018-08-15 갱신 1.1억(10% · 1년 경과) */
const HISTORY_10PCT_AUG15 = [jeonse("2017-07-31", 100_000_000), jeonse("2018-08-15", 110_000_000)];

/** §97의5 — 취득 2018-07-01, 세 기산 축 모두 2018-08-01, 양도 2029-01-01 */
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

describe("기산일 = 임대사업자 등록일·세무서 사업자등록일·실제 임대개시일 중 가장 늦은 날", () => {
  it("세 축 각각이 가장 늦을 때 그 날이 기산일", () => {
    const late = D("2018-09-01");
    expect(rental97EffectiveStart({ ...BASE_975, registrationDate: late })).toEqual(late);
    expect(rental97EffectiveStart({ ...BASE_975, taxRegistrationDate: late })).toEqual(late);
    expect(rental97EffectiveStart({ ...BASE_975, rentalStartDate: late })).toEqual(late);
  });
});

describe("§97의5 (①3호 → 령 §97의3③1호)", () => {
  it("기준선 — 기산일 2018-08-01 이후(08-15) 10% 증액 → 5% 위반", () => {
    expect(codes(evaluateRental975({ ...BASE_975, rentHistory: HISTORY_10PCT_AUG15 }))).toEqual(["RENT_INCREASE_VIOLATED"]);
  });

  it.each([
    ["임대사업자 등록일", { registrationDate: D("2018-09-01") }],
    ["세무서 사업자등록일", { taxRegistrationDate: D("2018-09-01") }],
    ["실제 임대개시일", { rentalStartDate: D("2018-09-01") }],
  ] as const)("🔴 %s가 2018-09-01(가장 늦음) → 08-15 증액은 임대개시 전이라 판정하지 않는다 (종전: 위반)", (_, over) => {
    expect(evaluateRental975({ ...BASE_975, ...over, rentHistory: HISTORY_10PCT_AUG15 }).isEligible).toBe(true);
  });

  it("기산일 당일 갱신하며 증액 → 판정 대상", () => {
    // 직전 계약 2017-07-31 — 1년 만료일(2018-07-31) 다음 날 증액이라 1년 규정은 걸리지 않는다
    const r = evaluateRental975({
      ...BASE_975,
      rentHistory: [jeonse("2017-07-31", 100_000_000), jeonse("2018-08-01", 110_000_000)],
    });
    expect(codes(r)).toEqual(["RENT_INCREASE_VIOLATED"]);
  });

  it("비교 기준은 등록 전 계약이어도 된다 — 2018-01-01 계약 대비 2019-02-01 10% 증액 → 위반", () => {
    const r = evaluateRental975({
      ...BASE_975,
      rentHistory: [jeonse("2018-01-01", 100_000_000), jeonse("2019-02-01", 110_000_000)],
    });
    expect(codes(r)).toEqual(["RENT_INCREASE_VIOLATED"]);
  });

  it("🔴 1년 이내 재증액도 같은 기산일 — 등록 전 1년 이내 증액은 판정하지 않는다", () => {
    const pre = [jeonse("2017-01-01", 100_000_000), jeonse("2017-06-01", 104_000_000)];
    expect(evaluateRental975({ ...BASE_975, rentHistory: pre }).isEligible).toBe(true);
    const post = [jeonse("2018-08-01", 100_000_000), jeonse("2019-02-01", 104_000_000)];
    expect(codes(evaluateRental975({ ...BASE_975, rentHistory: post }))).toEqual(["RENT_INCREASE_WITHIN_1_YEAR"]);
  });

  it("위반 메시지에 판정 기준을 적는다", () => {
    const r = evaluateRental975({ ...BASE_975, rentHistory: HISTORY_10PCT_AUG15 });
    expect(r.isEligible ? "" : r.ineligibleReasons[0].message).toMatch(
      /임대사업자 등록일·세무서 사업자등록일·실제 임대개시일 중 가장 늦은 날 이후/,
    );
  });
});

/**
 * §97의3 — 세 기산 축 모두 2015-01-01, 양도 2026-07-01 (11년 6개월 → 70%).
 * 취득 2014-01-01 < 임대개시라 령 §97의3⑤ 안분 기준시가 3점을 함께 둔다(판정 대상 아님).
 */
const BASE_973: Rental97EvaluationInput = {
  id: "rental_97_3",
  acquisitionDate: D("2014-01-01"),
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
  stdPriceAtAcquisition: 250_000_000,
  stdPriceAtRentalStart: 300_000_000,
  stdPriceAtTransfer: 600_000_000,
};

describe("§97의3 (①2호 → 령 §97의3③1호)", () => {
  const HISTORY = [jeonse("2014-01-01", 100_000_000), jeonse("2015-03-01", 110_000_000)];

  it("기준선 — 기산일 2015-01-01 이후(03-01) 10% 증액 → 5% 위반", () => {
    expect(codes(evaluateRental973({ ...BASE_973, rentHistory: HISTORY }))).toEqual(["RENT_INCREASE_VIOLATED"]);
  });

  it.each([
    ["임대사업자 등록일", { registrationDate: D("2015-06-01") }],
    ["세무서 사업자등록일", { taxRegistrationDate: D("2015-06-01") }],
    ["실제 임대개시일", { rentalStartDate: D("2015-06-01") }],
  ] as const)("🔴 %s가 2015-06-01(가장 늦음) → 03-01 증액은 판정하지 않는다 (종전: 위반)", (_, over) => {
    expect(evaluateRental973({ ...BASE_973, ...over, rentHistory: HISTORY }).isEligible).toBe(true);
  });

  it("🔴 등록 전 1년 이내 재증액은 판정하지 않는다", () => {
    const pre = [jeonse("2013-01-01", 100_000_000), jeonse("2013-06-01", 104_000_000)];
    expect(evaluateRental973({ ...BASE_973, rentHistory: pre }).isEligible).toBe(true);
  });
});
