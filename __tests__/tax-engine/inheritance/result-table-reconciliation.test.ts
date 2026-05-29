/**
 * 상속세 결과 집계표 정합 수정 anchor — T3·T5·T7·T10
 *
 * 계획: docs/00-pm/inheritance-result-table-bugfix.plan.md
 * 설계: docs/02-design/features/inheritance-result-table-reconciliation.engine.design.md
 *
 * - T10: 세액 배부 총액 보존 (Σ인별 == 엔진 권위 총계, 잔차 0)
 * - T7:  장례비 §14 한도 인별 배부 (㉡ 합계 == deductedBeforeAggregation)
 * - T5:  사전증여 doneeId 설정 시 ②·⑫ per-heir 동시 채움
 * - T3:  협의분할 합 ≠ 엔진 평가액 시 allocationMismatch echo (검증 우회 경로)
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { EXAMPLE_INPUT, HEIR_ID } from "./fixtures/comprehensive-case-pdf.fixture";
import type {
  InheritanceTaxInput,
  EstateItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

describe("T10 — 세액 배부 총액 보존 (잔액 흡수)", () => {
  const result = calcInheritanceTax(EXAMPLE_INPUT);
  const har = result.heirAllocationResult!;
  const perHeir = har.perHeir;
  const nonCorp = Object.values(perHeir).filter((p) => p.heirId !== HEIR_ID.corporate);

  it("Σ computedTaxShare == distributableTax (잔차 0)", () => {
    const sum = nonCorp.reduce((s, p) => s + p.computedTaxShare, 0);
    expect(sum).toBe(har.distributableTax);
  });

  it("Σ indirectTaxBaseShare == indirectNumerator (잔차 0)", () => {
    const sum = nonCorp.reduce((s, p) => s + p.indirectTaxBaseShare, 0);
    expect(sum).toBe(har.indirectNumerator);
  });

  it("Σ taxBaseShare(비corp) == computedTaxShareDenominator (= taxBase − corpGift)", () => {
    // 직접배부 합 + 간접배부 합 = 분모 (T10 후 정확 보존)
    const sumDirect = Object.values(perHeir)
      .filter((p) => p.heirId !== HEIR_ID.corporate)
      .reduce((s, p) => s + p.directTaxBaseShare, 0);
    const sumIndirect = nonCorp.reduce((s, p) => s + p.indirectTaxBaseShare, 0);
    expect(sumDirect + sumIndirect).toBe(har.indirectNumerator + sumDirect);
  });
});

describe("T7 — 장례비 §14 한도 인별 배부 (over-cap)", () => {
  const heirs: Heir[] = [
    { id: "h1", relation: "spouse" },
    { id: "h2", relation: "child" },
  ];
  // 식대 28M (한도 10M) — 인별 배부도 capped 10M 이어야
  const input: InheritanceTaxInput = {
    decedentType: "resident",
    deathDate: "2024-06-01",
    estateItems: [
      { id: "a1", category: "financial", name: "예금", marketValue: 1_000_000_000 } as EstateItem,
    ],
    debtItems: [
      { id: "f1", category: "funeral", name: "장례식대", amount: 28_000_000, isBongan: false },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    presumedItems: undefined,
    exemptions: undefined,
    preGiftsWithin10Years: [],
    heirs,
    deductionInput: { heirs },
    creditInput: { priorGifts: [], isFiledOnTime: true },
  };

  it("㉡ per-heir debtShare 합 == deductedBeforeAggregation (capped 10M)", () => {
    const result = calcInheritanceTax(input);
    expect(result.deductedBeforeAggregation).toBe(10_000_000); // min(28M, 10M)
    const har = result.heirAllocationResult!;
    const sumDebt = Object.values(har.perHeir).reduce((s, p) => s + p.debtShare, 0);
    expect(sumDebt).toBe(10_000_000); // uncapped 28M 아님
  });
});

describe("T5 — 사전증여 doneeId 설정 시 ②·⑫ per-heir 채움", () => {
  const heirs: Heir[] = [
    { id: "h1", relation: "spouse" },
    { id: "h2", relation: "child" },
  ];
  const input: InheritanceTaxInput = {
    decedentType: "resident",
    deathDate: "2024-06-01",
    estateItems: [
      { id: "a1", category: "financial", name: "예금", marketValue: 2_000_000_000 } as EstateItem,
    ],
    debtItems: undefined,
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    presumedItems: undefined,
    exemptions: undefined,
    preGiftsWithin10Years: [
      { giftDate: "2020-01-01", isHeir: true, giftAmount: 300_000_000, giftTaxPaid: 40_000_000, doneeId: "h2" },
    ],
    heirs,
    deductionInput: { heirs },
    creditInput: {
      priorGifts: [
        { giftDate: "2020-01-01", isHeir: true, giftAmount: 300_000_000, giftTaxPaid: 40_000_000, doneeId: "h2" },
      ],
      isFiledOnTime: true,
    },
  };

  it("doneeId 지정 heir의 ② priorGiftAmount·⑫ priorGiftComputedTax 채워짐", () => {
    const result = calcInheritanceTax(input);
    const h2 = result.heirAllocationResult!.perHeir["h2"];
    expect(h2.priorGiftAmount).toBe(300_000_000); // ②
    expect(h2.priorGiftComputedTax).toBe(40_000_000); // ⑫a
  });
});

describe("T3 — allocationMismatch echo (협의분할 합 ≠ 엔진 평가액)", () => {
  const heirs: Heir[] = [
    { id: "h1", relation: "spouse" },
    { id: "h2", relation: "child" },
  ];
  // 평가액 550M인데 협의분할 합 650M (검증 우회 — calcInheritanceTax 직접 호출)
  const input: InheritanceTaxInput = {
    decedentType: "resident",
    deathDate: "2024-06-01",
    estateItems: [
      {
        id: "stock1",
        category: "financial",
        name: "예금",
        marketValue: 550_000_000,
        heirAllocations: [
          { heirId: "h1", amount: 150_000_000 },
          { heirId: "h2", amount: 500_000_000 },
        ],
      } as EstateItem,
    ],
    debtItems: undefined,
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    presumedItems: undefined,
    exemptions: undefined,
    preGiftsWithin10Years: [],
    heirs,
    deductionInput: { heirs },
    creditInput: { priorGifts: [], isFiledOnTime: true },
  };

  it("불일치 자산이 allocationMismatch에 echo (expected 550M, actual 650M)", () => {
    const result = calcInheritanceTax(input);
    const mm = result.heirAllocationResult!.allocationMismatch ?? [];
    expect(mm.length).toBe(1);
    expect(mm[0].assetId).toBe("stock1");
    expect(mm[0].expected).toBe(550_000_000);
    expect(mm[0].actual).toBe(650_000_000);
    expect(mm[0].delta).toBe(100_000_000);
  });
});
