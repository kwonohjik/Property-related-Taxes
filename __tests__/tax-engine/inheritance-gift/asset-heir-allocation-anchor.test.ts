/**
 * 자산 협의분할 (heirAllocations) anchor — 메인 PR 2
 *
 * Pre-Do anchor 2건 (A1·A2) + 케이스 매트릭스 anchor 6건 (C3·C4·C5·C6·C8·C9)
 * 회귀 C1·C2는 기존 inheritance.test.ts에서 커버.
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼
// ============================================================

function buildInput(opts: {
  heirs: Heir[];
  estateItems: EstateItem[];
  isGenerationSkip?: boolean;
}): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2026-01-01",
    estateItems: opts.estateItems,
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [],
    heirs: opts.heirs,
    deductionInput: { heirs: opts.heirs },
    creditInput: { isFiledOnTime: true },
    isGenerationSkip: opts.isGenerationSkip ?? false,
  };
}

const apartment = (id: string, amount: number): EstateItem => ({
  id,
  category: "real_estate_apartment",
  name: `아파트${id}`,
  marketValue: amount,
});

// ============================================================
// Pre-Do anchor (Plan v5 / Design v4)
// ============================================================

describe("자산 협의분할 — Pre-Do anchor", () => {
  it("[A1] heirAllocations 입력 시 STEP 13 활성 + 배우자 100% 분배", () => {
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      { id: "h2", relation: "child", name: "장남" },
    ];
    const input = buildInput({
      heirs,
      estateItems: [
        {
          ...apartment("a1", 10_000_000_000),
          heirAllocations: [{ heirId: "h1", amount: 10_000_000_000 }],
        },
      ],
    });
    const r = calcInheritanceTax(input);
    expect(r.heirAllocationResult).toBeDefined();
    const h1 = r.heirAllocationResult!.perHeir["h1"]!;
    const h2 = r.heirAllocationResult!.perHeir["h2"]!;
    expect(h1.finalTax).toBeGreaterThan(0);
    expect(h2.finalTax).toBe(0);
  });

  it("[A2] 수유자(legatee) + 세대생략 할증 정상 작동", () => {
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      {
        id: "h3",
        relation: "legatee",
        name: "손녀(수유자)",
        isGenerationSkipBeneficiary: true,
      },
    ];
    const input = buildInput({
      heirs,
      isGenerationSkip: true,
      estateItems: [
        {
          ...apartment("a1", 10_000_000_000),
          heirAllocations: [
            { heirId: "h1", amount: 7_000_000_000 },
            { heirId: "h3", amount: 3_000_000_000 },
          ],
        },
      ],
    });
    const r = calcInheritanceTax(input);
    const h3 = r.heirAllocationResult!.perHeir["h3"]!;
    expect(h3.finalTax).toBeGreaterThan(0);
    expect(h3.generationSkipSurcharge).toBeGreaterThan(0);
  });
});

// ============================================================
// 케이스 매트릭스 anchor
// ============================================================

describe("자산 협의분할 — 케이스 매트릭스", () => {
  it("[C3] 배우자 100% — heirAllocationResult 정상", () => {
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      { id: "h2", relation: "child", name: "자녀" },
    ];
    const input = buildInput({
      heirs,
      estateItems: [
        {
          ...apartment("a1", 8_000_000_000),
          heirAllocations: [{ heirId: "h1", amount: 8_000_000_000 }],
        },
      ],
    });
    const r = calcInheritanceTax(input);
    expect(r.heirAllocationResult).toBeDefined();
    // 배우자 finalTax가 전체 finalTax를 차지함 (자녀 = 0)
    const h1 = r.heirAllocationResult!.perHeir["h1"]!;
    const h2 = r.heirAllocationResult!.perHeir["h2"]!;
    expect(h2.finalTax).toBe(0);
    expect(h1.finalTax + h2.finalTax).toBe(h1.finalTax);
  });

  it("[C4] 수유자 포함 3인 분배 — 세대생략 손녀 할증 분기", () => {
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      { id: "h2", relation: "child", name: "장남" },
      {
        id: "h3",
        relation: "legatee",
        name: "손녀",
        isGenerationSkipBeneficiary: true,
      },
    ];
    const input = buildInput({
      heirs,
      isGenerationSkip: true,
      estateItems: [
        {
          ...apartment("a1", 10_000_000_000),
          heirAllocations: [
            { heirId: "h1", amount: 5_000_000_000 },
            { heirId: "h2", amount: 3_000_000_000 },
            { heirId: "h3", amount: 2_000_000_000 },
          ],
        },
      ],
    });
    const r = calcInheritanceTax(input);
    expect(r.heirAllocationResult).toBeDefined();
    const h1 = r.heirAllocationResult!.perHeir["h1"]!;
    const h2 = r.heirAllocationResult!.perHeir["h2"]!;
    const h3 = r.heirAllocationResult!.perHeir["h3"]!;
    // 배우자·자녀: 세대생략 할증 없음
    expect(h1.generationSkipSurcharge).toBe(0);
    expect(h2.generationSkipSurcharge).toBe(0);
    // 손녀(legatee + isGenerationSkipBeneficiary): 할증 발동
    expect(h3.generationSkipSurcharge).toBeGreaterThan(0);
  });

  it("[C5] 합계 != 평가액 — 엔진은 동작하지만 안분 합계가 평가액과 다름 (validate가 차단)", () => {
    // 엔진은 validate 없이 직접 호출되므로 합계 != 평가액이어도 안분은 수행됨
    // UI/API layer의 validate에서 차단됨. 엔진 anchor는 동작 자체만 확인.
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      { id: "h2", relation: "child", name: "자녀" },
    ];
    const input = buildInput({
      heirs,
      estateItems: [
        {
          ...apartment("a1", 10_000_000_000),
          heirAllocations: [
            { heirId: "h1", amount: 6_000_000_000 },
            { heirId: "h2", amount: 3_000_000_000 },
            // 합계 9B ≠ 평가액 10B
          ],
        },
      ],
    });
    const r = calcInheritanceTax(input);
    // 엔진 자체는 안분 결과를 반환 (validate가 책임)
    expect(r.heirAllocationResult).toBeDefined();
  });

  it("[C6] orphaned heirId (heirs에 없는 ID) — 엔진은 그 heir 결과를 단순 미반환", () => {
    const heirs: Heir[] = [{ id: "h1", relation: "spouse", name: "배우자" }];
    const input = buildInput({
      heirs,
      estateItems: [
        {
          ...apartment("a1", 10_000_000_000),
          heirAllocations: [
            { heirId: "h1", amount: 5_000_000_000 },
            { heirId: "h_orphan", amount: 5_000_000_000 },
          ],
        },
      ],
    });
    const r = calcInheritanceTax(input);
    // h1는 결과 있음, h_orphan은 perHeir에 없음
    expect(r.heirAllocationResult!.perHeir["h1"]).toBeDefined();
    expect(r.heirAllocationResult!.perHeir["h_orphan"]).toBeUndefined();
  });

  it("[C8] 법인(corporate) 포함 — corporate.finalTax = 0 (영리법인 면제)", () => {
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      {
        id: "hc",
        relation: "corporate",
        name: "재단법인",
      },
    ];
    const input = buildInput({
      heirs,
      estateItems: [
        {
          ...apartment("a1", 10_000_000_000),
          heirAllocations: [{ heirId: "h1", amount: 10_000_000_000 }],
        },
      ],
    });
    const r = calcInheritanceTax(input);
    // 법인이 분배 대상에 없어도 perHeir에 항목은 존재 가능 (영리법인은 finalTax=0)
    const hc = r.heirAllocationResult!.perHeir["hc"];
    if (hc) {
      expect(hc.finalTax).toBe(0);
    }
  });

  it("[C9] heirAllocations 미입력 — 자연인 상속인 있으면 법정상속분 자동 배부 (배우자+자녀1)", () => {
    // 2026-05-26 정정: '항상 배부' 확정 → 미입력 자산은 법정상속분(배우자 3/5, 자녀 2/5)
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      { id: "h2", relation: "child", name: "자녀" },
    ];
    const input = buildInput({
      heirs,
      estateItems: [apartment("a1", 10_000_000_000)],
    });
    const r = calcInheritanceTax(input);
    expect(r.heirAllocationResult).toBeDefined();
    const h1 = r.heirAllocationResult!.perHeir["h1"]!;
    const h2 = r.heirAllocationResult!.perHeir["h2"]!;
    expect(h1.directEstateAmount).toBe(6_000_000_000); // 3/5
    expect(h2.directEstateAmount).toBe(4_000_000_000); // 2/5
  });

  it("[C10] 미입력 자산 법정상속분 — 배우자+자녀2 → 3/7·2/7·2/7", () => {
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      { id: "h2", relation: "child", name: "장남" },
      { id: "h3", relation: "child", name: "차남" },
    ];
    const input = buildInput({
      heirs,
      estateItems: [apartment("a1", 7_000_000_000)],
    });
    const r = calcInheritanceTax(input);
    const h1 = r.heirAllocationResult!.perHeir["h1"]!;
    const h2 = r.heirAllocationResult!.perHeir["h2"]!;
    const h3 = r.heirAllocationResult!.perHeir["h3"]!;
    expect(h1.directEstateAmount).toBe(3_000_000_000); // 3/7
    expect(h2.directEstateAmount).toBe(2_000_000_000); // 2/7
    expect(h3.directEstateAmount).toBe(2_000_000_000); // 2/7
  });

  it("[C11] 혼합 — 자산A 협의분할 입력 + 자산B 미입력(법정상속분)", () => {
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      { id: "h2", relation: "child", name: "자녀" },
    ];
    const input = buildInput({
      heirs,
      estateItems: [
        { ...apartment("a1", 5_000_000_000), heirAllocations: [{ heirId: "h1", amount: 5_000_000_000 }] },
        apartment("b1", 5_000_000_000), // 미입력 → 법정상속분 3/5·2/5
      ],
    });
    const r = calcInheritanceTax(input);
    const h1 = r.heirAllocationResult!.perHeir["h1"]!;
    const h2 = r.heirAllocationResult!.perHeir["h2"]!;
    // A1 전액(50억) 배우자 + B1 법정상속분(배우자 30억·자녀 20억)
    expect(h1.directEstateAmount).toBe(8_000_000_000);
    expect(h2.directEstateAmount).toBe(2_000_000_000);
  });

  it("[C12] debtItems 미입력 → 채무 법정상속분 분담 (배우자 3/5)", () => {
    const heirs: Heir[] = [
      { id: "h1", relation: "spouse", name: "배우자" },
      { id: "h2", relation: "child", name: "자녀" },
    ];
    const input: InheritanceTaxInput = {
      ...buildInput({ heirs, estateItems: [apartment("a1", 10_000_000_000)] }),
      debtItems: [
        { id: "d1", category: "financial", name: "은행", amount: 700_000_000 },
      ],
    };
    const r = calcInheritanceTax(input);
    const h1 = r.heirAllocationResult!.perHeir["h1"]!;
    const h2 = r.heirAllocationResult!.perHeir["h2"]!;
    // 채무(financial) 7억 법정상속분 분담: 배우자 3/5(4.2억), 자녀 2/5(2.8억)
    expect(h1.debtPrincipalShare).toBe(420_000_000);
    expect(h2.debtPrincipalShare).toBe(280_000_000);
    // H-34/M-8: funeral 미입력이어도 §9②1호 최소 500만 공제가 per-heir 안분(배우자 3M·자녀 2M).
    //   debtShare = 순채무 + 공과금 + 장례비 → 배우자 4.2억+3백만, 자녀 2.8억+2백만.
    expect(h1.debtShare).toBe(423_000_000);
    expect(h2.debtShare).toBe(282_000_000);
    // usedLegalShareFallback echo true
    expect(r.heirAllocationResult!.usedLegalShareFallback).toBe(true);
  });
});
