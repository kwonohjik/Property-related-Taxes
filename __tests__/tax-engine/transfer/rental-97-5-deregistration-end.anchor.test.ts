/**
 * anchor — 등록 말소(자진·자동) 후 임대기간 종점·임대료 요건 (§97의5·§97의3)
 *
 * 계획서 docs/01-plan/features/rental-97-5-deregistration-end.plan.md (Q-1 a · Q-2 A · Q-3 같이 적용).
 * - 조특령 §97의5① 「…10년 이상 계속하여 등록하고, 그 등록한 기간 동안 계속하여 10년 이상 임대」 ·
 *   ② 분자 「제1항에 따른 임대기간의 마지막 날의 기준시가」 — 말소일이 임대기간의 마지막 날이다.
 *   조특령 §97의3② 「…그 등록 기간 동안 통산하여」도 같은 구조.
 * - 서면-2017-법령해석재산-1253(2019.4.19.) — 요건을 갖추어 10년 이상 임대한 후 양도 시 해당 요건을 갖추지
 *   못한 경우에도 감면대상 ⇒ 임대 종료일(말소일) **뒤** 계약의 증액은 위반으로 세지 않는다(당일 계약은 센다).
 * 화면은 종점 칸 하나(「임대 종료일 또는 등록 말소일」)로 받는다 — 엔진 입력은 `rentalEndDate` 그대로.
 *
 * 교재 사례: 2016.2. 취득(기준시가 2억) · 2016.4. 등록 · 2026.4. 자동말소(5억) · 2030.10. 양도(12억, 6억).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
const jeonse = (date: string, deposit: number) => ({ contractDate: D(date), contractType: "jeonse" as const, deposit, monthlyRent: 0 });

/** 등록 당시 계약 1억 → 2018 갱신 1.05억(5% — 위반 아님) */
const OK_HISTORY = [jeonse("2016-04-15", 100_000_000), jeonse("2018-04-15", 105_000_000)];
const withLate = (date: string, deposit = 150_000_000) => [...OK_HISTORY, jeonse(date, deposit)];

const BASE_975: Rental97EvaluationInput = {
  id: "rental_97_5",
  acquisitionDate: D("2016-02-15"),
  registrationDate: D("2016-04-15"),
  rentalStartDate: D("2016-04-15"),
  taxRegistrationDate: D("2016-04-15"),
  transferDate: D("2030-10-15"),
  isPurchaseRental: true,
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 200_000_000,
  stdPriceAtAcquisition: 200_000_000,
  stdPriceAtTransfer: 600_000_000,
  calculatedTax: 200_000_000,
  transferIncome: 560_000_000,
  basicDeduction: 2_500_000,
  taxBase: 557_500_000,
};
/** 2026-04-15 자동말소 — 종점 칸에 말소일 */
const DEREG_2026 = { rentalContinuesToTransfer: false, rentalEndDate: D("2026-04-15"), stdPriceAtRentalEnd: 500_000_000 };

describe("§97의5 — 말소일이 임대기간의 마지막 날", () => {
  it("M-1 교재 사례 — 비율 (5억 − 2억) ÷ (6억 − 2억) = 0.75 · 감면 150,672,645 (소득세법 §90①)", () => {
    const r = evaluateRental975({ ...BASE_975, ...DEREG_2026, rentHistory: OK_HISTORY });
    expect(r.isEligible).toBe(true);
    if (!r.isEligible || r.effectCategory !== "tax_amount") throw new Error("unreachable");
    expect(r.rentalGainRatio).toBe(0.75);
    expect(r.reductionAmount).toBe(150_672_645);
  });

  it("M-2 8년 자동말소(2024-04-15) — 10년 미달", () => {
    const r = evaluateRental975({ ...BASE_975, ...DEREG_2026, rentalEndDate: D("2024-04-15"), stdPriceAtRentalEnd: 450_000_000 });
    expect(codes(r)).toContain("RENTAL_PERIOD_SHORT");
  });
});

describe("§97의5 — 종점 뒤 계약은 임대료 요건 밖 (1253 · Q-2 A)", () => {
  it("🔴 M-3 말소 뒤 2027 계약 +43% → 적격 · 감면은 M-1과 같다", () => {
    const r = evaluateRental975({ ...BASE_975, ...DEREG_2026, rentHistory: withLate("2027-05-01") });
    expect(codes(r)).toEqual([]);
    if (!r.isEligible || r.effectCategory !== "tax_amount") throw new Error("unreachable");
    expect(r.reductionAmount).toBe(150_672_645);
  });

  it("M-4 같은 증액이 말소 전(2025) → 위반 유지", () => {
    expect(codes(evaluateRental975({ ...BASE_975, ...DEREG_2026, rentHistory: withLate("2025-05-01") }))).toContain("RENT_INCREASE_VIOLATED");
  });

  it("M-5 증액 계약일 = 종점 당일 → 임대기간 중이라 센다", () => {
    expect(codes(evaluateRental975({ ...BASE_975, ...DEREG_2026, rentHistory: withLate("2026-04-15") }))).toContain("RENT_INCREASE_VIOLATED");
  });

  it("M-6 양도일까지 등록·임대 유지 + 2027 계약 +43% → 위반 유지 (종점 = 양도일)", () => {
    const r = evaluateRental975({ ...BASE_975, rentalContinuesToTransfer: true, rentHistory: withLate("2027-05-01") });
    expect(codes(r)).toContain("RENT_INCREASE_VIOLATED");
  });

  it("🔴 M-7 말소 뒤 1년 이내 재증액(5% 이내) → 1년 재증액 위반으로 세지 않는다", () => {
    // 2026-05-01 계약(말소 뒤) 1.1025억 → 2026-09-01 1.12억: 4개월 만의 재증액(1.6%) — 직전 계약이 2020.2.11 이후
    const history = [...OK_HISTORY, jeonse("2026-05-01", 110_250_000), jeonse("2026-09-01", 112_000_000)];
    const r = evaluateRental975({ ...BASE_975, ...DEREG_2026, rentHistory: history });
    expect(codes(r)).not.toContain("RENT_INCREASE_WITHIN_1_YEAR");
    // 같은 이력을 양도일까지 유지하면 센다 — 위 단언이 필터 없이 통과하지 않음을 보증
    expect(codes(evaluateRental975({ ...BASE_975, rentalContinuesToTransfer: true, rentHistory: history }))).toContain(
      "RENT_INCREASE_WITHIN_1_YEAR",
    );
  });
});

describe("§97의3 — 같은 규칙 (Q-3)", () => {
  const BASE_973: Rental97EvaluationInput = {
    ...BASE_975,
    id: "rental_97_3",
    stdPriceAtRentalStart: 200_000_000,
    ...DEREG_2026,
  };

  it("🔴 M-8 말소 뒤 2027 계약 +43% → 적격 70%", () => {
    const r = evaluateRental973({ ...BASE_973, rentHistory: withLate("2027-05-01") });
    expect(codes(r)).toEqual([]);
    if (!r.isEligible || r.effectCategory !== "long_term_holding_special") throw new Error("unreachable");
    expect(r.overrideRate).toBe(0.7);
  });

  it("M-9 같은 증액이 말소 전(2025) → 위반 유지", () => {
    expect(codes(evaluateRental973({ ...BASE_973, rentHistory: withLate("2025-05-01") }))).toContain("RENT_INCREASE_VIOLATED");
  });
});
