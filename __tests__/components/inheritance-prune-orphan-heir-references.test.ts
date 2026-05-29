import { describe, it, expect } from "vitest";
import {
  INITIAL_FORM,
  pruneOrphanHeirReferences,
  type FormState,
} from "@/components/calc/inheritance/shared";
import type {
  EstateItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-prior-gift.types";

// 상속인 삭제·이력 복원 시 고아 협의분할/doneeId 정리 — 사례 17 화면 재현
// (자산 "prop-..-2" heirId "heir-..-3"가 Heir에 없음 차단 버그)

const heirA: Heir = { id: "heir-1-0", relation: "spouse" };
const heirB: Heir = { id: "heir-1-1", relation: "child" };
const ORPHAN = "heir-1-3"; // 삭제된 상속인

function estate(id: string, allocs: { heirId: string; amount: number }[]): EstateItem {
  return {
    id,
    category: "real_estate" as EstateItem["category"],
    name: id,
    marketValue: allocs.reduce((s, a) => s + a.amount, 0),
    heirAllocations: allocs,
  };
}

describe("pruneOrphanHeirReferences", () => {
  it("A1: 고아 heirId 협의분할 항목만 제거, 유효 항목 보존", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      heirs: [heirA, heirB],
      estateItems: [
        estate("prop-2", [
          { heirId: heirA.id, amount: 100 },
          { heirId: ORPHAN, amount: 100 },
        ]),
      ],
    };
    const next = pruneOrphanHeirReferences(form);
    expect(next.estateItems[0].heirAllocations).toEqual([
      { heirId: heirA.id, amount: 100 },
    ]);
  });

  it("A2: 협의분할이 전부 고아면 undefined로 되돌려 법정상속분 fallback 복귀", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      heirs: [heirA, heirB],
      estateItems: [estate("prop-2", [{ heirId: ORPHAN, amount: 200 }])],
    };
    const next = pruneOrphanHeirReferences(form);
    expect(next.estateItems[0].heirAllocations).toBeUndefined();
  });

  it("A3: 고아 없으면 원본 객체 참조 유지 (불필요 리렌더 방지)", () => {
    const item = estate("prop-2", [{ heirId: heirA.id, amount: 100 }]);
    const form: FormState = {
      ...INITIAL_FORM,
      heirs: [heirA, heirB],
      estateItems: [item],
    };
    const next = pruneOrphanHeirReferences(form);
    expect(next.estateItems[0]).toBe(item);
  });

  it("A4: stockItems·presumedItems·debtItems 동일 정리", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      heirs: [heirA],
      stockItems: [estate("stock-1", [{ heirId: ORPHAN, amount: 50 }])],
      debtItems: [
        {
          id: "debt-1",
          category: "financial",
          name: "은행대출",
          amount: 30,
          heirAllocations: [{ heirId: ORPHAN, amount: 30 }],
        },
      ],
    };
    const next = pruneOrphanHeirReferences(form);
    expect(next.stockItems[0].heirAllocations).toBeUndefined();
    expect(next.debtItems?.[0].heirAllocations).toBeUndefined();
  });

  it("A5: priorGifts.doneeId 고아면 undefined", () => {
    const gift: PriorGift = {
      giftDate: "2020-01-01",
      giftAmount: 1000,
      doneeId: ORPHAN,
    } as PriorGift;
    const valid: PriorGift = {
      giftDate: "2021-01-01",
      giftAmount: 500,
      doneeId: heirA.id,
    } as PriorGift;
    const form: FormState = {
      ...INITIAL_FORM,
      heirs: [heirA],
      priorGifts: [gift, valid],
    };
    const next = pruneOrphanHeirReferences(form);
    expect(next.priorGifts[0].doneeId).toBeUndefined();
    expect(next.priorGifts[1].doneeId).toBe(heirA.id);
  });

  it("A6: debtItems undefined(협의분할 OFF) 상태 보존", () => {
    const form: FormState = {
      ...INITIAL_FORM,
      heirs: [heirA],
      debtItems: undefined,
    };
    const next = pruneOrphanHeirReferences(form);
    expect(next.debtItems).toBeUndefined();
  });
});
