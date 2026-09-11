/**
 * Pre-Do anchor — **F-14**(기준시가 코드리뷰 2026-08-26, 🟠 high · SPLIT).
 *
 * ## 결함
 *
 * 다건 집계의 **표시용 취득가액**을 `transfer-tax-aggregate.ts` 가 원시
 * `standardPriceAtTransfer` 를 분모로 **재산식**한다. 그런데 단건 엔진은 소득세법
 * 시행령 §164⑨(수용 보상·공매 경락)가 발동하면 **낮아진 분모**로 환산한다
 * (`resolveConversionDenominatorAtTransfer`). 두 분모가 갈리면 표시 취득가액이
 * 과소가 되고, 그 차액만큼 **역산되는 필요경비가 과대**가 된다.
 *
 * 🔴 **교차검산이 오류를 가린다.** 신고서 양식 항등식
 *    「양도가액 − 취득가액 − 필요경비 = 양도차익」이 **두 값 모두에서 성립**한다
 *    (필요경비가 취득가액에서 역산되기 때문). 자기검산으로는 영원히 안 드러난다.
 *
 * ## 실측 (2026-09-12 · mock 세율)
 *
 * 토지 1건 · 양도 10억 · 취득시 기준시가 2억 · 양도시 기준시가 5억 ·
 * 수용(§164⑨ 1호) ㎡당 2,500,000 · 200㎡ · 보상 1,500,000 · 보상기초 2,000,000
 *   → §164⑨ 분모 = min[2,500,000 · 1,500,000 · 2,000,000] × 200㎡ = **3억**
 *
 * | 칸 | 현행 표시 | 엔진(정답) | 괴리 |
 * |---|---:|---:|---:|
 * | 취득가액 | 400,000,000 | 666,666,666 | **−266,666,666** |
 * | 필요경비 | 272,666,666 | 6,000,000 (= 2억 × 3% 개산공제) | **+266,666,666** |
 * | 양도차익 | 327,333,334 | 327,333,334 | 0 |
 *
 * ## 안전망 부존재
 *
 * 재산식을 `estimatedBase` 로 바꾸는 뮤테이션에 `__tests__/tax-engine/` +
 * `__tests__/calc/` + `__tests__/api/` **1,368파일 15,277건이 전건 통과**했다.
 * 세액이 불변이라 어느 테스트도 이 칸을 보지 않는다 ⇒ 이 anchor 가 유일한 관측 경로다.
 *
 * 법령: 「소득세법 시행령」 제164조 제9항 제1호 · 제176조의2 제2항 제2호.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 토지 1건 — 환산취득. `withExpr` 이면 §164⑨ 1호(수용)로 분모가 5억 → 3억으로 낮아진다. */
function landItem(id: string, withExpr: boolean) {
  return {
    propertyId: id,
    propertyLabel: id,
    propertyType: "land" as const,
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 500_000_000,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    ...(withExpr
      ? {
          transferCause: "public_expropriation" as const,
          standardPricePerSqmAtTransfer: 2_500_000,
          transferArea: 200,
          compensationPerSqm: 1_500_000,
          compensationBasisStdPrice: 2_000_000,
        }
      : {}),
  } as unknown as TransferTaxInput;
}

function run(items: TransferTaxInput[]) {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2020,
      properties: items,
      annualBasicDeductionUsed: 0,
      priorReductionUsage: [],
    } as never,
    rates,
  );
}

describe("F-14 · 다건 표시 취득가액은 엔진 환산액(estimatedBase)이 정본이다", () => {
  describe("§1 §164⑨ 발동 — 수정 전 실패(의도된 Pre-Do)", () => {
    it("★ 표시 취득가액 = 엔진 estimatedBase (재산식 금지)", () => {
      const r = run([landItem("A", true), landItem("B", true)]);
      for (const p of r.properties) {
        expect(p.filingDisplay?.estimatedBase).toBe(666_666_666);
        expect(p.acquisitionPrice).toBe(666_666_666);
      }
    });

    it("★ 필요경비는 개산공제만 남는다 — 역산이 취득가액 과소를 흡수하지 않는다", () => {
      const r = run([landItem("A", true)]);
      const p = r.properties[0];
      expect(p.filingDisplay?.estimatedDeduction).toBe(6_000_000);
      expect(p.necessaryExpense).toBe(6_000_000);
    });
  });

  describe("§2 역방향 가드 — 수정 전후 불변이어야 하는 것", () => {
    it("§164⑨ 미발동이면 두 분모가 같아 표시가 바뀌지 않는다", () => {
      const r = run([landItem("A", false)]);
      const p = r.properties[0];
      // floor(10억 × 2억 ÷ 5억) = 400,000,000 — 재산식과 엔진이 일치하는 대조군
      expect(p.acquisitionPrice).toBe(400_000_000);
      expect(p.necessaryExpense).toBe(6_000_000);
    });

    it("세액·양도차익은 §164⑨ 발동 여부와 무관하게 표시 수정의 영향을 받지 않는다", () => {
      const on = run([landItem("A", true)]);
      const off = run([landItem("A", false)]);
      expect(on.properties[0].transferGain).toBe(327_333_334);
      expect(off.properties[0].transferGain).toBe(594_000_000);
      expect(on.determinedTax).toBeGreaterThan(0);
    });

    it("신고서 교차검산 항등식은 수정 후에도 성립한다 (양도 − 취득 − 필요경비 = 양도차익)", () => {
      const r = run([landItem("A", true), landItem("B", false)]);
      for (const p of r.properties) {
        expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
      }
    });
  });
});
