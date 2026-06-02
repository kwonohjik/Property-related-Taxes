/**
 * suggestSpouseActualAmount — §19 mixed-allocation 정확화 anchor
 *
 * 설계: docs/02-design/features/inheritance-additional-deduction-autofill-v3.engine.design.md (케이스 S-1~S-3, §C)
 *
 * ★ R-1: 일부 자산만 협의분할 입력(0<allocated<total)이면 자동값이 과소 → 잘못된 auto-fill.
 *   → isApplicable=false로 자동도출 포기(엔진 법정상속분 fallback + UI 강한 경고).
 *   현행은 isApplicable=true·과소 value 반환 (S-2가 RED → 수정 후 GREEN).
 */

import { describe, expect, it } from "vitest";

import { suggestSpouseActualAmount } from "@/lib/calc/inheritance-deduction-suggest";
import type {
  EstateItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function asset(over: Partial<EstateItem>): EstateItem {
  return {
    id: over.id ?? "a1",
    category: over.category ?? "real_estate_land",
    name: over.name ?? "재산",
    ...over,
  };
}

function heir(over: Partial<Heir>): Heir {
  return { id: over.id ?? "h1", relation: over.relation ?? "child", ...over };
}

const heirs = [
  heir({ id: "s", relation: "spouse" }),
  heir({ id: "c", relation: "child" }),
];

describe("suggestSpouseActualAmount — §19 mixed-allocation", () => {
  it("S-1: 전부 협의분할(2/2건) → 배우자 배분 합", () => {
    const items = [
      asset({
        id: "a1",
        marketValue: 1_000_000_000,
        heirAllocations: [
          { heirId: "s", amount: 600_000_000 },
          { heirId: "c", amount: 400_000_000 },
        ],
      }),
      asset({
        id: "a2",
        marketValue: 500_000_000,
        heirAllocations: [
          { heirId: "s", amount: 200_000_000 },
          { heirId: "c", amount: 300_000_000 },
        ],
      }),
    ];
    const r = suggestSpouseActualAmount(items, heirs);
    expect(r.isApplicable).toBe(true);
    expect(r.value).toBe(800_000_000);
  });

  it("S-2 (Anchor B): 일부만 협의분할(1/3건) → isApplicable=false (잘못된 과소 auto-fill 방지)", () => {
    const items = [
      asset({
        id: "a1",
        marketValue: 2_000_000_000,
        heirAllocations: [{ heirId: "c", amount: 2_000_000_000 }],
      }),
      // ↓ 미입력 (총액-only) — 실제로는 배우자가 단독 수령했을 수 있음
      asset({ id: "a2", marketValue: 600_000_000 }),
      asset({ id: "a3", marketValue: 400_000_000 }),
    ];
    const r = suggestSpouseActualAmount(items, heirs);
    // 현행 버그: hasAllocations=true·value 과소(=a1의 배우자분 0)로 isApplicable=true 반환 → RED
    expect(r.isApplicable).toBe(false);
  });

  it("S-3: 협의분할 전무 → isApplicable=false (엔진 법정상속분 fallback)", () => {
    const items = [asset({ id: "a1", marketValue: 1_000_000_000 })];
    const r = suggestSpouseActualAmount(items, heirs);
    expect(r.isApplicable).toBe(false);
    expect(r.reason).toContain("법정상속분");
  });

  it("S-1b: 단일 자산 전부 협의분할(1/1건) 회귀 → 정상 도출", () => {
    const items = [
      asset({
        id: "a1",
        marketValue: 1_000_000_000,
        heirAllocations: [
          { heirId: "s", amount: 600_000_000 },
          { heirId: "c", amount: 400_000_000 },
        ],
      }),
    ];
    const r = suggestSpouseActualAmount(items, heirs);
    expect(r.isApplicable).toBe(true);
    expect(r.value).toBe(600_000_000);
  });
});
