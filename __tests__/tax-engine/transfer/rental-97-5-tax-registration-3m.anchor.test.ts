/**
 * anchor — §97의5 세무서 사업자등록도 취득일로부터 3개월 이내 (rental-97-5-textbook-gaps.plan.md §3.2 · §4.2)
 *
 * ⚠️ 법령 문언에 없는 요건이다 — 사용자 정책 결정(2026-11-12 Q-1·Q-2). 법 §97의5①1호의 3개월은
 *    「민간임대주택에 관한 특별법」 등록뿐이고, 사업자등록은 조특령 §97의5③ 임대개시 기산 축이다.
 * 기한 계산은 지자체 등록 3개월과 같은 `addMonths`(말일 clamp)다.
 * 종전 엔진은 4개월째 사업자등록도 통과시켰다(Pre-Do 실측: 감면 50,000,000원).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));

/** 지자체 등록·임대개시는 취득 직후 — 사업자등록일만 바꾼다 */
const input = (acq: string, taxReg: string): Rental97EvaluationInput => ({
  id: "rental_97_5",
  acquisitionDate: D(acq),
  registrationDate: D(acq),
  rentalStartDate: D(acq),
  taxRegistrationDate: D(taxReg),
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

describe("§97의5 세무서 사업자등록 3개월 — 사용자 정책", () => {
  it("T-1 취득 2016-03-10 · 사업자등록 2016-06-10 → 통과 (3개월 당일)", () => {
    expect(evaluateRental975(input("2016-03-10", "2016-06-10"))).toMatchObject({
      isEligible: true,
      reductionAmount: 50_000_000,
    });
  });

  it("T-2 취득 2016-03-10 · 사업자등록 2016-06-11 → TAX_REGISTRATION_AFTER_3_MONTHS 단독", () => {
    const r = evaluateRental975(input("2016-03-10", "2016-06-11"));
    expect(codes(r)).toEqual(["TAX_REGISTRATION_AFTER_3_MONTHS"]);
    const reason = !r.isEligible ? r.ineligibleReasons[0] : undefined;
    expect(reason?.message).toBe("취득일로부터 3개월 이내에 세무서 사업자등록을 하지 않았습니다.");
    // 법령 문언에 없는 요건 — 메시지에 호를 붙이지 않는다(Q-2)
    expect(reason?.message).not.toContain("①1호");
  });

  it("T-3 취득 전 사업자등록(2014-05-01) → 통과", () => {
    expect(evaluateRental975(input("2016-03-10", "2014-05-01")).isEligible).toBe(true);
  });

  it("T-4 취득 2016-11-30 · 사업자등록 2017-02-28 → 통과 (말일 clamp)", () => {
    expect(evaluateRental975(input("2016-11-30", "2017-02-28")).isEligible).toBe(true);
    expect(codes(evaluateRental975(input("2016-11-30", "2017-03-01")))).toEqual(["TAX_REGISTRATION_AFTER_3_MONTHS"]);
  });

  it("사업자등록 안 함 → 종전 사유(TAX_REGISTRATION_REQUIRED)만, 3개월 사유는 붙지 않는다", () => {
    const r = evaluateRental975({ ...input("2016-03-10", "2016-03-10"), isTaxRegistered: false });
    expect(codes(r)).toEqual(["TAX_REGISTRATION_REQUIRED"]);
  });
});
