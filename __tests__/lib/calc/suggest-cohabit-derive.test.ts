/**
 * deriveCohabitHouseStdPrice — §23의2 동거주택 공시가격 자동도출 anchor
 *
 * 설계: docs/02-design/features/inheritance-additional-deduction-autofill-v3.engine.design.md (케이스 C-1~C-6)
 * 법령: 상증법 §23의2①(KoreanLaw mst 276123) — "해당 주택·부수토지에 담보된 피상속인 채무 뺀 가액"
 *
 * ★ E-1: derive.value = gross standardPrice (담보 차감 금지 — 엔진 calcCohabitationDeduction이 단일 차감).
 */

import { describe, expect, it } from "vitest";

import { deriveCohabitHouseStdPrice } from "@/lib/calc/inheritance-deduction-suggest";
import type {
  EstateItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function asset(over: Partial<EstateItem>): EstateItem {
  return {
    id: over.id ?? "a1",
    category: over.category ?? "real_estate_apartment",
    name: over.name ?? "주택",
    ...over,
  };
}

function heir(over: Partial<Heir>): Heir {
  return { id: over.id ?? "h1", relation: over.relation ?? "child", ...over };
}

const cohabitChild = heir({ id: "h1", relation: "child", isCohabitant: true });

describe("deriveCohabitHouseStdPrice — §23의2 동거주택 자동도출", () => {
  it("C-1: 동거주택 단일·담보 0 (stdPrice 5억) → value=5억(gross), securedDebt=0", () => {
    const items = [
      asset({ id: "a1", standardPrice: 500_000_000, isCohabitantHouse: true }),
    ];
    const r = deriveCohabitHouseStdPrice(items, [cohabitChild]);
    expect(r.value).toBe(500_000_000);
    expect(r.securedDebt).toBe(0);
    expect(r.isApplicable).toBe(true);
  });

  it("C-2 (Anchor A): 동거주택+저당 (5억, mortgage 1억) → value=5억(gross)·securedDebt=1억 (이중차감 아님)", () => {
    const items = [
      asset({
        id: "a1",
        standardPrice: 500_000_000,
        mortgageAmount: 100_000_000,
        isCohabitantHouse: true,
      }),
    ];
    const r = deriveCohabitHouseStdPrice(items, [cohabitChild]);
    // ★ gross — securedDebt 차감은 엔진이 단일 수행 (deductions.ts:294)
    expect(r.value).toBe(500_000_000);
    expect(r.securedDebt).toBe(100_000_000);
    expect(r.isApplicable).toBe(true);
  });

  it("C-3: 복수 isCohabitantHouse (legacy) → isApplicable=false (자동도출 포기)", () => {
    const items = [
      asset({ id: "a1", standardPrice: 500_000_000, isCohabitantHouse: true }),
      asset({ id: "a2", standardPrice: 300_000_000, isCohabitantHouse: true }),
    ];
    const r = deriveCohabitHouseStdPrice(items, [cohabitChild]);
    expect(r.isApplicable).toBe(false);
    expect(r.value).toBe(0);
  });

  it("C-5: 미체크 (Heir.isCohabitant만, isCohabitantHouse 없음) → isApplicable=false", () => {
    const items = [asset({ id: "a1", standardPrice: 500_000_000 })];
    const r = deriveCohabitHouseStdPrice(items, [cohabitChild]);
    expect(r.isApplicable).toBe(false);
  });

  it("C-6: 임대보증금만 (저당 0, leaseDeposit 2억) → securedDebt=0 (담보된 채무 아님), value=stdPrice", () => {
    const items = [
      asset({
        id: "a1",
        standardPrice: 500_000_000,
        leaseDeposit: 200_000_000,
        isCohabitantHouse: true,
      }),
    ];
    const r = deriveCohabitHouseStdPrice(items, [cohabitChild]);
    expect(r.value).toBe(500_000_000);
    expect(r.securedDebt).toBe(0);
  });

  it("standardPrice 없음 → isApplicable=false", () => {
    const items = [asset({ id: "a1", isCohabitantHouse: true })];
    const r = deriveCohabitHouseStdPrice(items, [cohabitChild]);
    expect(r.isApplicable).toBe(false);
  });

  it("동거 자녀 없음 → notes 경고 (도출은 하되 요건 확인 안내)", () => {
    const items = [
      asset({ id: "a1", standardPrice: 500_000_000, isCohabitantHouse: true }),
    ];
    const r = deriveCohabitHouseStdPrice(items, [
      heir({ id: "h1", relation: "child" }),
    ]);
    expect(r.notes?.some((n) => n.includes("동거"))).toBe(true);
  });
});
