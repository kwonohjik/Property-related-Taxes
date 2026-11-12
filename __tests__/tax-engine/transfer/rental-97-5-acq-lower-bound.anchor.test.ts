/**
 * anchor — §97의5 취득 하한 2015.1.1. (rental-97-5-textbook-gaps.plan.md §3.1 · §4.1)
 *
 * 법률 제12853호(2015.1.1. 시행) 부칙 §34 「제97조의5의 개정규정은 이 법 시행 후 최초로 **취득**하는 분부터 적용한다」.
 * 축은 취득일뿐이다 — 2014년 매매계약·2015년 잔금 주택도 대상(서면-2015-부동산-0715).
 * 종전 시한 판정은 상한(2018.12.31.)만 있어 2014년 이전 취득분도 100% 감면을 통과했다(Pre-Do 실측: 감면 50,000,000원).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));

/** 취득 직후 등록·사업자등록·임대, 양도까지 계속 임대 — 시한 외 다른 요건은 모두 충족 */
const input = (acq: string, contract?: string): Rental97EvaluationInput => ({
  id: "rental_97_5",
  acquisitionDate: D(acq),
  ...(contract ? { contractDate: D(contract) } : {}),
  registrationDate: D(acq),
  rentalStartDate: D(acq),
  taxRegistrationDate: D(acq),
  transferDate: D("2030-06-01"),
  isPurchaseRental: true,
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 300_000_000,
  rentalContinuesToTransfer: true,
  calculatedTax: 50_000_000,
});

describe("§97의5 취득 하한 — 부칙 §34", () => {
  it("L-1 2014-12-31 취득 → 시한 외 (부칙 §34 사유)", () => {
    const p = checkReductionPeriod("rental_97_5", input("2014-12-31"));
    expect(p.inPeriod).toBe(false);
    expect(p.failReason).toContain("2015.1.1 이전");
    expect(p.failReason).toContain("법률 제12853호 부칙 제34조");
    expect(codes(evaluateRental975(input("2014-12-31")))).toEqual(["OUT_OF_PERIOD"]);
  });

  it("L-2 2015-01-01 취득 → 통과 (경계 포함)", () => {
    expect(checkReductionPeriod("rental_97_5", input("2015-01-01")).inPeriod).toBe(true);
    expect(evaluateRental975(input("2015-01-01"))).toMatchObject({ isEligible: true, reductionAmount: 50_000_000 });
  });

  it("L-3 2014년 계약·2015년 잔금 → 통과 (서면-2015-부동산-0715 — 하한은 취득일만 본다)", () => {
    expect(checkReductionPeriod("rental_97_5", input("2015-02-01", "2014-11-01")).inPeriod).toBe(true);
    expect(evaluateRental975(input("2015-02-01", "2014-11-01")).isEligible).toBe(true);
  });

  it("L-4 2018-12-20 계약·2019-02-01 취득 → 통과 (상한 계약 예외 회귀)", () => {
    expect(checkReductionPeriod("rental_97_5", input("2019-02-01", "2018-12-20")).inPeriod).toBe(true);
  });

  it("L-5 2019-01-01 취득·계약 없음 → 상한 사유 (회귀)", () => {
    const p = checkReductionPeriod("rental_97_5", input("2019-01-01"));
    expect(p.inPeriod).toBe(false);
    expect(p.failReason).toContain("2018.12.31 이후");
  });

  it("취득일 미입력 — 종전처럼 시한 외(상한이 막는다)", () => {
    expect(checkReductionPeriod("rental_97_5", { ...input("2016-01-01"), acquisitionDate: undefined }).inPeriod).toBe(false);
  });
});
