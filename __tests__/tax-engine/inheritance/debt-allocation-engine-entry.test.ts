/**
 * 채무 협의분할 엔진 진입 조건 확장 회귀 anchor
 *
 * 본 PR §3.9 / 디자인 §1.4 — `inheritance-tax.ts:422-425` `hasHeirAllocations` OR 절 1줄 추가.
 * 채무 협의분할만 입력된 케이스도 `calcHeirAllocation` 트리거되어 결과에 `heirAllocationResult`가 노출되어야 함.
 *
 * anchor:
 *  - IDA-ENGINE-1: debtItems.heirAllocations만 있는 입력 → heirAllocationResult 생성
 *  - IDA-ENGINE-2: debtItems도 없고 estateItems.heirAllocations·doneeId도 없음 → heirAllocationResult === undefined (회귀 차단)
 *  - IDA-ENGINE-3: 기존 estateItems.heirAllocations 케이스 → 결과 불변 (회귀 차단)
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIRS: Heir[] = [
  { id: "h-eldest", name: "장남", relation: "child" },
  { id: "h-spouse", name: "배우자", relation: "spouse" },
  { id: "h-second", name: "차남", relation: "child" },
];

const ESTATE_ITEM: EstateItem = {
  id: "estate-1",
  category: "real_estate_apartment",
  name: "주택",
  marketValue: 2_000_000_000,
};

function baseInput(): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems: [ESTATE_ITEM],
    heirs: HEIRS,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    deductionInput: {
      heirs: HEIRS,
      spouseActualAmount: 0,
      preferLumpSum: true,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: {
      priorGifts: [],
      isFiledOnTime: true,
    },
  } as InheritanceTaxInput;
}

describe("채무 협의분할 엔진 진입 조건 확장 (IDA-ENGINE)", () => {
  it("IDA-ENGINE-1: debtItems.heirAllocations만 있는 입력 → heirAllocationResult 생성", () => {
    const input: InheritanceTaxInput = {
      ...baseInput(),
      debtItems: [
        {
          id: "debt-1",
          category: "financial",
          name: "K은행",
          amount: 400_000_000,
          heirAllocations: [{ heirId: "h-eldest", amount: 400_000_000 }],
        },
      ],
    };

    const result = calcInheritanceTax(input);

    expect(result.heirAllocationResult).toBeDefined();
    expect(Object.keys(result.heirAllocationResult?.perHeir ?? {}).length).toBeGreaterThan(0);
  });

  it("IDA-ENGINE-2: 협의분할 입력 전무 → 자연인 상속인 법정상속분 자동 배부 (항상 배부 정책)", () => {
    const input = baseInput();
    // 협의분할 미입력이어도 자연인 상속인(배우자+자녀2) 존재 → 미입력 자산 법정상속분 배부
    const result = calcInheritanceTax(input);

    // 2026-05-26 정책 변경: 자연인 상속인 1명+ 이면 항상 상속인별 배부
    expect(result.heirAllocationResult).toBeDefined();
    expect(Object.keys(result.heirAllocationResult!.perHeir).length).toBeGreaterThan(0);
  });

  it("IDA-ENGINE-3: 기존 estateItems.heirAllocations 케이스 — 결과 생성 동작 불변 (회귀 차단)", () => {
    const input: InheritanceTaxInput = {
      ...baseInput(),
      estateItems: [
        {
          ...ESTATE_ITEM,
          heirAllocations: [
            { heirId: "h-eldest", amount: 1_000_000_000 },
            { heirId: "h-spouse", amount: 1_000_000_000 },
          ],
        },
      ],
    };

    const result = calcInheritanceTax(input);

    expect(result.heirAllocationResult).toBeDefined();
    expect(Object.keys(result.heirAllocationResult?.perHeir ?? {}).length).toBeGreaterThan(0);
  });

  it("IDA-ENGINE-4: debtItems heirAllocations 없음 → 채무 법정상속분 분담 + 자산 법정상속분 배부", () => {
    const input: InheritanceTaxInput = {
      ...baseInput(),
      debtItems: [
        {
          id: "debt-1",
          category: "financial",
          name: "K은행",
          amount: 400_000_000,
          // heirAllocations 없음 → 채무 법정상속분 분담
        },
      ],
    };

    const result = calcInheritanceTax(input);

    // 항상 배부: 미입력 채무·자산 모두 법정상속분
    expect(result.heirAllocationResult).toBeDefined();
    expect(Object.keys(result.heirAllocationResult!.perHeir).length).toBeGreaterThan(0);
  });

  it("IDA-ENGINE-5: debtItems.heirAllocations 빈 배열 → 법정상속분 배부 (length 0 = 미입력)", () => {
    const input: InheritanceTaxInput = {
      ...baseInput(),
      debtItems: [
        {
          id: "debt-1",
          category: "financial",
          name: "K은행",
          amount: 400_000_000,
          heirAllocations: [], // 빈 배열 = 미입력 → 법정상속분
        },
      ],
    };

    const result = calcInheritanceTax(input);

    expect(result.heirAllocationResult).toBeDefined();
    expect(Object.keys(result.heirAllocationResult!.perHeir).length).toBeGreaterThan(0);
  });
});
