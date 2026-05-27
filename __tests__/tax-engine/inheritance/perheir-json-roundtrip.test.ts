/**
 * A-2 — perHeir JSON round-trip 직렬화 소실 anchor
 *
 * Map일 때: JSON.parse(JSON.stringify(result)) 후 perHeir = {} (소실) → RED
 * Record로 변경 후: 키·값 보존 → GREEN
 *
 * 계획: docs/00-pm/inheritance-perheir-serialization-fix.plan.md §5
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function buildInput(): InheritanceTaxInput {
  const heirs: Heir[] = [
    { id: "h1", relation: "spouse", name: "배우자" },
    { id: "h2", relation: "child", name: "장남" },
  ];
  const estateItems: EstateItem[] = [
    {
      id: "a1",
      category: "real_estate_apartment",
      name: "아파트",
      marketValue: 2_000_000_000,
      heirAllocations: [
        { heirId: "h1", amount: 1_200_000_000 },
        { heirId: "h2", amount: 800_000_000 },
      ],
    },
  ];
  return {
    decedentType: "resident",
    deathDate: "2026-01-01",
    estateItems,
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [],
    heirs,
    deductionInput: { heirs },
    creditInput: { isFiledOnTime: true },
    isGenerationSkip: false,
  };
}

describe("A-2 perHeir JSON round-trip 직렬화 보존", () => {
  it("JSON.parse(JSON.stringify(result)) 후 perHeir 키·값이 보존된다", () => {
    const result = calcInheritanceTax(buildInput());
    expect(result.heirAllocationResult).toBeDefined();

    // JSON round-trip (route.ts → fetch → client 경로 시뮬레이션)
    const roundTripped = JSON.parse(
      JSON.stringify(result),
    ) as typeof result;

    const perHeir = roundTripped.heirAllocationResult?.perHeir;
    expect(perHeir).toBeDefined();

    // Map일 때: JSON.stringify(new Map([["h1",{...}]])) = "{}" → 이 assert 실패 (RED)
    // Record일 때: JSON.stringify({h1:{...},h2:{...}}) = 보존 → 이 assert 통과 (GREEN)
    const keys = Object.keys(perHeir ?? {});
    expect(keys.length).toBeGreaterThan(0); // 소실되면 0

    // h1·h2 구체 키·값 검증
    expect(perHeir!["h1"]).toBeDefined();
    expect(perHeir!["h2"]).toBeDefined();
    expect(typeof perHeir!["h1"].finalTax).toBe("number");
    expect(typeof perHeir!["h2"].finalTax).toBe("number");
  });
});
