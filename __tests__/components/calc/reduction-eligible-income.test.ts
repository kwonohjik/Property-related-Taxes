import { describe, it, expect } from "vitest";
import {
  reductionEligibleIncome,
  incomeDeductionReducible,
  incomeDeductionRuralSurtax,
} from "@/components/calc/results/transfer/reduction-eligible-income";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

/** 헬퍼는 소득금액차감 detail 11필드만 읽으므로 partial cast로 최소 구성. */
const asResult = (partial: Record<string, unknown>) => partial as unknown as TransferTaxResult;

/**
 * 별지84호 부표2 ⑲ 세액감면대상금액 = 감면대상 양도소득금액 (소득세법 §90①, 감면율 前).
 * §77 계열의 reducibleIncome은 감면율(15/20/40/25%)을 곱한 값이므로 ⑲에 직접 쓰면 안 됨.
 */
describe("reductionEligibleIncome (부표2 ⑲ 세액감면대상금액)", () => {
  const fullIncome = 290_841_229; // 양도소득금액
  const reducible = 53_425_403; // 감면율 곱한 값 (§77)

  it("§77 공익수용 → 양도소득금액 전액 (reducibleIncome 아님)", () => {
    expect(reductionEligibleIncome("public_expropriation", fullIncome, reducible, undefined)).toBe(
      fullIncome,
    );
  });

  it("§77의3 개발제한 → 양도소득금액 전액", () => {
    expect(reductionEligibleIncome("gb_designated_land", fullIncome, reducible, undefined)).toBe(
      fullIncome,
    );
  });

  it("§77의2 대토보상 → echo(eligibleTransferIncome) 대토보상분", () => {
    expect(
      reductionEligibleIncome("replacement_land_comp", fullIncome, reducible, 203_484_404),
    ).toBe(203_484_404);
  });

  it("§77의2 echo 없으면 reducibleIncome fallback", () => {
    expect(reductionEligibleIncome("replacement_land_comp", fullIncome, reducible, undefined)).toBe(
      reducible,
    );
  });

  it("자경 §69 등 그 외 → reducibleIncome(감면대상 소득) 그대로", () => {
    expect(reductionEligibleIncome("self_farming", fullIncome, reducible, undefined)).toBe(reducible);
    expect(reductionEligibleIncome(undefined, fullIncome, reducible, undefined)).toBe(reducible);
  });
});

/**
 * 소득금액 감면대상(§90② 소득금액차감) — 종전 new993Detail만 참조하던 결함 정정.
 * §99의3이 아닌 §99·§98의8·하이브리드 income-deduction 감면도 값·농특세가 집계돼야 한다.
 */
describe("incomeDeductionReducible / incomeDeductionRuralSurtax (§90② 소득금액차감 일반화)", () => {
  it("§99의3(new993Detail) — 종전 동작 유지", () => {
    const r = asResult({ new993Detail: { reducibleTransferIncome: 179_917_278, ruralSurtax: 14_124_188 } });
    expect(incomeDeductionReducible(r)).toBe(179_917_278);
    expect(incomeDeductionRuralSurtax(r)).toBe(14_124_188);
  });

  it("§99(new99Detail) — 종전 0으로 누락되던 값이 집계됨 (인접 결함 정정)", () => {
    const r = asResult({ new99Detail: { reducibleTransferIncome: 88_000_000, ruralSurtax: 3_500_000 } });
    expect(incomeDeductionReducible(r)).toBe(88_000_000);
    expect(incomeDeductionRuralSurtax(r)).toBe(3_500_000);
  });

  it("§98의8·하이브리드(unsold988Detail·unsold987Detail 등)도 집계", () => {
    expect(
      incomeDeductionReducible(asResult({ unsold988Detail: { reducibleTransferIncome: 12_000_000, ruralSurtax: 0 } })),
    ).toBe(12_000_000);
    expect(
      incomeDeductionReducible(asResult({ unsold987Detail: { reducibleTransferIncome: 5_000_000, ruralSurtax: 400_000 } })),
    ).toBe(5_000_000);
  });

  it("하이브리드 5년 내(tax_amount 경로) reducibleTransferIncome=0 → 소득금액 미차감", () => {
    // 세액감면 경로는 소득금액차감이 아니므로 0. 합산에 영향 없음.
    const r = asResult({ unsold992Detail: { reducibleTransferIncome: 0, ruralSurtax: 0 } });
    expect(incomeDeductionReducible(r)).toBe(0);
  });

  it("적용 detail 없음 → 0", () => {
    expect(incomeDeductionReducible(asResult({}))).toBe(0);
    expect(incomeDeductionRuralSurtax(asResult({}))).toBe(0);
  });
});
